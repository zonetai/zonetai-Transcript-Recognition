import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface RenderedPage {
  pageNumber: number;
  base64: string;
}

interface RenderPdfResult {
  totalPages: number;
  pages: RenderedPage[];
  error?: string;
}

/**
 * 判斷該 PDF 是否為純掃描/無數位文字層的圖片型 PDF
 */
export function isScannedPdf(extractedText: string): boolean {
  const textWithoutPageMarkers = extractedText
    .replace(/<<<PAGE_\d+>>>/g, '')
    .replace(/\s+/g, '');
  return textWithoutPageMarkers.length < 50;
}

/**
 * 呼叫 Python 利用 pdfplumber 將 PDF 頁面批次轉為高解析度 JPEG 圖片
 */
async function renderPdfPages(
  pdfBuffer: Buffer,
  startPage: number = 1,
  endPage?: number
): Promise<RenderPdfResult> {
  const tempDir = os.tmpdir();
  const tempPdfPath = path.join(tempDir, `scan_temp_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);

  const scriptCandidates = [
    path.join(process.cwd(), 'scripts', 'render_pdf_pages.py'),
    path.join(process.cwd(), 'frontend', 'scripts', 'render_pdf_pages.py'),
    path.join(__dirname, '..', '..', '..', 'scripts', 'render_pdf_pages.py'),
    path.join(__dirname, '..', 'scripts', 'render_pdf_pages.py'),
  ];
  const scriptPath = scriptCandidates.find((p) => fs.existsSync(p)) || scriptCandidates[0];

  try {
    await fs.promises.writeFile(tempPdfPath, pdfBuffer);

    const args = [scriptPath, tempPdfPath, String(startPage)];
    if (endPage) {
      args.push(String(endPage));
    }

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile('python', args, { maxBuffer: 100 * 1024 * 1024 }, (err, out, stderr) => {
        if (err) {
          console.error('Python render_pdf_pages error:', stderr || err);
          reject(err);
        } else {
          resolve(out);
        }
      });
    });

    const parsed: RenderPdfResult = JSON.parse(stdout);
    return parsed;
  } finally {
    try {
      if (fs.existsSync(tempPdfPath)) {
        await fs.promises.unlink(tempPdfPath);
      }
    } catch {
      // Ignore cleanup error
    }
  }
}

/**
 * 呼叫多模態視覺模型 (Vision) 辨識整頁地政謄本
 */
async function transcribePageImage(
  base64: string,
  apiKey: string,
  model: string
): Promise<string> {
  const prompt = `請精確讀取這張台灣地政謄本掃描圖片的所有文字內容，完整忠實輸出所有文字（包含頂部標題、標示部、所有權部、他項權利部、前次移轉等），保持原始欄位名稱格式，不要省略任何文字，不要包在代碼區塊中：`;

  const visionModel = (model && (model.includes('gemini') || model.includes('vision') || model.includes('4o') || model.includes('vl')))
    ? model
    : 'google/gemini-2.5-flash';

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      console.error('Vision transcribe API error:', res.status, errTxt);
      return '';
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('Failed to transcribe page image:', err);
    return '';
  }
}

/**
 * 將掃描型 PDF 完整視覺轉譯為帶有 <<<PAGE_N>>> 標記之標準文字流
 */
export async function transcribeScannedPdf(
  pdfBuffer: Buffer,
  options?: { maxPages?: number; concurrency?: number }
): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey || apiKey === 'dummy-key-for-build' || apiKey === 'your_api_key_here') {
    throw new Error('未設定有效的 LLM_API_KEY，無法執行掃描型 PDF 之 Vision 視覺辨識。');
  }

  const model = process.env.LLM_MODEL || 'google/gemini-2.5-flash';
  const maxPages = options?.maxPages || 15; // 預設單次轉譯至多 15 頁以兼顧效能與回應時間
  const concurrency = options?.concurrency || 4; // 並行 4 頁批次處理

  console.log(`[Scanned-PDF] Rendering pages (up to ${maxPages} pages)...`);
  const renderRes = await renderPdfPages(pdfBuffer, 1, maxPages);

  if (!renderRes.pages || renderRes.pages.length === 0) {
    throw new Error(renderRes.error || '無法從該掃描型 PDF 渲染出任何頁面影像。');
  }

  console.log(`[Scanned-PDF] Successfully rendered ${renderRes.pages.length} pages (Total in doc: ${renderRes.totalPages}). Starting Vision transcription with ${model}...`);

  const pageTexts: { pageNumber: number; text: string }[] = [];

  for (let i = 0; i < renderRes.pages.length; i += concurrency) {
    const chunk = renderRes.pages.slice(i, i + concurrency);
    console.log(`[Scanned-PDF] Transcribing pages ${chunk.map(c => c.pageNumber).join(', ')}...`);

    const chunkResults = await Promise.all(
      chunk.map(async (pageItem) => {
        const text = await transcribePageImage(pageItem.base64, apiKey, model);
        return {
          pageNumber: pageItem.pageNumber,
          text,
        };
      })
    );

    pageTexts.push(...chunkResults);
  }

  // 依頁碼順序組合成單一字串，並在每頁注入 <<<PAGE_N>>>
  const fullText = pageTexts
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((item) => `\n<<<PAGE_${item.pageNumber}>>>\n${item.text}\n`)
    .join('\n');

  console.log(`[Scanned-PDF] Finished transcribing ${pageTexts.length} pages. Total text length: ${fullText.length}.`);
  return fullText;
}
