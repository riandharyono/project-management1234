import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { client, shortDate, localISODate } from "../lib/api";
import { EmptyState } from "./EmptyState";

const TABS = [
  { key: "progress", label: "Progres Tim" },
  { key: "data-requests", label: "Permintaan Data" },
];

function Deadlines({ row }) {
  if (!row.laporan_deadline && !row.kke_deadline) return null;
  const today = localISODate();
  const tone = d => (d < today ? "overdue" : "");
  return (
    <div className="mon-deadlines">
      {row.laporan_deadline && <span className={tone(row.laporan_deadline)}>Laporan: {shortDate(row.laporan_deadline)}</span>}
      {row.kke_deadline && <span className={tone(row.kke_deadline)}>KKE: {shortDate(row.kke_deadline)}</span>}
    </div>
  );
}

export function MonitoringPage({ onOpenTeam }) {
  const [tab, setTab] = useState("progress");
  return (
    <div className="page" data-testid="monitoring-page">
      <div className="page-heading">
        <div><h1>Monitoring</h1><p className="muted">Rekap lintas semua penugasan, diurutkan dari yang paling butuh perhatian.</p></div>
      </div>
      <div className="mon-tabs">
        {TABS.map(t => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)} data-testid={`monitoring-tab-${t.key}`}>{t.label}</button>
        ))}
      </div>
      {tab === "progress"
        ? <ProgressMonitoring onOpenTeam={onOpenTeam} />
        : <DataRequestMonitoring onOpenTeam={onOpenTeam} />}
    </div>
  );
}

function ProgressMonitoring({ onOpenTeam }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { client.get("/teams/tasks-monitoring").then(r => setRows(r.data)).catch(() => setRows([])); }, []);
  if (rows === null) return <p className="muted">Memuat…</p>;
  if (!rows.length) return <EmptyState icon={<CheckCircle2 size={22} />} title="Belum ada tim" body="Progres tugas akan muncul di sini begitu ada tim dengan tugas." />;
  return (
    <div className="mon-list" data-testid="progress-monitoring-list">
      {rows.map(r => {
        const tone = !r.total ? "" : r.pct_complete >= 80 ? "var(--success)" : r.pct_complete >= 50 ? "var(--warning)" : "var(--danger)";
        return (
          <button className="mon-row" key={r.team_id} onClick={() => onOpenTeam(r.team_id, "overview")} data-testid={`progress-monitoring-row-${r.team_id}`}>
            <div>
              <div className="name">{r.team_name}</div>
              <div className="meta">{r.done}/{r.total || 0} tugas selesai · dimulai {r.created_at ? shortDate(r.created_at) : "-"}</div>
              <Deadlines row={r} />
            </div>
            <div>
              {r.overdue > 0
                ? <span className="flag"><AlertTriangle size={11} /> {r.overdue} lewat tenggat</span>
                : <span className="flag ok"><CheckCircle2 size={11} /> Tidak ada yang lewat tenggat</span>}
            </div>
            <div className="mon-track"><i style={{ width: `${r.pct_complete}%`, background: tone }} /></div>
            <div className="pct">{r.pct_complete}%<small>progres</small></div>
          </button>
        );
      })}
    </div>
  );
}

function DataRequestMonitoring({ onOpenTeam }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { client.get("/data-requests/monitoring").then(r => setRows(r.data)).catch(() => setRows([])); }, []);
  if (rows === null) return <p className="muted">Memuat…</p>;
  if (!rows.length) return <EmptyState icon={<CheckCircle2 size={22} />} title="Belum ada tim" body="Kelengkapan data akan muncul di sini begitu ada tim dengan permintaan data." />;
  return (
    <div className="mon-list" data-testid="data-monitoring-list">
      {rows.map(r => {
        const flagged = r.counts.tidak_tersedia > 0;
        const tone = !r.total ? "" : r.pct_complete >= 80 ? "var(--success)" : r.pct_complete >= 50 ? "var(--warning)" : "var(--danger)";
        return (
          <button className="mon-row" key={r.team_id} onClick={() => onOpenTeam(r.team_id, "data-requests")} data-testid={`monitoring-row-${r.team_id}`}>
            <div>
              <div className="name">{r.team_name}</div>
              <div className="meta">{r.counts.diterima_lengkap}/{r.total || 0} data · dimulai {r.created_at ? shortDate(r.created_at) : "-"}</div>
              <Deadlines row={r} />
            </div>
            <div>
              {flagged
                ? <span className="flag"><AlertTriangle size={11} /> {r.counts.tidak_tersedia} tidak tersedia</span>
                : <span className="flag ok"><CheckCircle2 size={11} /> Tidak ada kendala</span>}
            </div>
            <div className="mon-track"><i style={{ width: `${r.pct_complete}%`, background: tone }} /></div>
            <div className="pct">{r.pct_complete}%<small>lengkap</small></div>
          </button>
        );
      })}
    </div>
  );
}
