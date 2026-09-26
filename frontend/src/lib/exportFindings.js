import { downloadPdfBytes, downloadTextFile } from "./exportRecap";

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function assigneeNames(item) {
  return (item.assignees || []).map(a => a.name).filter(Boolean).join("; ");
}

export function findingsToCsv(items, label) {
  const headers = ["No", "Tanggal", "Tim", "Tahun", "Tanggungan", "Tugas", "Kolom", "Penulis", "Ditugasi", "Temuan"];
  const rows = (items || []).map((it, i) => [
    i + 1,
    it.created_at ? new Date(it.created_at).toLocaleString("id-ID") : "",
    it.team_name || "",
    it.team_year || "",
    it.wilayah || "",
    it.task_title || "",
    it.list_name || "",
    it.author || "",
    assigneeNames(it),
    it.body || "",
  ]);
  const body = [headers, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
  return `\uFEFFRekap Temuan ${label}\r\n${body}\r\n`;
}

function pdfEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function toPdfText(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E]/g, " ");
}

function wrapText(text, maxChars) {
  const raw = toPdfText(text).trim() || "";
  if (!raw) return [""];
  const words = raw.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function findingsToPdfBytes(items, label) {
  const pageW = 595;
  const pageH = 842;
  const margin = 40;
  const pages = [];
  let lines = [];
  let y = pageH - margin;

  const flushPage = () => {
    if (lines.length) pages.push(lines);
    lines = [];
    y = pageH - margin;
  };

  const add = (text, opts = {}) => {
    const size = opts.size || 10;
    const indent = opts.indent || 0;
    const maxChars = Math.max(24, Math.floor((pageW - margin * 2 - indent) / (size * 0.5)));
    const wrapped = wrapText(text, maxChars);
    wrapped.forEach(part => {
      if (y < margin + 28) flushPage();
      y -= size + 3;
      lines.push({ text: part, x: margin + indent, y, size, color: opts.color || null });
    });
  };

  add(`Rekap Temuan ${label}`, { size: 16 });
  add(`${(items || []).length} temuan · dibuat ${new Date().toLocaleString("id-ID")}`, { size: 9, color: [0.35, 0.38, 0.45] });
  y -= 8;

  (items || []).forEach((it, i) => {
    if (y < margin + 90) flushPage();
    add(`${i + 1}. ${it.task_title || "(Tanpa judul)"}`, { size: 11 });
    add(`${it.team_name || ""}${it.team_year ? ` · ${it.team_year}` : ""}${it.list_name ? ` · ${it.list_name}` : ""}`, { size: 9, indent: 14, color: [0.25, 0.3, 0.4] });
    add(`Penulis: ${it.author || "-"}${assigneeNames(it) ? ` · Ditugasi: ${assigneeNames(it)}` : ""}`, { size: 9, indent: 14 });
    if (it.created_at) add(new Date(it.created_at).toLocaleString("id-ID"), { size: 8, indent: 14, color: [0.45, 0.48, 0.55] });
    add(it.body || "", { size: 10, indent: 14 });
    y -= 6;
  });

  flushPage();
  if (!pages.length) pages.push([{ text: `Rekap Temuan ${label}`, x: margin, y: pageH - margin - 20, size: 16, color: null }]);

  const bodyOf = [];
  const offsets = [];
  const pushObj = body => {
    bodyOf.push(body);
    return bodyOf.length;
  };
  const catalogId = pushObj(null);
  const pagesId = pushObj(null);
  const fontId = pushObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];

  pages.forEach(pageLines => {
    const ops = ["BT"];
    pageLines.forEach(line => {
      const color = line.color ? `${line.color[0]} ${line.color[1]} ${line.color[2]} rg` : "0 0 0 rg";
      ops.push(color);
      ops.push(`/F1 ${line.size} Tf`);
      ops.push(`1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm`);
      ops.push(`(${pdfEscape(toPdfText(line.text))}) Tj`);
    });
    ops.push("ET");
    const stream = ops.join("\n");
    const contentId = pushObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(pushObj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
    ));
  });

  bodyOf[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  bodyOf[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let out = "%PDF-1.4\n";
  bodyOf.forEach((body, i) => {
    offsets[i] = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = out.length;
  out += `xref\n0 ${bodyOf.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(pos => {
    out += `${String(pos).padStart(10, "0")} 00000 n \n`;
  });
  out += `trailer\n<< /Size ${bodyOf.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

export function downloadFindingsCsv(items, label) {
  downloadTextFile(findingsToCsv(items, label), `Rekap-Temuan-${label}.csv`, "text/csv;charset=utf-8");
}

export function downloadFindingsPdf(items, label) {
  downloadPdfBytes(findingsToPdfBytes(items, label), `Rekap-Temuan-${label}.pdf`);
}
