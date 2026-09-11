import DOMPurify from "dompurify";

export const TITLE_COLORS = [
  { key: "default", value: "", label: "Default" },
  { key: "red", value: "#dc6863", label: "Merah" },
  { key: "orange", value: "#ec9a2b", label: "Oranye" },
  { key: "green", value: "#20a76a", label: "Hijau" },
  { key: "blue", value: "#2879ed", label: "Biru" },
  { key: "purple", value: "#8b5cf6", label: "Ungu" },
];

export const TITLE_SIZES = [
  { key: "2", label: "Kecil", card: 13, detail: 18 },
  { key: "3", label: "Biasa", card: 14, detail: 20 },
  { key: "5", label: "Besar", card: 17, detail: 26 },
];

const TITLE_HTML_ALLOWED = {
  ALLOWED_TAGS: ["span", "font", "b", "strong", "i", "em", "br"],
  ALLOWED_ATTR: ["style", "color", "size", "class"],
};

export function sanitizeTitleHtml(html) {
  return DOMPurify.sanitize(html || "", TITLE_HTML_ALLOWED);
}

export function titleToPlain(htmlOrText) {
  if (!htmlOrText) return "";
  if (typeof document === "undefined") return String(htmlOrText).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const d = document.createElement("div");
  d.innerHTML = sanitizeTitleHtml(htmlOrText);
  return (d.textContent || "").replace(/\s+/g, " ").trim();
}

export function titleDisplayHtml(task) {
  if (task?.title_html) return sanitizeTitleHtml(task.title_html);
  const color = task?.title_color || "";
  const size = task?.title_size === "sm" ? "0.92em" : task?.title_size === "lg" ? "1.2em" : "";
  const text = task?.title || "";
  if (!color && !size) return "";
  const style = [color ? `color:${color}` : "", size ? `font-size:${size}` : ""].filter(Boolean).join(";");
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<span style="${style}">${escaped}</span>`;
}
