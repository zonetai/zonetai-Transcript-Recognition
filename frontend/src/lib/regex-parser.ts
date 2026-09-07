import {
  LandDescription,
  BuildingDescription,
  OwnershipRecord,
  OtherRightsRecord,
  SingleDeed,
  PreviousTransferValue,
} from './schema';

/**
 * 預處理：消除跨頁斷點（平滑縫合 續次頁 與 次頁頁首資訊，保留頁碼標記）
 */
export function cleanPageBreaks(text: string): string {
  return text.replace(/[（\(]續次頁[）\)][\s\S]*?列印時間[：:][^\r\n]+頁次[：:]\d+/g, (match) => {
    const pageMatches = match.match(/<<<PAGE_\d+>>>/g);
    return pageMatches ? `\n${pageMatches.join('\n')}\n` : '\n';
  });
}

/**
 * 將整份 PDF 純文字依照謄本大標題切分為獨立的單筆謄本片段
 */
export function splitDeedChunks(text: string): string[] {
  const cleaned = cleanPageBreaks(text);
  const titleRegex = /(?=[^\r\n]*(?:土地|建物)登記(?:第一|第二|第三)類謄本)/;
  const rawChunks = cleaned.split(titleRegex).map(c => c.trim()).filter(c => c.length > 50);
  return rawChunks.length > 0 ? rawChunks : [cleaned];
}

/**
 * 解析單一筆謄本片段
 */
