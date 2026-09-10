import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Database, Download, FileOutput, Link2, Search } from "lucide-react";
import { client } from "../lib/api";
import { EmptyState } from "./EmptyState";
import { currentYear } from "../lib/years";
import { downloadPdfBytes, downloadTextFile, flattenRecapItems, recapToCsv, recapToPdfBytes } from "../lib/exportRecap";

const STATUS_LABEL = {
  diminta: "Diminta",
  diterima_sebagian: "Sebagian",
  diterima_lengkap: "Lengkap",
  tidak_tersedia: "Tidak tersedia",
  tidak_relevan: "Tidak relevan",
};
const STATUS_TONE = {
  diminta: "req", diterima_sebagian: "part", diterima_lengkap: "ok", tidak_tersedia: "na", tidak_relevan: "nr",
};

function bestStatus(counts) {
  for (const s of ["diterima_lengkap", "diterima_sebagian", "tidak_tersedia", "diminta", "tidak_relevan"]) {
    if (counts?.[s]) return s;
  }
  return "diminta";
}

function statusSummary(counts) {
  return ["diterima_lengkap", "diterima_sebagian", "diminta", "tidak_tersedia", "tidak_relevan"]
    .filter(s => counts?.[s])
    .map(s => `${counts[s]} ${STATUS_LABEL[s].toLowerCase()}`)
    .join(" · ");
}

