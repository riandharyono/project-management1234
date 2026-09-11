const STATUS_LABEL = {
  diminta: "Diminta",
  diterima_sebagian: "Sebagian",
  diterima_lengkap: "Lengkap",
  tidak_tersedia: "Tidak tersedia",
  tidak_relevan: "Tidak relevan",
};

export function flattenRecapItems(recapOrGroups) {
  const regions = recapOrGroups?.regions;
  const groups = regions?.length
    ? regions.flatMap(r => r.groups || [])
    : (Array.isArray(recapOrGroups) ? recapOrGroups : recapOrGroups?.groups || []);
  const seen = new Map();
  for (const g of groups) {
    for (const it of g.items || []) {
      if (it?.key && !seen.has(it.key)) seen.set(it.key, it);
    }
  }
  return [...seen.values()];
}

function statusSummary(counts) {
  return ["diterima_lengkap", "diterima_sebagian", "diminta", "tidak_tersedia", "tidak_relevan"]
    .filter(s => counts?.[s])
    .map(s => `${counts[s]} ${(STATUS_LABEL[s] || s).toLowerCase()}`)
    .join(" · ");
}

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function recapToCsv(items, year) {
  const headers = [
    "No", "Wilayah", "Nama data", "Klasifikasi", "Jumlah tim", "Tim",
    "Status per tim", "PIC", "Ringkasan status", "Nama tautan", "Link unduhan", "Catatan",
  ];
  const rows = (items || []).map((it, i) => {
    const atts = it.attachments || [];
    return [
      i + 1,
      it.wilayah || "",
      it.name || "",
      (it.sheets || []).join("; "),
      it.team_count ?? (it.teams || []).length,
      (it.teams || []).map(t => t.team_name).filter(Boolean).join("; "),
      (it.teams || []).map(t => `${t.team_name}: ${STATUS_LABEL[t.status] || t.status}`).join("; "),
      (it.teams || []).map(t => t.pic).filter(Boolean).join("; "),
      statusSummary(it.status_counts),
      atts.map(a => a.name || "").filter(Boolean).join("; "),
      atts.map(a => a.url).filter(Boolean).join("; "),
      (it.notes || []).join("; "),
    ];
  });
  const body = [headers, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
  return `\uFEFFRekap Data ${year}\r\n${body}\r\n`;
}

export function downloadTextFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

export function recapToPdfBytes(items, year, meta = {}) {
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
    wrapped.forEach((part, idx) => {
      if (y < margin + 28) flushPage();
      y -= size + 3;
      lines.push({
        text: part,
        x: margin + indent,
        y,
        size,
        color: opts.color || null,
        link: idx === 0 ? opts.link || null : null,
      });
    });
  };

  add(`Rekap Data ${year}`, { size: 16 });
  add(`${items.length} data unik · ${meta.totalRequests ?? "-"} permintaan · ${meta.teamCount ?? "-"} tim`, { size: 9, color: [0.35, 0.38, 0.45] });
  add(`Dibuat ${new Date().toLocaleString("id-ID")}`, { size: 8, color: [0.45, 0.48, 0.55] });
  y -= 8;

  (items || []).forEach((it, i) => {
    if (y < margin + 90) flushPage();
    add(`${i + 1}. ${it.name || ""}`, { size: 11 });
    if (it.wilayah) add(`Wilayah: ${it.wilayah}`, { size: 9, indent: 14, color: [0.25, 0.3, 0.4] });
    if ((it.sheets || []).length) add(`Klasifikasi: ${(it.sheets || []).join(", ")}`, { size: 9, indent: 14, color: [0.25, 0.3, 0.4] });
    add(`Tim (${it.team_count ?? (it.teams || []).length}): ${(it.teams || []).map(t => `${t.team_name} [${STATUS_LABEL[t.status] || t.status}]`).join(", ") || "-"}`, { size: 9, indent: 14 });
    const pics = (it.teams || []).map(t => t.pic).filter(Boolean);
    if (pics.length) add(`PIC: ${pics.join("; ")}`, { size: 9, indent: 14 });
    add(`Status: ${statusSummary(it.status_counts) || "-"}`, { size: 9, indent: 14 });
    const atts = it.attachments || [];
    if (atts.length) {
      add("Link unduhan:", { size: 9, indent: 14 });
      atts.forEach(a => {
        const label = a.name && a.name !== a.url ? `${a.name} - ${a.url}` : (a.url || a.name || "");
        add(label, { size: 8, indent: 24, color: [0.15, 0.32, 0.72], link: a.url || null });
      });
    } else {
      add("Link unduhan: (belum ada)", { size: 9, indent: 14, color: [0.5, 0.5, 0.55] });
    }
    if ((it.notes || []).length) add(`Catatan: ${(it.notes || []).join(" | ")}`, { size: 8, indent: 14, color: [0.35, 0.38, 0.45] });
    y -= 6;
  });

  flushPage();
  if (!pages.length) pages.push([{ text: `Rekap Data ${year}`, x: margin, y: pageH - margin - 20, size: 16, color: null, link: null }]);

  const objects = [];
  const offsets = [];
  const bodyOf = [];
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
    const annotIds = [];
    pageLines.forEach(line => {
      const color = line.color ? `${line.color[0]} ${line.color[1]} ${line.color[2]} rg` : "0 0 0 rg";
      ops.push(color);
      ops.push(`/F1 ${line.size} Tf`);
      ops.push(`1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm`);
      ops.push(`(${pdfEscape(toPdfText(line.text))}) Tj`);
      if (line.link) {
        const w = Math.min(pageW - margin - line.x, Math.max(40, line.text.length * line.size * 0.48));
        const h = line.size + 2;
        annotIds.push(pushObj(
          `<< /Type /Annot /Subtype /Link /Rect [${line.x.toFixed(2)} ${(line.y - 2).toFixed(2)} ${(line.x + w).toFixed(2)} ${(line.y + h).toFixed(2)}] /Border [0 0 0] /A << /S /URI /URI (${pdfEscape(line.link)}) >> >>`
        ));
      }
    });
    ops.push("ET");
    const stream = ops.join("\n");
    const contentId = pushObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const annotsPart = annotIds.length ? ` /Annots [${annotIds.map(id => `${id} 0 R`).join(" ")}]` : "";
    pageIds.push(pushObj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >>${annotsPart} >>`
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

export function downloadPdfBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
