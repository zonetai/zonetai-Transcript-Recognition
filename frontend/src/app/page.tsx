"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './page.module.css';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.type !== 'application/pdf') {
        setError('請上傳有效的 PDF 檔案');
        setFile(null);
      } else {
        setFile(selected);
        setError(null);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      if (selected.type !== 'application/pdf') {
        setError('請上傳有效的 PDF 檔案');
      } else {
        setFile(selected);
        setError(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    // 1. 同步將原始 PDF 存入本機瀏覽器 IndexedDB，確保任何環境皆可 0 延遲即時預覽對照
    try {
      const { storeClientPdf } = await import('@/lib/client-pdf-store');
      await storeClientPdf(file);
    } catch (e) {
      console.warn('Could not store PDF in IndexedDB:', e);
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let errMessage = '伺服器解析失敗';
        const rawText = await res.text().catch(() => '');
        try {
          const errData = JSON.parse(rawText);
          errMessage = errData.error || errMessage;
        } catch {
          if (res.status === 413 || rawText.includes('FUNCTION_PAYLOAD_TOO_LARGE') || rawText.includes('Entity Too Large') || rawText.includes('too large')) {
            errMessage = '檔案過大（超過 Vercel 限制 4.5MB）。本件第三類謄本為 29MB~73MB 之高解析純掃描影像，請改用支援 Docker 的平台（如 Zeabur）部署或於本機運行。';
          } else if (res.status === 504 || rawText.includes('Timeout') || rawText.includes('FUNCTION_INVOCATION_TIMEOUT')) {
            errMessage = '伺服器處理逾時（超過 Vercel 免費版 10~15 秒限制），請部署於支援容器運算之伺服器。';
          } else {
            errMessage = rawText || `伺服器回應錯誤 (${res.status})`;
          }
        }
        throw new Error(errMessage);
      }

      const data = await res.json();
      
      // 將資料存入 sessionStorage 供結果頁使用
      sessionStorage.setItem('parsedResult', JSON.stringify(data));
      router.push('/result');

    } catch (err: any) {
      console.error(err);
      setError(err.message || '發生未知錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoWrapper}>
          <Image src="/LOGO.svg" alt="中泰不動產估價師聯合事務所" width={240} height={70} className={styles.homeLogo} />
        </div>
        <h1 className={styles.title}>謄本解析工具</h1>
        <p className={styles.subtitle}>
          自動讀取電子謄本內容，轉換為可匯出的結構化資料表。
        </p>

        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.modernSpinner}></div>
            <div className={styles.loadingText}>謄本辨識與頁面定位中...</div>
            <div className={styles.loadingBar}><div className={styles.loadingProgress}></div></div>
          </div>
        ) : (
          <>
            <div 
              className={`${styles.dropzone} ${isDragActive ? styles.active : ''} ${file ? styles.fileSelected : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {file ? (
                <>
                  <div className={styles.successIcon}>
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                  </div>
                  <div className={styles.successText}>已成功載入檔案</div>
                  <div className={styles.fileName}>{file.name}</div>
                  <div className={styles.reselectText}>點擊此處可重新選擇檔案</div>
                </>
              ) : (
                <>
                  <div className={styles.dropzoneIcon}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="12" y1="18" x2="12" y2="12"></line>
                      <line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>
                  </div>
                  <div className={styles.dropzoneText}>
                    點擊或將 PDF 檔案拖曳至此
                  </div>
                </>
              )}
              <input 
                type="file" 
                accept="application/pdf"
                onChange={handleFileChange}
                className={styles.fileInput}
              />
            </div>

            {error && (
              <div className={styles.error}>{error}</div>
            )}

            <button 
              onClick={handleUpload}
              disabled={!file}
              className={styles.button}
            >
              開始解析
            </button>
          </>
        )}
      </div>
    </main>
  );
}
