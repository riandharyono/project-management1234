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

function matchItem(it, needle) {
  return it.name.toLowerCase().includes(needle)
    || (it.wilayah || "").toLowerCase().includes(needle)
    || (it.sheets || []).some(s => s.toLowerCase().includes(needle))
    || (it.teams || []).some(t => (t.team_name || "").toLowerCase().includes(needle) || (t.pic || "").toLowerCase().includes(needle));
}

export function DataRecapPage({ initialYear, onOpenTeam }) {
  const [year, setYear] = useState(initialYear || currentYear());
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [wilayah, setWilayah] = useState("all");
  const [openKey, setOpenKey] = useState(null);
  const [openSheets, setOpenSheets] = useState(() => new Set());
  const [openRegions, setOpenRegions] = useState(() => new Set());

  useEffect(() => {
    if (initialYear) setYear(initialYear);
  }, [initialYear]);

  useEffect(() => {
    setData(null);
    setWilayah("all");
    client.get("/data-recap", { params: { year } }).then(r => {
      setData(r.data);
      const regions = r.data.regions || [];
      setOpenRegions(new Set(regions.map(reg => reg.wilayah)));
      setOpenSheets(new Set(regions.flatMap(reg => (reg.groups || []).map(g => `${reg.wilayah}::${g.sheet}`))));
    }).catch(() => setData({ year, years: [year], groups: [], regions: [], unique_count: 0, total_requests: 0, team_count: 0, wilayahs: [] }));
  }, [year]);

  const regions = useMemo(() => {
    const list = data?.regions?.length ? data.regions : [{ wilayah: "Semua", groups: data?.groups || [], count: data?.unique_count || 0 }];
    const scoped = wilayah === "all" ? list : list.filter(r => r.wilayah === wilayah);
    const needle = q.trim().toLowerCase();
    if (!needle) return scoped;
    return scoped.map(r => {
      const groups = (r.groups || []).map(g => ({
        ...g,
        items: g.items.filter(it => matchItem(it, needle)),
      })).filter(g => g.items.length).map(g => ({ ...g, count: g.items.length }));
      const count = new Set(groups.flatMap(g => g.items.map(it => it.key))).size;
      return { ...r, groups, count };
    }).filter(r => r.count);
  }, [data, q, wilayah]);

  const uniqueVisible = useMemo(() => {
    const seen = new Set();
    for (const r of regions) for (const g of r.groups || []) for (const it of g.items) seen.add(it.key);
    return seen.size;
  }, [regions]);

  const toggleSheet = id => {
    setOpenSheets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleRegion = w => {
    setOpenRegions(prev => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w); else next.add(w);
      return next;
    });
  };

  const exportItems = flattenRecapItems(data);
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
          <p className="muted">Database permintaan data per tahun, dikelompokkan per wilayah/pemda — tanpa duplikat di wilayah yang sama.</p>
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
          <div className="dr-stats recap-stats recap-stats-4">
            <div className="dr-stat tot"><b>{data.unique_count}</b><span>Data unik</span></div>
            <div className="dr-stat ok"><b>{data.total_requests}</b><span>Permintaan</span></div>
            <div className="dr-stat part"><b>{data.wilayah_count ?? (data.wilayahs || []).length}</b><span>Wilayah</span></div>
            <div className="dr-stat nr"><b>{data.team_count}</b><span>Tim {data.year}</span></div>
          </div>

          {!!(data.wilayahs || []).length && (
            <div className="mon-year-filters" data-testid="recap-wilayah-filter">
              <button type="button" className={wilayah === "all" ? "active" : ""} onClick={() => setWilayah("all")} data-testid="recap-wilayah-all">Semua wilayah</button>
              {data.wilayahs.map(w => (
                <button key={w} type="button" className={wilayah === w ? "active" : ""} onClick={() => setWilayah(w)} data-testid={`recap-wilayah-${w}`}>
                  {w}
                </button>
              ))}
            </div>
          )}

          <div className="recap-search">
            <Search size={14} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama data, wilayah, sheet, atau tim…" data-testid="recap-search-input" />
          </div>

          {!data.unique_count ? (
            <EmptyState
              icon={<Database size={22} />}
              title={`Belum ada data ${data.year}`}
              body="Tambahkan permintaan data di tab Permintaan Data, dan isi wilayah/pemda di pengaturan tim agar rekap terkelompok."
            />
          ) : !regions.length ? (
            <EmptyState icon={<Search size={22} />} title="Tidak ada yang cocok" body="Coba kata kunci lain atau pilih wilayah berbeda." />
          ) : (
            <>
              {q.trim() && <p className="recap-filter-hint">{uniqueVisible} data unik cocok</p>}
              {regions.map(region => {
                const regionOpen = openRegions.has(region.wilayah);
                return (
                  <div className="recap-region" key={region.wilayah} data-testid={`recap-wilayah-group-${region.wilayah}`}>
                    <button type="button" className={`recap-region-head ${regionOpen ? "open" : ""}`} onClick={() => toggleRegion(region.wilayah)}>
                      <ChevronRight size={16} />
                      <b>{region.wilayah}</b>
                      <span className="prog">{region.count} data</span>
                    </button>
                    {regionOpen && (region.groups || []).map(g => {
                      const sheetId = `${region.wilayah}::${g.sheet}`;
                      const open = openSheets.has(sheetId);
                      return (
                        <div className="sheet recap-group" key={sheetId} data-testid={`recap-sheet-${sheetId}`}>
                          <button type="button" className={`sheet-head recap-sheet-head ${open ? "open" : ""}`} onClick={() => toggleSheet(sheetId)}>
                            <ChevronRight size={14} />
                            <b>{g.sheet}</b>
                            <span className="prog">{g.count} data</span>
                          </button>
                          {open && g.items.map(item => {
                            const expanded = openKey === `${sheetId}:${item.key}`;
                            const tone = STATUS_TONE[bestStatus(item.status_counts)] || "req";
                            return (
                              <div className="recap-item" key={item.key} data-testid={`recap-item-${item.key}`}>
                                <button type="button" className="recap-item-main" onClick={() => setOpenKey(expanded ? null : `${sheetId}:${item.key}`)}>
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
