import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { client, shortDate } from "../lib/api";
import { EmptyState } from "./EmptyState";

export function DataMonitoring({ onOpenTeam }) {
  const [rows, setRows] = useState(null);

  useEffect(() => { client.get("/data-requests/monitoring").then(r => setRows(r.data)).catch(() => setRows([])); }, []);

  if (rows === null) return <div className="page"><p className="muted">Memuat…</p></div>;

  return (
    <div className="page" data-testid="data-monitoring-page">
      <div className="page-heading">
        <div><h1>Monitoring Data</h1><p className="muted">Kelengkapan permintaan data semua penugasan, diurutkan dari yang paling butuh perhatian.</p></div>
      </div>
      {!rows.length ? (
        <EmptyState icon={<CheckCircle2 size={22} />} title="Belum ada tim" body="Kelengkapan data akan muncul di sini begitu ada tim dengan permintaan data." />
      ) : (
        <div className="mon-list" data-testid="monitoring-list">
          {rows.map(r => {
            const flagged = r.counts.tidak_tersedia > 0;
            const tone = !r.total ? "" : r.pct_complete >= 80 ? "var(--success)" : r.pct_complete >= 50 ? "var(--warning)" : "var(--danger)";
            return (
              <button className="mon-row" key={r.team_id} onClick={() => onOpenTeam(r.team_id)} data-testid={`monitoring-row-${r.team_id}`}>
                <div>
                  <div className="name">{r.team_name}</div>
                  <div className="meta">{r.counts.diterima_lengkap}/{r.total || 0} data · dimulai {r.created_at ? shortDate(r.created_at) : "-"}</div>
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
      )}
    </div>
  );
}
