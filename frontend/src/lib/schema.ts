import { z } from 'zod';

// 前次移轉現值明細（可有多筆歷史紀錄）
export const PreviousTransferValueSchema = z.object({
  yearMonth: z.string(),                  // 如 "105年08月"
  value: z.string(),                      // 如 "5,076.3"
  share: z.string().nullable().optional() // 如 "100000分之44"
});

// 單筆所有權登記次序
export const OwnershipRecordSchema = z.object({
  registrationOrder: z.string(),                  // 登記次序，如 "0024"
  registrationDate: z.string(),                    // 登記日期，如 "民國111年09月05日"
  registrationReason: z.string(),                  // 登記原因，如 "分割繼承"
  causeDate: z.string().nullable(),                // 原因發生日期
  
  // 第二類謄本或含有所有權人個資之欄位
  ownerName: z.string().nullable().optional(),     // 所有權人姓名（二類為遮罩或公司名稱）
  ownerId: z.string().nullable().optional(),       // 統一編號
  ownerAddress: z.string().nullable().optional(),  // 住址
  
  ownershipShare: z.string(),                      // 權利範圍，如 "16分之1"
  isJointOwnership: z.boolean(),                   // 是否公同共有
  certificateNumber: z.string().nullable(),        // 權狀字號
  currentAnnouncedLandValue: z.string().nullable(),// 當期申報地價
  
  // 歷次取得與前次移轉
  previousTransferValues: z.array(PreviousTransferValueSchema).default([]),
  historicalShare: z.string().nullable().optional(), // 摘要歷次取得權利範圍
  
  // 相關他項權利次序 (如 "0090-000 0096-000")
  relatedMortgageOrders: z.string().nullable().optional(),

  // 由 LLM 判讀或正則解析之限制登記與註記
  restrictions: z.array(z.object({
    type: z.enum(["查封", "假扣押", "假處分", "預告登記", "信託", "其他", "無"]),
    caseNumber: z.string().nullable(),             // 案號
    creditor: z.string().nullable(),               // 債權人
    debtors: z.array(z.string()).nullable(),       // 債務人（可多人）
    restrictedShare: z.string().nullable(),        // 限制範圍
    registeredDate: z.string().nullable(),
  })).default([]),
  generalNotes: z.array(z.string()).default([]),    // 一般註記事項
  rawOtherNotes: z.string().nullable().optional(), // 原始其他登記事項純文字備查
  pageNumber: z.number().optional(),               // 位於原始 PDF 之頁碼 (對照定位使用)
});

// 土地標示部
export const LandDescriptionSchema = z.object({
  section: z.string(),                             // 地段，如 "新市區三舍段"
  landNumber: z.string(),                          // 地號，如 "0587-0007"
  registrationDate: z.string().nullable(),         // 登記日期
  registrationReason: z.string().nullable(),       // 登記原因
  area: z.number(),                                // 平方公尺
  zoningType: z.string().nullable(),               // 使用分區
  landUseCategory: z.string().nullable(),          // 使用地類別
  announcedValue: z.object({
    yearMonth: z.string(),
    valuePerSquareMeter: z.number(),
  }).nullable(),
  buildingNumbers: z.array(z.string()).default([]),// 地上建物建號
  otherNotes: z.array(z.string()).default([]),     // 標示部其他登記事項
});

// 建物標示部
export const BuildingDescriptionSchema = z.object({
  section: z.string().nullable().optional(),       // 地段
  buildingNumber: z.string(),                      // 建號，如 "04256-000"
  address: z.string(),                             // 建物門牌
  landNumber: z.string(),                          // 建物坐落地號
  mainUsage: z.string(),                           // 主要用途
  mainMaterial: z.string(),                        // 主要建材
  floors: z.number(),                              // 層數
  totalArea: z.number(),                           // 總面積 (平方公尺)
  currentFloor: z.string(),                        // 層次
  currentFloorArea: z.number(),                    // 層次面積 (平方公尺)
  completionDate: z.string(),                      // 建築完成日期
  usagePermitNumber: z.string().nullable(),        // 使用執照字號
  otherNotes: z.array(z.string()).default([]),     // 標示部其他登記事項
});

