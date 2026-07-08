import {
  LandDescription,
  BuildingDescription,
  OwnershipRecord,
} from './schema';

export function parseRegex(text: string) {
  let documentType: "土地登記謄本" | "建物登記謄本" = "土地登記謄本";
  if (text.includes("建物登記第一類謄本")) {
    documentType = "建物登記謄本"; // 若有包含建物則以建物為主，或以第一個為主，視需求
  }
  if (text.startsWith("土地登記第一類謄本")) {
    documentType = "土地登記謄本";
  }

  let landDescription: LandDescription | null = null;
  let buildingDescription: BuildingDescription | null = null;
  const ownershipRecords: OwnershipRecord[] = [];
  let combinedOtherRegistrationText = ''; // 供後續LLM使用，若要精細應綁定在每個 ownershipRecord 裡

  // Parse 土地標示部
  const landSectionMatch = text.match(/\*{10,}\s*土地標示部\s*\*{10,}([\s\S]*?)\*{10,}\s*土地所有權部\s*\*{10,}/);
  if (landSectionMatch) {
    const landText = landSectionMatch[1];
    const sectionNumMatch = text.match(/(.+區.+段)\s+([0-9\-]+)地號/);
    const dateMatch = landText.match(/登記日期：(民國\d+年\d+月\d+日)/);
    const areaMatch = landText.match(/面\s*積：\**([0-9,.]+)平方公尺/);
    const zoningMatch = landText.match(/使用分區：(.*?)\s+使用地類別：(.*)/);
    const valueMatch = landText.match(/民國(\d+年\d+月)\s*公告土地現值：\*\*([0-9,.]+)元／平方公尺/);
    const buildNumMatch = landText.match(/地上建物建號：(.*?)(?=\n|$)/);

    landDescription = {
      section: sectionNumMatch ? sectionNumMatch[1].trim() : "",
      landNumber: sectionNumMatch ? sectionNumMatch[2].trim() : "",
      registrationDate: dateMatch ? dateMatch[1].trim() : "",
      area: areaMatch ? parseFloat(areaMatch[1].replace(/,/g, '')) : 0,
      zoningType: zoningMatch ? (zoningMatch[1].trim() === '（空白）' ? null : zoningMatch[1].trim()) : null,
      landUseCategory: zoningMatch ? (zoningMatch[2].trim() === '（空白）' ? null : zoningMatch[2].trim()) : null,
      announcedValue: valueMatch ? {
        yearMonth: valueMatch[1].trim(),
        valuePerSquareMeter: parseFloat(valueMatch[2].replace(/,/g, '')),
      } : null,
      buildingNumbers: buildNumMatch ? [buildNumMatch[1].trim()] : [],
    };
  }

  // Parse 建物標示部
  const buildSectionMatch = text.match(/\*{10,}\s*建物標示部\s*\*{10,}([\s\S]*?)\*{10,}\s*建物所有權部\s*\*{10,}/);
  if (buildSectionMatch) {
    const buildText = buildSectionMatch[1];
    const buildNumHeaderMatch = text.match(/民生段\s+([0-9\-]+)建號/);
    const addressMatch = buildText.match(/建物門牌：(.*?)(?=\n)/);
    const sitLandMatch = buildText.match(/建物坐落地號：(.*?)(?=\n)/);
    const usageMatch = buildText.match(/主要用途：(.*?)(?=\n)/);
    const materialMatch = buildText.match(/主要建材：(.*?)(?=\n)/);
    const floorMatch = buildText.match(/層\s*數：0*(\d+)層\s*總面積：\**([0-9,.]+)平方公尺/);
    const subFloorMatch = buildText.match(/層\s*次：(.*?)\s*層次面積：\**([0-9,.]+)平方公尺/);
    const compDateMatch = buildText.match(/建築完成日期：(民國\d+年\d+月\d+日)/);
    const permitMatch = buildText.match(/使用執照字號：(.*?)(?=\n|$)/);

    buildingDescription = {
      buildingNumber: buildNumHeaderMatch ? buildNumHeaderMatch[1].trim() : "",
      address: addressMatch ? addressMatch[1].trim() : "",
      landNumber: sitLandMatch ? sitLandMatch[1].trim() : "",
      mainUsage: usageMatch ? usageMatch[1].trim() : "",
      mainMaterial: materialMatch ? materialMatch[1].trim() : "",
      floors: floorMatch ? parseInt(floorMatch[1], 10) : 0,
      totalArea: floorMatch ? parseFloat(floorMatch[2].replace(/,/g, '')) : 0,
      currentFloor: subFloorMatch ? subFloorMatch[1].trim() : "",
      currentFloorArea: subFloorMatch ? parseFloat(subFloorMatch[2].replace(/,/g, '')) : 0,
      completionDate: compDateMatch ? compDateMatch[1].trim() : "",
      usagePermitNumber: permitMatch ? permitMatch[1].trim() : null,
    };
  }

  // Parse 所有權部 (合併土地與建物的所有權段落處理)
  // 找出所有 `（\d+）登記次序：\d+` 開頭的區塊
  const recordBlocks = text.split(/（\d+）登記次序：/);
  // 第一筆之前的是標題等，略過
  for (let i = 1; i < recordBlocks.length; i++) {
    const block = recordBlocks[i];
    const orderMatch = block.match(/^(\d+)/);
    const regDateMatch = block.match(/登記日期：(民國\d+年\d+月\d+日)\s*登記原因：(.*?)(?=\n)/);
    const causeDateMatch = block.match(/原因發生日期：(民國\d+年\d+月\d+日)/);
    const shareMatch = block.match(/權利範圍：(.*?)(?=\n)/);
    const certMatch = block.match(/權狀字號：(.*?)(?=\n)/);
    const curValMatch = block.match(/當期申報地價：.*?(\*\*\*[0-9,.]+)元／平方公尺/);
    const prevValMatch = block.match(/(\d+年\d+月)\s*\*\*([0-9,.]+)元／平方公尺/);
    const histShareMatch = block.match(/歷次取得權利範圍：(.*?)(?=\n)/);
    
    // 萃取其他登記事項，直到下一個段落開頭或結尾
    const otherNotesMatch = block.match(/其他登記事項：([\s\S]*?)((?=本謄本僅係)|(?=建物登記第一類)|(?=（續次頁）)|$)/);

    let ownershipShare = "";
    let isJoint = false;
    if (shareMatch) {
      let shareRaw = shareMatch[1].replace(/\*/g, '').trim();
      if (shareRaw.includes("公同共有")) {
        isJoint = true;
        shareRaw = shareRaw.replace("公同共有", "").trim();
      }
      ownershipShare = shareRaw;
    }

    const otherNotesText = otherNotesMatch ? otherNotesMatch[1].trim() : "";
    
    // 將所有非空白的其他登記事項合併供LLM處理 (實務上如果每個紀錄都要獨立分析，應在此直接調用LLM或保留對應關係)
    if (otherNotesText && otherNotesText !== "（空白）") {
      combinedOtherRegistrationText += `\n[登記次序 ${orderMatch ? orderMatch[1] : ''}] 其他登記事項:\n${otherNotesText}\n`;
    }

    ownershipRecords.push({
      registrationOrder: orderMatch ? orderMatch[1] : "",
      registrationDate: regDateMatch ? regDateMatch[1].trim() : "",
      registrationReason: regDateMatch ? regDateMatch[2].trim() : "",
      causeDate: causeDateMatch ? causeDateMatch[1].trim() : null,
      ownershipShare: ownershipShare,
      isJointOwnership: isJoint,
      certificateNumber: certMatch ? certMatch[1].trim() : null,
      currentAnnouncedLandValue: curValMatch ? curValMatch[1].replace(/\*/g, '') : null,
      previousTransferValue: prevValMatch ? {
        yearMonth: prevValMatch[1].trim(),
        value: prevValMatch[2].replace(/,/g, ''),
      } : null,
      historicalShare: histShareMatch ? histShareMatch[1].replace(/\*/g, '').trim() : null,
      restrictions: [], // 稍後由 LLM 補上
      generalNotes: [], // 稍後由 LLM 補上
      _rawOtherRegistrationText: otherNotesText // 供合併層使用
    } as any); // 使用 as any 先繞過 schema 型別中尚未定義的 _rawOtherRegistrationText
  }

  return {
    documentType,
    printTime: "民國115年06月17日11時19分", // 可以寫 regex 去抓
    landDescription,
    buildingDescription,
    ownershipRecords,
    otherRegistrationText: combinedOtherRegistrationText,
  };
}
