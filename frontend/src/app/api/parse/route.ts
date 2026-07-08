import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromPDF } from '@/lib/pdf-extractor';
import { mergeAndValidate } from '@/lib/merger';

export const runtime = 'nodejs';

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

    // 2. 執行第一層：PDF 提取
    const extractedText = await extractTextFromPDF(buffer);

    // 3. 執行後續層級 (Regex -> LLM -> Merger -> Zod)
    const result = await mergeAndValidate(extractedText);

    // 4. 回傳解析結果
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('API Parse Error:', error);
    return NextResponse.json(
      { error: error.message || '伺服器解析時發生錯誤' },
      { status: 500 }
    );
  }
}
