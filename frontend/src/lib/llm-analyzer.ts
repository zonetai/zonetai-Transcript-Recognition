import Groq from 'groq-sdk';
import { OwnershipRecordSchema } from './schema';
import { z } from 'zod';

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'groq';
const LLM_MODEL = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';

// 建立 Groq 實例
const groq = new Groq({
  apiKey: process.env.LLM_API_KEY || 'dummy-key-for-build',
});

// 解析輸出結構定義
const LlmOutputSchema = z.object({
  restrictions: OwnershipRecordSchema.shape.restrictions,
  generalNotes: OwnershipRecordSchema.shape.generalNotes,
});

export type LlmOutput = z.infer<typeof LlmOutputSchema>;

// 記憶體快取，避免對相同註記文字重複發送請求
const noteCache = new Map<string, LlmOutput>();

const SYSTEM_PROMPT = `你是台灣地政士專用的謄本文字判讀助手。以下是一段從土地/建物登記謄本
「其他登記事項」欄位擷取的原始文字，可能包含「限制登記事項」和
「一般註記事項」兩種類型的資訊。

請仔細判讀並僅輸出符合以下JSON Schema的結果，不要輸出任何額外說明文字：

{
  "restrictions": [
    {
      "type": "查封 | 假扣押 | 假處分 | 預告登記 | 信託 | 其他 | 無",
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
2. 若為「信託專簿」、「委託人」等信託註記，若有明確保全則可歸入「信託」或一般註記
3. 若完全沒有限制登記相關文字，restrictions輸出空陣列 []
4. 債務人若有多人，務必全部列出，並保留括號中的身分關係說明（例如「張文德（即張承豐之繼承人）」）
5. 一般註記事項（如「主登記次序...公同共有」「未會同申請，欠繳書狀費」）一律歸入 generalNotes
6. 絕對不要臆測原文沒有的資訊，若無法判斷某欄位填null
`;

/**
 * 第三層：LLM 語意判斷模組（具備快取與優雅降級）
 */
export async function analyzeOtherRegistration(otherRegistrationText: string): Promise<LlmOutput> {
  if (!otherRegistrationText || otherRegistrationText.trim() === '' || otherRegistrationText.trim() === '（空白）') {
    return { restrictions: [], generalNotes: [] };
  }

  const trimmed = otherRegistrationText.trim();
  if (noteCache.has(trimmed)) {
    return noteCache.get(trimmed)!;
  }

  // 若未設定有效 API Key，降級回退為一般註記
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey || apiKey === 'dummy-key-for-build' || apiKey === 'your_api_key_here') {
    const fallback: LlmOutput = {
      restrictions: [],
      generalNotes: [trimmed],
    };
    noteCache.set(trimmed, fallback);
    return fallback;
  }

  const userPrompt = `待判讀原文：\n"""\n${trimmed}\n"""`;

  try {
    let content = '{}';
    if (LLM_PROVIDER === 'openrouter' || apiKey.startsWith('sk-or-')) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://zonetai.com.tw',
          'X-Title': 'Zonetai Deed Analyzer'
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter API error ${res.status}: ${errText}`);
      }

      const jsonRes = await res.json();
      content = jsonRes.choices?.[0]?.message?.content || '{}';
    } else if (LLM_PROVIDER === 'groq') {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        model: LLM_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      content = chatCompletion.choices[0]?.message?.content || '{}';
    } else {
      throw new Error(`Unsupported LLM provider: ${LLM_PROVIDER}`);
    }

    const parsedJson = JSON.parse(content);
    const validated = LlmOutputSchema.parse(parsedJson);
    
    noteCache.set(trimmed, validated);
    return validated;
  } catch (error: any) {
    console.error('LLM Analysis Warning (fallback to raw text):', error.message || error);
    // 降級回退：保留原始文字於 generalNotes，不讓整體流程崩潰
    const fallback: LlmOutput = {
      restrictions: [],
      generalNotes: [trimmed],
    };
    noteCache.set(trimmed, fallback);
    return fallback;
  }
}

/**
 * 批次並行去重處理多筆登記事項
 */
export async function batchAnalyzeOtherRegistrations(
  notes: string[],
  concurrency: number = 3
): Promise<Map<string, LlmOutput>> {
  const uniqueNotes = Array.from(new Set(notes.map(n => n.trim()).filter(n => n && n !== '（空白）')));
  const resultMap = new Map<string, LlmOutput>();

  // 分批並行處理以符合 Rate Limit
  for (let i = 0; i < uniqueNotes.length; i += concurrency) {
    const chunk = uniqueNotes.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (text) => {
        const res = await analyzeOtherRegistration(text);
        resultMap.set(text, res);
      })
    );
  }

  return resultMap;
}
