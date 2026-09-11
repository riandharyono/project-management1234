import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Database, Download, FileOutput, Link2, Search } from "lucide-react";
import { client } from "../lib/api";
import { EmptyState } from "./EmptyState";
import { currentYear } from "../lib/years";
import { NO_DOC_TYPE_LABEL, PUSAT_LABEL, weakestStatus } from "../lib/dataDocs";
import { downloadPdfBytes, downloadTextFile, flattenRecapItems, recapToCsv, recapToCsvDetail, recapToPdfBytes } from "../lib/exportRecap";

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
const GROUP_OPTIONS = [
  { key: "wilayah", label: "Per tanggungan" },
  { key: "doc_type", label: "Per jenis" },
  { key: "doc_year", label: "Per tahun dokumen" },
];

function statusSummary(counts) {
  return ["diterima_lengkap", "diterima_sebagian", "diminta", "tidak_tersedia", "tidak_relevan"]
    .filter(s => counts?.[s])
    .map(s => `${counts[s]} ${STATUS_LABEL[s].toLowerCase()}`)
    .join(" · ");
}

function matchItem(it, needle) {
  return it.name.toLowerCase().includes(needle)
    || (it.wilayah || "").toLowerCase().includes(needle)
    || (it.doc_type || "").toLowerCase().includes(needle)
    || String(it.doc_year || "").includes(needle)
    || (it.sheets || []).some(s => s.toLowerCase().includes(needle))
    || (it.teams || []).some(t => (t.team_name || "").toLowerCase().includes(needle) || (t.pic || "").toLowerCase().includes(needle));
}

function groupLabel(item, groupBy) {
  if (groupBy === "doc_type") return item.doc_type || NO_DOC_TYPE_LABEL;
  if (groupBy === "doc_year") return item.doc_year ? String(item.doc_year) : "(Tanpa tahun)";
  return item.wilayah || PUSAT_LABEL;
}

function groupRecap(items, groupBy) {
  const by = new Map();
  for (const it of items) {
    const label = groupLabel(it, groupBy);
    if (!by.has(label)) by.set(label, []);
    by.get(label).push(it);
  }
  const labels = [...by.keys()].sort((a, b) => {
    if (a === PUSAT_LABEL) return -1;
    if (b === PUSAT_LABEL) return 1;
    if (a === NO_DOC_TYPE_LABEL || a === "(Tanpa tahun)" || a === "(Tanpa wilayah)") return 1;
    if (b === NO_DOC_TYPE_LABEL || b === "(Tanpa tahun)" || b === "(Tanpa wilayah)") return -1;
    if (groupBy === "doc_year") return Number(b) - Number(a);
    return String(a).localeCompare(String(b), "id");
  });
  return labels.map(label => {
    const rows = by.get(label);
    const bySheet = new Map();
    for (const it of rows) {
      const sheets = it.sheets?.length ? it.sheets : ["(Tanpa klasifikasi)"];
      for (const sh of sheets) {
        if (!bySheet.has(sh)) bySheet.set(sh, []);
        if (!bySheet.get(sh).some(x => x.key === it.key)) bySheet.get(sh).push(it);
      }
    }
    const groups = [...bySheet.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "id"))
      .map(([sheet, list]) => ({ sheet, count: list.length, items: list }));
    return { wilayah: label, count: rows.length, groups };
  });
}

