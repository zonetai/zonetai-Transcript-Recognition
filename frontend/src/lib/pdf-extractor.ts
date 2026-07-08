// 解決 Next.js 伺服器端執行 pdf.js 時找不到瀏覽器物件的錯誤
if (typeof global !== 'undefined') {
  if (!(global as any).DOMMatrix) {
    (global as any).DOMMatrix = class DOMMatrix { };
  }
  if (!(global as any).Path2D) {
    (global as any).Path2D = class Path2D { };
  }
}

const pdfParse = require('pdf-parse');

/**
 * 第一層：PDF文字提取模組
 * @param buffer PDF檔案的Buffer
 * @returns 提取出的純文字
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse options (預設行為即可保留換行)
    const options = {
      // 如果有需要特殊的排版解析，可在此覆寫 pagerender
    };
    
    const data = await pdfParse(buffer, options);
    
    // 確保回傳的內容為純字串，且進行基本修整（不改變換行結構）
    return data.text;
  } catch (error: any) {
    console.error('Error in PDF extraction:', error);
    throw new Error('PDF 文字提取失敗: ' + (error.message || error.toString()));
  }
}
