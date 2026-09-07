import crypto from 'crypto';

interface CachedPdf {
  buffer: Buffer;
  timestamp: number;
}

// 記憶體快取池，供使用者於解析結果頁面以 iframe 即時同步瀏覽原始 PDF 檔案
const pdfStorage = new Map<string, CachedPdf>();

// 1 小時過期自動清理
const TTL_MS = 60 * 60 * 1000;

export function storePdfInCache(buffer: Buffer): string {
  cleanExpired();
  const id = crypto.randomUUID();
  pdfStorage.set(id, {
    buffer,
    timestamp: Date.now(),
  });
  return id;
}

export function getPdfFromCache(id: string): Buffer | null {
  cleanExpired();
  const item = pdfStorage.get(id);
  if (!item) return null;
  return item.buffer;
}

function cleanExpired() {
  const now = Date.now();
  for (const [id, item] of pdfStorage.entries()) {
    if (now - item.timestamp > TTL_MS) {
      pdfStorage.delete(id);
    }
  }
}