export function DataRecapPage({ initialYear, onOpenTeam }) {
  const [year, setYear] = useState(initialYear || currentYear());
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState(null);
  const [openSheets, setOpenSheets] = useState(() => new Set());

  useEffect(() => {
    if (initialYear) setYear(initialYear);
  }, [initialYear]);

  useEffect(() => {
    setData(null);
    client.get("/data-recap", { params: { year } }).then(r => {
      setData(r.data);
      const sheets = (r.data.groups || []).map(g => g.sheet);
      setOpenSheets(new Set(sheets));
    }).catch(() => setData({ year, years: [year], groups: [], unique_count: 0, total_requests: 0, team_count: 0 }));
  }, [year]);

  const filtered = useMemo(() => {
    if (!data?.groups) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.groups;
    return data.groups.map(g => ({
      ...g,
      items: g.items.filter(it =>
        it.name.toLowerCase().includes(needle)
        || it.sheets.some(s => s.toLowerCase().includes(needle))
        || it.teams.some(t => (t.team_name || "").toLowerCase().includes(needle) || (t.pic || "").toLowerCase().includes(needle))
      ),
    })).filter(g => g.items.length).map(g => ({ ...g, count: g.items.length }));
  }, [data, q]);

  const uniqueVisible = useMemo(() => {
    const seen = new Set();
    for (const g of filtered) for (const it of g.items) seen.add(it.key);
    return seen.size;
  }, [filtered]);

  const toggleSheet = sheet => {
    setOpenSheets(prev => {
      const next = new Set(prev);
      if (next.has(sheet)) next.delete(sheet); else next.add(sheet);
      return next;
    });
  };

  const exportItems = flattenRecapItems(data?.groups);
  const fileBase = `Rekap-Data-${data?.year || year}`;
  const exportCsv = () => {
    const csv = recapToCsv(exportItems, data?.year || year);
    downloadTextFile(csv, `${fileBase}.csv`, "text/csv;charset=utf-8");
  };
  const exportPdf = () => {
    const bytes = recapToPdfBytes(exportItems, data?.year || year, {
      totalRequests: data?.total_requests,
      teamCount: data?.team_count,
    });
    downloadPdfBytes(bytes, `${fileBase}.pdf`);
  };

  return (
    <div className="page recap-page" data-testid="data-recap-page">
      <div className="page-heading">
        <div>
          <h1>Rekap Data</h1>
          <p className="muted">Database permintaan data per tahun — dikelompokkan, tanpa duplikat antar tim.</p>
        </div>
        {!!data?.unique_count && (
          <div className="recap-export" data-testid="recap-export-actions">
            <button className="secondary" onClick={exportCsv} disabled={!exportItems.length} data-testid="recap-export-csv">
              <Download size={14} /> CSV
            </button>
            <button className="secondary" onClick={exportPdf} disabled={!exportItems.length} data-testid="recap-export-pdf">
              <FileOutput size={14} /> PDF
            </button>
          </div>
        )}
      </div>

      {!!data?.years?.length && (
        <div className="mon-year-filters" data-testid="recap-year-filter">
          {data.years.map(y => (
            <button key={y} type="button" className={year === y ? "active" : ""} onClick={() => setYear(y)} data-testid={`recap-year-${y}`}>
              {y}{y === currentYear() ? "" : y < currentYear() ? " · arsip" : ""}
            </button>
          ))}
        </div>
      )}

      {!data ? (
        <p className="muted">Memuat…</p>
      ) : (
        <>
          <div className="dr-stats recap-stats">
            <div className="dr-stat tot"><b>{data.unique_count}</b><span>Data unik</span></div>
            <div className="dr-stat ok"><b>{data.total_requests}</b><span>Permintaan</span></div>
            <div className="dr-stat part"><b>{data.team_count}</b><span>Tim {data.year}</span></div>
          </div>

          <div className="recap-search">
            <Search size={14} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama data, sheet, atau tim…" data-testid="recap-search-input" />
          </div>

          {!data.unique_count ? (
            <EmptyState
              icon={<Database size={22} />}
              title={`Belum ada data ${data.year}`}
              body="Tambahkan permintaan data di tab Permintaan Data pada tim tahun ini. Rekap akan menggabungkannya di sini tanpa duplikat."
            />
          ) : !filtered.length ? (
            <EmptyState icon={<Search size={22} />} title="Tidak ada yang cocok" body="Coba kata kunci lain." />
          ) : (
            <>
              {q.trim() && <p className="recap-filter-hint">{uniqueVisible} data unik cocok</p>}
              {filtered.map(g => {
                const open = openSheets.has(g.sheet);
                return (
                  <div className="sheet recap-group" key={g.sheet} data-testid={`recap-sheet-${g.sheet}`}>
                    <button type="button" className={`sheet-head recap-sheet-head ${open ? "open" : ""}`} onClick={() => toggleSheet(g.sheet)}>
                      <ChevronRight size={14} />
                      <b>{g.sheet}</b>
                      <span className="prog">{g.count} data</span>
                    </button>
                    {open && g.items.map(item => {
                      const expanded = openKey === `${g.sheet}:${item.key}`;
                      const tone = STATUS_TONE[bestStatus(item.status_counts)] || "req";
                      return (
                        <div className="recap-item" key={item.key} data-testid={`recap-item-${item.key}`}>
                          <button type="button" className="recap-item-main" onClick={() => setOpenKey(expanded ? null : `${g.sheet}:${item.key}`)}>
                            <div className="recap-item-name">
                              <span>{item.name}</span>
                              {item.sheets.length > 1 && (
                                <div className="dr-tags">
                                  {item.sheets.filter(s => s !== g.sheet).map(s => <span className="dr-tag" key={s}>{s}</span>)}
                                </div>
                              )}
                            </div>
                            <span className={`recap-pill ${tone}`}>{item.team_count} tim</span>
                            <span className="recap-meta">{statusSummary(item.status_counts)}</span>
                            <ChevronRight size={14} className={expanded ? "rot" : ""} />
                          </button>
                          {expanded && (
                            <div className="recap-item-detail">
                              <div className="recap-teams">
                                {item.teams.map(t => (
                                  <button key={t.team_id} type="button" className="recap-team-chip" onClick={() => onOpenTeam?.(t.team_id, "data-requests")} data-testid={`recap-team-${t.team_id}`}>
                                    <i style={{ background: t.team_color }} />
                                    <span>{t.team_name}</span>
                                    <em className={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</em>
                                    {t.pic ? <small>{t.pic}</small> : null}
                                  </button>
                                ))}
                              </div>
                              {!!item.attachments.length && (
                                <div className="recap-links">
                                  {item.attachments.map(a => (
                                    <a key={a.url} href={a.url} target="_blank" rel="noreferrer"><Link2 size={11} /> {a.name || a.url}{a.team_name ? ` · ${a.team_name}` : ""}</a>
                                  ))}
                                </div>
                              )}
                              {!!item.notes.length && (
                                <ul className="recap-notes">{item.notes.map(n => <li key={n}>{n}</li>)}</ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