export function DataRecapPage({ initialYear, onOpenTeam }) {
  const [year, setYear] = useState(initialYear || currentYear());
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [wilayah, setWilayah] = useState("all");
  const [docType, setDocType] = useState("all");
  const [docYear, setDocYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [noLink, setNoLink] = useState(false);
  const [groupBy, setGroupBy] = useState("wilayah");
  const [openKey, setOpenKey] = useState(null);
  const [openSheets, setOpenSheets] = useState(() => new Set());
  const [openRegions, setOpenRegions] = useState(() => new Set());

  useEffect(() => {
    if (initialYear) setYear(initialYear);
  }, [initialYear]);

  useEffect(() => {
    setData(null);
    setWilayah("all"); setDocType("all"); setDocYear("all"); setStatus("all"); setNoLink(false);
    client.get("/data-recap", { params: { year } }).then(r => {
      setData(r.data);
      const items = flattenRecapItems(r.data);
      setOpenRegions(new Set(items.map(it => it.wilayah).filter(Boolean)));
      setOpenSheets(new Set(items.flatMap(it => (it.sheets || []).map(s => `${it.wilayah}::${s}`))));
    }).catch(() => setData({
      year, years: [year], groups: [], regions: [], items: [], unique_count: 0,
      total_requests: 0, team_count: 0, wilayahs: [], doc_years: [], doc_types: [],
      complete_count: 0, pending_count: 0, no_link_count: 0, pusat_count: 0,
    }));
  }, [year]);

  const allItems = useMemo(() => flattenRecapItems(data || {}), [data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allItems.filter(it => {
      if (wilayah !== "all" && it.wilayah !== wilayah) return false;
      if (docType !== "all" && (it.doc_type || NO_DOC_TYPE_LABEL) !== docType) return false;
      if (docYear !== "all" && String(it.doc_year) !== String(docYear)) return false;
      const weak = it.weakest_status || weakestStatus(it.status_counts);
      if (status === "pending" && !["diminta", "diterima_sebagian"].includes(weak)) return false;
      if (status !== "all" && status !== "pending" && weak !== status) return false;
      if (noLink && it.has_link) return false;
      if (needle && !matchItem(it, needle)) return false;
      return true;
    });
  }, [allItems, q, wilayah, docType, docYear, status, noLink]);

  const regions = useMemo(() => groupRecap(filtered, groupBy), [filtered, groupBy]);

  useEffect(() => {
    setOpenRegions(new Set(regions.map(r => r.wilayah)));
    setOpenSheets(new Set(regions.flatMap(r => (r.groups || []).map(g => `${r.wilayah}::${g.sheet}`))));
  }, [groupBy, wilayah, docType, docYear, status, noLink, year]);

  const uniqueVisible = filtered.length;
  const completeVisible = filtered.filter(i => (i.weakest_status || weakestStatus(i.status_counts)) === "diterima_lengkap").length;
  const pendingVisible = filtered.filter(i => ["diminta", "diterima_sebagian"].includes(i.weakest_status || weakestStatus(i.status_counts))).length;
  const noLinkVisible = filtered.filter(i => !i.has_link).length;
  const pusatVisible = filtered.filter(i => i.wilayah === PUSAT_LABEL).length;
  const pemdaVisible = new Set(filtered.filter(i => i.wilayah && i.wilayah !== PUSAT_LABEL && i.wilayah !== "(Tanpa wilayah)").map(i => i.wilayah)).size;

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

  const fileBase = `Rekap-Data-${data?.year || year}`;
  const exportCsv = () => {
    downloadTextFile(recapToCsv(filtered, data?.year || year), `${fileBase}.csv`, "text/csv;charset=utf-8");
  };
  const exportCsvDetail = () => {
    downloadTextFile(recapToCsvDetail(filtered, data?.year || year), `${fileBase}-rinci.csv`, "text/csv;charset=utf-8");
  };
  const exportPdf = () => {
    const bytes = recapToPdfBytes(filtered, data?.year || year, {
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
          <p className="muted">Katalog dokumen unik per tanggungan, tahun dokumen, dan jenis — peraturan pusat tidak ikut pemda tim.</p>
        </div>
        {!!allItems.length && (
          <div className="recap-export" data-testid="recap-export-actions">
            <button className="secondary" onClick={exportCsv} disabled={!filtered.length} data-testid="recap-export-csv">
              <Download size={14} /> CSV
            </button>
            <button className="secondary" onClick={exportCsvDetail} disabled={!filtered.length} data-testid="recap-export-csv-detail">
              <Download size={14} /> CSV rinci
            </button>
            <button className="secondary" onClick={exportPdf} disabled={!filtered.length} data-testid="recap-export-pdf">
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
          <div className="dr-stats recap-stats recap-stats-6">
            <div className="dr-stat tot"><b>{uniqueVisible}</b><span>Data unik</span></div>
            <div className="dr-stat ok"><b>{completeVisible}</b><span>Lengkap semua tim</span></div>
            <div className="dr-stat part"><b>{pendingVisible}</b><span>Belum lengkap</span></div>
            <div className="dr-stat na"><b>{noLinkVisible}</b><span>Tanpa tautan</span></div>
            <div className="dr-stat nr"><b>{pusatVisible}</b><span>Pusat / umum</span></div>
            <div className="dr-stat tot"><b>{pemdaVisible}</b><span>Pemda</span></div>
          </div>

          <div className="recap-toolbar">
            <div className="mon-year-filters" data-testid="recap-group-by">
              {GROUP_OPTIONS.map(opt => (
                <button key={opt.key} type="button" className={groupBy === opt.key ? "active" : ""} onClick={() => setGroupBy(opt.key)} data-testid={`recap-group-${opt.key}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            {!!(data.wilayahs || []).length && (
              <div className="mon-year-filters" data-testid="recap-wilayah-filter">
                <button type="button" className={wilayah === "all" ? "active" : ""} onClick={() => setWilayah("all")} data-testid="recap-wilayah-all">Semua tanggungan</button>
                {data.wilayahs.map(w => (
                  <button key={w} type="button" className={wilayah === w ? "active" : ""} onClick={() => setWilayah(w)} data-testid={`recap-wilayah-${w}`}>
                    {w}
                  </button>
                ))}
              </div>
            )}
            {!!(data.doc_years || []).length && (
              <div className="mon-year-filters" data-testid="recap-doc-year-filter">
                <button type="button" className={docYear === "all" ? "active" : ""} onClick={() => setDocYear("all")}>Semua tahun dokumen</button>
                {data.doc_years.map(y => (
                  <button key={y} type="button" className={String(docYear) === String(y) ? "active" : ""} onClick={() => setDocYear(y)} data-testid={`recap-doc-year-${y}`}>
                    {y}
                  </button>
                ))}
              </div>
            )}
            {!!(data.doc_types || []).length && (
              <div className="mon-year-filters" data-testid="recap-doc-type-filter">
                <button type="button" className={docType === "all" ? "active" : ""} onClick={() => setDocType("all")}>Semua jenis</button>
                {data.doc_types.map(t => (
                  <button key={t} type="button" className={docType === t ? "active" : ""} onClick={() => setDocType(t)} data-testid={`recap-doc-type-${t}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div className="mon-year-filters" data-testid="recap-status-filter">
              <button type="button" className={status === "all" && !noLink ? "active" : ""} onClick={() => { setStatus("all"); setNoLink(false); }}>Semua status</button>
              <button type="button" className={status === "pending" ? "active" : ""} onClick={() => setStatus("pending")}>Belum lengkap</button>
              <button type="button" className={noLink ? "active" : ""} onClick={() => setNoLink(v => !v)} data-testid="recap-filter-no-link">Tanpa tautan</button>
            </div>
          </div>

          <div className="recap-search">
            <Search size={14} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, pemda, jenis, sheet, atau tim…" data-testid="recap-search-input" />
          </div>

          {!allItems.length ? (
            <EmptyState
              icon={<Database size={22} />}
              title={`Belum ada data ${data.year}`}
              body="Tambahkan permintaan data, lalu isi tanggungan (pemda atau Pusat / umum), tahun dokumen, dan jenis."
            />
          ) : !regions.length ? (
            <EmptyState icon={<Search size={22} />} title="Tidak ada yang cocok" body="Coba kata kunci atau filter lain." />
          ) : (
            <>
              <p className="recap-filter-hint">{uniqueVisible} data unik{q.trim() || wilayah !== "all" || docType !== "all" || docYear !== "all" || status !== "all" || noLink ? " sesuai filter" : ""}</p>
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
                            const weak = item.weakest_status || weakestStatus(item.status_counts);
                            const tone = STATUS_TONE[weak] || "req";
                            const complete = item.complete_teams ?? item.status_counts?.diterima_lengkap ?? 0;
                            return (
                              <div className="recap-item" key={item.key} data-testid={`recap-item-${item.key}`}>
                                <button type="button" className="recap-item-main" onClick={() => setOpenKey(expanded ? null : `${sheetId}:${item.key}`)}>
                                  <div className="recap-item-name">
                                    <span>{item.name}</span>
                                    <div className="dr-doc-meta">
                                      {groupBy !== "wilayah" && item.wilayah ? <span>{item.wilayah}</span> : null}
                                      {item.doc_year ? <span>{item.doc_year}</span> : null}
                                      {item.doc_type ? <span>{item.doc_type}</span> : null}
                                      {!item.has_link ? <span className="warn">tanpa tautan</span> : null}
                                    </div>
                                  </div>
                                  <span className={`recap-pill ${tone}`}>{complete}/{item.team_count} lengkap</span>
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
