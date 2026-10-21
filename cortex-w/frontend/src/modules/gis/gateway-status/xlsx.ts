/**
 * A small, dependency-free writer of Excel workbooks (.xlsx): sheets of text and numbers with colours, number formats,
 * column widths and frozen rows / columns. An .xlsx file is a zip of XML parts; the zip here stores them uncompressed,
 * which every reader accepts, so the file is a little larger than Excel's own but needs no library.
 */

export interface XlsxFill {
  /** "#RRGGBB" */
  color: string;
}

/** A cell style: what the cell looks like. The same style is reused by every cell that names it. */
export interface XlsxStyle {
  fill?: XlsxFill;
  bold?: boolean;
  /** "#RRGGBB" text colour */
  textColor?: string;
  align?: 'left' | 'center' | 'right';
  /** An Excel number format code, e.g. '[h]:mm' or '0.0'. */
  numFmt?: string;
  size?: number;
  border?: boolean;
}

export interface XlsxCell {
  /** A number is stored as a number (so it sorts and sums); a string as text; null leaves the cell empty. */
  v: string | number | null;
  style?: XlsxStyle;
}

export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
  /** Column widths in characters. */
  widths?: number[];
  /** Rows / columns kept in view while scrolling. */
  freeze?: { rows?: number; cols?: number };
  /** Filter buttons on a header row (1-based) covering the data rows below it down to `toRow`. */
  autoFilter?: { headerRow: number; toRow: number };
  /** Row heights in points, by 1-based row. */
  rowHeights?: Record<number, number>;
  /** Print on landscape paper, one page wide. */
  landscape?: boolean;
  /** Text cells such as "23:18" are meant as text: do not flag them as "number stored as text". */
  textIsText?: boolean;
}

export interface XlsxMeta {
  title?: string;
  creator?: string;
}

// --- zip (stored) --------------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

/** A zip with every file stored, not compressed. */
export function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // a fixed timestamp (1980-01-01) keeps the output identical for identical input
  const dosTime = 0;
  const dosDate = (1 << 5) | 1;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true); // made by
    cd.setUint16(6, 20, true); // needed
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

// --- workbook ------------------------------------------------------------------------------------------------------

const esc = (s: string) =>
  s
    // characters XML cannot hold at all are dropped; the rest are escaped
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** "A", "B" ... "Z", "AA" ... for a 0-based column. */
export function columnName(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Excel's sheet names: at most 31 characters, none of  [ ] : * ? / \  , and not empty. */
export function sheetName(name: string, fallback = 'Sheet'): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31).trim();
  return cleaned || fallback;
}

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;

class StyleBook {
  private fills: string[] = [];
  private fonts: string[] = [];
  private numFmts = new Map<string, number>();
  private xfs: string[] = [];
  private byKey = new Map<string, number>();

  constructor() {
    this.fonts.push('<font><sz val="11"/><name val="Calibri"/></font>');
    this.fills.push('<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>');
    this.xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
  }

  /** A key made of EVERY property of the style, in a fixed order, so two styles share an id only when they are the same. */
  static key(style: XlsxStyle): string {
    return JSON.stringify([
      style.fill?.color.toUpperCase() ?? null,
      !!style.bold,
      style.textColor?.toUpperCase() ?? null,
      style.align ?? null,
      style.numFmt ?? null,
      style.size ?? null,
      !!style.border,
    ]);
  }

  id(style: XlsxStyle | undefined): number {
    if (!style) return 0;
    const key = StyleBook.key(style);
    const hit = this.byKey.get(key);
    if (hit !== undefined) return hit;

    const fontKey = `<font>${style.bold ? '<b/>' : ''}<sz val="${style.size ?? 11}"/>${style.textColor ? `<color rgb="${argb(style.textColor)}"/>` : ''}<name val="Calibri"/></font>`;
    let fontId = this.fonts.indexOf(fontKey);
    if (fontId < 0) fontId = this.fonts.push(fontKey) - 1;

    let fillId = 0;
    if (style.fill) {
      const f = `<fill><patternFill patternType="solid"><fgColor rgb="${argb(style.fill.color)}"/><bgColor indexed="64"/></patternFill></fill>`;
      fillId = this.fills.indexOf(f);
      if (fillId < 0) fillId = this.fills.push(f) - 1;
    }

    let numFmtId = 0;
    if (style.numFmt) {
      if (!this.numFmts.has(style.numFmt)) this.numFmts.set(style.numFmt, 164 + this.numFmts.size);
      numFmtId = this.numFmts.get(style.numFmt)!;
    }

    const align = style.align ? `<alignment horizontal="${style.align}" vertical="center"/>` : '';
    const xf = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${style.border ? 1 : 0}" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''} applyFont="1"${fillId ? ' applyFill="1"' : ''}${style.border ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`;
    const id = this.xfs.push(xf) - 1;
    this.byKey.set(key, id);
    return id;
  }

