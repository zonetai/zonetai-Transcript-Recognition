import fs from 'fs';
import path from 'path';
import { parseRegex } from '../src/lib/regex-parser';

describe('Regex Parser', () => {
  it('should parse sample1 correctly', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'sample1.txt');
    const text = fs.readFileSync(fixturePath, 'utf8');

    const result = parseRegex(text);
    
    expect(result.documentType).toBe('土地登記謄本');
    
    // 土地標示部
    expect(result.landDescription).not.toBeNull();
    expect(result.landDescription?.section).toBe('松山區民生段');
    expect(result.landDescription?.landNumber).toBe('0056-0029');
    expect(result.landDescription?.area).toBe(300.00);
    expect(result.landDescription?.zoningType).toBeNull();
    expect(result.landDescription?.announcedValue?.valuePerSquareMeter).toBe(302000);
    
    // 建物標示部
    expect(result.buildingDescription).not.toBeNull();
    expect(result.buildingDescription?.buildingNumber).toBe('04256-000');
    expect(result.buildingDescription?.totalArea).toBe(92.01);
    
    // 所有權部
    expect(result.ownershipRecords.length).toBeGreaterThan(0);
    expect(result.ownershipRecords[0].registrationOrder).toBe('0024');
    expect(result.ownershipRecords[0].ownershipShare).toBe('16分之1');
    expect(result.ownershipRecords[0].isJointOwnership).toBe(false);

    // 含有公同共有的項目
    const jointRecord = result.ownershipRecords.find(r => r.registrationOrder === '0028');
    expect(jointRecord).toBeDefined();
    expect(jointRecord?.isJointOwnership).toBe(true);
    expect(jointRecord?.ownershipShare).toBe('32分之1');
  });
});
