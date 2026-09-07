# 中泰估價 - 台灣地政謄本智慧辨識與結構化解析系統
> **Taiwan Land & Building Deed Intelligent OCR & Parser**  
> 專為不動產估價師、地政士、資產管理及金融機構量身打造之高精準度謄本解析工具。

[![Next.js](https://img.shields.io/badge/Next.js-16.2.10-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-yellow?style=flat&logo=python)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red)](#)

---

## 📖 系統簡介

台灣地政電子謄本長年存在**排版格式繁瑣**、**多頁共有人拆散**、**前次移轉持分複雜**、**同檔案合併多筆標的**、以及**第一類/第三類謄本圖層遮蔽與老舊純掃描影像**等痛點。

本系統結合了**高速規則正則引擎**與**多模態視覺 AI（Google Gemini 2.5 Flash / OpenRouter Vision）**，能將任何上傳的土地或建物謄本 PDF，在數秒至數十秒內完整轉換為高品質、半形標準化的結構化資料（JSON / 表格 / CSV），並提供左側原始 PDF 即時雙向連動核對功能。

---

## 🌟 核心特色

### 1. 第一類、第二類、第三類謄本全類別支援
* **第一類謄本**：自動偵測地政遮蔽章/個資圖層，智慧切出登記名義人影像條帶，調用 Vision AI 補全完整姓名、身分證字號與地址。
* **第二類謄本**：純文字電子謄本極速秒級解析，完美支援數十位共有人、公同共有、複雜前次移轉歷次取得明細（每㎡單價、持分、取得年月）。
* **第三類謄本（純掃描件）**：自動判定 0 數位文字之純掃描 PDF，透過 Python 渲染高解析 JPEG 並以多模態 Vision 進行多頁平行轉譯；依據《土地登記規則》第 24 條之 1 規定，自動將未公開之統編明確標示為 **`無 (依法隱匿)`**。

### 2. 左右雙欄即時雙向聯動對照（Click-to-Jump & Dual Pane）
* 右側點擊任一筆所有權人或他項權利橫列，左側內嵌 PDF 即刻精準滾動翻頁至該筆資料所在的原始頁面（`P.X`）。
* 資料列具備天藍色選取焦點光暈（`focusedRow`），長篇多頁比對絕不眼花。
* 各登記次序均附帶 `📄 P.X` 徽章，並提供「新分頁另開放大」檢視。

### 3. 細項徹底分離、純數字分子分母便利複製
* 告別資訊擠在同一個儲存格的混亂排版，所有欄位（次序、姓名、統編、持分、地價、移轉、登記日期、原因、字號、住址）獨立成欄。
* **權利範圍獨立分子分母**：將「14000分之22」貼心拆解為上下兩欄純數字，提供獨立點擊複製按鈕，方便估價師直接貼入 Excel 進行持分試算。
* 所有文字與符號一律自動轉為**半形標準格式**（例如 `1080號` 而非 `１０８０號`）。

### 4. 多筆標的自動切分（Multi-Deed Splitting）
* 若單一 PDF 內同時包含多筆土地或多筆建物（例如整批建案或重劃區清冊），系統會依標示部自動切分為獨立標籤頁（Deed Tabs），每筆標的獨立展示。

### 5. 一鍵匯出全半形標準 CSV
* 匯出檔案整合謄本大類、標的識別、原始頁碼、分子分母純數字、完整前次移轉明細、限制登記與住址，可直接匯入各類估價報告書或資料庫。

---

## 🏗️ 技術架構與解析流程

```
                           [ 上傳地政謄本 PDF 檔案 ]
                                      │
                                      ▼
                        [ 檢測數位文字層 (pdf-parse) ]
                                      │
             ┌────────────────────────┴────────────────────────┐
             │                                                 │
   [ 數位文字層 >= 50字 ]                             [ 純影像掃描件 / 文字層 < 50字 ]
   (電子謄本：第一類/第二類)                             (老舊掃描件：第三類謄本)
             │                                                 │
             ▼                                                 ▼
   [ 提取文字 + 頁碼標記 ]                           [ Python render_pdf_pages.py ]
             │                                       高解析 JPEG 批次渲染
             │                                                 │
             │                                                 ▼
             │                                    [ OpenRouter / Gemini 2.5 Flash ]
             │                                      多頁並行多模態視覺轉譯 (OCR)
             │                                                 │
             └────────────────────────┬────────────────────────┘
                                      │
                                      ▼
                          [ 注入 <<<PAGE_N>>> 統一串流 ]
                                      │
                                      ▼
                        [ Layer 2: 核心正則拆解引擎 ]
                        (regex-parser.ts)
                        - 標示部（土地/建物面積、地號、門牌）
                        - 所有權部（多共有人、公同共有、歷次移轉）
                        - 他項權利部（抵押權、債權額、債務人）
                        - 實體頁碼精準綁定（Page Tracking Engine）
                                      │
                                      ▼
                        [ Layer 3: 圖層遮蔽切條辨識 ]
                        (vision-analyzer.ts)
                        - 偵測第一類謄本缺漏文字
                        - Python extract_strips.py 裁剪條狀圖
                        - Vision AI 個資補全
                                      │
                                      ▼
                        [ Layer 4: 結構化與型別校驗 ]
                        (merger.ts & schema.ts)
                        - Zod Schema 嚴格型別校驗
                        - 全形轉半形正規化
                                      │
                                      ▼
                      [ 前端互動呈現 (Result Page) ]
                      - 左右雙向滾動聯動對照
                      - 分子/分母拆解與獨立複製
                      - 一鍵匯出標準 CSV
```

---

## 📁 專案目錄結構

```bash
zonetai-/
├── frontend/                     # Next.js 前端與 API 路由
│   ├── scripts/
│   │   ├── extract_strips.py     # 第一類謄本條狀圖層定位與裁剪腳本
│   │   └── render_pdf_pages.py   # 第三類純掃描件多頁 JPEG 渲染腳本
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── parse/        # 謄本解析主要 API 端點 (POST)
│   │   │   │   └── pdf/[id]/     # PDF 暫存與串流分頁預覽端點 (GET)
│   │   │   ├── page.tsx          # 上傳首頁
│   │   │   └── result/           # 結果對照與編輯頁面
│   │   └── lib/
│   │       ├── pdf-extractor.ts  # 數位文字提取與頁碼注入
│   │       ├── regex-parser.ts   # 核心謄本正則拆解器
│   │       ├── scanned-pdf-analyzer.ts # 純掃描件多模態辨識管理器
│   │       ├── vision-analyzer.ts# 第一類謄本圖層切條補全模組
│   │       ├── merger.ts         # 規則與 LLM 融合校正層
│   │       └── schema.ts         # Zod 資料規格定義
│   └── tests/                    # Jest 單元測試集
├── 謄本範例/                     # 包含一類、二類、多筆合併、三類測試 PDF
├── docker-compose.yml            # Docker 容器化配置
├── Dockerfile                    # 容器建置腳本
└── README.md                     # 專案說明文件
```

---

## 🚀 快速開始

### 1. 環境需求
* **Node.js**：v18.0.0 或更高版本（建議 v20+ 或 v22）
* **pnpm**：建議版本 v9+
* **Python**：v3.10+（需安裝 `pdfplumber` 與 `pillow`）

### 2. 安裝 Python 影像處理套件
```bash
pip install pdfplumber pillow
```

### 3. 設定環境變數
在專案根目錄或 `frontend/` 下建立 `.env` 檔案：
```env
# OpenRouter / Gemini API 配置
LLM_PROVIDER=openrouter
LLM_API_KEY=sk-or-v1-your-openrouter-api-key
LLM_MODEL=google/gemini-2.5-flash
```

### 4. 安裝依賴與啟動開發伺服器
```bash
cd frontend
pnpm install
pnpm dev
```
瀏覽器開啟 [http://localhost:3000](http://localhost:3000) 即可開始使用。

### 5. 執行測試與建置檢查
```bash
# 執行單元測試
pnpm test

# 執行生產環境建置
pnpm build
```

---

## ⚖️ 法規與隱私聲明

1. **《土地登記規則》第 24 條之 1**：
   - 第一類謄本：登記名義人本人申請，顯示完整姓名、統編與住址。
   - 第二類謄本：任何人均得申請，隱匿出生日期、部分身分證字號與部分住址。
   - 第三類謄本：利害關係人申請，完整公開姓名與戶籍住址，但依法隱匿統一編號與出生日期。
2. 本工具所有上傳之 PDF 檔案僅於伺服器記憶體中進行暫存串流比對，不作永久儲存；使用者應依法妥善保管謄本資料，遵循個人資料保護法相關規定。

---

## 👨‍💻 維護與授權

* **開發單位**：中泰不動產估價師事務所 (Zonetai Real Estate Appraisers Firm)
* **版權所有**：Copyright © 2026 Zonetai. All rights reserved.
