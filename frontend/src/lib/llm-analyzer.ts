import Groq from 'groq-sdk';
import { OwnershipRecordSchema } from './schema';
import { z } from 'zod';

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'groq';
const LLM_MODEL = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';

// 建立 Groq 實例
// 在正式環境需注意資料隱私保護（個資法）
const groq = new Groq({
  apiKey: process.env.LLM_API_KEY || 'dummy-key-for-build',
});

// 我們只需要 OwnershipRecordSchema 裡面的 restrictions 和 generalNotes 部分
const LlmOutputSchema = z.object({
  restrictions: OwnershipRecordSchema.shape.restrictions,
  generalNotes: OwnershipRecordSchema.shape.generalNotes,
});

export type LlmOutput = z.infer<typeof LlmOutputSchema>;

const SYSTEM_PROMPT = `你是台灣地政士專用的謄本文字判讀助手。以下是一段從土地/建物登記謄本
「其他登記事項」欄位擷取的原始文字，可能包含「限制登記事項」和
「一般註記事項」兩種類型的資訊。

請仔細判讀並僅輸出符合以下JSON Schema的結果，不要輸出任何額外說明文字：

{
  "restrictions": [
    {
      "type": "查封 | 假扣押 | 假處分 | 預告登記 | 其他 | 無",
      "caseNumber": "案號字串或null",
      "creditor": "債權人姓名/公司名稱或null",
      "debtors": ["債務人1", "債務人2"] 或 null,
      "restrictedShare": "限制範圍字串，如'32分之1'，或null",
      "registeredDate": "民國年月日字串或null"
    }
  ],
  "generalNotes": ["一般註記事項的原文摘要（逐條列出）"]
}

判讀規則：
1. 若文字中出現「依臺灣XX地方法院...查封登記」，type應判為「查封」
2. 若完全沒有限制登記相關文字，restrictions輸出空陣列 []
3. 債務人若有多人，務必全部列出，並保留括號中的身分關係說明
   （例如「張文德（即張承豐之繼承人）」需完整保留括號內容）
4. 一般註記事項（如「主登記次序...公同共有」「未會同申請，欠繳書狀費」）
   一律歸入 generalNotes，不要誤判為restrictions
5. 絕對不要臆測或補充原文沒有明確寫出的資訊，若無法判斷某欄位，填null
`;

/**
 * 第三層：LLM 語意判斷模組
 * 僅處理 Regex 無法確定性解析的「其他登記事項」片段
 * @param otherRegistrationText 其他登記事項原文
 */
export async function analyzeOtherRegistration(otherRegistrationText: string): Promise<LlmOutput> {
  if (!otherRegistrationText || otherRegistrationText.trim() === '') {
    return { restrictions: [], generalNotes: [] };
  }

  const userPrompt = `待判讀原文：\n"""\n${otherRegistrationText}\n"""`;

  try {
    if (LLM_PROVIDER === 'groq') {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        model: LLM_MODEL,
        temperature: 0.1, // 降低隨機性，提高穩定性
        response_format: { type: 'json_object' },
      });

      const content = chatCompletion.choices[0]?.message?.content || '{}';
      const parsedJson = JSON.parse(content);
      
      // 使用 Zod 進行格式驗證
      return LlmOutputSchema.parse(parsedJson);
    } else {
      // 預留其他 Provider (如 Anthropic/OpenAI) 的介面
      throw new Error(`Unsupported LLM provider: ${LLM_PROVIDER}`);
    }
  } catch (error: any) {
    console.error('LLM Analysis Error:', error);
    // 若 LLM 發生錯誤或驗證失敗，回傳空陣列並依賴外層標記需要人工複核
    throw new Error('LLM 解析失敗或格式驗證錯誤: ' + (error.message || error.toString()));
  }
}
