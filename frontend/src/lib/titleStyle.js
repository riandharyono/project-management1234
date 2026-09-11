export const TITLE_COLORS = [
  { key: "default", value: "", label: "Default" },
  { key: "red", value: "#dc6863", label: "Merah" },
  { key: "orange", value: "#ec9a2b", label: "Oranye" },
  { key: "green", value: "#20a76a", label: "Hijau" },
  { key: "blue", value: "#2879ed", label: "Biru" },
  { key: "purple", value: "#8b5cf6", label: "Ungu" },
];

export const TITLE_SIZES = [
  { key: "sm", label: "Kecil", card: 13, detail: 18 },
  { key: "md", label: "Biasa", card: 14, detail: 20 },
  { key: "lg", label: "Besar", card: 17, detail: 26 },
];

const COLOR_SET = new Set(TITLE_COLORS.map(c => c.value));
const SIZE_SET = new Set(TITLE_SIZES.map(s => s.key));

export function normalizeTitleColor(value) {
  return COLOR_SET.has(value) ? value : "";
}

export function normalizeTitleSize(value) {
  return SIZE_SET.has(value) ? value : "md";
}

export function titleStyle(task, where = "card") {
  const size = TITLE_SIZES.find(s => s.key === normalizeTitleSize(task?.title_size)) || TITLE_SIZES[1];
  const color = normalizeTitleColor(task?.title_color);
  return {
    color: color || undefined,
    fontSize: where === "detail" ? size.detail : size.card,
  };
}
