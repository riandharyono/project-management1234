import axios from "axios";

export const client = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`, withCredentials: true });

let refreshPromise = null;
client.interceptors.response.use(
  r => r,
  error => {
    const { config, response } = error;
    const skipRefresh = config?.url?.startsWith("/auth/refresh") || config?.url?.startsWith("/auth/login");
    if (response?.status === 401 && config && !config._retried && !skipRefresh) {
      config._retried = true;
      refreshPromise = refreshPromise || client.post("/auth/refresh").catch(e => { refreshPromise = null; throw e; }).then(r => { refreshPromise = null; return r; });
      return refreshPromise
        .then(() => client(config))
        .catch(e => { window.dispatchEvent(new Event("session-expired")); return Promise.reject(error); });
    }
    return Promise.reject(error);
  }
);

export const apiError = e => { const d = e.response?.data?.detail; return Array.isArray(d) ? d.map(x => x.msg).join(" ") : d || "Terjadi kesalahan"; };

export const fileUrl = id => `${process.env.REACT_APP_BACKEND_URL}/api/files/${id}`;

export const initials = name => (name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();

const PALETTE = ["#1B4A3A", "#2F6F4E", "#3D5A4A", "#245C4A", "#5A6B5E", "#40664F", "#1A3D32", "#4A6748"];
export const avatarColor = seed => { let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

export const isImageFile = filename => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename || "");

export const formatSize = bytes => { if (!bytes) return "0 B"; if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; };

export const timeAgo = iso => {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit yang lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam yang lalu`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} hari yang lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

export const shortDate = iso => iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "";

export const chatTime = iso => iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

export const isSameDay = (a, b) => a && b && new Date(a).toDateString() === new Date(b).toDateString();

export const dayLabel = iso => {
  if (!iso) return "";
  const d = new Date(iso), today = new Date(), yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (isSameDay(iso, today)) return "Hari ini";
  if (isSameDay(iso, yesterday)) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
};

export const LABEL_COLORS = ["#2879ed", "#20a76a", "#ec9a2b", "#dc6863", "#8b5cf6", "#0ea5a3", "#f2617a"];
