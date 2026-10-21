// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildXlsx, columnName, crc32, sheetName, zipStore } from '../xlsx';
import { readWorkbook } from './xlsxReader';

/** Reads a stored zip back: names, bytes and whether the checksums hold (a tiny reader, enough for these tests). */
function readZip(zip: Uint8Array) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const files: Record<string, Uint8Array> = {};
  let at = 0;
  let crcOk = true;
  while (dv.getUint32(at, true) === 0x04034b50) {
    const crc = dv.getUint32(at + 14, true);
    const size = dv.getUint32(at + 18, true);
    const nameLen = dv.getUint16(at + 26, true);
    const extraLen = dv.getUint16(at + 28, true);
    const name = new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLen));
    const data = zip.subarray(at + 30 + nameLen + extraLen, at + 30 + nameLen + extraLen + size);
    if (crc32(data) !== crc) crcOk = false;
    files[name] = data;
    at += 30 + nameLen + extraLen + size;
  }
  // the end record agrees with what was found
  const end = zip.length - 22;
  expect(dv.getUint32(end, true)).toBe(0x06054b50);
  expect(dv.getUint16(end + 10, true)).toBe(Object.keys(files).length);
  return { files, crcOk };
}
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');

describe('crc32 and zip', () => {
  it('matches the known checksum of "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('stores files that read back byte for byte, with valid checksums', () => {
    const data = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const { files, crcOk } = readZip(zipStore([{ name: 'a/b.bin', data }, { name: 'é.txt', data: new TextEncoder().encode('héllo') }]));
    expect(crcOk).toBe(true);
    expect([...files['a/b.bin']]).toEqual([1, 2, 3, 250, 251, 252]);
    expect(text(files['é.txt'])).toBe('héllo');
  });
});

