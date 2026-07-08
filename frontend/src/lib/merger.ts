import { parseRegex } from './regex-parser';
import { analyzeOtherRegistration } from './llm-analyzer';
import { DeedParsingResult, DeedParsingResultSchema } from './schema';

export async function mergeAndValidate(extractedText: string): Promise<DeedParsingResult> {
  const regexResult = parseRegex(extractedText);
  
  let needsManualReview = false;
  let reviewReason: string | null = null;

  try {
    for (let i = 0; i < regexResult.ownershipRecords.length; i++) {
      const record: any = regexResult.ownershipRecords[i];
      const rawNotes = record._rawOtherRegistrationText;

      if (rawNotes && rawNotes !== "（空白）") {
        const llmResult = await analyzeOtherRegistration(rawNotes);
        record.restrictions = llmResult.restrictions;
        record.generalNotes = llmResult.generalNotes;
      }
      
      // 移除輔助欄位
      delete record._rawOtherRegistrationText;
    }

    const finalData = {
      documentType: regexResult.documentType,
      printTime: regexResult.printTime,
      landDescription: regexResult.landDescription,
      buildingDescription: regexResult.buildingDescription,
      ownershipRecords: regexResult.ownershipRecords,
      needsManualReview: false,
      reviewReason: null,
    };

    const validatedData = DeedParsingResultSchema.parse(finalData);
    return validatedData;

  } catch (error: any) {
    console.error("Merge & Validate Error:", error);
    
    // 移除輔助欄位以避免 schema 錯誤
    regexResult.ownershipRecords.forEach((r: any) => delete r._rawOtherRegistrationText);

    return {
      documentType: regexResult.documentType,
      printTime: regexResult.printTime,
      landDescription: regexResult.landDescription,
      buildingDescription: regexResult.buildingDescription,
      ownershipRecords: regexResult.ownershipRecords,
      needsManualReview: true,
      reviewReason: `解析或驗證失敗: ${error.message || '未知錯誤'}`,
    };
  }
}
