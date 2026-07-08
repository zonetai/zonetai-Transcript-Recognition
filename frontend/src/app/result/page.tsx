"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './page.module.css';

export default function ResultPage() {
  const [data, setData] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const storedData = sessionStorage.getItem('parsedResult');
    if (storedData) {
      setData(JSON.parse(storedData));
    } else {
      router.push('/');
    }
  }, [router]);

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setToast('已複製: ' + (text.length > 20 ? text.substring(0, 20) + '...' : text));
    setTimeout(() => setToast(null), 2000);
  };

  const handleCopyTable = () => {
    const tableEl = document.getElementById('ownership-table');
    if (!tableEl) return;
    
    try {
      const range = document.createRange();
      range.selectNode(tableEl);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('copy');
        selection.removeAllRanges();
        setToast('✅ 已複製整個表格，可直接貼上至 Excel');
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      console.error('複製表格失敗:', err);
    }
  };

  const handleCopyBasicInfo = () => {
    if (!data) return;
    const lines = [];
    if (data.landDescription) {
      lines.push(`地段地號\t${data.landDescription.section} ${data.landDescription.landNumber}`);
      lines.push(`面積\t${data.landDescription.area} 平方公尺`);
      lines.push(`公告現值\t${data.landDescription.announcedValue?.valuePerSquareMeter || '無'} 元/平方公尺`);
    }
    if (data.buildingDescription) {
      lines.push(`建號\t${data.buildingDescription.buildingNumber}`);
      lines.push(`門牌\t${data.buildingDescription.address}`);
      lines.push(`總面積\t${data.buildingDescription.totalArea} 平方公尺`);
      lines.push(`完成日期\t${data.buildingDescription.completionDate}`);
    }
    lines.push(`列印時間\t${data.printTime}`);
  
    navigator.clipboard.writeText(lines.join('\n'));
    setToast('✅ 已複製基本資訊，可直接貼上至 Excel');
    setTimeout(() => setToast(null), 3000);
  };

  const handleDownloadCSV = () => {
    if (!data || !data.ownershipRecords) return;

    const headers = [
      "登記次序", "登記日期", "登記原因", "原因發生日期", "權利範圍", 
      "是否公同共有", "權狀字號", "當期申報地價", "前次移轉現值", 
      "歷次取得權利範圍", "限制登記事項"
    ];

    const rows = data.ownershipRecords.map((r: any) => {
      const rest = r.restrictions && r.restrictions.length > 0 
        ? r.restrictions.map((re: any) => `${re.type}(${re.caseNumber || ''})`).join('; ')
        : "無";
        
      return [
        r.registrationOrder || "",
        r.registrationDate || "",
        r.registrationReason || "",
        r.causeDate || "",
        r.ownershipShare || "",
        r.isJointOwnership ? "是" : "否",
        r.certificateNumber || "",
        r.currentAnnouncedLandValue || "",
        r.previousTransferValue?.value || "",
        r.historicalShare || "",
        rest
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = "\uFEFF" + headers.join(',') + "\n" + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${data.documentType || '謄本'}_解析結果.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>載入中...</div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logoContainer}>
            <Image src="/LOGO.svg" alt="中泰估價 Logo" width={150} height={48} className={styles.logo} />
            <h1 className={styles.title}>謄本解析結果</h1>
          </div>
          <div className={styles.actions}>
            <button onClick={() => router.push('/')} className={styles.secondaryBtn}>
              重新上傳
            </button>
            <button onClick={handleDownloadCSV} className={styles.primaryBtn}>
              匯出 CSV
            </button>
          </div>
        </div>
      </div>

      <div className={styles.container}>
        <div className={styles.content}>
        {data.needsManualReview && (
          <div className={styles.warningBanner}>
            <div className={styles.warningTitle}>需要人工複核</div>
            <div>{data.reviewReason || "系統判斷部分欄位可能解析有誤，請人工核對。"}</div>
          </div>
        )}

        <div className={styles.viewToggle}>
          <button 
            className={`${styles.toggleBtn} ${viewMode === 'table' ? styles.active : ''}`}
            onClick={() => setViewMode('table')}
          >
            表格檢視
          </button>
          <button 
            className={`${styles.toggleBtn} ${viewMode === 'json' ? styles.active : ''}`}
            onClick={() => setViewMode('json')}
          >
            JSON 檢視
          </button>
        </div>

        {viewMode === 'table' ? (
          <>
            <div className={styles.card}>
              <div className={styles.tableHeaderContainer}>
                <h2 className={styles.cardTitle} style={{ border: 'none', margin: 0, padding: 0 }}>基本資訊 - {data.documentType}</h2>
                <button onClick={handleCopyBasicInfo} className={styles.iconBtn} title="複製基本資訊">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  複製基本資訊
                </button>
              </div>
              <div className={styles.infoGrid}>
                {data.landDescription && (
                  <>
                    <div className={styles.infoItem}><span className={styles.infoLabel}>地段地號</span><span onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={`${styles.infoValue} ${styles.copyable}`}>{data.landDescription.section} {data.landDescription.landNumber}</span></div>
                    <div className={styles.infoItem}><span className={styles.infoLabel}>面積</span><span onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={`${styles.infoValue} ${styles.copyable}`}>{data.landDescription.area} 平方公尺</span></div>
                    <div className={styles.infoItem}><span className={styles.infoLabel}>公告現值</span><span onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={`${styles.infoValue} ${styles.copyable}`}>{data.landDescription.announcedValue?.valuePerSquareMeter || '無'} 元/平方公尺</span></div>
                  </>
                )}
                {data.buildingDescription && (
                  <>
                    <div className={styles.infoItem}><span className={styles.infoLabel}>建號</span><span onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={`${styles.infoValue} ${styles.copyable}`}>{data.buildingDescription.buildingNumber}</span></div>
                    <div className={styles.infoItem}><span className={styles.infoLabel}>門牌</span><span onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={`${styles.infoValue} ${styles.copyable}`}>{data.buildingDescription.address}</span></div>
                    <div className={styles.infoItem}><span className={styles.infoLabel}>總面積</span><span onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={`${styles.infoValue} ${styles.copyable}`}>{data.buildingDescription.totalArea} 平方公尺</span></div>
                    <div className={styles.infoItem}><span className={styles.infoLabel}>完成日期</span><span onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={`${styles.infoValue} ${styles.copyable}`}>{data.buildingDescription.completionDate}</span></div>
                  </>
                )}
                <div className={styles.infoItem}><span className={styles.infoLabel}>列印時間</span><span onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={`${styles.infoValue} ${styles.copyable}`}>{data.printTime}</span></div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.tableHeaderContainer}>
                <h2 className={styles.cardTitle} style={{ border: 'none', margin: 0, padding: 0 }}>所有權部紀錄</h2>
                <button onClick={handleCopyTable} className={styles.iconBtn} title="複製整個表格">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  複製表格
                </button>
              </div>
              <div className={styles.tableWrapper}>
                <table id="ownership-table" className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>次序</th>
                      <th>登記日期/原因</th>
                      <th>權利範圍</th>
                      <th>地價/現值</th>
                      <th>限制/備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ownershipRecords?.map((record: any, idx: number) => (
                      <tr key={idx}>
                        <td onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={styles.copyable}>{record.registrationOrder}</td>
                        <td onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={styles.copyable}>
                          {record.registrationDate}
                          <br />
                          <span style={{ color: '#64748b' }}>{record.registrationReason}</span>
                        </td>
                        <td onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={styles.copyable}>
                          {record.ownershipShare}
                          {record.isJointOwnership && (
                            <>
                              <br />
                              <span style={{ color: '#1a4c54' }}>公同共有</span>
                            </>
                          )}
                        </td>
                        <td onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={styles.copyable}>
                          {record.currentAnnouncedLandValue && (
                            <>申報: {record.currentAnnouncedLandValue}<br /></>
                          )}
                          {record.previousTransferValue?.value && (
                            <span style={{ color: '#64748b' }}>前次: {record.previousTransferValue.value}</span>
                          )}
                        </td>
                        <td onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} className={styles.copyable}>
                          {record.restrictions?.map((r: any, i: number) => (
                            <span key={i} className={styles.restrictionBadge}>
                              {r.type}
                            </span>
                          ))}
                          {record.generalNotes?.map((n: string, i: number) => (
                            <div key={i} style={{ color: '#64748b' }}>• {n}</div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.card}>
            <div className={styles.jsonHeader}>
              <h2 className={styles.cardTitle} style={{ border: 'none', margin: 0, padding: 0 }}>原始 JSON 資料</h2>
              <button onClick={() => handleCopy(JSON.stringify(data, null, 2))} className={styles.iconBtn}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                複製全部 JSON
              </button>
            </div>
             <pre className={styles.jsonViewer} onClick={(e) => handleCopy((e.currentTarget as HTMLElement).innerText)} style={{ cursor: 'pointer' }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
      </div>

      {toast && (
        <div className={styles.toast}>
          {toast}
        </div>
      )}
    </>
  );
}
