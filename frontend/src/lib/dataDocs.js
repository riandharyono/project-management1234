export const PUSAT_LABEL = "Pusat / umum";
export const NO_WILAYAH_LABEL = "(Tanpa wilayah)";
export const NO_DOC_TYPE_LABEL = "(Tanpa jenis)";

export const DOC_TYPE_SUGGESTIONS = [
  "Peraturan pusat",
  "Peraturan daerah",
  "LKPD",
  "LPPD",
  "LKPJ",
  "Data statistik",
  "SK / Keputusan",
  "Laporan",
  "Dokumen perencanaan",
];

export function itemScope(item) {
  return item?.scope === "pusat" ? "pusat" : "pemda";
}

export function itemWilayahLabel(item, teamWilayah) {
  if (itemScope(item) === "pusat") return PUSAT_LABEL;
  return (item?.wilayah_label || item?.wilayah || teamWilayah || "").trim() || NO_WILAYAH_LABEL;
}

export function mergeSuggestions(preset, extra) {
  const seen = new Set();
  const out = [];
  for (const v of [...(preset || []), ...(extra || [])]) {
    const s = (v || "").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

export function weakestStatus(counts) {
  for (const s of ["diminta", "diterima_sebagian", "tidak_tersedia", "tidak_relevan", "diterima_lengkap"]) {
    if (counts?.[s]) return s;
  }
  return "diminta";
}
