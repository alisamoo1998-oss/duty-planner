// مولّد ملف Word (DOCX) حقيقي لكشف الخدمات اليومية — بلا مكتبات خارجية ولا خدمات.
// DOCX = حزمة ZIP (بدون ضغط «stored») من أجزاء XML. يعمل في المتصفح وفي Node (للاختبار).
// الاتجاه RTL: bidi على الفقرات والقسم، rtl على المقاطع، bidiVisual على الجدول (العمود الأول على اليمين).
// ترتيب عناصر XML مطابق لمخطط OOXML لتجنّب رسالة «الملف تالف» في Word.
import { LEGEND, COLUMNS } from "./report-logic.js";
import { formatDisplay } from "./dates.js";

const FONT = "Tahoma";
const enc = new TextEncoder();

// ---------- ZIP (stored) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files, when = new Date()) {
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  const push = (u8) => { parts.push(u8); offset += u8.length; };

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    central.push({ name, crc, size: data.length, offset });
    push(new Uint8Array(lh.buffer)); push(name); push(data);
  }
  const cdStart = offset;
  for (const c of central) {
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, c.crc, true);
    ch.setUint32(20, c.size, true); ch.setUint32(24, c.size, true); ch.setUint16(28, c.name.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, c.offset, true);
    push(new Uint8Array(ch.buffer)); push(c.name);
  }
  const cdSize = offset - cdStart;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
  end.setUint16(8, central.length, true); end.setUint16(10, central.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, cdStart, true); end.setUint16(20, 0, true);
  push(new Uint8Array(end.buffer));

  const out = new Uint8Array(offset);
  let p = 0;
  for (const u of parts) { out.set(u, p); p += u.length; }
  return out;
}

// ---------- عناصر WordprocessingML ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// مقطع نصي. الترتيب داخل rPr مطابق للمخطط: rFonts, b, bCs, i, iCs, color, sz, szCs, u, rtl
function run(text, { bold = false, italic = false, size = 20, color = "000000", underline = false } = {}) {
  return `<w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/>` +
    `${bold ? "<w:b/><w:bCs/>" : ""}${italic ? "<w:i/><w:iCs/>" : ""}<w:color w:val="${color}"/>` +
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${underline ? '<w:u w:val="single"/>' : ""}<w:rtl/></w:rPr>` +
    `<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}
// فقرة RTL. الترتيب في pPr: keepNext, bidi, spacing, jc
function para(runs, { center = false, after = 0, before = 0, keepNext = false } = {}) {
  return `<w:p><w:pPr>${keepNext ? "<w:keepNext/>" : ""}<w:bidi/><w:spacing w:before="${before}" w:after="${after}"/>${center ? '<w:jc w:val="center"/>' : ""}</w:pPr>${runs}</w:p>`;
}
const SHADE = { done: "EEF0F2", pending: "FFF7E3", upcoming: null, missing: null, today: null };

// خلية: paras (نص XML للفقرات)، fill (لون تعبئة اختياري)، thick (حدود علوية/سفلية سميكة ليوم اليوم)
function cell(width, parasXml, { fill = null, thick = false } = {}) {
  const borders = thick
    ? '<w:tcBorders><w:top w:val="single" w:sz="18" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="18" w:space="0" w:color="000000"/></w:tcBorders>'
    : "";
  const shd = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${borders}${shd}</w:tcPr>${parasXml || para("")}</w:tc>`;
}
const row = (cells, { header = false } = {}) =>
  `<w:tr><w:trPr><w:cantSplit/>${header ? "<w:tblHeader/>" : ""}</w:trPr>${cells.join("")}</w:tr>`;
const tableXml = (widths, rows) => {
  const total = widths.reduce((a, b) => a + b, 0);
  const b = (n) => `<w:${n} w:val="single" w:sz="6" w:space="0" w:color="555555"/>`;
  return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${total}" w:type="dxa"/>` +
    `<w:tblBorders>${b("top")}${b("left")}${b("bottom")}${b("right")}${b("insideH")}${b("insideV")}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`;
};

// نص سطر لفرد داخل خلية (نفس منطق العرض في الصفحة)
export function entryText(e) {
  const base = `${e.name}${e.driver ? " 🚗" : ""}${e.inactive ? " (غير نشط)" : ""}`;
  if (e.note) return `${e.note}: ${base}`;
  if (e.detail) return `${base} — ${e.detail}`;
  return base;
}

function cellParas(entries) {
  if (!entries.length) return para(run("لا توجد", { color: "666666", italic: true, size: 18 }));
  return entries
    .map((e) =>
      // المطابق للبحث: عريض + مسطَّر (يظهر في الطباعة بالأبيض والأسود)؛ التكليف: مائل
      para(run(entryText(e), { bold: e.hit, underline: e.hit, italic: e.kind === "assignment", size: 20 })) +
      (e.span ? para(run(e.span, { italic: true, size: 17, color: "444444" })) : "")
    )
    .join("");
}

