import { z } from 'zod';

// 單筆所有權登記次序
export const OwnershipRecordSchema = z.object({
  registrationOrder: z.string(),           // 登記次序，如 "0024"
  registrationDate: z.string(),             // 民國年登記日期
  registrationReason: z.string(),           // 登記原因，如 "分割繼承"
  causeDate: z.string().nullable(),         // 原因發生日期
  ownershipShare: z.string(),               // 權利範圍，如 "16分之1"
  isJointOwnership: z.boolean(),            // 是否公同共有
  certificateNumber: z.string().nullable(), // 權狀字號
  currentAnnouncedLandValue: z.string().nullable(), // 當期申報地價
  previousTransferValue: z.object({
    yearMonth: z.string(),
    value: z.string(),
  }).nullable(),
  historicalShare: z.string().nullable(),   // 歷次取得權利範圍
  restrictions: z.array(z.object({          // 由LLM層產出
    type: z.enum(["查封", "假扣押", "假處分", "預告登記", "其他", "無"]),
    caseNumber: z.string().nullable(),      // 案號
    creditor: z.string().nullable(),        // 債權人
    debtors: z.array(z.string()).nullable(),// 債務人（可多人）
    restrictedShare: z.string().nullable(), // 限制範圍
    registeredDate: z.string().nullable(),
  })).default([]),
  generalNotes: z.array(z.string()).default([]), // 一般註記事項
});

// 土地標示部
export const LandDescriptionSchema = z.object({
  section: z.string(),          // 地段，如 "松山區民生段"
  landNumber: z.string(),       // 地號，如 "0056-0029"
  registrationDate: z.string(),
  area: z.number(),             // 平方公尺
  zoningType: z.string().nullable(),
  landUseCategory: z.string().nullable(),
  announcedValue: z.object({
    yearMonth: z.string(),
    valuePerSquareMeter: z.number(),
  }).nullable(),
  buildingNumbers: z.array(z.string()).default([]), // 地上建物建號
});

// 建物標示部
export const BuildingDescriptionSchema = z.object({
  buildingNumber: z.string(),    // 建號
  address: z.string(),           // 建物門牌
  landNumber: z.string(),        // 建物坐落地號
  mainUsage: z.string(),         // 主要用途
  mainMaterial: z.string(),      // 主要建材
  floors: z.number(),
  totalArea: z.number(),
  currentFloor: z.string(),
  currentFloorArea: z.number(),
  completionDate: z.string(),
  usagePermitNumber: z.string().nullable(),
});

// 完整謄本解析結果
export const DeedParsingResultSchema = z.object({
  documentType: z.enum(["土地登記謄本", "建物登記謄本"]),
  printTime: z.string(),
  landDescription: LandDescriptionSchema.nullable(),
  buildingDescription: BuildingDescriptionSchema.nullable(),
  ownershipRecords: z.array(OwnershipRecordSchema),
  needsManualReview: z.boolean(),   // Zod驗證失敗或LLM信心度低時標記為true
  reviewReason: z.string().nullable(),
});

export type OwnershipRecord = z.infer<typeof OwnershipRecordSchema>;
export type LandDescription = z.infer<typeof LandDescriptionSchema>;
export type BuildingDescription = z.infer<typeof BuildingDescriptionSchema>;
export type DeedParsingResult = z.infer<typeof DeedParsingResultSchema>;
