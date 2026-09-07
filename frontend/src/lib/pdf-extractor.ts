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
    let pageCount = 0;
    const options = {
      pagerender: function (pageData: any) {
        pageCount++;
        const curPage = pageCount;
        return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
          .then(function (textContent: any) {
            let lastY: any;
            let text = `\n<<<PAGE_${curPage}>>>\n`;
            for (let item of textContent.items) {
              if (lastY === item.transform[5] || !lastY) {
                text += item.str;
              } else {
                text += '\n' + item.str;
              }
              lastY = item.transform[5];
            }
            return text;
          });
      },
    };
    
    const data = await pdfParse(buffer, options);
    return data.text;
  } catch (error: any) {
    console.error('Error in PDF extraction:', error);
    throw new Error('PDF 文字提取失敗: ' + (error.message || error.toString()));
  }
}
