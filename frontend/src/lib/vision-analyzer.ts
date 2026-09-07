import { SingleDeed } from './schema';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface OwnerCardData {
  ownerIndex: number;
  page: number;
  stripsCount: number;
  base64: string;
}

interface RecognizedOwner {
  ownerName: string;
  ownerId: string;
  ownerAddress: string;
}

/**
 * 執行 Python 腳本從 PDF 抽取並垂直拼接所有權人個資長條圖
 */
async function extractOwnerCardsFromPdf(pdfBuffer: Buffer): Promise<OwnerCardData[]> {
  const tempDir = os.tmpdir();
  const tempPdfPath = path.join(tempDir, `deed_temp_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  const scriptCandidates = [
    path.join(process.cwd(), 'scripts', 'extract_strips.py'),
    path.join(process.cwd(), 'frontend', 'scripts', 'extract_strips.py'),
    path.join(__dirname, '..', '..', '..', 'scripts', 'extract_strips.py'),
    path.join(__dirname, '..', 'scripts', 'extract_strips.py'),
  ];
  const scriptPath = scriptCandidates.find((p) => fs.existsSync(p)) || scriptCandidates[0];

  try {
    await fs.promises.writeFile(tempPdfPath, pdfBuffer);

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        'python',
        [scriptPath, tempPdfPath],
        { maxBuffer: 50 * 1024 * 1024 },
        (err, out, stderr) => {
          if (err) {
            console.error('Python extract_strips error:', stderr || err);
            reject(err);
          } else {
            resolve(out);
          }
        }
      );
    });

    const parsed = JSON.parse(stdout);
    return parsed.ownerCards || [];
  } catch (error) {
    console.error('Failed to extract owner cards from PDF:', error);
    return [];
  } finally {
    try {
      if (fs.existsSync(tempPdfPath)) {
        await fs.promises.unlink(tempPdfPath);
      }
    } catch {
      // Ignore cleanup error
    }
  }
}

/**
 * 呼叫多模態視覺模型 (Vision) 辨識拼接後的所有權人個資圖卡
 */
async function recognizeOwnerCard(
  card: OwnerCardData,
  apiKey: string,
  model: string
): Promise<RecognizedOwner | null> {
  const prompt = `請精確讀取這張台灣地政謄本個資圖片，不要猜測，直接輸出 JSON：
{
  "ownerName": "姓名（去除所有權人字樣）",
  "ownerId": "身分證統編（去除統一編號字樣）",
  "ownerAddress": "完整戶籍住址（去除住址字樣）"
}`;

  // 確保使用的模型支援 Vision (若環境設定為純文字模型如 llama-3.3-70b，自動使用 gemini-2.5-flash)
  const visionModel = (model && (model.includes('gemini') || model.includes('vision') || model.includes('4o') || model.includes('vl')))
    ? model
    : 'google/gemini-2.5-flash';

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://zonetai.com.tw',
        'X-Title': 'Zonetai Deed Vision OCR',
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${card.base64}` } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      console.error(`Vision API error ${res.status}:`, await res.text());
      return null;
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawContent);

    return {
      ownerName: (parsed.ownerName || '').trim(),
      ownerId: (parsed.ownerId || '').trim(),
      ownerAddress: (parsed.ownerAddress || '').trim(),
    };
  } catch (err) {
    console.error(`Failed to recognize owner card #${card.ownerIndex}:`, err);
    return null;
  }
}

/**
 * 當第一類謄本所有權人因防偽圖像化而為空時，自動調用 Vision AI 補全個資
 */
export async function enrichDeedsWithOwnerVision(
  deeds: SingleDeed[],
  pdfBuffer: Buffer
): Promise<SingleDeed[]> {
  // 檢查是否有任一謄本的所有權人欄位為空 (第一類謄本特徵)
  const needsVision = deeds.some((deed) =>
    deed.ownershipRecords.some(
      (r) => !r.ownerName || r.ownerName === '無' || !r.ownerId || r.ownerId === '無'
    )
  );

  if (!needsVision) {
    return deeds;
  }

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey || apiKey === 'dummy-key-for-build' || apiKey === 'your_api_key_here') {
    console.warn('No valid LLM_API_KEY for Vision recognition. Skipping image OCR.');
    return deeds;
  }

  const model = process.env.LLM_MODEL || 'google/gemini-2.5-flash';

  console.log('Detected Category 1 Deed with image-based owner info. Extracting image cards...');
  const ownerCards = await extractOwnerCardsFromPdf(pdfBuffer);
  if (ownerCards.length === 0) {
    console.log('No image strip cards found in PDF.');
    return deeds;
  }

  console.log(`Extracted ${ownerCards.length} owner cards. Running Vision recognition with ${model}...`);

  // 批次並行呼叫 Vision (Concurrency 3 以確保速度與穩定度)
  const recognizedOwners: (RecognizedOwner | null)[] = [];
  const concurrency = 3;
  for (let i = 0; i < ownerCards.length; i += concurrency) {
    const chunk = ownerCards.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((card) => recognizeOwnerCard(card, apiKey, model))
    );
    recognizedOwners.push(...chunkResults);
  }

  // 依序回填至各謄本的所有權人紀錄中
  let cardIdx = 0;
  const enrichedDeeds = deeds.map((deed) => {
    const updatedRecords = deed.ownershipRecords.map((rec) => {
      // 若該紀錄缺少姓名或統編，且尚有辨識出的資料
      if ((!rec.ownerName || rec.ownerName === '無') && cardIdx < recognizedOwners.length) {
        const recognized = recognizedOwners[cardIdx];
        cardIdx++;
        if (recognized) {
          return {
            ...rec,
            ownerName: recognized.ownerName || rec.ownerName,
            ownerId: recognized.ownerId || rec.ownerId,
            ownerAddress: recognized.ownerAddress || rec.ownerAddress,
          };
        }
      }
      return rec;
    });

    return {
      ...deed,
      ownershipRecords: updatedRecords,
    };
  });

  console.log(`Successfully enriched ${cardIdx} owner records from Vision OCR.`);
  return enrichedDeeds;
}
