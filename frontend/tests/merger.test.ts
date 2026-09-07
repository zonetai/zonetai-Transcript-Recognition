import fs from 'fs';
import path from 'path';
import { mergeAndValidate } from '../src/lib/merger';

// Polyfill for pdf-parse in test env
if (typeof global !== 'undefined') {
  if (!(global as any).DOMMatrix) (global as any).DOMMatrix = class DOMMatrix { };
  if (!(global as any).Path2D) (global as any).Path2D = class Path2D { };
}
const pdfParse = require('pdf-parse');

describe('Merger & Multi-Deed Integration', () => {
  it('should validate sample1 with merger', async () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'sample1.txt');
    const text = fs.readFileSync(fixturePath, 'utf8');

    const result = await mergeAndValidate(text);

    expect(result.totalCount).toBe(2);
    expect(result.deeds.length).toBe(2);
    expect(result.deeds[0].ownershipRecords.length).toBe(5);
    expect(result.deeds[1].ownershipRecords.length).toBe(5);
  });

  it('should validate 第二類謄本_2.pdf with merger', async () => {
    const pdfPath = path.resolve(__dirname, '..', '..', '謄本範例', '第二類謄本_2.pdf');
    if (!fs.existsSync(pdfPath)) return;

    const data = await pdfParse(fs.readFileSync(pdfPath));
    const result = await mergeAndValidate(data.text);

    expect(result.totalCount).toBe(1);
    expect(result.deeds[0].ownershipRecords.length).toBe(2);
    expect(result.deeds[0].ownershipRecords[0].previousTransferValues.length).toBe(99);
    expect(result.deeds[0].ownershipRecords[1].previousTransferValues.length).toBe(99);
    expect(result.deeds[0].otherRightsRecords.length).toBe(1);
  });
});
