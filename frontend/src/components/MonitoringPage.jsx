import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, Users } from "lucide-react";
import { Avatar } from "./Avatar";
import { client, shortDate, localISODate, safeHttpUrl } from "../lib/api";
import { EmptyState } from "./EmptyState";
import { currentYear, teamYear } from "../lib/years";

const TABS = [
  { key: "progress", label: "Progres Tim" },
  { key: "members", label: "Anggota" },
  { key: "data-requests", label: "Permintaan Data" },
];

function Deadlines({ row }) {
  if (!row.laporan_deadline && !row.kke_deadline && !row.laporan_link && !row.kke_link) return null;
  const today = localISODate();
  const tone = d => (d && d < today ? "overdue" : "");
  const stop = e => e.stopPropagation();
  return (
    <div className="mon-deadlines">
      {row.laporan_deadline && <span className={tone(row.laporan_deadline)}>Laporan: {shortDate(row.laporan_deadline)}</span>}
      {safeHttpUrl(row.laporan_link) && <a href={safeHttpUrl(row.laporan_link)} target="_blank" rel="noopener noreferrer" onClick={stop} data-testid={`monitoring-laporan-link-${row.team_id}`}><Link2 size={10} /> Link laporan</a>}
      {row.kke_deadline && <span className={tone(row.kke_deadline)}>KKE: {shortDate(row.kke_deadline)}</span>}
      {safeHttpUrl(row.kke_link) && <a href={safeHttpUrl(row.kke_link)} target="_blank" rel="noopener noreferrer" onClick={stop} data-testid={`monitoring-kke-link-${row.team_id}`}><Link2 size={10} /> Link KKE</a>}
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
        : tab === "members"
          ? <MembersMonitoring onOpenTeam={onOpenTeam} />
          : <DataRequestMonitoring onOpenTeam={onOpenTeam} />}
    </div>
  );
}

function YearFilter({ rows, year, onChange }) {
  const years = useMemo(() => {
    const set = new Set((rows || []).map(r => teamYear(r)));
    return [...set].sort((a, b) => b - a);
  }, [rows]);
  if (years.length < 2) return null;
  return (
    <div className="mon-year-filters" data-testid="monitoring-year-filter">
      {years.map(y => (
        <button key={y} type="button" className={year === y ? "active" : ""} onClick={() => onChange(y)} data-testid={`monitoring-year-${y}`}>
          {y}{y === currentYear() ? "" : y < currentYear() ? " · arsip" : ""}
        </button>
      ))}
      <button type="button" className={year === "all" ? "active" : ""} onClick={() => onChange("all")} data-testid="monitoring-year-all">Semua tahun</button>
    </div>
  );
}

function filterByYear(rows, year) {
  if (year === "all") return rows;
  return rows.filter(r => teamYear(r) === year);
}

function ProgressMonitoring({ onOpenTeam }) {
  const [rows, setRows] = useState(null);
  const [year, setYear] = useState(currentYear());
  useEffect(() => { client.get("/teams/tasks-monitoring").then(r => setRows(r.data)).catch(() => setRows([])); }, []);
  if (rows === null) return <p className="muted">Memuat…</p>;
  if (!rows.length) return <EmptyState icon={<CheckCircle2 size={22} />} title="Belum ada tim" body="Progres tugas akan muncul di sini begitu ada tim dengan tugas." />;
  const visible = filterByYear(rows, year);
  return (
    <>
      <YearFilter rows={rows} year={year} onChange={setYear} />
      {!visible.length ? (
        <EmptyState icon={<CheckCircle2 size={22} />} title={`Tidak ada tim ${year === "all" ? "" : year}`} body="Pilih tahun lain, atau buka arsip untuk melihat tim tahun sebelumnya." />
      ) : (
    <div className="mon-list" data-testid="progress-monitoring-list">
      {visible.map(r => {
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
      )}
    </>
  );
}

function MembersMonitoring({ onOpenTeam }) {
  const [data, setData] = useState(null);
  const [year, setYear] = useState(currentYear());
  useEffect(() => { client.get("/teams/members-monitoring").then(r => setData(r.data)).catch(() => setData({ members: [], unassigned: [] })); }, []);
  if (data === null) return <p className="muted">Memuat…</p>;
  const rows = data.members || [];
  const visible = filterByYear(rows, year);
  const unassigned = filterByYear(data.unassigned || [], year);
  if (!rows.length) return <EmptyState icon={<Users size={22} />} title="Belum ada anggota" body="Progres tugas per orang muncul setelah tim punya anggota dan tugas yang ditugaskan." />;
  return (
    <>
      <YearFilter rows={rows} year={year} onChange={setYear} />
      {!!unassigned.length && (
        <div className="mon-unassigned" data-testid="members-monitoring-unassigned">
          {unassigned.map(u => (
            <button key={u.team_id} type="button" className="mon-unassigned-chip" onClick={() => onOpenTeam(u.team_id, "tasks")}>
              {u.team_name}: {u.count} tugas belum ditugaskan
            </button>
          ))}
        </div>
      )}
      {!visible.length ? (
        <EmptyState icon={<Users size={22} />} title={`Tidak ada anggota ${year === "all" ? "" : year}`} body="Pilih tahun lain." />
      ) : (
        <div className="mon-list" data-testid="members-monitoring-list">
          {visible.map(r => {
            const tone = !r.total ? "" : r.pct_complete >= 80 ? "var(--success)" : r.pct_complete >= 50 ? "var(--warning)" : "var(--danger)";
            return (
              <button className="mon-row" key={`${r.team_id}-${r.user_id}`} onClick={() => onOpenTeam(r.team_id, "tasks")} data-testid={`members-monitoring-row-${r.user_id}`}>
                <div className="mon-member">
                  <Avatar id={r.user_id} name={r.user_name} photo={r.user_avatar} />
                  <div>
                    <div className="name">{r.user_name}</div>
                    <div className="meta">{r.team_name} · {r.done}/{r.total || 0} selesai · {r.open} berjalan</div>
                  </div>
                </div>
                <div>
                  {r.overdue > 0
                    ? <span className="flag"><AlertTriangle size={11} /> {r.overdue} lewat tenggat</span>
                    : r.total
                      ? <span className="flag ok"><CheckCircle2 size={11} /> Tidak ada yang lewat tenggat</span>
                      : <span className="flag">Belum ditugasi</span>}
                </div>
                <div className="mon-track"><i style={{ width: `${r.pct_complete}%`, background: tone }} /></div>
                <div className="pct">{r.pct_complete}%<small>progres</small></div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function DataRequestMonitoring({ onOpenTeam }) {
  const [rows, setRows] = useState(null);
  const [year, setYear] = useState(currentYear());
  useEffect(() => { client.get("/data-requests/monitoring").then(r => setRows(r.data)).catch(() => setRows([])); }, []);
  if (rows === null) return <p className="muted">Memuat…</p>;
  if (!rows.length) return <EmptyState icon={<CheckCircle2 size={22} />} title="Belum ada tim" body="Kelengkapan data akan muncul di sini begitu ada tim dengan permintaan data." />;
  const visible = filterByYear(rows, year);
  return (
    <>
      <YearFilter rows={rows} year={year} onChange={setYear} />
      {!visible.length ? (
        <EmptyState icon={<CheckCircle2 size={22} />} title={`Tidak ada tim ${year === "all" ? "" : year}`} body="Pilih tahun lain, atau buka arsip untuk melihat tim tahun sebelumnya." />
      ) : (
    <div className="mon-list" data-testid="data-monitoring-list">
      {visible.map(r => {
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
      )}
    </>
  );
}
