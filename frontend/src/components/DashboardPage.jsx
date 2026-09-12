import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Database, LayoutDashboard, MessageCircle, Plus, UserX } from "lucide-react";
import { client, shortDate, timeAgo } from "../lib/api";
import { canCreateTeam, canViewAllTeams } from "../lib/roles";
import { EmptyState } from "./EmptyState";
import { currentYear } from "../lib/years";

const PRIORITY_DOT = { high: "high", medium: "medium", low: "low", sedang: "medium" };

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

function barTone(pct) {
  if (pct >= 80) return "var(--success)";
  if (pct >= 50) return "var(--warning)";
  return "var(--danger)";
}

function kpiTone(key, n) {
  if (!n) return "";
  if (["overdue_tasks", "data_unavailable", "deadlines_overdue"].includes(key)) return "danger";
  if (["due_today", "data_pending", "unassigned"].includes(key)) return "warning";
  return "";
}

const ATTENTION_ICON = {
  deadline: CalendarClock,
  task: AlertTriangle,
  data: Database,
  unassigned: UserX,
};

export function DashboardPage({
  user, onOpenTeam, onOpenTask, onOpenMention, onCreateTeam, onOpenRecap, onOpenMonitoring,
}) {
  const [year, setYear] = useState(currentYear());
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    const params = year === "all" ? { all_years: true } : { year };
    client.get("/dashboard", { params }).then(r => setData(r.data)).catch(() => setData({
      year: year === "all" ? null : year, years: [currentYear()], all_years: year === "all",
      scope: "mine", kpis: { teams: 0, overdue_tasks: 0, due_today: 0, data_pending: 0, data_unavailable: 0, deadlines_overdue: 0, unassigned: 0 },
      attention: [], teams: [], deadlines: [], mine: { overdue: [], today: [], upcoming: [], mentions: [] },
    }));
  }, [year, user.id]);

  const kpis = data?.kpis || {};
  const mine = data?.mine || { overdue: [], today: [], upcoming: [], mentions: [] };
  const years = data?.years?.length ? data.years : [currentYear()];
  const firstName = (user.name || "").split(" ")[0] || "Anda";
  const orgView = data?.scope === "all";

  const goAttention = item => {
    if (item.kind === "task" && item.task_id) {
      onOpenTask?.({ id: item.task_id, team_id: item.team_id, title: item.title });
      return;
    }
    if (item.team_id) onOpenTeam?.(item.team_id, item.tab || "overview");
  };

  const kpiClick = key => {
    if (key === "data_pending" || key === "data_unavailable") { onOpenRecap?.(); return; }
    if (key === "unassigned" && orgView && onOpenMonitoring) { onOpenMonitoring(); return; }
    const map = {
      overdue_tasks: "dash-attention", due_today: "dash-mine", unassigned: "dash-attention",
      deadlines_overdue: "dash-deadlines", teams: "dash-teams",
    };
    document.getElementById(map[key])?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="page dash-page" data-testid="dashboard-page">
      <div className="page-heading">
        <div>
          <h1>{greeting()}, {firstName}</h1>
          <p className="muted">
            {orgView ? "Semua tim yang butuh perhatian, dalam satu layar." : "Tugas Anda dan kondisi tim tempat Anda bekerja."}
          </p>
        </div>
        <div className="dash-heading-actions">
          {canViewAllTeams(user) && (
            <button className="secondary" onClick={onOpenMonitoring} data-testid="dashboard-open-monitoring">Monitoring</button>
          )}
          <button className="secondary" onClick={onOpenRecap} data-testid="dashboard-open-recap">Rekap data</button>
          {canCreateTeam(user) && (
            <button className="primary" onClick={onCreateTeam} data-testid="hq-create-team-button"><Plus size={16} /> Buat Tim</button>
          )}
        </div>
      </div>

      <div className="mon-year-filters" data-testid="dashboard-year-filter">
        {years.map(y => (
          <button key={y} type="button" className={year === y ? "active" : ""} onClick={() => setYear(y)} data-testid={`dashboard-year-${y}`}>
            {y}{y === currentYear() ? "" : y < currentYear() ? " · arsip" : ""}
          </button>
        ))}
        <button type="button" className={year === "all" ? "active" : ""} onClick={() => setYear("all")} data-testid="dashboard-year-all">Semua tahun</button>
      </div>

      {!data ? (
        <p className="muted">Memuat dashboard…</p>
      ) : (
        <>
          <div className="dash-kpis" data-testid="dashboard-kpis">
            <Kpi label="Tim" value={kpis.teams} onClick={() => kpiClick("teams")} testId="dashboard-kpi-teams" />
            <Kpi label="Tugas terlambat" value={kpis.overdue_tasks} tone={kpiTone("overdue_tasks", kpis.overdue_tasks)} onClick={() => kpiClick("overdue_tasks")} testId="dashboard-kpi-overdue" />
            <Kpi label="Jatuh tempo hari ini" value={kpis.due_today} tone={kpiTone("due_today", kpis.due_today)} onClick={() => kpiClick("due_today")} testId="dashboard-kpi-today" />
            <Kpi label="Data belum lengkap" value={kpis.data_pending} tone={kpiTone("data_pending", kpis.data_pending)} onClick={() => kpiClick("data_pending")} testId="dashboard-kpi-data-pending" />
            <Kpi label="Data tidak tersedia" value={kpis.data_unavailable} tone={kpiTone("data_unavailable", kpis.data_unavailable)} onClick={() => kpiClick("data_unavailable")} testId="dashboard-kpi-data-na" />
            <Kpi label="Laporan / KKE lewat" value={kpis.deadlines_overdue} tone={kpiTone("deadlines_overdue", kpis.deadlines_overdue)} onClick={() => kpiClick("deadlines_overdue")} testId="dashboard-kpi-deadlines" />
            <Kpi label="Tanpa PIC" value={kpis.unassigned} tone={kpiTone("unassigned", kpis.unassigned)} onClick={() => kpiClick("unassigned")} testId="dashboard-kpi-unassigned" />
          </div>

          <div className="dash-grid">
            <section className="dash-panel" id="dash-attention" data-testid="dashboard-attention">
              <header className="dash-panel-head"><AlertTriangle size={14} /><h2>Perlu tindakan</h2><em>{data.attention.length}</em></header>
              {data.attention.length ? data.attention.map((item, i) => {
                const Icon = ATTENTION_ICON[item.kind] || AlertTriangle;
                return (
                  <button key={`${item.kind}-${item.team_id}-${item.task_id || i}`} className={`dash-row tone-${item.tone || ""}`} onClick={() => goAttention(item)} data-testid={`dashboard-attention-${i}`}>
                    <Icon size={14} />
                    <span className="dash-row-main">
                      <b>{item.title}</b>
                      <small>{item.detail}{item.date ? ` · ${shortDate(item.date)}` : ""}</small>
                    </span>
                  </button>
                );
              }) : (
                <p className="muted dash-empty">Tidak ada yang mendesak di tahun ini.</p>
              )}
            </section>

            <section className="dash-panel" id="dash-mine" data-testid="my-work-page">
              <header className="dash-panel-head"><ClipboardList size={14} /><h2>Tugas saya</h2></header>
              <MineBlock title="Terlambat" tone="danger" items={mine.overdue} onOpen={onOpenTask} testId="my-work-overdue" />
              <MineBlock title="Hari ini" tone="warning" items={mine.today} onOpen={onOpenTask} testId="my-work-today" />
              <MineBlock title="14 hari ke depan" items={mine.upcoming} onOpen={onOpenTask} testId="my-work-upcoming" />
              {!mine.overdue.length && !mine.today.length && !mine.upcoming.length && (
                <p className="muted dash-empty">Tidak ada tugas dengan tenggat dekat yang ditugaskan ke Anda.</p>
              )}
              <div className="dash-mentions">
                <div className="dash-panel-head tight"><MessageCircle size={13} /><h3>Mention belum dibaca</h3></div>
                {mine.mentions?.length ? mine.mentions.map(n => (
                  <button key={n.id} className="dash-row" onClick={() => onOpenMention?.(n)} data-testid={`my-work-mention-${n.id}`}>
                    <span className="dash-row-main"><b>{n.text}</b><small>{timeAgo(n.created_at)}</small></span>
                  </button>
                )) : <p className="muted dash-empty">Tidak ada mention baru.</p>}
              </div>
            </section>
          </div>

          <section id="dash-teams" data-testid="dashboard-teams">
            <header className="dash-section-head"><LayoutDashboard size={14} /><h2>Kesehatan tim</h2><em>{data.teams.length}</em></header>
            {!data.teams.length ? (
              <EmptyState icon={<CheckCircle2 size={22} />} title="Belum ada tim di tahun ini" body="Pilih tahun lain, atau buat tim baru." testId="dashboard-teams-empty" />
            ) : (
              <div className="dash-teams">
                {data.teams.map(t => (
                  <button key={t.team_id} className={`dash-team ${t.laporan_overdue || t.kke_overdue || t.task_overdue ? "hot" : ""}`} onClick={() => onOpenTeam?.(t.team_id, "overview")} data-testid={`dashboard-team-${t.team_id}`}>
                    <div className="dash-team-top">
                      <i style={{ background: t.team_color || "var(--accent)" }} />
                      <b>{t.team_name}</b>
                    </div>
                    {t.wilayah ? <small className="dash-team-wilayah">{t.wilayah}</small> : null}
                    <Meter label="Tugas" pct={t.task_pct} hint={`${t.task_done}/${t.task_total || 0}`} />
                    <Meter label="Data" pct={t.data_pct} hint={`${t.data_complete}/${t.data_total || 0}`} />
                    <div className="dash-team-flags">
                      {t.task_overdue > 0 && <span className="flag">{t.task_overdue} terlambat</span>}
                      {t.unassigned > 0 && <span className="flag warn">{t.unassigned} tanpa PIC</span>}
                      {t.data_unavailable > 0 && <span className="flag">{t.data_unavailable} data N/A</span>}
                      {t.laporan_overdue && <span className="flag">Laporan lewat</span>}
                      {t.kke_overdue && <span className="flag">KKE lewat</span>}
                      {!t.task_overdue && !t.unassigned && !t.data_unavailable && !t.laporan_overdue && !t.kke_overdue && (
                        <span className="flag ok">Aman</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="dash-panel dash-deadlines-panel" id="dash-deadlines" data-testid="dashboard-deadlines">
            <header className="dash-panel-head"><CalendarClock size={14} /><h2>Tenggat 14 hari</h2><em>{data.deadlines.length}</em></header>
            {data.deadlines.length ? data.deadlines.map((d, i) => (
              <button key={`${d.kind}-${d.team_id}-${d.task_id || d.date}-${i}`} className={`dash-row ${d.overdue ? "tone-danger" : ""}`} onClick={() => {
                if (d.task_id) onOpenTask?.({ id: d.task_id, team_id: d.team_id, title: d.title });
                else onOpenTeam?.(d.team_id, d.tab || "overview");
              }} data-testid={`dashboard-deadline-${i}`}>
                <span className={`due ${d.overdue ? "overdue" : ""}`}>{shortDate(d.date)}</span>
                <span className="dash-row-main">
                  <b>{d.title}</b>
                  <small>{d.kind === "task" ? d.team_name : d.kind === "kke" ? "KKE" : d.kind === "laporan" ? "Laporan" : ""}</small>
                </span>
              </button>
            )) : <p className="muted dash-empty">Tidak ada tenggat dalam 14 hari ke depan.</p>}
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone, onClick, testId }) {
  return (
    <button type="button" className={`dash-kpi ${tone || ""}`} onClick={onClick} data-testid={testId}>
      <small>{label}</small>
      <b>{value ?? 0}</b>
    </button>
  );
}

function Meter({ label, pct, hint }) {
  return (
    <div className="dash-meter">
      <div className="dash-meter-label"><span>{label}</span><span>{pct}% · {hint}</span></div>
      <div className="dash-meter-track"><i style={{ width: `${pct}%`, background: barTone(pct) }} /></div>
    </div>
  );
}

function MineBlock({ title, tone, items, onOpen, testId }) {
  if (!items?.length) return null;
  return (
    <div className={`dash-mine-block ${tone || ""}`} data-testid={testId}>
      <header><h3>{title}</h3><em>{items.length}</em></header>
      {items.map(t => {
        const pri = PRIORITY_DOT[(t.priority || "").toLowerCase()] || "medium";
        return (
          <button key={t.id} className="dash-row" onClick={() => onOpen?.(t)} data-testid={`my-work-row-${t.id}`}>
            <i className={`kb-priority-dot ${pri}`} title={t.priority} />
            <span className="dash-row-main">
              <b>{t.title}</b>
              <small>{t.team_name}{t.list_name ? ` · ${t.list_name}` : ""}</small>
            </span>
            {t.due_date && <span className={`due ${tone === "danger" ? "overdue" : ""}`}>{shortDate(t.due_date)}</span>}
          </button>
        );
      })}
    </div>
  );
}
