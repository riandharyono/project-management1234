import { useEffect, useMemo, useState } from "react";
import { Download, FileOutput, Flag, Search } from "lucide-react";
import { client, timeAgo } from "../lib/api";
import { EmptyState } from "./EmptyState";
import { downloadFindingsCsv, downloadFindingsPdf } from "../lib/exportFindings";

export function FindingsRecapPage({ teamId, onOpenTask, onOpenTeam }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [teamFilter, setTeamFilter] = useState(teamId || "all");
  const [year, setYear] = useState("all");

  useEffect(() => {
    setTeamFilter(teamId || "all");
  }, [teamId]);

  useEffect(() => {
    setData(null);
    const params = {};
    if (teamId) params.team_id = teamId;
    client.get("/findings", { params }).then(r => setData(r.data)).catch(() => {
      setData({ count: 0, team_count: 0, teams: [], years: [], items: [] });
    });
  }, [teamId]);

  const filtered = useMemo(() => {
    const items = data?.items || [];
    const needle = q.trim().toLowerCase();
    return items.filter(it => {
      if (teamFilter !== "all" && it.team_id !== teamFilter) return false;
      if (year !== "all" && String(it.team_year) !== String(year)) return false;
      if (!needle) return true;
      const blob = [
        it.body, it.author, it.task_title, it.team_name, it.list_name, it.wilayah,
        ...(it.assignees || []).map(a => a.name),
      ].join(" ").toLowerCase();
      return blob.includes(needle);
    });
  }, [data, q, teamFilter, year]);

  const teamOptions = data?.teams || [];
  const years = data?.years || [];
  const teamCount = new Set(filtered.map(i => i.team_id)).size;
  const label = teamId
    ? (filtered[0]?.team_name || "tim")
    : year !== "all" ? year : "semua";

  const hasFilter = q.trim() || teamFilter !== "all" || year !== "all";

  const openFindingTask = async (it) => {
    try {
      const r = await client.get(`/tasks/${it.task_id}`);
      onOpenTask?.(r.data);
    } catch {
      onOpenTask?.({ id: it.task_id, team_id: it.team_id, title: it.task_title });
    }
  };

  return (
    <div className="page recap-page findings-page" data-testid="findings-recap-page">
      <div className="page-heading">
        <div>
          <h1>Rekap Temuan</h1>
          <p className="muted">
            {teamId
              ? "Semua komentar bertanda temuan di papan tim ini."
              : "Semua komentar bertanda temuan dari seluruh papan Kanban yang dapat Anda lihat."}
          </p>
        </div>
        {!!(data?.items || []).length && (
          <div className="recap-export" data-testid="findings-export-actions">
            <button className="secondary" onClick={() => downloadFindingsCsv(filtered, label)} disabled={!filtered.length} data-testid="findings-export-csv">
              <Download size={14} /> CSV
            </button>
            <button className="secondary" onClick={() => downloadFindingsPdf(filtered, label)} disabled={!filtered.length} data-testid="findings-export-pdf">
              <FileOutput size={14} /> PDF
            </button>
          </div>
        )}
      </div>

      {!data ? (
        <p className="muted">Memuat…</p>
      ) : (
        <>
          <div className="dr-stats recap-stats recap-stats-3">
            <div className="dr-stat tot"><b>{filtered.length}</b><span>Temuan</span></div>
            <div className="dr-stat part"><b>{teamCount}</b><span>Tim</span></div>
            <div className="dr-stat ok"><b>{new Set(filtered.map(i => i.task_id)).size}</b><span>Tugas</span></div>
          </div>

          <div className="recap-filters" data-testid="findings-filters">
            <label className="recap-search">
              <Search size={14} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari temuan, tugas, tim, atau penulis…" data-testid="findings-search-input" />
            </label>
            {!teamId && (
              <label>Tim
                <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} data-testid="findings-team-filter">
                  <option value="all">Semua tim</option>
                  {teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}{t.year ? ` (${t.year})` : ""}</option>)}
                </select>
              </label>
            )}
            <label>Tahun
              <select value={year} onChange={e => setYear(e.target.value)} data-testid="findings-year-filter">
                <option value="all">Semua</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>

          {!filtered.length ? (
            <EmptyState
              icon={<Flag size={22} />}
              title={hasFilter ? "Tidak ada temuan yang cocok" : "Belum ada temuan"}
              body={hasFilter ? "Ubah filter atau kata kunci pencarian." : "Geser tombol Temuan saat menulis komentar di kartu Kanban, lalu temuan itu muncul di sini."}
              testId="findings-empty"
            />
          ) : (
            <div className="findings-list" data-testid="findings-list">
              {filtered.map(it => (
                <article className="finding-card" key={it.id} data-testid={`finding-card-${it.id}`}>
                  <header>
                    <button type="button" className="finding-team" onClick={() => onOpenTeam?.(it.team_id)} data-testid={`finding-team-${it.id}`}>
                      <i style={{ background: it.team_color || "#818CF8" }} />
                      {it.team_name}
                      {it.team_year ? <small>{it.team_year}</small> : null}
                    </button>
                    <small>{timeAgo(it.created_at)}</small>
                  </header>
                  <button type="button" className="finding-task" onClick={() => openFindingTask(it)} data-testid={`finding-open-task-${it.id}`}>
                    {it.task_title || "Tugas"}
                    {it.list_name ? <small>{it.list_name}</small> : null}
                  </button>
                  <p className="finding-body">{it.body}</p>
                  <footer>
                    <span>Oleh {it.author}</span>
                    {!!(it.assignees || []).length && (
                      <span>Ditugasi {(it.assignees || []).map(a => a.name).filter(Boolean).join(", ")}</span>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
