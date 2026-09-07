import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromPDF } from '@/lib/pdf-extractor';
import { mergeAndValidate } from '@/lib/merger';
import { storePdfInCache } from '@/lib/pdf-cache';
import { enrichDeedsWithOwnerVision } from '@/lib/vision-analyzer';
import { isScannedPdf, transcribeScannedPdf } from '@/lib/scanned-pdf-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '找不到上傳的檔案' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: '請上傳 PDF 檔案' }, { status: 400 });
    }

    // 1. 取得 PDF Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. 暫存 PDF 供結果頁左右雙欄對照 iframe 串流使用
    const pdfId = storePdfInCache(buffer);

    // 3. 執行第一層：PDF 文字提取
    let extractedText = await extractTextFromPDF(buffer);
    const isScanned = isScannedPdf(extractedText);

    if (isScanned) {
      console.log('[API Parse] Detected Scanned Image PDF without digital text. Routing to Vision OCR...');
      extractedText = await transcribeScannedPdf(buffer, { maxPages: 30, concurrency: 5 });
    }

    // 4. 執行後續層級 (Regex -> LLM -> Merger -> Zod)
    const result = await mergeAndValidate(extractedText);

    // 5. 若為第一類謄本或所有權人個資為圖層，自動調用 Vision AI 辨識補全 (純掃描 PDF 已由全頁 Vision 辨識，跳過切條)
    const enrichedDeeds = isScanned
      ? result.deeds
      : await enrichDeedsWithOwnerVision(result.deeds, buffer);

    // 6. 回傳解析結果與 pdfId
    return NextResponse.json({
      ...result,
      deeds: enrichedDeeds,
      pdfId,
    });

  } catch (error: any) {
    console.error('API Parse Error:', error);
    return NextResponse.json(
      { error: error.message || '伺服器解析時發生錯誤' },
      { status: 500 }
    );
  }
}