// 他項權利部登記次序
export const OtherRightsRecordSchema = z.object({
  registrationOrder: z.string(),                   // 登記次序，如 "0003-000"
  rightType: z.string(),                           // 權利種類，如 "最高限額抵押權", "抵押權"
  receiveYear: z.string().nullable().optional(),   // 收件年期
  receiveNumber: z.string().nullable().optional(), // 字號
  registrationDate: z.string().nullable().optional(), // 登記日期
  registrationReason: z.string().nullable().optional(), // 登記原因
  targetRegistrationOrders: z.string().nullable().optional(), // 標的登記次序
  
  // 權利人
  obligeeName: z.string().nullable().optional(),   // 權利人姓名/名稱
  obligeeId: z.string().nullable().optional(),     // 權利人統編
  obligeeAddress: z.string().nullable().optional(),// 權利人住址
  
  debtShare: z.string().nullable().optional(),     // 債權額比例，如 "全部 ***1分之1***"
  securedAmount: z.string().nullable().optional(), // 擔保債權總金額，如 "新臺幣 2,760,000,000元正"
  securedTypeAndScope: z.string().nullable().optional(), // 擔保債權種類及範圍
  maturityDate: z.string().nullable().optional(),  // 確定期日或清償日期
  interest: z.string().nullable().optional(),      // 利息/遲延利息/違約金約定
  
  // 債務人
  debtors: z.array(z.object({
    name: z.string(),
    id: z.string().nullable().optional(),
  })).default([]),
  
  setShare: z.string().nullable().optional(),      // 設定權利範圍
  certificateNumber: z.string().nullable().optional(), // 證明書字號
  jointSecuredNumbers: z.string().nullable().optional(), // 共同擔保地建號
  otherNotes: z.array(z.string()).default([]),     // 其他登記事項
  pageNumber: z.number().optional(),               // 位於原始 PDF 之頁碼 (對照定位使用)
});

// 單筆謄本解析結果
export const SingleDeedSchema = z.object({
  id: z.string(),                                  // 唯一識別碼，如 "deed-1"
  category: z.enum(["第一類謄本", "第二類謄本", "第三類謄本", "其它"]), // 謄本大類
  documentType: z.enum(["土地登記謄本", "建物登記謄本"]), // 標的種類
  title: z.string(),                               // 完整謄本標題
  identifier: z.string(),                          // 識別字串，如 "新市區三舍段 0587-0007地號"
  printTime: z.string(),                           // 列印時間
  verificationCode: z.string().nullable(),         // 謄本種類碼
  authority: z.string().nullable(),                // 管轄/核發機關
  
  landDescription: LandDescriptionSchema.nullable(),
  buildingDescription: BuildingDescriptionSchema.nullable(),
  ownershipRecords: z.array(OwnershipRecordSchema).default([]),
  otherRightsRecords: z.array(OtherRightsRecordSchema).default([]),
  
  startPage: z.number().optional(),                // 謄本在原始 PDF 起始頁碼
  needsManualReview: z.boolean().default(false),
  reviewReason: z.string().nullable().default(null),
});

// 完整解析結果（支援多筆謄本合併檔）
export const MultiDeedResultSchema = z.object({
  deeds: z.array(SingleDeedSchema),
  totalCount: z.number(),
  hasErrors: z.boolean().default(false),
});

// 舊格式相容（若有單筆呼叫處）
export const DeedParsingResultSchema = SingleDeedSchema;

export type PreviousTransferValue = z.infer<typeof PreviousTransferValueSchema>;
export type OwnershipRecord = z.infer<typeof OwnershipRecordSchema>;
export type LandDescription = z.infer<typeof LandDescriptionSchema>;
export type BuildingDescription = z.infer<typeof BuildingDescriptionSchema>;
export type OtherRightsRecord = z.infer<typeof OtherRightsRecordSchema>;
export type SingleDeed = z.infer<typeof SingleDeedSchema>;
export type MultiDeedResult = z.infer<typeof MultiDeedResultSchema>;
export type DeedParsingResult = SingleDeed;
