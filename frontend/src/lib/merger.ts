import { parseRegex } from './regex-parser';
import { batchAnalyzeOtherRegistrations } from './llm-analyzer';
import { MultiDeedResult, MultiDeedResultSchema, SingleDeed } from './schema';

export async function mergeAndValidate(extractedText: string): Promise<MultiDeedResult> {
  const { deeds } = parseRegex(extractedText);

  try {
    // 1. 收集整份文件中所有所有權紀錄的不重複原始註記文字
    const allNotes: string[] = [];
    for (const deed of deeds) {
      for (const record of deed.ownershipRecords) {
        if (record.rawOtherNotes && record.rawOtherNotes !== '（空白）') {
          allNotes.push(record.rawOtherNotes);
        }
      }
    }

    // 2. 批次去重並行分析
    const analysisMap = await batchAnalyzeOtherRegistrations(allNotes);

    // 3. 回填分析結果至各筆謄本記錄
    for (const deed of deeds) {
      for (const record of deed.ownershipRecords) {
        if (record.rawOtherNotes && analysisMap.has(record.rawOtherNotes)) {
          const llmRes = analysisMap.get(record.rawOtherNotes)!;
          record.restrictions = llmRes.restrictions;
          record.generalNotes = llmRes.generalNotes;
        }
      }
    }

    const finalResult: MultiDeedResult = {
      deeds,
      totalCount: deeds.length,
      hasErrors: false,
    };

    return MultiDeedResultSchema.parse(finalResult);

  } catch (error: any) {
    console.error("Merge & Validate Error:", error);

    // 降級容錯處理：標記每筆謄本需要人工複核
    const fallbackDeeds: SingleDeed[] = deeds.map(deed => ({
      ...deed,
      needsManualReview: true,
      reviewReason: `部分欄位解析或驗證提示: ${error.message || '格式需確認'}`,
    }));

    return {
      deeds: fallbackDeeds,
      totalCount: fallbackDeeds.length,
      hasErrors: true,
    };
  }
}
