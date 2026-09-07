"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './page.module.css';
import { SingleDeed } from '@/lib/schema';

// 全形轉半形工具函式
export function toHalfWidth(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/[—–]/g, '-')
    .replace(/／/g, '/');
}

// 權利範圍拆解為分子與分母 (純數字)
export function parseFraction(shareStr: string | null | undefined): {
  numerator: string;
  denominator: string;
  text: string;
} {
  if (!shareStr || shareStr === '無') {
    return { numerator: '無', denominator: '無', text: '無' };
  }
  const clean = toHalfWidth(shareStr).replace(/[\*\s]/g, '');
  
  // 匹配 "X分之Y" (例如 16分之1 -> 分母 16, 分子 1)
  const match = clean.match(/(\d+)分之(\d+)/);
  if (match) {
    return {
      denominator: match[1],
      numerator: match[2],
      text: `${match[1]}分之${match[2]}`,
    };
  }
  
  if (clean === '全部' || clean.includes('1分之1')) {
    return { numerator: '1', denominator: '1', text: '全部 (1分之1)' };
  }

  return { numerator: '無', denominator: '無', text: clean };
}

// 無色彩、純線條之極簡複製圖示 (Monochrome SVG)
function CopyIcon({ size = 13, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'inline-block', verticalAlign: '-1px', flexShrink: 0 }}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export default function ResultPage() {
  const [deeds, setDeeds] = useState<SingleDeed[]>([]);
  const [selectedDeedIndex, setSelectedDeedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  const [toast, setToast] = useState<string | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);
  const [showSplitView, setShowSplitView] = useState(true);
  const [currentPdfPage, setCurrentPdfPage] = useState<number>(1);
  const [activeRecordKey, setActiveRecordKey] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const storedData = sessionStorage.getItem('parsedResult');
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        if (parsed && Array.isArray(parsed.deeds)) {
          setDeeds(parsed.deeds);
          if (parsed.deeds[0]?.startPage) {
            setCurrentPdfPage(parsed.deeds[0].startPage);
          }
        } else if (parsed) {
          // 相容舊格式
          setDeeds([parsed]);
          if (parsed.startPage) {
            setCurrentPdfPage(parsed.startPage);
          }
        }
        if (parsed && parsed.pdfId) {
          setPdfId(parsed.pdfId);
        }
      } catch (e) {
        console.error("Failed to parse stored result:", e);
        router.push('/');
      }
    } else {
      router.push('/');
    }
  }, [router]);

  // 跳轉至左側 PDF 指定頁面並高亮該筆紀錄
  const jumpToPage = (pageNum?: number, key?: string) => {
    if (!pageNum || isNaN(pageNum)) return;
    setCurrentPdfPage(pageNum);
    if (key) {
      setActiveRecordKey(key);
    }
    if (!showSplitView && pdfId) {
      setShowSplitView(true);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // 手動編輯儲存格資料
  const handleEditRecord = (
    deedIndex: number,
    recordIndex: number,
    field: 'ownerName' | 'ownerId' | 'ownerAddress',
    currentValue: string | null | undefined
  ) => {
    const fieldName = field === 'ownerName' ? '所有權人姓名' : field === 'ownerId' ? '統一編號' : '住址';
    const oldVal = currentValue && currentValue !== '無' ? currentValue : '';
    const newVal = window.prompt(`請輸入修改後的「${fieldName}」：`, oldVal);
    if (newVal !== null) {
      const updated = [...deeds];
      const targetDeed = { ...updated[deedIndex] };
      const targetRecords = [...targetDeed.ownershipRecords];
      targetRecords[recordIndex] = {
        ...targetRecords[recordIndex],
        [field]: toHalfWidth(newVal).trim() || '無',
      };
      targetDeed.ownershipRecords = targetRecords;
      updated[deedIndex] = targetDeed;
      setDeeds(updated);
      showToast(`✅ 已更新 ${fieldName}`);
    }
  };

  // 保證 100% 成功、強制半形之複製函式
  const copyToClipboard = (rawText: string | number | null | undefined, label?: string) => {
    if (rawText === null || rawText === undefined || String(rawText).trim() === '' || String(rawText).trim() === '無') {
      showToast('⚠️ 該欄位為「無」，無資料可複製');
      return;
    }

    const clean = toHalfWidth(String(rawText)).trim();

    const fallbackCopy = (textToCopy: string) => {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.width = "2em";
        textArea.style.height = "2em";
        textArea.style.padding = "0";
        textArea.style.border = "none";
        textArea.style.outline = "none";
        textArea.style.boxShadow = "none";
        textArea.style.background = "transparent";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, textToCopy.length);
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          showToast(`✅ 已複製${label ? ` [${label}]` : ''}: ${textToCopy.length > 25 ? textToCopy.substring(0, 25) + '...' : textToCopy}`);
        } else {
          showToast(`❌ 複製失敗，請手動反白複製`);
        }
      } catch (err) {
        console.error('Fallback copy failed:', err);
        showToast(`❌ 複製失敗，請手動反白複製`);
      }
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(clean)
        .then(() => {
          showToast(`✅ 已複製${label ? ` [${label}]` : ''}: ${clean.length > 25 ? clean.substring(0, 25) + '...' : clean}`);
        })
        .catch(() => {
          fallbackCopy(clean);
        });
    } else {
      fallbackCopy(clean);
    }
  };

  const currentDeed = deeds[selectedDeedIndex] || null;

  // 輔助元件：若無資料則顯示灰體「無」，有資料則轉半形並提供點擊複製
  const renderValueCell = (val: string | number | null | undefined, label: string) => {
    if (val === null || val === undefined || String(val).trim() === '' || String(val).trim() === '（空白）' || String(val).trim() === '無') {
      return <span className={styles.emptyText}>無</span>;
    }
    const cleanStr = toHalfWidth(String(val)).trim();
    return (
      <div 
        className={styles.copyCell}
        onClick={() => copyToClipboard(cleanStr, label)}
        title={`點擊複製 ${label} (半形)`}
      >
        <span>{cleanStr}</span>
        <button 
          className={styles.copyIconBtn}
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(cleanStr, label);
          }}
          title="複製"
        >
          <CopyIcon size={12} />
        </button>
      </div>
    );
  };

  // 複製所有權部表格 (以 Tab 分隔貼入 Excel，全轉半形，無也寫無)
  const handleCopyTable = (tableId: string, name: string) => {
    const tableEl = document.getElementById(tableId);
    if (!tableEl) return;

    try {
      const rows = Array.from(tableEl.querySelectorAll('tr'));
      const text = rows.map(row => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        return cells.map(cell => {
          const raw = (cell as HTMLElement).innerText.replace(/\r?\n+/g, ' ').trim();
          return toHalfWidth(raw) || '無';
        }).join('\t');
      }).join('\n');

      copyToClipboard(text, name);
    } catch (err) {
      console.error('複製表格失敗:', err);
    }
  };

  // 複製基本資訊
  const handleCopyBasicInfo = () => {
    if (!currentDeed) return;
    const lines: string[] = [];
    lines.push(`謄本種類\t${toHalfWidth(currentDeed.title) || '無'}`);
    lines.push(`識別標的\t${toHalfWidth(currentDeed.identifier) || '無'}`);
    lines.push(`列印時間\t${toHalfWidth(currentDeed.printTime) || '無'}`);
    lines.push(`謄本種類碼\t${toHalfWidth(currentDeed.verificationCode || '') || '無'}`);
    lines.push(`核發機關\t${toHalfWidth(currentDeed.authority || '') || '無'}`);

    if (currentDeed.landDescription) {
      lines.push(`土地標示部\t有`);
      lines.push(`地段地號\t${toHalfWidth(currentDeed.landDescription.section)} ${toHalfWidth(currentDeed.landDescription.landNumber)}`);
      lines.push(`面積\t${currentDeed.landDescription.area ? `${currentDeed.landDescription.area} 平方公尺` : '無'}`);
      lines.push(`公告現值\t${currentDeed.landDescription.announcedValue ? `${toHalfWidth(String(currentDeed.landDescription.announcedValue.valuePerSquareMeter))} 元/平方公尺 (${toHalfWidth(currentDeed.landDescription.announcedValue.yearMonth)})` : '無'}`);
      lines.push(`使用分區\t${toHalfWidth(currentDeed.landDescription.zoningType || '') || '無'}`);
      lines.push(`使用地類別\t${toHalfWidth(currentDeed.landDescription.landUseCategory || '') || '無'}`);
      lines.push(`地上建物建號\t${currentDeed.landDescription.buildingNumbers.length > 0 ? toHalfWidth(currentDeed.landDescription.buildingNumbers.join(', ')) : '無'}`);
    } else {
      lines.push(`土地標示部\t無（純建物謄本）`);
    }

    if (currentDeed.buildingDescription) {
      lines.push(`建物標示部\t有`);
      lines.push(`建號\t${toHalfWidth(currentDeed.buildingDescription.buildingNumber) || '無'}`);
      lines.push(`門牌\t${toHalfWidth(currentDeed.buildingDescription.address) || '無'}`);
      lines.push(`坐落地號\t${toHalfWidth(currentDeed.buildingDescription.landNumber) || '無'}`);
      lines.push(`總面積\t${currentDeed.buildingDescription.totalArea ? `${currentDeed.buildingDescription.totalArea} 平方公尺` : '無'}`);
      lines.push(`主要用途\t${toHalfWidth(currentDeed.buildingDescription.mainUsage) || '無'}`);
      lines.push(`主要建材\t${toHalfWidth(currentDeed.buildingDescription.mainMaterial) || '無'}`);
      lines.push(`完成日期\t${toHalfWidth(currentDeed.buildingDescription.completionDate) || '無'}`);
      lines.push(`使用執照\t${toHalfWidth(currentDeed.buildingDescription.usagePermitNumber || '') || '無'}`);
    } else {
      lines.push(`建物標示部\t無（純土地謄本）`);
    }

    copyToClipboard(lines.join('\n'), '基本標示部資訊');
  };

  // 複製單一所有權人全部前次移轉明細
  const handleCopyOwnerTranches = (record: any) => {
    const tranches = record.previousTransferValues || [];
    if (tranches.length === 0) {
      showToast('⚠️ 本共有人無前次移轉明細');
      return;
    }
    const header = ['序號', '取得年月', '每㎡單價(元)', '取得持分', '分子', '分母'].join('\t');
    const rows = tranches.map((pv: any, i: number) => {
      const frac = parseFraction(pv.share);
      return [
        i + 1,
        toHalfWidth(pv.yearMonth),
        toHalfWidth(pv.value),
        toHalfWidth(pv.share || '無'),
        frac.numerator,
        frac.denominator
      ].join('\t');
    });

    copyToClipboard([header, ...rows].join('\n'), `登記次序 ${record.registrationOrder} 前次移轉明細 (共${tranches.length}筆)`);
  };

  // 匯出多筆整合 CSV (純半形，無也是明確寫 "無")
  const handleDownloadCSV = () => {
    if (!deeds || deeds.length === 0) return;

    const headers = [
      "謄本編號", "謄本大類", "標的種類", "地段地號/建號", "列印時間", "謄本起始頁",
      "部別", "頁碼", "登記次序", "所有權人", "統一編號", 
      "權利範圍", "分子", "分母", "公同共有",
      "當期申報地價", "前次移轉與歷次取得明細",
      "登記日期", "登記原因", "原因發生日", "權狀字號", "相關他項次序",
      "限制登記事項", "一般備註", "住址"
    ];

    const rows: string[][] = [];

    deeds.forEach((deed, deedIdx) => {
      const deedNo = `Deed-${deedIdx + 1}`;
      const deedStartPage = String(deed.startPage || 1);
      
      // 所有權部列
      if (deed.ownershipRecords.length > 0) {
        deed.ownershipRecords.forEach((r) => {
          const frac = parseFraction(r.ownershipShare);

          const restrictionsText = r.restrictions && r.restrictions.length > 0
            ? r.restrictions.map(re => `${toHalfWidth(re.type)}${re.caseNumber ? `(${toHalfWidth(re.caseNumber)})` : ''}`).join('; ')
            : "無";

          const prevValuesText = r.previousTransferValues && r.previousTransferValues.length > 0
            ? r.previousTransferValues.map((pv, i) => {
                const tf = parseFraction(pv.share);
                return `[${i+1}] ${toHalfWidth(pv.yearMonth)}: ${toHalfWidth(pv.value)}元/㎡ (持分:${toHalfWidth(pv.share || '無')},分子:${tf.numerator},分母:${tf.denominator})`;
              }).join(' ; ')
            : "無";

          const notesText = r.generalNotes && r.generalNotes.length > 0
            ? toHalfWidth(r.generalNotes.join('; '))
            : (toHalfWidth(r.rawOtherNotes || '') || "無");

          rows.push([
            deedNo,
            toHalfWidth(deed.category) || "無",
            toHalfWidth(deed.documentType) || "無",
            toHalfWidth(deed.identifier) || "無",
            toHalfWidth(deed.printTime) || "無",
            deedStartPage,
            "所有權部",
            String(r.pageNumber || deed.startPage || 1),
            toHalfWidth(r.registrationOrder) || "無",
            toHalfWidth(r.ownerName || '') || "無",
            toHalfWidth(r.ownerId || '') || "無",
            frac.text,
            frac.numerator,
            frac.denominator,
            r.isJointOwnership ? "是 (公同共有)" : "否",
            r.currentAnnouncedLandValue ? `${toHalfWidth(r.currentAnnouncedLandValue)} 元/㎡` : "無",
            prevValuesText,
            toHalfWidth(r.registrationDate) || "無",
            toHalfWidth(r.registrationReason) || "無",
            toHalfWidth(r.causeDate || '') || "無",
            toHalfWidth(r.certificateNumber || '') || "無",
            toHalfWidth(r.relatedMortgageOrders || '') || "無",
            restrictionsText,
            notesText,
            toHalfWidth(r.ownerAddress || '') || "無"
          ]);
        });
      }

      // 他項權利部列
      if (deed.otherRightsRecords.length > 0) {
        deed.otherRightsRecords.forEach((m) => {
          const debtorsText = m.debtors && m.debtors.length > 0
            ? m.debtors.map(d => `${toHalfWidth(d.name)}${d.id ? `(${toHalfWidth(d.id)})` : ''}`).join('; ')
            : "無";

          const receiveNo = (m.receiveYear && m.receiveNumber) 
            ? `${toHalfWidth(m.receiveYear)} ${toHalfWidth(m.receiveNumber)}` 
            : (toHalfWidth(m.receiveNumber || '') || "無");

          const shareFrac = parseFraction(m.setShare || m.debtShare || '');

          rows.push([
            deedNo,
            toHalfWidth(deed.category) || "無",
            toHalfWidth(deed.documentType) || "無",
            toHalfWidth(deed.identifier) || "無",
            toHalfWidth(deed.printTime) || "無",
            deedStartPage,
            "他項權利部",
            String(m.pageNumber || deed.startPage || 1),
            toHalfWidth(m.registrationOrder) || "無",
            toHalfWidth(m.obligeeName || '') || "無",
            toHalfWidth(m.obligeeId || '') || "無",
            shareFrac.text,
            shareFrac.numerator,
            shareFrac.denominator,
            "無",
            toHalfWidth(m.securedAmount || '') || "無",
            "無",
            toHalfWidth(m.registrationDate || '') || "無",
            toHalfWidth(m.registrationReason || '') || "無",
            toHalfWidth(m.maturityDate || '') || "無",
            receiveNo,
            toHalfWidth(m.certificateNumber || '') || "無",
            toHalfWidth(m.securedTypeAndScope || '') || "無",
            `債務人:${debtorsText}; 利息:${toHalfWidth(m.interest || '無')}; 備註:${m.otherNotes.length > 0 ? toHalfWidth(m.otherNotes.join('; ')) : '無'}`,
            toHalfWidth(m.obligeeAddress || '') || "無"
          ]);
        });
      }
    });

    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...rows.map(row => row.map(v => `"${String(v || '無').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const fileName = deeds.length === 1 
      ? `${toHalfWidth(deeds[0].identifier || '謄本')}_細項解析結果.csv` 
      : `謄本多筆細項解析匯總_${deeds.length}筆.csv`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`✅ 已匯出 ${deeds.length} 筆謄本之細項 CSV (全半形標準格式)`);
  };

  if (!deeds || deeds.length === 0 || !currentDeed) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>載入謄本資料中...</div>
      </div>
    );
  }

  return (
    <>
      {/* 頂部固定導覽列 */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logoContainer}>
            <Image src="/LOGO.svg" alt="中泰估價 Logo" width={140} height={42} className={styles.logo} priority />
            <h1 className={styles.title}>謄本解析結果</h1>
          </div>
          <div className={styles.actions}>
            {pdfId && (
              <button 
                onClick={() => setShowSplitView(!showSplitView)} 
                className={`${styles.splitToggleBtn} ${showSplitView ? styles.activeSplit : ''}`}
                title={showSplitView ? "收合左側原始 PDF 對照" : "開啟左側原始 PDF 對照視窗"}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="12" y1="3" x2="12" y2="21"/>
                </svg>
                <span>{showSplitView ? '收合 PDF 對照' : '開啟 PDF 對照'}</span>
              </button>
            )}
            <button onClick={() => router.push('/')} className={styles.secondaryBtn}>
              重新上傳
            </button>
            <button onClick={handleDownloadCSV} className={styles.primaryBtn}>
              匯出細項 CSV ({deeds.length}筆)
            </button>
          </div>
        </div>
      </header>

      <main className={`${styles.container} ${showSplitView && pdfId ? styles.containerSplit : ''}`}>
        {/* 左側：原始 PDF 即時串流對照面板 */}
        {showSplitView && pdfId && (
          <aside className={styles.pdfPane}>
            <div className={styles.pdfPaneHeader}>
              <div className={styles.pdfPaneTitle}>
                <span>📄 原始電子謄本預覽對照</span>
              </div>
              <div className={styles.pdfNavControls}>
                <div className={styles.pageNavGroup}>
                  <button 
                    className={styles.pageNavBtn}
                    onClick={() => setCurrentPdfPage(p => Math.max(1, p - 1))}
                    title="上一頁"
                  >
                    ◀
                  </button>
                  <span className={styles.currentPdfPageTag}>
                    第 <strong>{currentPdfPage}</strong> 頁
                  </span>
                  <button 
                    className={styles.pageNavBtn}
                    onClick={() => setCurrentPdfPage(p => p + 1)}
                    title="下一頁"
                  >
                    ▶
                  </button>
                </div>
                <a 
                  href={`/api/pdf/${pdfId}#page=${currentPdfPage}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={styles.pdfExternalLink}
                  title="在新分頁另開放大檢視當前頁"
                >
                  新分頁 ↗
                </a>
              </div>
            </div>
            <iframe 
              key={currentPdfPage}
              src={`/api/pdf/${pdfId}#page=${currentPdfPage}&view=FitH`} 
              className={styles.pdfIframe}
              title="原始謄本 PDF 檢視"
            />
          </aside>
        )}

        <div className={`${styles.content} ${showSplitView && pdfId ? styles.contentSplit : ''}`}>
          
          {/* 謄本分頁標籤列 */}
          <div className={styles.tabSection}>
            <div className={styles.tabHeaderRow}>
              <span className={styles.tabTitle}>謄本清單</span>
              <span className={styles.totalBadge}>共 {deeds.length} 筆獨立謄本</span>
            </div>
            <div className={styles.tabList}>
              {deeds.map((deed, idx) => {
                const isActive = idx === selectedDeedIndex;
                const isCat1 = deed.category === "第一類謄本";
                const isCat3 = deed.category === "第三類謄本";
                const catTagClass = isCat1 ? styles.catTag1 : isCat3 ? styles.catTag3 : styles.catTag2;
                return (
                  <button
                    key={deed.id || idx}
                    className={`${styles.tabItem} ${isActive ? styles.tabItemActive : ''}`}
                    onClick={() => {
                      setSelectedDeedIndex(idx);
                      if (deed.startPage) {
                        jumpToPage(deed.startPage);
                      }
                    }}
                  >
                    <div className={styles.tabItemTitle}>
                      {toHalfWidth(deed.identifier || deed.title)}
                      {deed.startPage && (
                        <span className={styles.startPageBadge}>P.{deed.startPage}起</span>
                      )}
                    </div>
                    <div className={styles.tabItemSub}>
                      <span className={`${styles.categoryTag} ${catTagClass}`}>
                        {deed.category}
                      </span>
                      <span>所有權 {deed.ownershipRecords.length}筆</span>
                      {deed.otherRightsRecords.length > 0 ? (
                        <span>• 他項 {deed.otherRightsRecords.length}筆</span>
                      ) : (
                        <span>• 他項 無</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 人工複核提示橫幅 */}
          {currentDeed.needsManualReview && (
            <div className={styles.warningBanner}>
              <div className={styles.warningTitle}>⚠️ 需要人工複核</div>
              <div>{currentDeed.reviewReason || "系統判斷部分欄位格式可能需要核對，請人工確認。"}</div>
            </div>
          )}

          {/* 檢視模式切換 (表格 / JSON) */}
          <div className={styles.viewToggle}>
            <button 
              className={`${styles.toggleBtn} ${viewMode === 'table' ? styles.active : ''}`}
              onClick={() => setViewMode('table')}
            >
              表格檢視 (細緻排版)
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
              {/* 卡片一：標示部基本資訊 (獨立細項排版，無也寫無) */}
              <section className={styles.card}>
                <div className={styles.tableHeaderContainer}>
                  <h2 className={styles.cardTitle}>
                    基本標示資訊 — {currentDeed.title}
                    <span className={styles.countTag}>{currentDeed.category}</span>
                    {currentDeed.startPage && (
                      <button 
                        type="button"
                        className={`${styles.pageJumpBadge} ${currentPdfPage === currentDeed.startPage ? styles.activeBadge : ''}`}
                        onClick={() => jumpToPage(currentDeed.startPage, 'basic-info')}
                        title={`點擊定位至標示部起始頁 (第 ${currentDeed.startPage} 頁)`}
                      >
                        📄 P.{currentDeed.startPage}
                      </button>
                    )}
                  </h2>
                  <button onClick={handleCopyBasicInfo} className={styles.iconBtn} title="複製基本標示資訊">
                    <CopyIcon size={15} />
                    複製基本資訊 (Excel格式)
                  </button>
                </div>

                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>標的識別</span>
                    <div className={styles.infoValue}>{renderValueCell(currentDeed.identifier, '標的識別')}</div>
                  </div>

                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>列印時間</span>
                    <div className={styles.infoValue}>{renderValueCell(currentDeed.printTime, '列印時間')}</div>
                  </div>

                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>謄本種類碼</span>
                    <div className={styles.infoValue}>{renderValueCell(currentDeed.verificationCode, '種類碼')}</div>
                  </div>

                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>資料管轄機關</span>
                    <div className={styles.infoValue}>{renderValueCell(currentDeed.authority, '管轄機關')}</div>
                  </div>

                  {/* 土地標示部 */}
                  {currentDeed.landDescription ? (
                    <>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>地段 / 地號</span>
                        <div className={styles.infoValue}>
                          {renderValueCell(`${currentDeed.landDescription.section} ${currentDeed.landDescription.landNumber}`, '地段地號')}
                        </div>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>土地面積</span>
                        <div className={styles.infoValue}>
                          {renderValueCell(currentDeed.landDescription.area ? `${currentDeed.landDescription.area} 平方公尺` : null, '土地面積')}
                        </div>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>公告土地現值</span>
                        <div className={styles.infoValue}>
                          {renderValueCell(
                            currentDeed.landDescription.announcedValue 
                              ? `${currentDeed.landDescription.announcedValue.valuePerSquareMeter} 元/㎡ (${currentDeed.landDescription.announcedValue.yearMonth})` 
                              : null,
                            '公告土地現值'
                          )}
                        </div>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>使用分區 / 地類別</span>
                        <div className={styles.infoValue}>
                          {renderValueCell(
                            currentDeed.landDescription.zoningType || currentDeed.landDescription.landUseCategory
                              ? `${currentDeed.landDescription.zoningType || '無'} / ${currentDeed.landDescription.landUseCategory || '無'}`
                              : null,
                            '使用分區類別'
                          )}
                        </div>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>地上建物建號</span>
                        <div className={styles.infoValue}>
                          {renderValueCell(
                            currentDeed.landDescription.buildingNumbers.length > 0 
                              ? currentDeed.landDescription.buildingNumbers.join(', ') 
                              : null,
                            '地上建物建號'
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>土地標示部</span>
                      <span className={styles.emptyText}>無（本件為純建物謄本）</span>
                    </div>
                  )}

                  {/* 建物標示部 */}
                  {currentDeed.buildingDescription ? (
                    <>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>建號</span>
                        <div className={styles.infoValue}>
                          {renderValueCell(currentDeed.buildingDescription.buildingNumber, '建號')}
                        </div>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>建物門牌</span>
                        <div className={styles.infoValue}>
                          {renderValueCell(currentDeed.buildingDescription.address, '門牌')}
                        </div>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>坐落地號</span>
                        <div className={styles.infoValue}>
                          {renderValueCell(currentDeed.buildingDescription.landNumber, '坐落地號')}
                        </div>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>總面積 / 層次面積</span>
                        <div className={styles.infoValue}>
                          {renderValueCell(
                            currentDeed.buildingDescription.totalArea 
                              ? `${currentDeed.buildingDescription.totalArea} ㎡ (${currentDeed.buildingDescription.currentFloor || '無'})` 
                              : null,
                            '建物面積'
                          )}
                        </div>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>主要用途 / 建材</span>
                        <div className={styles.infoValue}>
                          {renderValueCell(
                            currentDeed.buildingDescription.mainUsage 
                              ? `${currentDeed.buildingDescription.mainUsage} (${currentDeed.buildingDescription.mainMaterial || '無'})` 
                              : null,
                            '主要用途'
                          )}
                        </div>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>建築完成日 / 使用執照</span>
                        <div className={styles.infoValue}>
                          {renderValueCell(
                            currentDeed.buildingDescription.completionDate || currentDeed.buildingDescription.usagePermitNumber
                              ? `${currentDeed.buildingDescription.completionDate || '無'} / 執照:${currentDeed.buildingDescription.usagePermitNumber || '無'}`
                              : null,
                            '建築執照'
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>建物標示部</span>
                      <span className={styles.emptyText}>無（本件為純土地謄本）</span>
                    </div>
                  )}
                </div>
              </section>

              {/* 卡片二：所有權部紀錄 (欄位徹底分離，排版合理簡潔，含上下分子分母) */}
              <section className={styles.card}>
                <div className={styles.tableHeaderContainer}>
                  <h2 className={styles.cardTitle}>
                    所有權部紀錄
                    <span className={styles.countTag}>
                      {currentDeed.ownershipRecords.length > 0 ? `共 ${currentDeed.ownershipRecords.length} 位所有權人` : '無'}
                    </span>
                  </h2>
                  <button 
                    onClick={() => handleCopyTable('ownership-table', '所有權部表格')} 
                    className={styles.iconBtn}
                    title="複製所有權部表格至 Excel"
                  >
                    <CopyIcon size={15} />
                    複製所有權表格 (Excel格式)
                  </button>
                </div>

                <div className={styles.tableWrapper}>
                  <table id="ownership-table" className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th style={{ width: '50px', textAlign: 'center' }}>次序</th>
                        <th>所有權人</th>
                        <th>統一編號</th>
                        <th style={{ minWidth: '150px' }}>權利範圍 (含上下分子分母)</th>
                        <th style={{ width: '80px', textAlign: 'center' }}>公同共有</th>
                        <th>申報地價</th>
                        <th style={{ minWidth: '420px' }}>前次移轉與歷次取得明細 (完整正常列出)</th>
                        <th>登記日期</th>
                        <th>登記原因</th>
                        <th>原因發生日</th>
                        <th>權狀字號</th>
                        <th>相關他項次序</th>
                        <th>限制登記</th>
                        <th>一般備註</th>
                        <th style={{ minWidth: '180px' }}>住址</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentDeed.ownershipRecords.map((record, idx) => {
                        const tranches = record.previousTransferValues || [];
                        const frac = parseFraction(record.ownershipShare);
                        const recordKey = `owner-${idx}`;
                        const isRowActive = activeRecordKey === recordKey;
                        const pageNum = record.pageNumber || currentDeed.startPage || 1;

                        return (
                          <tr 
                            key={idx}
                            className={`${styles.clickableRow} ${isRowActive ? styles.focusedRow : ''}`}
                            onClick={() => jumpToPage(pageNum, recordKey)}
                            title={`點擊定位至左側 PDF 第 ${pageNum} 頁`}
                          >
                            {/* 1. 次序 */}
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>
                              <div className={styles.orderCellContent}>
                                {renderValueCell(record.registrationOrder, '登記次序')}
                                <button 
                                  type="button"
                                  className={`${styles.pageJumpBadge} ${currentPdfPage === pageNum ? styles.activeBadge : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    jumpToPage(pageNum, recordKey);
                                  }}
                                  title={`點擊定位至左側 PDF 第 ${pageNum} 頁`}
                                >
                                  📄 P.{pageNum}
                                </button>
                              </div>
                            </td>

                            {/* 2. 所有權人 */}
                            <td style={{ fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem' }}>
                                {renderValueCell(record.ownerName, '所有權人')}
                                <button 
                                  className={styles.editCellBtn} 
                                  onClick={() => handleEditRecord(selectedDeedIndex, idx, 'ownerName', record.ownerName)}
                                  title="核對左側 PDF 並修改姓名"
                                >
                                  ✏️
                                </button>
                              </div>
                            </td>

                            {/* 3. 統一編號 */}
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem' }}>
                                {record.ownerId === '無 (依法隱匿)' ? (
                                  <span className={styles.legalHiddenBadge} title="土地登記規則第24條之1規定：第三類謄本依法隱匿登記名義人之統一編號與出生日期">
                                    無 (依法隱匿)
                                  </span>
                                ) : (
                                  renderValueCell(record.ownerId, '統一編號')
                                )}
                                <button 
                                  className={styles.editCellBtn} 
                                  onClick={() => handleEditRecord(selectedDeedIndex, idx, 'ownerId', record.ownerId)}
                                  title="核對左側 PDF 並修改統編"
                                >
                                  ✏️
                                </button>
                              </div>
                            </td>

                            {/* 4. 權利範圍 (含上下分子分母兩個欄位，純數字好複製) */}
                            <td>
                              <div className={styles.shareContainer}>
                                <div className={styles.shareMainText}>
                                  {renderValueCell(record.ownershipShare, '權利範圍')}
                                </div>
                                {frac.numerator !== '無' && (
                                  <div className={styles.fractionBox}>
                                    <div 
                                      className={styles.fractionRow}
                                      onClick={() => copyToClipboard(frac.numerator, '分子')}
                                      title="點擊複製分子 (純數字)"
                                    >
                                      <span className={styles.fractionLabel}>分子</span>
                                      <span className={styles.fractionNumber}>{frac.numerator}</span>
                                      <CopyIcon size={11} className={styles.fractionCopyIcon} />
                                    </div>
                                    <div 
                                      className={styles.fractionRow}
                                      onClick={() => copyToClipboard(frac.denominator, '分母')}
                                      title="點擊複製分母 (純數字)"
                                    >
                                      <span className={styles.fractionLabel}>分母</span>
                                      <span className={styles.fractionNumber}>{frac.denominator}</span>
                                      <CopyIcon size={11} className={styles.fractionCopyIcon} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 5. 公同共有 */}
                            <td style={{ textAlign: 'center' }}>
                              {record.isJointOwnership ? (
                                <span style={{ color: '#0d9488', fontWeight: 700 }}>是</span>
                              ) : (
                                <span style={{ color: '#64748b' }}>否</span>
                              )}
                            </td>

                            {/* 6. 當期申報地價 */}
                            <td>
                              {renderValueCell(
                                record.currentAnnouncedLandValue ? `${record.currentAnnouncedLandValue} 元/㎡` : null,
                                '當期申報地價'
                              )}
                            </td>

                            {/* 7. 前次移轉與歷次取得明細 (正常列入表格，含分子分母) */}
                            <td>
                              {tranches.length > 0 ? (
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e40af' }}>
                                      共 {tranches.length} 筆明細：
                                    </span>
                                    {tranches.length > 1 && (
                                      <button 
                                        className={styles.batchCopyBtn}
                                        onClick={() => handleCopyOwnerTranches(record)}
                                        title="複製全部明細至 Excel"
                                      >
                                        <CopyIcon size={12} />
                                        <span>複製全部 {tranches.length} 筆明細</span>
                                      </button>
                                    )}
                                  </div>

                                  <div className={styles.trancheSubTableWrapper}>
                                    <table className={styles.trancheSubTable}>
                                      <thead>
                                        <tr>
                                          <th style={{ width: '32px', textAlign: 'center' }}>#</th>
                                          <th style={{ width: '80px' }}>取得年月</th>
                                          <th style={{ width: '90px' }}>單價 (元/㎡)</th>
                                          <th>取得持分</th>
                                          <th style={{ width: '65px', textAlign: 'center' }}>分子</th>
                                          <th style={{ width: '85px', textAlign: 'center' }}>分母</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {tranches.map((pv, pvi) => {
                                          const tFrac = parseFraction(pv.share);
                                          return (
                                            <tr key={pvi}>
                                              <td style={{ textAlign: 'center', color: '#94a3b8' }}>{pvi + 1}</td>
                                              <td>{renderValueCell(pv.yearMonth, `取得年月#${pvi+1}`)}</td>
                                              <td style={{ fontWeight: 600 }}>{renderValueCell(pv.value, `單價#${pvi+1}`)}</td>
                                              <td>{renderValueCell(pv.share, `持分#${pvi+1}`)}</td>
                                              <td style={{ textAlign: 'center' }}>
                                                {tFrac.numerator !== '無' ? (
                                                  <span 
                                                    className={styles.numBadge}
                                                    onClick={() => copyToClipboard(tFrac.numerator, `分子#${pvi+1}`)}
                                                    title="點擊複製分子"
                                                  >
                                                    {tFrac.numerator}
                                                  </span>
                                                ) : <span className={styles.emptyText}>無</span>}
                                              </td>
                                              <td style={{ textAlign: 'center' }}>
                                                {tFrac.denominator !== '無' ? (
                                                  <span 
                                                    className={styles.numBadge}
                                                    onClick={() => copyToClipboard(tFrac.denominator, `分母#${pvi+1}`)}
                                                    title="點擊複製分母"
                                                  >
                                                    {tFrac.denominator}
                                                  </span>
                                                ) : <span className={styles.emptyText}>無</span>}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ) : (
                                <span className={styles.emptyText}>無</span>
                              )}
                            </td>

                            {/* 8. 登記日期 */}
                            <td>{renderValueCell(record.registrationDate, '登記日期')}</td>

                            {/* 9. 登記原因 */}
                            <td style={{ color: '#0369a1', fontWeight: 600 }}>
                              {renderValueCell(record.registrationReason, '登記原因')}
                            </td>

                            {/* 10. 原因發生日 */}
                            <td>{renderValueCell(record.causeDate, '原因發生日')}</td>

                            {/* 11. 權狀字號 */}
                            <td>{renderValueCell(record.certificateNumber, '權狀字號')}</td>

                            {/* 12. 相關他項次序 */}
                            <td style={{ color: '#7c3aed' }}>
                              {renderValueCell(record.relatedMortgageOrders, '相關他項次序')}
                            </td>

                            {/* 13. 限制登記 */}
                            <td>
                              {record.restrictions && record.restrictions.length > 0 ? (
                                record.restrictions.map((r, ri) => (
                                  <span 
                                    key={ri} 
                                    className={r.type === '信託' ? styles.trustBadge : styles.restrictionBadge}
                                    onClick={() => copyToClipboard(`${r.type}${r.caseNumber ? `(${r.caseNumber})` : ''}`, '限制登記')}
                                    style={{ cursor: 'pointer' }}
                                    title="點擊複製限制登記"
                                  >
                                    {toHalfWidth(r.type)}{r.caseNumber ? `(${toHalfWidth(r.caseNumber)})` : ''}
                                  </span>
                                ))
                              ) : (
                                <span className={styles.emptyText}>無</span>
                              )}
                            </td>

                            {/* 14. 一般備註 */}
                            <td>
                              {record.generalNotes && record.generalNotes.length > 0 ? (
                                record.generalNotes.map((n, ni) => (
                                  <div 
                                    key={ni} 
                                    style={{ fontSize: '0.8rem', color: '#475569', cursor: 'pointer' }}
                                    onClick={() => copyToClipboard(n, '一般備註')}
                                    title="點擊複製備註"
                                  >
                                    • {toHalfWidth(n)}
                                  </div>
                                ))
                              ) : record.rawOtherNotes ? (
                                <span 
                                  style={{ fontSize: '0.8rem', cursor: 'pointer' }}
                                  onClick={() => copyToClipboard(record.rawOtherNotes, '原始備註')}
                                >
                                  {toHalfWidth(record.rawOtherNotes)}
                                </span>
                              ) : (
                                <span className={styles.emptyText}>無</span>
                              )}
                            </td>

                            {/* 15. 住址 */}
                            <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem' }}>
                                {renderValueCell(record.ownerAddress, '住址')}
                                <button 
                                  className={styles.editCellBtn} 
                                  onClick={() => handleEditRecord(selectedDeedIndex, idx, 'ownerAddress', record.ownerAddress)}
                                  title="核對左側 PDF 並修改住址"
                                >
                                  ✏️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 卡片三：他項權利部紀錄 (獨立細項欄位，無也寫無) */}
              <section className={styles.card}>
                <div className={styles.tableHeaderContainer}>
                  <h2 className={styles.cardTitle}>
                    他項權利部紀錄
                    <span className={styles.countTag}>
                      {currentDeed.otherRightsRecords.length > 0 ? `共 ${currentDeed.otherRightsRecords.length} 筆設定` : '無設定'}
                    </span>
                  </h2>
                  {currentDeed.otherRightsRecords.length > 0 && (
                    <button 
                      onClick={() => handleCopyTable('other-rights-table', '他項權利部表格')} 
                      className={styles.iconBtn}
                      title="複製他項權利部表格至 Excel"
                    >
                      <CopyIcon size={15} />
                      複製他項權利表 (Excel格式)
                    </button>
                  )}
                </div>

                {currentDeed.otherRightsRecords.length > 0 ? (
                  <div className={styles.tableWrapper}>
                    <table id="other-rights-table" className={styles.dataTable}>
                      <thead>
                        <tr>
                          <th style={{ width: '60px', textAlign: 'center' }}>次序</th>
                          <th>權利種類</th>
                          <th>擔保債權總金額</th>
                          <th>權利人 (姓名/公司)</th>
                          <th>統一編號</th>
                          <th>住址</th>
                          <th>債權比例</th>
                          <th>設定權利範圍</th>
                          <th>收件年期/字號</th>
                          <th>登記日期</th>
                          <th>登記原因</th>
                          <th>債務人</th>
                          <th>確定期日</th>
                          <th>利息約定</th>
                          <th>其他約定事項</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentDeed.otherRightsRecords.map((m, mIdx) => {
                          const mortKey = `mort-${mIdx}`;
                          const isMortActive = activeRecordKey === mortKey;
                          const mortPageNum = m.pageNumber || currentDeed.startPage || 1;

                          return (
                            <tr 
                              key={mIdx}
                              className={`${styles.clickableRow} ${isMortActive ? styles.focusedRow : ''}`}
                              onClick={() => jumpToPage(mortPageNum, mortKey)}
                              title={`點擊定位至左側 PDF 第 ${mortPageNum} 頁`}
                            >
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                <div className={styles.orderCellContent}>
                                  {renderValueCell(m.registrationOrder, '他項次序')}
                                  <button 
                                    type="button"
                                    className={`${styles.pageJumpBadge} ${currentPdfPage === mortPageNum ? styles.activeBadge : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      jumpToPage(mortPageNum, mortKey);
                                    }}
                                    title={`點擊定位至左側 PDF 第 ${mortPageNum} 頁`}
                                  >
                                    📄 P.{mortPageNum}
                                  </button>
                                </div>
                              </td>
                              <td style={{ color: '#b45309', fontWeight: 600 }}>
                                {renderValueCell(m.rightType, '權利種類')}
                              </td>
                              <td style={{ fontWeight: 700, color: '#0f172a' }}>
                                {renderValueCell(m.securedAmount, '擔保金額')}
                              </td>
                              <td style={{ fontWeight: 600 }}>
                                {renderValueCell(m.obligeeName, '權利人')}
                              </td>
                              <td>
                                {renderValueCell(m.obligeeId, '權利人統編')}
                              </td>
                              <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                {renderValueCell(m.obligeeAddress, '權利人住址')}
                              </td>
                              <td>{renderValueCell(m.debtShare, '債權比例')}</td>
                              <td>{renderValueCell(m.setShare, '設定範圍')}</td>
                              <td>
                                {renderValueCell(
                                  (m.receiveYear && m.receiveNumber) ? `${m.receiveYear} ${m.receiveNumber}` : m.receiveNumber,
                                  '收件字號'
                                )}
                              </td>
                              <td>{renderValueCell(m.registrationDate, '登記日期')}</td>
                              <td>{renderValueCell(m.registrationReason, '登記原因')}</td>
                              <td>
                                {m.debtors && m.debtors.length > 0 ? (
                                  m.debtors.map((d, di) => (
                                    <div 
                                      key={di} 
                                      style={{ cursor: 'pointer' }}
                                      onClick={() => copyToClipboard(`${d.name}${d.id ? `(${d.id})` : ''}`, '債務人')}
                                    >
                                      {toHalfWidth(d.name)}{d.id ? ` (${toHalfWidth(d.id)})` : ''}
                                    </div>
                                  ))
                                ) : <span className={styles.emptyText}>無</span>}
                              </td>
                              <td>{renderValueCell(m.maturityDate, '確定期日')}</td>
                              <td>{renderValueCell(m.interest, '利息約定')}</td>
                              <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                                {m.otherNotes && m.otherNotes.length > 0 
                                  ? renderValueCell(m.otherNotes.join('; '), '其他登記事項')
                                  : <span className={styles.emptyText}>無</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: '#94a3b8', padding: '1.5rem 0', textAlign: 'center', background: '#f8fafc', borderRadius: '8px' }}>
                    他項權利部：無（本標的無抵押權或其他他項權利設定）
                  </div>
                )}
              </section>
            </>
          ) : (
            /* JSON 檢視模式 */
            <section className={styles.card}>
              <div className={styles.tableHeaderContainer}>
                <h2 className={styles.cardTitle}>原始 JSON 結構資料 (全半形標準化)</h2>
                <button 
                  onClick={() => copyToClipboard(JSON.stringify(deeds, null, 2), '全部 JSON')} 
                  className={styles.iconBtn}
                >
                  <CopyIcon size={15} />
                  複製全部 JSON (半形)
                </button>
              </div>
              <pre className={styles.jsonViewer}>
                {JSON.stringify(deeds, null, 2)}
              </pre>
            </section>
          )}

        </div>
      </main>

      {/* 提示訊息彈窗 */}
      {toast && (
        <div className={styles.toast}>
          {toast}
        </div>
      )}
    </>
  );
}
