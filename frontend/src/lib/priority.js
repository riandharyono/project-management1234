export const PRIORITIES = [
  { value: "High", label: "Tinggi" },
  { value: "Medium", label: "Sedang" },
  { value: "Low", label: "Rendah" },
];

export const priorityLabel = value => PRIORITIES.find(p => p.value === value)?.label || value || "Sedang";

export const priorityKey = value => {
  const x = String(value || "").toLowerCase();
  if (x === "high" || x === "tinggi") return "high";
  if (x === "low" || x === "rendah") return "low";
  return "medium";
};