describe('names', () => {
  it('names columns like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });
  it('makes sheet names Excel accepts', () => {
    expect(sheetName('Uptime [hours]: 6/10')).toBe('Uptime hours 6 10');
    expect(sheetName('x'.repeat(50)).length).toBe(31);
    expect(sheetName('   ', 'Sheet1')).toBe('Sheet1');
  });
});

describe('buildXlsx', () => {
  const bytes = buildXlsx([
    {
      name: 'Hours',
      widths: [20, 12],
      freeze: { rows: 1, cols: 1 },
      rows: [
        [{ v: 'Gateway', style: { bold: true, fill: { color: '#112233' }, textColor: '#FFFFFF' } }, { v: '6 Oct', style: { bold: true } }],
        [{ v: '506f9800000002a6' }, { v: 23.5 / 24, style: { numFmt: '[h]:mm', fill: { color: '#BBF7D0' }, align: 'center' } }],
        [{ v: 'A & B <c> "q"' }, { v: null }],
      ],
    },
    { name: 'Hours', rows: [[{ v: 'second sheet, same name' }]] },
  ]);
  const { files, crcOk } = readZip(bytes);

  it('is a complete package with valid checksums', () => {
    expect(crcOk).toBe(true);
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/app.xml',
      'docProps/core.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/sharedStrings.xml',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
  });

  it('every part is well-formed XML', () => {
    for (const [name, data] of Object.entries(files)) {
      const doc = xml(text(data));
      expect(doc.getElementsByTagName('parsererror').length, name).toBe(0);
    }
  });

  it('gives sheets of the same name different names', () => {
    const doc = xml(text(files['xl/workbook.xml']));
    const names = [...doc.getElementsByTagName('sheet')].map((s) => s.getAttribute('name'));
    expect(names).toEqual(['Hours', 'Hours 2']);
  });

  it('stores numbers as numbers and text once, as escaped shared strings', () => {
    const doc = xml(text(files['xl/worksheets/sheet1.xml']));
    const cells = Object.fromEntries([...doc.getElementsByTagName('c')].map((c) => [c.getAttribute('r'), c]));
    expect(cells.B2.getElementsByTagName('v')[0].textContent).toBe(String(23.5 / 24));
    expect(cells.B2.getAttribute('t')).toBeNull();
    expect(cells.A3.getAttribute('t')).toBe('s');
    const sheet = readWorkbook(bytes)[0];
    expect(sheet.cells.get('A3')?.value).toBe('A & B <c> "q"');
    expect(sheet.cells.get('B3')).toBeUndefined(); // an empty, unstyled cell is not written
    const sst = xml(text(files['xl/sharedStrings.xml'])).documentElement;
    expect(Number(sst.getAttribute('uniqueCount'))).toBe(sst.getElementsByTagName('si').length);
  });

  it('describes the sheet: dimension, filter buttons, frozen panes', () => {
    const b = buildXlsx([{ name: 'S', rows: [[{ v: 'a' }, { v: 'b' }, { v: 'c' }], [{ v: 1 }, { v: 2 }, { v: 3 }], [{ v: 4 }, { v: 5 }, { v: 6 }]], autoFilter: { headerRow: 1, toRow: 3 }, freeze: { rows: 1 } }]);
    const sheet = readWorkbook(b)[0];
    expect(sheet.dimension).toBe('A1:C3');
    expect(sheet.autoFilter).toBe('A1:C3');
    expect(sheet.frozen).toEqual({ x: 0, y: 1 });
  });

  it('keeps every colour: cells that differ ONLY in their fill do not share a style (the bug that made the file\'s colours wrong)', () => {
    const base = { align: 'center' as const, border: true, numFmt: '[h]:mm' };
    const colours = ['#BBF7D0', '#DCFCE7', '#FEF9C3', '#FED7AA', '#FECACA'];
    const b = buildXlsx([{ name: 'S', rows: [colours.map((c, i) => ({ v: i / 10, style: { ...base, fill: { color: c } } }))] }]);
    const sheet = readWorkbook(b)[0];
    expect([...sheet.cells.values()].map((c) => c.fill)).toEqual(colours.map((c) => c.slice(1)));
    // and the same style is still shared when everything is the same
    const same = buildXlsx([{ name: 'S', rows: [[{ v: 1, style: base }, { v: 2, style: { ...base } }]] }]);
    const styleIds = [...xml(text(readZip(same).files['xl/worksheets/sheet1.xml'])).getElementsByTagName('c')].map((c) => c.getAttribute('s'));
    expect(styleIds[0]).toBe(styleIds[1]);
  });

  it('keeps the fill, the bold, the colour of the text and the number format together on a cell', () => {
    const b = buildXlsx([{ name: 'S', rows: [[
      { v: 1, style: { fill: { color: '#ff0000' }, bold: true, numFmt: '0.0' } },
      { v: 2, style: { fill: { color: '#ff0000' }, bold: false, numFmt: '0.0' } },
      { v: 3, style: { fill: { color: '#00ff00' }, bold: true, numFmt: '0.0"%"' } },
    ]] }]);
    const c = readWorkbook(b)[0].cells;
    expect([c.get('A1')?.fill, c.get('A1')?.bold, c.get('A1')?.numFmt]).toEqual(['FF0000', true, '0.0']);
    expect([c.get('B1')?.fill, c.get('B1')?.bold]).toEqual(['FF0000', false]);
    expect([c.get('C1')?.fill, c.get('C1')?.bold, c.get('C1')?.numFmt]).toEqual(['00FF00', true, '0.0"%"']);
    expect(c.get('C1')?.shown).toBe('3.0%');
  });

  it('keeps the colours, the number format and the frozen pane', () => {
    const sheet = xml(text(files['xl/worksheets/sheet1.xml']));
    const pane = sheet.getElementsByTagName('pane')[0];
    expect(pane.getAttribute('xSplit')).toBe('1');
    expect(pane.getAttribute('ySplit')).toBe('1');
    expect(pane.getAttribute('topLeftCell')).toBe('B2');
    const styles = text(files['xl/styles.xml']);
    expect(styles).toContain('formatCode="[h]:mm"');
    expect(styles).toContain('rgb="FFBBF7D0"');
    expect(styles).toContain('rgb="FF112233"');
    // the styled cell points at an existing style
    const styleId = Number([...sheet.getElementsByTagName('c')].find((c) => c.getAttribute('r') === 'B2')!.getAttribute('s'));
    const count = Number(xml(styles).getElementsByTagName('cellXfs')[0].getAttribute('count'));
    expect(styleId).toBeGreaterThan(0);
    expect(styleId).toBeLessThan(count);
  });

  it('is identical for identical input', () => {
    const again = buildXlsx([{ name: 'A', rows: [[{ v: 1 }]] }]);
    expect(buildXlsx([{ name: 'A', rows: [[{ v: 1 }]] }])).toEqual(again);
  });

  it('refuses an empty workbook', () => {
    expect(() => buildXlsx([])).toThrow();
  });
});
