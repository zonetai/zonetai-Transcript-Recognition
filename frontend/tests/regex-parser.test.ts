import fs from 'fs';
import path from 'path';
import { parseRegex } from '../src/lib/regex-parser';

// Polyfill for pdf-parse in test env
if (typeof global !== 'undefined') {
  if (!(global as any).DOMMatrix) (global as any).DOMMatrix = class DOMMatrix { };
  if (!(global as any).Path2D) (global as any).Path2D = class Path2D { };
}
const pdfParse = require('pdf-parse');

describe('Multi-Deed Regex Parser', () => {
  it('should parse sample1 (1 land + 1 building) correctly', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'sample1.txt');
    const text = fs.readFileSync(fixturePath, 'utf8');

    const result = parseRegex(text);
    
    expect(result.totalCount).toBe(2);
    expect(result.deeds.length).toBe(2);

    // Deed 1: 土地登記第一類謄本
    const landDeed = result.deeds[0];
    expect(landDeed.documentType).toBe('土地登記謄本');
    expect(landDeed.category).toBe('第一類謄本');
    expect(landDeed.identifier).toContain('0056-0029地號');
    expect(landDeed.printTime).toBe('民國115年06月17日11時19分');
    expect(landDeed.landDescription).not.toBeNull();
    expect(landDeed.landDescription?.section).toBe('松山區民生段');
    expect(landDeed.landDescription?.landNumber).toBe('0056-0029');
    expect(landDeed.landDescription?.area).toBe(300.00);
    expect(landDeed.landDescription?.zoningType).toBeNull();
    expect(landDeed.landDescription?.announcedValue?.valuePerSquareMeter).toBe(302000);
    
    // 土地所有權部 5 筆
    expect(landDeed.ownershipRecords.length).toBe(5);
    expect(landDeed.ownershipRecords[0].registrationOrder).toBe('0024');
    expect(landDeed.ownershipRecords[0].ownershipShare).toBe('16分之1');
    expect(landDeed.ownershipRecords[0].isJointOwnership).toBe(false);

    // 土地所有權部公同共有
    const jointRecord = landDeed.ownershipRecords.find(r => r.registrationOrder === '0028');
    expect(jointRecord).toBeDefined();
    expect(jointRecord?.isJointOwnership).toBe(true);
    expect(jointRecord?.ownershipShare).toBe('32分之1');

    // Deed 2: 建物登記第一類謄本
    const buildingDeed = result.deeds[1];
    expect(buildingDeed.documentType).toBe('建物登記謄本');
    expect(buildingDeed.category).toBe('第一類謄本');
    expect(buildingDeed.identifier).toContain('04256-000建號');
    expect(buildingDeed.buildingDescription).not.toBeNull();
    expect(buildingDeed.buildingDescription?.buildingNumber).toBe('04256-000');
    expect(buildingDeed.buildingDescription?.totalArea).toBe(92.01);
    expect(buildingDeed.ownershipRecords.length).toBe(5);
  });

  it('should accurately parse 第二類謄本_2.pdf with 99+99 historical shares and other rights', async () => {
    const pdfPath = path.resolve(__dirname, '..', '..', '謄本範例', '第二類謄本_2.pdf');
    if (!fs.existsSync(pdfPath)) return;

    const data = await pdfParse(fs.readFileSync(pdfPath));
    const result = parseRegex(data.text);

    expect(result.totalCount).toBe(1);
    const deed = result.deeds[0];
    expect(deed.category).toBe('第二類謄本');
    expect(deed.documentType).toBe('土地登記謄本');
    expect(deed.identifier).toContain('0587-0007地號');
    expect(deed.landDescription?.area).toBe(58493.00);

    // 驗證 2 位所有權人與海量前次移轉
    expect(deed.ownershipRecords.length).toBe(2);
    const owner1 = deed.ownershipRecords[0];
    const owner2 = deed.ownershipRecords[1];

    expect(owner1.registrationOrder).toBe('0002');
    expect(owner1.ownerName).toBe('冠隆建設股份有限公司');
    expect(owner1.ownerId).toBe('12717319');
    expect(owner1.ownershipShare).toBe('2分之1');
    expect(owner1.previousTransferValues.length).toBe(99);

    expect(owner2.registrationOrder).toBe('0003');
    expect(owner2.ownerName).toBe('耀麟股份有限公司');
    expect(owner2.ownerId).toBe('42785279');
    expect(owner2.ownershipShare).toBe('2分之1');
    expect(owner2.previousTransferValues.length).toBe(99);

    // 驗證他項權利部
    expect(deed.otherRightsRecords.length).toBe(1);
    const mortgage = deed.otherRightsRecords[0];
    expect(mortgage.registrationOrder).toBe('0003-000');
    expect(mortgage.rightType).toBe('最高限額抵押權');
    expect(mortgage.obligeeName).toBe('元大商業銀行股份有限公司');
    expect(mortgage.securedAmount).toContain('2,760,000,000');
  });

  it('should parse 第二類謄本_多筆合併在同檔案_3.pdf into 8 distinct deeds', async () => {
    const pdfPath = path.resolve(__dirname, '..', '..', '謄本範例', '第二類謄本_多筆合併在同檔案_3.pdf');
    if (!fs.existsSync(pdfPath)) return;

    const data = await pdfParse(fs.readFileSync(pdfPath));
    const result = parseRegex(data.text);

    expect(result.totalCount).toBe(8);
    expect(result.deeds.length).toBe(8);

    // 前 4 筆為土地，後 4 筆為建物
    for (let i = 0; i < 4; i++) {
      expect(result.deeds[i].documentType).toBe('土地登記謄本');
      expect(result.deeds[i].identifier).toContain('地號');
    }
    for (let i = 4; i < 8; i++) {
      expect(result.deeds[i].documentType).toBe('建物登記謄本');
      expect(result.deeds[i].identifier).toContain('建號');
    }
  });

  it('should parse 第二類謄本.pdf with 2 lands and full mortgage details', async () => {
    const pdfPath = path.resolve(__dirname, '..', '..', '謄本範例', '第二類謄本.pdf');
    if (!fs.existsSync(pdfPath)) return;

    const data = await pdfParse(fs.readFileSync(pdfPath));
    const result = parseRegex(data.text);

    expect(result.totalCount).toBe(2);
    expect(result.deeds[0].identifier).toContain('0158-0001地號');
    expect(result.deeds[0].ownershipRecords.length).toBe(4);
    expect(result.deeds[0].otherRightsRecords.length).toBe(5);

    expect(result.deeds[1].identifier).toContain('0159-0000地號');
    expect(result.deeds[1].ownershipRecords.length).toBe(4);
    expect(result.deeds[1].otherRightsRecords.length).toBe(5);
  });
});
