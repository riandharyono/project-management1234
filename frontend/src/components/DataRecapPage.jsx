import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Database, Download, FileOutput, Link2, Search } from "lucide-react";
import { client } from "../lib/api";
import { EmptyState } from "./EmptyState";
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
  return labels.map(label => ({ label, count: by.get(label).length, items: by.get(label) }));
}

export function DataRecapPage({ onOpenTeam }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [wilayah, setWilayah] = useState("all");
  const [docType, setDocType] = useState("all");
  const [docYear, setDocYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [noLink, setNoLink] = useState(false);
  const [groupBy, setGroupBy] = useState("wilayah");
  const [openKey, setOpenKey] = useState(null);
  const [openGroups, setOpenGroups] = useState(() => new Set());

  useEffect(() => {
    setData(null);
    client.get("/data-recap", { params: { all_years: true } }).then(r => {
      setData(r.data);
    }).catch(() => setData({
      year: null, all_years: true, years: [], groups: [], regions: [], items: [], unique_count: 0,
      total_requests: 0, team_count: 0, wilayahs: [], doc_years: [], doc_types: [],
      complete_count: 0, pending_count: 0, no_link_count: 0, pusat_count: 0,
    }));
  }, []);

  const allItems = useMemo(() => flattenRecapItems(data || {}), [data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allItems.filter(it => {
      if (wilayah !== "all" && it.wilayah !== wilayah) return false;
      if (docType !== "all" && (it.doc_type || NO_DOC_TYPE_LABEL) !== docType) return false;
      if (docYear !== "all" && String(it.doc_year) !== String(docYear)) return false;
      const weak = it.weakest_status || weakestStatus(it.status_counts);
      if (status === "pending" && !["diminta", "diterima_sebagian"].includes(weak)) return false;
      if (status === "diterima_lengkap" && weak !== "diterima_lengkap") return false;
      if (noLink && it.has_link) return false;
      if (needle && !matchItem(it, needle)) return false;
      return true;
    });
  }, [allItems, q, wilayah, docType, docYear, status, noLink]);

  const regions = useMemo(() => groupRecap(filtered, groupBy), [filtered, groupBy]);

  const autoOpen = regions.length === 1 ? regions[0].label : null;
  useEffect(() => {
    setOpenGroups(autoOpen ? new Set([autoOpen]) : new Set());
  }, [autoOpen]);

  const uniqueVisible = filtered.length;
  const completeVisible = filtered.filter(i => (i.weakest_status || weakestStatus(i.status_counts)) === "diterima_lengkap").length;
  const pendingVisible = filtered.filter(i => ["diminta", "diterima_sebagian"].includes(i.weakest_status || weakestStatus(i.status_counts))).length;
  const noLinkVisible = filtered.filter(i => !i.has_link).length;
  const pusatVisible = filtered.filter(i => i.wilayah === PUSAT_LABEL).length;
  const pemdaVisible = new Set(filtered.filter(i => i.wilayah && i.wilayah !== PUSAT_LABEL && i.wilayah !== "(Tanpa wilayah)").map(i => i.wilayah)).size;

  const toggleGroup = label => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const clickCard = key => {
    if (key === "unique") { setStatus("all"); setNoLink(false); setWilayah("all"); return; }
    if (key === "complete") { setStatus("diterima_lengkap"); setNoLink(false); return; }
    if (key === "pending") { setStatus(status === "pending" ? "all" : "pending"); setNoLink(false); return; }
    if (key === "nolink") { setNoLink(v => !v); setStatus("all"); return; }
    if (key === "pusat") { setWilayah(wilayah === PUSAT_LABEL ? "all" : PUSAT_LABEL); return; }
  };

  const fileLabel = docYear !== "all" ? docYear : "semua";
  const exportCsv = () => {
    downloadTextFile(recapToCsv(filtered, fileLabel), `Rekap-Data-${fileLabel}.csv`, "text/csv;charset=utf-8");
  };
  const exportCsvDetail = () => {
    downloadTextFile(recapToCsvDetail(filtered, fileLabel), `Rekap-Data-${fileLabel}-rinci.csv`, "text/csv;charset=utf-8");
  };
  const exportPdf = () => {
    downloadPdfBytes(recapToPdfBytes(filtered, fileLabel, {
      totalRequests: data?.total_requests,
      teamCount: data?.team_count,
    }), `Rekap-Data-${fileLabel}.pdf`);
  };

  const hasFilter = q.trim() || wilayah !== "all" || docType !== "all" || docYear !== "all" || status !== "all" || noLink;

  return (
    <div className="page recap-page" data-testid="data-recap-page">
      <div className="page-heading">
        <div>
          <h1>Rekap Data</h1>
          <p className="muted">Katalog seluruh dokumen unik — filter tahun memakai tahun dokumen, bukan tahun penugasan tim.</p>
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

      {!data ? (
        <p className="muted">Memuat…</p>
      ) : (
        <>
          <div className="dr-stats recap-stats recap-stats-6">
            <button type="button" className={`dr-stat tot ${status === "all" && !noLink && wilayah === "all" ? "on" : ""}`} onClick={() => clickCard("unique")} data-testid="recap-card-unique">
              <b>{uniqueVisible}</b><span>Data unik</span>
            </button>
            <button type="button" className={`dr-stat ok ${status === "diterima_lengkap" ? "on" : ""}`} onClick={() => clickCard("complete")} data-testid="recap-card-complete">
              <b>{completeVisible}</b><span>Lengkap semua tim</span>
            </button>
            <button type="button" className={`dr-stat part ${status === "pending" ? "on" : ""}`} onClick={() => clickCard("pending")} data-testid="recap-card-pending">
              <b>{pendingVisible}</b><span>Belum lengkap</span>
            </button>
            <button type="button" className={`dr-stat na ${noLink ? "on" : ""}`} onClick={() => clickCard("nolink")} data-testid="recap-card-nolink">
              <b>{noLinkVisible}</b><span>Tanpa tautan</span>
            </button>
            <button type="button" className={`dr-stat nr ${wilayah === PUSAT_LABEL ? "on" : ""}`} onClick={() => clickCard("pusat")} data-testid="recap-card-pusat">
              <b>{pusatVisible}</b><span>Pusat / umum</span>
            </button>
            <div className="dr-stat tot"><b>{pemdaVisible}</b><span>Pemda</span></div>
          </div>

          <div className="recap-filters" data-testid="recap-filters">
            <label className="recap-search">
              <Search size={14} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, pemda, jenis, sheet, atau tim…" data-testid="recap-search-input" />
            </label>
            <label>Tanggungan
              <select value={wilayah} onChange={e => setWilayah(e.target.value)} data-testid="recap-wilayah-filter">
                <option value="all">Semua</option>
                {(data.wilayahs || []).map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label>Jenis
              <select value={docType} onChange={e => setDocType(e.target.value)} data-testid="recap-doc-type-filter">
                <option value="all">Semua</option>
                {(data.doc_types || []).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>Tahun dokumen
              <select value={docYear} onChange={e => setDocYear(e.target.value)} data-testid="recap-doc-year-filter">
                <option value="all">Semua</option>
                {(data.doc_years || []).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label>Tampilkan
              <select value={groupBy} onChange={e => setGroupBy(e.target.value)} data-testid="recap-group-by">
                {GROUP_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
              </select>
            </label>
          </div>

          {!allItems.length ? (
            <EmptyState
              icon={<Database size={22} />}
              title="Belum ada data"
              body="Tambahkan permintaan data, lalu isi tanggungan (pemda atau Pusat / umum), tahun dokumen, dan jenis."
            />
          ) : !regions.length ? (
            <EmptyState icon={<Search size={22} />} title="Tidak ada yang cocok" body="Coba kata kunci atau filter lain." />
          ) : (
            <>
              <p className="recap-filter-hint">{uniqueVisible} data unik{hasFilter ? " sesuai filter" : ""}</p>
              {regions.map(region => {
                const open = openGroups.has(region.label);
                return (
                  <div className="recap-region" key={region.label} data-testid={`recap-wilayah-group-${region.label}`}>
                    <button type="button" className={`recap-region-head ${open ? "open" : ""}`} onClick={() => toggleGroup(region.label)}>
                      <ChevronRight size={16} />
                      <b>{region.label}</b>
                      <span className="prog">{region.count} data</span>
                    </button>
                    {open && region.items.map(item => {
                      const expanded = openKey === `${region.label}:${item.key}`;
                      const weak = item.weakest_status || weakestStatus(item.status_counts);
                      const tone = STATUS_TONE[weak] || "req";
                      const complete = item.complete_teams ?? item.status_counts?.diterima_lengkap ?? 0;
                      return (
                        <div className="recap-item" key={item.key} data-testid={`recap-item-${item.key}`}>
                          <button type="button" className="recap-item-main" onClick={() => setOpenKey(expanded ? null : `${region.label}:${item.key}`)}>
                            <div className="recap-item-name">
                              <span>{item.name}</span>
                              <div className="dr-doc-meta">
                                {groupBy !== "wilayah" && item.wilayah ? <span>{item.wilayah}</span> : null}
                                {item.doc_year ? <span>{item.doc_year}</span> : null}
                                {item.doc_type ? <span>{item.doc_type}</span> : null}
                                {(item.sheets || []).map(s => <span key={s}>{s}</span>)}
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
            </>
          )}
        </>
      )}
    </div>
  );
}