export function parseSingleDeed(chunk: string, index: number = 0): SingleDeed {
  // 0. 解析此謄本在原始 PDF 的起始頁碼與各登記次序之頁碼對應
  const startPageMatch = chunk.match(/<<<PAGE_(\d+)>>>/);
  const startPage = startPageMatch ? parseInt(startPageMatch[1], 10) : 1;

  const orderPageMap = new Map<string, number>();
  let curScanPage = startPage;
  for (const line of chunk.split('\n')) {
    const pm = line.match(/<<<PAGE_(\d+)>>>/);
    if (pm) curScanPage = parseInt(pm[1], 10);
    const om = line.match(/(?<!相關他項權利|標的)登記次序[：:]\s*([0-9\-]+)/);
    if (om) {
      const cleanOrder = om[1].trim();
      if (!orderPageMap.has(cleanOrder)) {
        orderPageMap.set(cleanOrder, curScanPage);
      }
    }
  }

  // 1. 謄本基本標題與類別辨別
  const titleMatch = chunk.match(/([^\r\n]*(?:土地|建物)登記(?:第一|第二|第三)類謄本[^\r\n]*)/);
  const title = titleMatch ? titleMatch[1].replace(/<<<PAGE_\d+>>>/g, '').trim() : "土地登記第二類謄本";

  let category: "第一類謄本" | "第二類謄本" | "第三類謄本" | "其它" = "第二類謄本";
  if (title.includes("第一類")) {
    category = "第一類謄本";
  } else if (title.includes("第二類")) {
    category = "第二類謄本";
  } else if (title.includes("第三類")) {
    category = "第三類謄本";
  } else {
    category = "其它";
  }

  let documentType: "土地登記謄本" | "建物登記謄本" = "土地登記謄本";
  if (title.includes("建物") || chunk.includes("建物標示部")) {
    documentType = "建物登記謄本";
  }

  // 2. 地段地號 / 建號 識別字串（尋找含有「段」且結尾是「地號」或「建號」的行，避開標題）
  const idRegex = /(?:^|\r?\n)\s*([^\r\n]+?(?:段(?:\S+小段)?)\s*[0-9\-]+(?:地號|建號))/;
  const idMatch = chunk.match(idRegex);
  const identifier = idMatch ? idMatch[1].trim() : (documentType === "建物登記謄本" ? "未知建物" : "未知土地");

  // 3. 列印時間（動態匹配）
  const printTimeMatch = chunk.match(/列印時間[：:]\s*(民國\d+年\d+月\d+日\d+時\d+分)/);
  const printTime = printTimeMatch ? printTimeMatch[1].trim() : "未知列印時間";

  // 4. 謄本種類碼與管轄機關
  const verCodeMatch = chunk.match(/謄本種類碼[：:]\s*([A-Za-z0-9\*]+)/);
  const verificationCode = verCodeMatch ? verCodeMatch[1].trim() : null;

  const authMatch = chunk.match(/(?:資料管轄機關|謄本核發機關)[：:]\s*(\S+)/);
  const authority = authMatch ? authMatch[1].trim() : null;

  // 5. 標示部解析
  let landDescription: LandDescription | null = null;
  let buildingDescription: BuildingDescription | null = null;

  // 土地標示部
  const landSectionMatch = chunk.match(/\*{5,}\s*土地標示部\s*\*{5,}([\s\S]*?)(?=\*{5,}\s*土地所有權部|\*{5,}\s*土地他項權利部|〈\s*本謄本列印完畢\s*〉|\(\s*本謄本列印完畢\s*\)|$)/);
  if (landSectionMatch) {
    const landText = landSectionMatch[1];
    const sectionNumMatch = identifier.match(/(.+?段(?:\S+小段)?)\s*([0-9\-]+)地號/) ||
      chunk.match(/(.+?段(?:\S+小段)?)\s*([0-9\-]+)地號/);
    const dateMatch = landText.match(/登記日期[：:]\s*(民國\d+年\d+月\d+日)/);
    const reasonMatch = landText.match(/登記原因[：:]\s*([^\r\n]+)/);
    const areaMatch = landText.match(/面\s*積[：:]\s*\**([0-9,.]+)\s*平方公尺/);
    const zoningMatch = landText.match(/使用分區[：:]\s*([^\r\n]*?)(?:\s+使用地類別[：:]\s*([^\r\n]*)|$)/);
    const valueMatch = landText.match(/(?:(?:民國)?(\d+年\d+月)\s*)?公告土地現值[：:]\s*\**([0-9,.]+)\s*元[／/]\s*平方公尺/);
    const buildNumMatch = landText.match(/地上建物建號[：:]\s*([\s\S]*?)(?=其他登記事項|登記原因|使用地類別|$)/);
    const otherNotesMatch = landText.match(/其他登記事項[：:]\s*([\s\S]*?)(?=$)/);

    const zoningVal = zoningMatch && zoningMatch[1] ? zoningMatch[1].trim() : null;
    const landUseVal = zoningMatch && zoningMatch[2] ? zoningMatch[2].trim() : null;

    let announcedValueObj = null;
    if (valueMatch) {
      announcedValueObj = {
        yearMonth: valueMatch[1] ? valueMatch[1].trim() : "",
        valuePerSquareMeter: parseFloat(valueMatch[2].replace(/,/g, '')),
      };
    }

    landDescription = {
      section: sectionNumMatch ? sectionNumMatch[1].trim() : "",
      landNumber: sectionNumMatch ? sectionNumMatch[2].trim() : "",
      registrationDate: dateMatch ? dateMatch[1].trim() : null,
      registrationReason: reasonMatch ? reasonMatch[1].trim() : null,
      area: areaMatch ? parseFloat(areaMatch[1].replace(/,/g, '')) : 0,
      zoningType: zoningVal === '（空白）' || zoningVal === '(空白)' ? null : zoningVal,
      landUseCategory: landUseVal === '（空白）' || landUseVal === '(空白)' ? null : landUseVal,
      announcedValue: announcedValueObj,
      buildingNumbers: buildNumMatch 
        ? buildNumMatch[1].replace(/\r?\n+/g, '、').split(/[、,，\s]+/).map(s => s.trim()).filter(s => s.length > 0)
        : [],
      otherNotes: otherNotesMatch && otherNotesMatch[1].trim() !== '（空白）' && otherNotesMatch[1].trim() !== '(空白)' 
        ? [otherNotesMatch[1].replace(/<<<PAGE_\d+>>>/g, '').trim()] 
        : [],
    };
  }

  // 建物標示部
  const buildSectionMatch = chunk.match(/\*{5,}\s*建物標示部\s*\*{5,}([\s\S]*?)(?=\*{5,}\s*建物所有權部|\*{5,}\s*建物他項權利部|〈\s*本謄本列印完畢\s*〉|\(\s*本謄本列印完畢\s*\)|$)/);
  if (buildSectionMatch) {
    const buildText = buildSectionMatch[1];
    const buildNumHeaderMatch = identifier.match(/(.+?段(?:\S+小段)?)\s*([0-9\-]+)建號/) ||
      chunk.match(/(.+?段(?:\S+小段)?)\s*([0-9\-]+)建號/);
    const addressMatch = buildText.match(/建物門牌[：:]\s*([^\r\n]+)/);
    const sitLandMatch = buildText.match(/建物坐落地號[：:]\s*([^\r\n]+)/);
    const usageMatch = buildText.match(/主要用途[：:]\s*([^\r\n]+)/);
    const materialMatch = buildText.match(/主要建材[：:]\s*([^\r\n]+)/);
    const floorMatch = buildText.match(/層\s*數[：:]\s*0*(\d+)層\s*總面積[：:]\s*\**([0-9,.]+)\s*平方公尺/);
    const subFloorMatch = buildText.match(/層\s*次[：:]\s*(.*?)\s*層次面積[：:]\s*\**([0-9,.]+)\s*平方公尺/);
    const compDateMatch = buildText.match(/建築完成日期[：:]\s*(民國\d+年\d+月\d+日)/);
    const permitMatch = buildText.match(/使用執照字號[：:]\s*([^\r\n]+)/);
    const otherNotesMatch = buildText.match(/其他登記事項[：:]\s*([\s\S]*?)(?=$)/);

    buildingDescription = {
      section: buildNumHeaderMatch ? buildNumHeaderMatch[1].trim() : "",
      buildingNumber: buildNumHeaderMatch ? buildNumHeaderMatch[2].trim() : "",
      address: addressMatch ? addressMatch[1].trim() : "",
      landNumber: sitLandMatch ? sitLandMatch[1].trim() : "",
      mainUsage: usageMatch ? usageMatch[1].trim() : "",
      mainMaterial: materialMatch ? materialMatch[1].trim() : "",
      floors: floorMatch ? parseInt(floorMatch[1], 10) : 0,
      totalArea: floorMatch ? parseFloat(floorMatch[2].replace(/,/g, '')) : 0,
      currentFloor: subFloorMatch ? subFloorMatch[1].trim() : "",
      currentFloorArea: subFloorMatch ? parseFloat(subFloorMatch[2].replace(/,/g, '')) : 0,
      completionDate: compDateMatch ? compDateMatch[1].trim() : "",
      usagePermitNumber: permitMatch && permitMatch[1].trim() !== '（空白）' && permitMatch[1].trim() !== '(空白)' ? permitMatch[1].trim() : null,
      otherNotes: otherNotesMatch && otherNotesMatch[1].trim() !== '（空白）' && otherNotesMatch[1].trim() !== '(空白)' ? [otherNotesMatch[1].replace(/<<<PAGE_\d+>>>/g, '').trim()] : [],
    };
  }

  // 6. 所有權部解析
  const ownershipRecords: OwnershipRecord[] = [];
  const ownMatch = chunk.match(/(?:\*{5,}\s*(?:土地|建物)所有權部\s*\*{5,})([\s\S]*?)(?=\*{5,}\s*(?:土地|建物)他項權利部|〈\s*本謄本列印完畢\s*〉|\(\s*本謄本列印完畢\s*\)|$)/);
  if (ownMatch) {
    const ownText = ownMatch[1];
    const recordBlocks = ownText.split(/(?:(?<=\n)\s*(?:[（\(]\d+[）\)]\s*)?|[（\(]\d+[）\)]\s*)登記次序[：:]/).slice(1);

    for (const block of recordBlocks) {
      const orderMatch = block.match(/^([0-9\-]+)/);
      if (!orderMatch) continue;

      const regDateMatch = block.match(/登記日期[：:]\s*(民國\d+年\d+月\d+日)/);
      const regReasonMatch = block.match(/登記原因[：:]\s*([^\r\n]+)/);
      const causeDateMatch = block.match(/原因發生日期[：:]\s*(民國\d+年\d+月\d+日)/);

      // 所有權人姓名、統編、住址
      const ownerNameMatch = block.match(/所有權人[：:]\s*([^\r\n]+)/);
      const ownerIdMatch = block.match(/統一編號[：:]\s*([^\r\n]+)/);
      const ownerAddressMatch = block.match(/住\s*址[：:]\s*([^\r\n]+)/);

      // 第三類謄本依法隱匿統一編號
      let ownerIdVal = ownerIdMatch ? ownerIdMatch[1].trim() : null;
      if (!ownerIdVal && category === "第三類謄本") {
        ownerIdVal = "無 (依法隱匿)";
      }

      // 權利範圍 (避免匹配到 歷次取得權利範圍)
      const shareMatch = block.match(/(?<!歷次取得)權利範圍[：:]\s*([^\r\n]+)/);
      const certMatch = block.match(/權狀字號[：:]\s*([^\r\n]+)/);
      const curValMatch = block.match(/當期申報地價[：:]\s*.*?([\*\s0-9,.]+)\s*元[／/]\s*平方公尺/);
      const relatedMortMatch = block.match(/相關他項權利登記次序[：:]\s*([^\r\n]+)/);

      // 權利範圍與公同共有判斷
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

      // 前次移轉現值與歷次取得權利範圍配對
      const previousTransferValues: PreviousTransferValue[] = [];
      const prevSectionMatch = block.match(/前次移轉現值或原規定地價[：:]?([\s\S]*?)(?=相關他項權利登記次序|其他登記事項|$)/);
      
      if (prevSectionMatch) {
        const prevSectionText = prevSectionMatch[1];
        const pairRegex = /(\d+年\d+月)\s*([\*\s0-9,.]+)\s*元[／/]\s*平方公尺[\s\S]*?歷次取得權利範圍[：:]\s*([^\r\n]+)/g;
        const pairMatches = [...prevSectionText.matchAll(pairRegex)];

        if (pairMatches.length > 0) {
          for (const m of pairMatches) {
            const rawVal = m[2].replace(/[\*\s元／/平方公尺]/g, '').trim();
            const rawShare = m[3].replace(/\*/g, '').trim();
            previousTransferValues.push({
              yearMonth: m[1].trim(),
              value: rawVal,
              share: rawShare || null,
            });
          }
        } else {
          // 若只有單筆前次移轉現值
          const singlePrev = prevSectionText.match(/(\d+年\d+月)\s*([\*\s0-9,.]+)\s*元[／/]\s*平方公尺/);
          const singleHist = prevSectionText.match(/歷次取得權利範圍[：:]\s*([^\r\n]+)/);
          if (singlePrev) {
            previousTransferValues.push({
              yearMonth: singlePrev[1].trim(),
              value: singlePrev[2].replace(/[\*\s元／/平方公尺]/g, '').trim(),
              share: singleHist ? singleHist[1].replace(/\*/g, '').trim() : null,
            });
          }
        }
      }

      // 其他登記事項
      const otherNotesMatch = block.match(/其他登記事項[：:]\s*([\s\S]*?)(?=$)/);
      const rawOtherNotes = otherNotesMatch ? otherNotesMatch[1].trim() : "";

      ownershipRecords.push({
        registrationOrder: orderMatch[1].trim(),
        registrationDate: regDateMatch ? regDateMatch[1].trim() : "",
        registrationReason: regReasonMatch ? regReasonMatch[1].trim() : "",
        causeDate: causeDateMatch ? causeDateMatch[1].trim() : null,
        ownerName: ownerNameMatch ? ownerNameMatch[1].trim() : null,
        ownerId: ownerIdVal,
        ownerAddress: ownerAddressMatch ? ownerAddressMatch[1].trim() : null,
        ownershipShare,
        isJointOwnership: isJoint,
        certificateNumber: certMatch && certMatch[1].trim() !== '（空白）' && certMatch[1].trim() !== '(空白)' ? certMatch[1].trim() : null,
        currentAnnouncedLandValue: curValMatch ? curValMatch[1].replace(/[\*\s]/g, '').trim() : null,
        previousTransferValues,
        historicalShare: previousTransferValues[0]?.share || null,
        relatedMortgageOrders: relatedMortMatch ? relatedMortMatch[1].trim() : null,
        restrictions: [],
        generalNotes: [],
        rawOtherNotes: rawOtherNotes !== "（空白）" && rawOtherNotes !== "(空白)" ? rawOtherNotes.replace(/<<<PAGE_\d+>>>/g, '').trim() : null,
        pageNumber: (orderMatch ? orderPageMap.get(orderMatch[1].trim()) : null) || startPage,
      } as any);
    }
  }

  // 7. 他項權利部解析
  const otherRightsRecords: OtherRightsRecord[] = [];
  const mortSectionMatch = chunk.match(/(?:\*{5,}\s*(?:土地|建物)他項權利部\s*\*{5,})([\s\S]*?)(?=〈\s*本謄本列印完畢\s*〉|\(\s*本謄本列印完畢\s*\)|$)/);
  if (mortSectionMatch) {
    const mortText = mortSectionMatch[1];
    const mortBlocks = mortText.split(/(?:(?<=\n)\s*(?:[（\(]\d+[）\)]\s*)?|[（\(]\d+[）\)]\s*)登記次序[：:]/).slice(1);

    for (const mBlock of mortBlocks) {
      const mOrderMatch = mBlock.match(/^([0-9\-]+)/);
      if (!mOrderMatch) continue;

      const rightTypeMatch = mBlock.match(/權利種類[：:]\s*([^\r\n]+)/);
      const receiveMatch = mBlock.match(/收件年期[：:]\s*([^\s]+)\s+字號[：:]\s*([^\r\n]+)/);
      const regDateMatch = mBlock.match(/登記日期[：:]\s*(民國\d+年\d+月\d+日)/);
      const regReasonMatch = mBlock.match(/登記原因[：:]\s*([^\r\n]+)/);
      const targetOrdersMatch = mBlock.match(/標的登記次序[：:]\s*([^\r\n]+)/);

      // 權利人資訊
      const obligeeNameMatch = mBlock.match(/權\s*利\s*人[：:]\s*([^\r\n]+)/);
      const obligeeIdMatch = mBlock.match(/統一編號[：:]\s*([^\r\n]+)/);
      const obligeeAddressMatch = mBlock.match(/住\s*址[：:]\s*([^\r\n]+)/);

      const debtShareMatch = mBlock.match(/債權額比例[：:]\s*([^\r\n]+)/);
      const securedAmountMatch = mBlock.match(/(?:擔保債權總金額|債權總金額)[：:]\s*([^\r\n]+)/);
      const securedTypeMatch = mBlock.match(/擔保債權種類及範圍[：:]\s*([\s\S]*?)(?=擔保債權確定期日|清償日期|利息|遲延利息|違約金|$|約定)/);
      const maturityMatch = mBlock.match(/(?:擔保債權確定期日|清償日期)[：:]\s*([^\r\n]+)/);
      const interestMatch = mBlock.match(/(?:利息[（(]率[）)]?|遲延利息|違約金)[：:]\s*([^\r\n]+)/);

      // 債務人資訊
      const debtorsMatch = mBlock.match(/債務人及債務額比例[：:]\s*([\s\S]*?)(?=設定權利範圍|證明書字號|共同擔保|其他登記事項|$)/);
      const debtors: Array<{ name: string; id?: string | null }> = [];
      if (debtorsMatch) {
        const dText = debtorsMatch[1];
        const dNameMatch = dText.match(/債務人[：:]\s*([^\r\n]+)/);
        const dIdMatch = dText.match(/統一編號[：:]\s*([^\r\n]+)/);
        if (dNameMatch) {
          debtors.push({
            name: dNameMatch[1].trim(),
            id: dIdMatch ? dIdMatch[1].trim() : null,
          });
        }
      }

      const setShareMatch = mBlock.match(/設定權利範圍[：:]\s*([^\r\n]+)/);
      const certNumberMatch = mBlock.match(/證明書字號[：:]\s*([^\r\n]+)/);
      const jointSecuredMatch = mBlock.match(/共同擔保(?:地號|建號)[：:]\s*([^\r\n]+)/);
      const otherNotesMatch = mBlock.match(/其他登記事項[：:]\s*([\s\S]*?)(?=$)/);

      otherRightsRecords.push({
        registrationOrder: mOrderMatch[1].trim(),
        rightType: rightTypeMatch ? rightTypeMatch[1].trim() : "抵押權",
        receiveYear: receiveMatch ? receiveMatch[1].trim() : null,
        receiveNumber: receiveMatch ? receiveMatch[2].trim() : null,
        registrationDate: regDateMatch ? regDateMatch[1].trim() : null,
        registrationReason: regReasonMatch ? regReasonMatch[1].trim() : null,
        targetRegistrationOrders: targetOrdersMatch ? targetOrdersMatch[1].trim() : null,
        obligeeName: obligeeNameMatch ? obligeeNameMatch[1].trim() : null,
        obligeeId: obligeeIdMatch ? obligeeIdMatch[1].trim() : null,
        obligeeAddress: obligeeAddressMatch ? obligeeAddressMatch[1].trim() : null,
        debtShare: debtShareMatch ? debtShareMatch[1].trim() : null,
        securedAmount: securedAmountMatch ? securedAmountMatch[1].replace(/\*/g, '').trim() : null,
        securedTypeAndScope: securedTypeMatch ? securedTypeMatch[1].trim() : null,
        maturityDate: maturityMatch ? maturityMatch[1].trim() : null,
        interest: interestMatch ? interestMatch[1].trim() : null,
        debtors,
        setShare: setShareMatch ? setShareMatch[1].trim() : null,
        certificateNumber: certNumberMatch && certNumberMatch[1].trim() !== '（空白）' && certNumberMatch[1].trim() !== '(空白)' ? certNumberMatch[1].trim() : null,
        jointSecuredNumbers: jointSecuredMatch ? jointSecuredMatch[1].trim() : null,
        otherNotes: otherNotesMatch && otherNotesMatch[1].trim() !== '（空白）' && otherNotesMatch[1].trim() !== '(空白)' ? [otherNotesMatch[1].replace(/<<<PAGE_\d+>>>/g, '').trim()] : [],
        pageNumber: (mOrderMatch ? orderPageMap.get(mOrderMatch[1].trim()) : null) || startPage,
      });
    }
  }

  return {
    id: `deed-${index + 1}`,
    category,
    documentType,
    title,
    identifier,
    printTime,
    verificationCode,
    authority,
    landDescription,
    buildingDescription,
    ownershipRecords,
    otherRightsRecords,
    startPage,
    needsManualReview: false,
    reviewReason: null,
  };
}

/**
 * 核心正則解析入口：傳入整份 PDF 文字，回傳多筆 SingleDeed 陣列
 */
export function parseRegex(text: string): { deeds: SingleDeed[]; totalCount: number } {
  const chunks = splitDeedChunks(text);
  const deeds = chunks.map((chunk, i) => parseSingleDeed(chunk, i));
  return {
    deeds,
    totalCount: deeds.length,
  };
}