export function docxFileName(report) {
  return `كشف-الخدمات-${report.from}_${report.to}.docx`;
}

// ---------- بناء المستند ----------
// meta: { preparedAt: "dd/mm/yyyy hh:mm", filterNote: "", countsText: "" }
export function buildDocxBytes(report, meta, when = new Date()) {
  const cols = report.columns;
  // عرض الصفحة المتاح: A4 (11906) - هوامش 2×850 = 10206 twips. عمود التاريخ ثابت، والبقية بالتساوي
  const total = 10200;
  const dateW = cols.length === 4 ? 1700 : 1900;
  // عمود المهام أعرض (يحمل اسم الفرد والمهمة ومدتها)؛ بقية الأعمدة متساوية
  const wide = { tasks: cols.length === 4 ? 2750 : null };
  const fixed = cols.reduce((a, c) => a + (wide[c] || 0), 0);
  const flexCols = cols.filter((c) => !wide[c]).length;
  const flex = flexCols ? Math.floor((total - dateW - fixed) / flexCols) : 0;
  const widths = [dateW, ...cols.map((c) => wide[c] || (flexCols ? flex : total - dateW))];

  const head = row([
    cell(widths[0], para(run("التاريخ واليوم", { bold: true, size: 20 })), { fill: "D9DEE3" }),
    ...cols.map((c, i) => cell(widths[i + 1], para(run(COLUMNS[c], { bold: true, size: 20 })), { fill: "D9DEE3" })),
  ], { header: true });

  const body = report.rows.map((r) => {
    const k = r.status.kind;
    const fill = SHADE[k];
    const thick = k === "today";
    const label = [r.status.label, r.status.sub ? `(${r.status.sub})` : ""].filter(Boolean).join(" ");
    const dateCell = cell(
      widths[0],
      para(run(formatDisplay(r.date), { bold: true, size: 20 })) +
        para(run(r.weekday, { size: 19 })) +
        para(run(k === "done" ? `✓ ${label}` : label, { size: 17, bold: k === "today", italic: k === "missing", color: "333333" })),
      { fill, thick }
    );
    return row([dateCell, ...cols.map((c, i) => cell(widths[i + 1], cellParas(r.cells[c]), { fill, thick }))]);
  });

  // وسيلة الإيضاح: صف واحد بخلايا مظللة كما في الجدول، والنص يكفي وحده عند الطباعة بالأبيض والأسود
  const lw = Math.floor(total / LEGEND.length);
  const legendRow = row(LEGEND.map((l) => cell(lw, para(run(l.text, { size: 16 })), { fill: SHADE[l.kind], thick: l.kind === "today" })));

  const lines = [
    para(run("كشف الخدمات اليومية", { bold: true, size: 36 }), { center: true, after: 80 }),
    para(run(`الفترة: من ${formatDisplay(report.from)} إلى ${formatDisplay(report.to)}`, { bold: true, size: 24 }), { center: true, after: 40 }),
    para(run(`تاريخ إعداد التقرير: ${meta.preparedAt}`, { size: 20 }), { center: true, after: 40 }),
    para(run(meta.countsText, { size: 19, color: "333333" }), { center: true, after: 40 }),
    meta.filterNote ? para(run(meta.filterNote, { size: 19, bold: true }), { center: true, after: 40 }) : "",
    para(run("وسيلة الإيضاح:", { bold: true, size: 18 }), { before: 80, after: 40, keepNext: true }),
    tableXml(Array(LEGEND.length).fill(lw), [legendRow]),
    para("", { after: 80 }),
    tableXml(widths, [head, ...body]),
    para(run("الأسطر المائلة في عمود المهام تكليفات مسجّلة في صفحة التعيينات. «بديل» يعني اليوم الثاني من خدمة الخفارة أو الحراسة (48 ساعة) وليس خدمة جديدة. الأيام القادمة مخطط لها وقابلة للتعديل.", { size: 16, color: "444444" }), { before: 80 }),
  ].join("");

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${lines}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="450" w:footer="450" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="260" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const iso = when.toISOString().replace(/\.\d+Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(`كشف الخدمات اليومية ${report.from} إلى ${report.to}`)}</dc:title><dc:creator>Duty Planner</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;

  return zipStore([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: documentXml },
    { name: "word/_rels/document.xml.rels", data: docRels },
    { name: "word/styles.xml", data: stylesXml },
    { name: "docProps/core.xml", data: core },
  ], when);
}
