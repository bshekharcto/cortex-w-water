/**
 * A reader of the workbooks xlsx.ts writes, for tests: it resolves, for every cell, what a spreadsheet would SHOW
 * (the number run through its format) and how the cell looks (fill, bold). It reads the file the way a spreadsheet does
 * (zip -> styles / shared strings -> cells), independently of the code that wrote it.
 */
export interface ReadCell {
  ref: string;
  /** The text a spreadsheet shows. */
  shown: string;
  /** The stored value: a number, or text. */
  value: number | string | null;
  fill: string | null;
  bold: boolean;
  numFmt: string;
}
export interface ReadSheet {
  name: string;
  cells: Map<string, ReadCell>;
  rows: Map<number, ReadCell[]>;
  dimension: string | null;
  autoFilter: string | null;
  frozen: { x: number; y: number } | null;
}

const td = new TextDecoder();

export function readZipFiles(zip: Uint8Array): Record<string, Uint8Array> {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const out: Record<string, Uint8Array> = {};
  let at = 0;
  while (dv.getUint32(at, true) === 0x04034b50) {
    const size = dv.getUint32(at + 18, true);
    const nameLen = dv.getUint16(at + 26, true);
    const extraLen = dv.getUint16(at + 28, true);
    out[td.decode(zip.subarray(at + 30, at + 30 + nameLen))] = zip.subarray(at + 30 + nameLen + extraLen, at + 30 + nameLen + extraLen + size);
    at += 30 + nameLen + extraLen + size;
  }
  return out;
}

const parse = (b: Uint8Array) => new DOMParser().parseFromString(td.decode(b), 'application/xml');
const col = (ref: string) => ref.replace(/\d+/g, '');
const rowNo = (ref: string) => Number(ref.replace(/\D+/g, ''));

/** Formats a number the way the number formats this file uses are shown by a spreadsheet that CUTS (not rounds) seconds. */
export function showNumber(v: number, fmt: string): string {
  const star = /"\*"$/.test(fmt) ? '*' : '';
  const base = fmt.replace(/"\*"$/, '');
  if (base === '[h]:mm') {
    const totalMinutes = Math.floor(v * 1440 + 1e-9);
    return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}${star}`;
  }
  if (base === '0.0') return `${v.toFixed(1)}${star}`;
  if (base === '0.0"%"') return `${v.toFixed(1)}%${star}`;
  if (base === '0') return String(Math.round(v));
  if (base === 'dd mmm yyyy') {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86_400_000);
    return `${String(d.getUTCDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  return String(v); // General
}

export function readWorkbook(zip: Uint8Array): ReadSheet[] {
  const files = readZipFiles(zip);
  const styles = parse(files['xl/styles.xml']);
  const fills = [...styles.getElementsByTagName('fills')[0].getElementsByTagName('fill')].map((f) => f.getElementsByTagName('fgColor')[0]?.getAttribute('rgb')?.slice(2) ?? null);
  const fonts = [...styles.getElementsByTagName('fonts')[0].getElementsByTagName('font')].map((f) => f.getElementsByTagName('b').length > 0);
  const numFmts = new Map([...styles.getElementsByTagName('numFmt')].map((n) => [Number(n.getAttribute('numFmtId')), n.getAttribute('formatCode')!]));
  const xfs = [...styles.getElementsByTagName('cellXfs')[0].getElementsByTagName('xf')].map((x) => ({
    fill: fills[Number(x.getAttribute('fillId'))],
    bold: fonts[Number(x.getAttribute('fontId'))],
    numFmt: numFmts.get(Number(x.getAttribute('numFmtId'))) ?? 'General',
  }));
  const strings = [...parse(files['xl/sharedStrings.xml']).getElementsByTagName('si')].map((si) => si.getElementsByTagName('t')[0].textContent ?? '');
  const wb = parse(files['xl/workbook.xml']);
  return [...wb.getElementsByTagName('sheet')].map((sh, i) => {
    const doc = parse(files[`xl/worksheets/sheet${i + 1}.xml`]);
    const cells = new Map<string, ReadCell>();
    const rows = new Map<number, ReadCell[]>();
    for (const c of [...doc.getElementsByTagName('c')]) {
      const ref = c.getAttribute('r')!;
      const xf = xfs[Number(c.getAttribute('s') ?? 0)];
      const v = c.getElementsByTagName('v')[0]?.textContent;
      const value = v == null ? null : c.getAttribute('t') === 's' ? strings[Number(v)] : Number(v);
      const cell: ReadCell = {
        ref,
        value,
        shown: value === null ? '' : typeof value === 'number' ? showNumber(value, xf.numFmt) : value,
        fill: xf.fill,
        bold: xf.bold,
        numFmt: xf.numFmt,
      };
      cells.set(ref, cell);
      rows.set(rowNo(ref), [...(rows.get(rowNo(ref)) ?? []), cell]);
    }
    const pane = doc.getElementsByTagName('pane')[0];
    return {
      name: sh.getAttribute('name')!,
      cells,
      rows,
      dimension: doc.getElementsByTagName('dimension')[0]?.getAttribute('ref') ?? null,
      autoFilter: doc.getElementsByTagName('autoFilter')[0]?.getAttribute('ref') ?? null,
      frozen: pane ? { x: Number(pane.getAttribute('xSplit') ?? 0), y: Number(pane.getAttribute('ySplit') ?? 0) } : null,
    };
  });
}
export { col };