  xml(): string {
    const numFmts = [...this.numFmts].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`).join('');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (numFmts ? `<numFmts count="${this.numFmts.size}">${numFmts}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

/** The text of every text cell, once each (what Excel itself writes; every reader understands it). */
class SharedStrings {
  private index = new Map<string, number>();
  private list: string[] = [];
  references = 0;
  id(text: string): number {
    this.references++;
    let i = this.index.get(text);
    if (i === undefined) {
      i = this.list.push(text) - 1;
      this.index.set(text, i);
    }
    return i;
  }
  xml(): string {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.references}" uniqueCount="${this.list.length}">` +
      this.list.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('') +
      '</sst>'
    );
  }
}

function sheetXml(sheet: XlsxSheet, styles: StyleBook, strings: SharedStrings): string {
  const freeze = sheet.freeze;
  const xSplit = freeze?.cols ?? 0;
  const ySplit = freeze?.rows ?? 0;
  const pane =
    xSplit || ySplit
      ? `<pane${xSplit ? ` xSplit="${xSplit}"` : ''}${ySplit ? ` ySplit="${ySplit}"` : ''} topLeftCell="${columnName(xSplit)}${ySplit + 1}" activePane="${
          xSplit && ySplit ? 'bottomRight' : xSplit ? 'topRight' : 'bottomLeft'
        }" state="frozen"/>`
      : '';
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (cell.v === null && !cell.style) return '';
          const ref = `${columnName(c)}${r + 1}`;
          const s = styles.id(cell.style);
          const attr = s ? ` s="${s}"` : '';
          if (cell.v === null) return `<c r="${ref}"${attr}/>`;
          if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return `<c r="${ref}"${attr}><v>${cell.v}</v></c>`;
          return `<c r="${ref}"${attr} t="s"><v>${strings.id(String(cell.v))}</v></c>`;
        })
        .join('');
      const ht = sheet.rowHeights?.[r + 1];
      return `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`;
    })
    .join('');
  const widest = sheet.rows.reduce((n, r) => Math.max(n, r.length), 1);
  const dimension = `A1:${columnName(Math.max(0, widest - 1))}${Math.max(1, sheet.rows.length)}`;
  const filter = sheet.autoFilter
    ? `<autoFilter ref="A${sheet.autoFilter.headerRow}:${columnName(Math.max(0, widest - 1))}${Math.max(sheet.autoFilter.headerRow, sheet.autoFilter.toRow)}"/>`
    : '';
  // parts must follow the order of the schema: sheetPr, dimension, sheetViews, sheetFormatPr, cols, sheetData, autoFilter, pageMargins, pageSetup
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (sheet.landscape ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '') +
    `<dimension ref="${dimension}"/>` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rows}</sheetData>` +
    filter +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    (sheet.landscape ? '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' : '') +
    (sheet.textIsText ? `<ignoredErrors><ignoredError sqref="${dimension}" numberStoredAsText="1"/></ignoredErrors>` : '') +
    '</worksheet>'
  );
}

/** The workbook as the bytes of an .xlsx file. */
export function buildXlsx(sheets: XlsxSheet[], meta: XlsxMeta = {}): Uint8Array {
  if (sheets.length === 0) throw new Error('A workbook needs at least one sheet');
  const styles = new StyleBook();
  const used = new Set<string>();
  const names = sheets.map((s, i) => {
    let name = sheetName(s.name, `Sheet${i + 1}`);
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${name.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
  const strings = new SharedStrings();
  const sheetParts = sheets.map((s) => sheetXml(s, styles, strings)); // styles and strings are collected while the sheets are written
  const files = [
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        '</workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `<Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
        '</Relationships>',
    },
    { name: 'xl/styles.xml', data: styles.xml() },
    { name: 'xl/sharedStrings.xml', data: strings.xml() },
    {
      name: 'docProps/core.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${esc(meta.title ?? 'Workbook')}</dc:title><dc:creator>${esc(meta.creator ?? 'Cortex-W')}</dc:creator>` +
        '</cp:coreProperties>',
    },
    {
      name: 'docProps/app.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Cortex-W</Application></Properties>',
    },
    ...sheetParts.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml })),
  ];
  return zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.data) })));
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Saves bytes (or text) to the user's computer under this file name. */
export function downloadFile(filename: string, data: Uint8Array | string, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // a moment later: some browsers need the address alive until the download starts
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
