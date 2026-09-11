import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Paperclip, Trash2, X, Pencil, Check, FileOutput, Link2, ChevronDown } from "lucide-react";
import { client, apiError, fileUrl, formatSize, shortDate } from "../lib/api";
import { useConfirm } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { ExportSuratModal } from "./ExportSuratModal";
import { currentYear, teamYear } from "../lib/years";
import { DOC_TYPE_SUGGESTIONS, PUSAT_LABEL, itemScope, itemWilayahLabel, mergeSuggestions } from "../lib/dataDocs";

function normName(s) {
  return (s || "").trim().toLowerCase().replace(/[\s\u00a0]+/g, " ").replace(/["'`]+/g, "").trim();
}

function parseDocYear(value, fallback) {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 1900 && n <= 2100) return n;
  return fallback;
}

function flattenCatalog(recap) {
  const source = recap?.items?.length
    ? recap.items
    : (recap?.regions?.length ? recap.regions.flatMap(r => (r.groups || []).flatMap(g => g.items || [])) : (recap?.groups || []).flatMap(g => g.items || []));
  const seen = new Map();
  for (const it of source) {
    const k = it.name_key || it.key;
    if (k && !seen.has(k)) seen.set(k, { ...it, key: k });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
}

const STATUS_OPTIONS = [
  { value: "diminta", label: "Diminta" },
  { value: "diterima_sebagian", label: "Diterima Sebagian" },
  { value: "diterima_lengkap", label: "Diterima Lengkap" },
  { value: "tidak_tersedia", label: "Tidak Tersedia" },
  { value: "tidak_relevan", label: "Tidak Relevan" },
];
const STATUS_TONE = {
  diminta: "req", diterima_sebagian: "part", diterima_lengkap: "ok", tidak_tersedia: "na", tidak_relevan: "nr",
};
const NO_SHEET = "(Tanpa sheet)";

export function DataRequests({ team, myRole, onTeamUpdated }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSheet, setOpenSheet] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", pic: "", notes: "", scope: "pemda", wilayah: "", doc_year: currentYear(), doc_type: "" });
  const [docTypes, setDocTypes] = useState([]);
  const [attachingId, setAttachingId] = useState(null);
  const [linkUrlDraft, setLinkUrlDraft] = useState("");
  const [linkNameDraft, setLinkNameDraft] = useState("");
  const [attachError, setAttachError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [wilayah, setWilayah] = useState(team.wilayah || "");
  const [wilayahs, setWilayahs] = useState([]);
  const [wilayahSaving, setWilayahSaving] = useState(false);
  const [wilayahSaved, setWilayahSaved] = useState(false);
  const [wilayahError, setWilayahError] = useState("");
  const [renamingSheet, setRenamingSheet] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [addingSheetId, setAddingSheetId] = useState(null);
  const [sheetDraft, setSheetDraft] = useState("");
  const confirm = useConfirm();
  const assignmentYear = teamYear(team);

  const load = () => client.get(`/teams/${team.id}/data-requests`).then(r => { setItems(r.data); setLoading(false); });
  useEffect(() => {
    setLoading(true); load(); setOpenSheet(null);
    setWilayah(team.wilayah || "");
    setWilayahSaved(false); setWilayahError("");
    setRenamingSheet(null); setAddingSheetId(null);
  }, [team.id, team.wilayah, team.year]);
  useEffect(() => {
    client.get("/wilayahs").then(r => setWilayahs(r.data || [])).catch(() => setWilayahs([]));
    client.get("/doc-types").then(r => setDocTypes(r.data || [])).catch(() => setDocTypes([]));
  }, []);
  useEffect(() => {
    client.get("/data-recap", { params: { year: teamYear(team) } })
      .then(r => setCatalog(flattenCatalog(r.data)))
      .catch(() => setCatalog([]));
  }, [team.id, team.year, items.length]);

  const allSheets = useMemo(() => [...new Set(items.flatMap(i => (i.sheets?.length ? i.sheets : [NO_SHEET])))].sort(), [items]);
  const bySheet = useMemo(() => allSheets.map(sheet => ({
    sheet,
    rows: items.filter(i => (i.sheets?.length ? i.sheets : [NO_SHEET]).includes(sheet)),
  })), [allSheets, items]);

  const counts = useMemo(() => {
    const c = { total: items.length, diminta: 0, diterima_sebagian: 0, diterima_lengkap: 0, tidak_tersedia: 0, tidak_relevan: 0 };
    items.forEach(i => { c[i.status] = (c[i.status] || 0) + 1; });
    return c;
  }, [items]);
  const pctOk = counts.total ? Math.round((counts.diterima_lengkap / counts.total) * 100) : 0;
  const pctPart = counts.total ? Math.round((counts.diterima_sebagian / counts.total) * 100) : 0;
  const pctNa = counts.total ? Math.round((counts.tidak_tersedia / counts.total) * 100) : 0;
  const pctNr = counts.total ? Math.round((counts.tidak_relevan / counts.total) * 100) : 0;

  const canDelete = myRole === "admin";

  const saveWilayah = async e => {
    e?.preventDefault();
    setWilayahSaving(true); setWilayahError(""); setWilayahSaved(false);
    try {
      await client.patch(`/teams/${team.id}`, {
        name: team.name, color: team.color, year: assignmentYear, wilayah: wilayah.trim(),
        laporan_deadline: team.laporan_deadline || null, kke_deadline: team.kke_deadline || null,
        laporan_link: team.laporan_link || null, kke_link: team.kke_link || null,
      });
      setWilayahSaved(true);
      onTeamUpdated?.();
    } catch (x) { setWilayahError(apiError(x)); }
    finally { setWilayahSaving(false); }
  };

  const setStatus = async (item, status) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i));
    try { await client.patch(`/data-requests/${item.id}`, { status }); } catch (e) { load(); }
  };
  const startEdit = item => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      pic: item.pic || "",
      notes: item.notes || "",
      scope: itemScope(item),
      wilayah: item.wilayah || wilayah.trim() || team.wilayah || "",
      doc_year: item.doc_year || assignmentYear,
      doc_type: item.doc_type || "",
    });
  };
  const saveEdit = async () => {
    const id = editingId; setEditingId(null);
    await client.patch(`/data-requests/${id}`, {
      name: editForm.name.trim(), pic: editForm.pic.trim(), notes: editForm.notes.trim(),
      scope: editForm.scope, wilayah: editForm.scope === "pusat" ? "" : editForm.wilayah.trim(),
      doc_year: parseDocYear(editForm.doc_year, assignmentYear), doc_type: editForm.doc_type.trim(),
    });
    load();
  };
  const typeSuggestions = mergeSuggestions(DOC_TYPE_SUGGESTIONS, [...docTypes, ...items.map(i => i.doc_type)]);
  const removeItem = async item => {
    const ok = await confirm({ title: `Hapus "${item.name}"?`, body: "Item permintaan data ini akan dihapus permanen.", confirmLabel: "Hapus", danger: true });
    if (ok) { await client.delete(`/data-requests/${item.id}`); load(); }
  };
  const removeSheetTag = async (item, sheet) => {
    const next = (item.sheets || []).filter(s => s !== sheet);
    await client.patch(`/data-requests/${item.id}`, { sheets: next });
    load();
  };
  const addSheetToItem = async item => {
    const v = sheetDraft.trim();
    if (!v) return;
    const next = [...new Set([...(item.sheets || []), v])];
    setAddingSheetId(null); setSheetDraft("");
    await client.patch(`/data-requests/${item.id}`, { sheets: next });
    load();
  };
  const startRenameSheet = sheet => {
    if (sheet === NO_SHEET) setRenameDraft("");
    else setRenameDraft(sheet);
    setRenamingSheet(sheet);
  };
  const saveRenameSheet = async oldName => {
    const next = renameDraft.trim();
    if (!next || next === oldName) { setRenamingSheet(null); return; }
    await client.post(`/teams/${team.id}/data-requests/rename-sheet`, { from_name: oldName, to_name: next });
    setRenamingSheet(null); setRenameDraft("");
    load();
  };

  const openAttach = itemId => {
    setAttachingId(cur => cur === itemId ? null : itemId);
    setLinkUrlDraft(""); setLinkNameDraft(""); setAttachError("");
  };
  const addAttachmentLink = async () => {
    if (!linkUrlDraft.trim() || !attachingId) return;
    try {
      await client.post(`/data-requests/${attachingId}/attachments`, { name: linkNameDraft.trim(), url: linkUrlDraft.trim() });
      setAttachingId(null); setLinkUrlDraft(""); setLinkNameDraft("");
      load();
    } catch (e) { setAttachError(apiError(e)); }
  };
  const removeAttachment = async (item, fileId) => {
    await client.delete(`/data-requests/${item.id}/attachments/${fileId}`);
    load();
  };

  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>;

  return (
    <div className="page dr-page" data-testid="data-requests-page">
      <div className="page-heading">
        <div>
          <h1>Permintaan Data</h1>
          <p className="muted">Tanggungan, tahun dokumen, dan jenis diatur per data — peraturan pusat tidak ikut wilayah pemda tim.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={() => setExportOpen(true)} data-testid="export-surat-button"><FileOutput size={14} /> Ekspor Surat</button>
          <button className="primary" onClick={() => setOpenSheet("__new__")} data-testid="add-data-request-button"><Plus size={16} /> Tambah Data</button>
        </div>
      </div>

      <form className={`dr-wilayah-bar ${wilayah.trim() ? "" : "missing"}`} onSubmit={saveWilayah} data-testid="data-request-wilayah-form">
        <p className="dr-assignment" data-testid="data-request-assignment-year">Penugasan {assignmentYear}</p>
        <label>
          Pemda default (dokumen daerah)
          <input
            value={wilayah}
            onChange={e => { setWilayah(e.target.value); setWilayahSaved(false); }}
            list="dr-wilayah-suggestions"
            placeholder="Contoh: Kabupaten Fakfak — tidak dipakai untuk dokumen pusat"
            data-testid="data-request-wilayah-input"
          />
        </label>
        <datalist id="dr-wilayah-suggestions">{wilayahs.map(w => <option key={w} value={w} />)}</datalist>
        <datalist id="dr-doc-type-suggestions">{typeSuggestions.map(t => <option key={t} value={t} />)}</datalist>
        <datalist id="dr-sheet-suggestions-row">{allSheets.filter(s => s !== NO_SHEET).map(s => <option key={s} value={s} />)}</datalist>
        <button className="primary" disabled={wilayahSaving} data-testid="save-data-request-wilayah">{wilayahSaving ? "Menyimpan…" : "Simpan"}</button>
        {wilayahSaved && <span className="dr-wilayah-ok">Pemda default tersimpan{wilayah.trim() ? ` · ${wilayah.trim()}` : ""}.</span>}
        {wilayahError && <div className="error">{wilayahError}</div>}
        {!wilayah.trim() && !wilayahSaved && <p className="muted">Isi pemda default untuk dokumen daerah. Peraturan pusat dipilih per data sebagai Pusat / umum. Tahun penugasan diubah di pengaturan tim.</p>}
      </form>
      {exportOpen && (
        <ExportSuratModal
          team={team}
          items={items.filter(i => i.status !== "diterima_lengkap" && i.status !== "tidak_relevan")}
          onClose={() => setExportOpen(false)}
          onSaved={onTeamUpdated}
        />
      )}

      {!!counts.total && (
        <>
          <div className="dr-stats">
            <div className="dr-stat tot"><b>{counts.total}</b><span>Total data</span></div>
            <div className="dr-stat ok"><b>{counts.diterima_lengkap}</b><span>Diterima lengkap</span></div>
            <div className="dr-stat part"><b>{counts.diterima_sebagian}</b><span>Sebagian</span></div>
            <div className="dr-stat na"><b>{counts.tidak_tersedia}</b><span>Tidak tersedia</span></div>
            <div className="dr-stat nr"><b>{counts.tidak_relevan}</b><span>Tidak relevan</span></div>
          </div>
          <div className="dr-overall">
            <div className="dr-track">
              <i style={{ width: `${pctOk}%`, background: "var(--success)" }} />
              <i style={{ width: `${pctPart}%`, background: "var(--warning)" }} />
              <i style={{ width: `${pctNa}%`, background: "var(--danger)" }} />
              <i style={{ width: `${pctNr}%`, background: "var(--teal)" }} />
            </div>
            <b>{pctOk}% lengkap</b>
          </div>
        </>
      )}

      {openSheet === "__new__" && (
        <AddForm team={team} items={items} catalog={catalog} year={assignmentYear} wilayah={wilayah.trim() || team.wilayah} defaultSheet="" onDone={() => { setOpenSheet(null); load(); }} onCancel={() => setOpenSheet(null)} allSheets={allSheets} />
      )}

      {!items.length ? (
        <EmptyState
          icon={<Paperclip size={22} />}
          title="Belum ada data yang diminta"
          body="Tambahkan data yang dibutuhkan untuk sheet kertas kerja evaluasi, lalu pantau statusnya di sini."
          action={<button className="primary" onClick={() => setOpenSheet("__new__")}><Plus size={16} /> Tambah data pertama</button>}
        />
      ) : (
        bySheet.map(({ sheet, rows }) => {
          const done = rows.filter(r => r.status === "diterima_lengkap").length;
          const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;
          return (
            <div className="sheet" key={sheet} data-testid={`sheet-group-${sheet}`}>
              <div className="sheet-head">
                {renamingSheet === sheet ? (
                  <form className="sheet-rename" onSubmit={e => { e.preventDefault(); saveRenameSheet(sheet); }} data-testid={`rename-sheet-form-${sheet}`}>
                    <input autoFocus value={renameDraft} onChange={e => setRenameDraft(e.target.value)} placeholder="Nama sheet KKE" data-testid={`rename-sheet-input-${sheet}`} />
                    <button type="submit" className="icon-button" title="Simpan nama"><Check size={14} /></button>
                    <button type="button" className="icon-button" onClick={() => setRenamingSheet(null)}><X size={14} /></button>
                  </form>
                ) : (
                  <div className="sheet-title">
                    <b>{sheet}</b>
                    <button type="button" className="icon-button tiny" onClick={() => startRenameSheet(sheet)} title="Ubah nama sheet" data-testid={`rename-sheet-${sheet}`}><Pencil size={12} /></button>
                  </div>
                )}
                <div className="mini-track"><i style={{ width: `${pct}%` }} /></div>
                <span className="prog">{done}/{rows.length} lengkap</span>
                <button className="add-btn" onClick={() => setOpenSheet(sheet)} data-testid={`add-to-sheet-${sheet}`}>+ Tambah data</button>
              </div>
              {openSheet === sheet && (
                <AddForm team={team} items={items} catalog={catalog} year={assignmentYear} wilayah={wilayah.trim() || team.wilayah} defaultSheet={sheet === NO_SHEET ? "" : sheet} onDone={() => { setOpenSheet(null); load(); }} onCancel={() => setOpenSheet(null)} allSheets={allSheets} />
              )}
              {rows.map(item => (
                <div className="dr-row" key={item.id} data-testid={`data-request-row-${item.id}`}>
                  <div className="dr-main">
                    {editingId === item.id ? (
                      <div className="dr-edit-form">
                        <input autoFocus value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Nama data" data-testid={`edit-name-${item.id}`} />
                        <select value={editForm.scope} onChange={e => setEditForm({ ...editForm, scope: e.target.value })} data-testid={`edit-scope-${item.id}`}>
                          <option value="pemda">Pemda</option>
                          <option value="pusat">Pusat / umum</option>
                        </select>
                        {editForm.scope === "pemda" && (
                          <input value={editForm.wilayah} onChange={e => setEditForm({ ...editForm, wilayah: e.target.value })} list="dr-wilayah-suggestions" placeholder="Kabupaten / provinsi" data-testid={`edit-wilayah-${item.id}`} />
                        )}
                        <input
                          type="number"
                          min="1900"
                          max="2100"
                          value={editForm.doc_year}
                          onChange={e => setEditForm({ ...editForm, doc_year: e.target.value })}
                          placeholder="Tahun dokumen"
                          title="Tahun dokumen"
                          data-testid={`edit-doc-year-${item.id}`}
                        />
                        <input value={editForm.doc_type} onChange={e => setEditForm({ ...editForm, doc_type: e.target.value })} list="dr-doc-type-suggestions" placeholder="Jenis dokumen" data-testid={`edit-doc-type-${item.id}`} />
                        <input value={editForm.pic} onChange={e => setEditForm({ ...editForm, pic: e.target.value })} placeholder="PIC pemda (opsional)" />
                        <input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Catatan (opsional)" />
                        <button className="icon-button" onClick={saveEdit} data-testid={`save-edit-${item.id}`}><Check size={14} /></button>
                        <button className="icon-button" onClick={() => setEditingId(null)}><X size={14} /></button>
                      </div>
                    ) : (
                      <>
                        <div className="dr-name">
                          {item.name}
                          {item.pic && <small> · {item.pic}</small>}
                          <button className="icon-button tiny" onClick={() => startEdit(item)} data-testid={`edit-item-${item.id}`}><Pencil size={11} /></button>
                        </div>
                        <div className="dr-doc-meta">
                          <span className={`dr-scope ${itemScope(item)}`}>{itemWilayahLabel(item, wilayah.trim() || team.wilayah)}</span>
                          {item.doc_year ? <span>{item.doc_year}</span> : null}
                          {item.doc_type ? <span>{item.doc_type}</span> : null}
                        </div>
                        {item.notes && <p className="dr-note">{item.notes}</p>}
                        <div className="dr-tags">
                          {(item.sheets || []).map(s => (
                            <span className="dr-tag" key={s}>{s}<button onClick={() => removeSheetTag(item, s)} title="Hapus dari sheet ini"><X size={9} /></button></span>
                          ))}
                          {addingSheetId === item.id ? (
                            <input
                              autoFocus
                              className="dr-add-sheet-input"
                              value={sheetDraft}
                              onChange={e => setSheetDraft(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSheetToItem(item); } if (e.key === "Escape") setAddingSheetId(null); }}
                              onBlur={() => { if (sheetDraft.trim()) addSheetToItem(item); else setAddingSheetId(null); }}
                              placeholder="Nama sheet…"
                              list="dr-sheet-suggestions-row"
                              data-testid={`add-sheet-input-${item.id}`}
                            />
                          ) : (
                            <button type="button" className="dr-tag add" onClick={() => { setAddingSheetId(item.id); setSheetDraft(""); }} title="Tambah sheet" data-testid={`add-sheet-${item.id}`}>+ sheet</button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <select className={`pill-select ${STATUS_TONE[item.status]}`} value={item.status} onChange={e => setStatus(item, e.target.value)} data-testid={`status-select-${item.id}`}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div className="dr-date">
                    {item.status === "diterima_lengkap" || item.status === "diterima_sebagian"
                      ? (item.received_at ? `diterima ${shortDate(item.received_at)}` : "")
                      : (item.requested_at ? `diminta ${shortDate(item.requested_at)}` : "")}
                  </div>
                  <div className="dr-evidence">
                    {(item.attachments || []).map(a => (
                      <span className="dr-file" key={a.id}>
                        <a href={a.url || fileUrl(a.id)} target="_blank" rel="noreferrer" title={a.url ? (a.name || a.url) : `${a.filename} (${formatSize(a.size)})`}>{a.url ? (a.name || a.url) : a.filename}</a>
                        <button onClick={() => removeAttachment(item, a.id)} data-testid={`remove-attachment-${item.id}-${a.id}`}><X size={10} /></button>
                      </span>
                    ))}
                    <button className="icon-button tiny" onClick={() => openAttach(item.id)} title="Tambah link bukti" data-testid={`attach-data-request-${item.id}`}><Link2 size={13} /></button>
                    {attachingId === item.id && (
                      <div className="dr-link-form" data-testid={`data-request-link-form-${item.id}`}>
                        <input autoFocus value={linkUrlDraft} onChange={e => setLinkUrlDraft(e.target.value)} placeholder="https://drive.google.com/…"
                          onKeyDown={e => e.key === "Enter" && addAttachmentLink()} data-testid={`data-request-link-url-${item.id}`} />
                        <input value={linkNameDraft} onChange={e => setLinkNameDraft(e.target.value)} placeholder="Nama dokumen (opsional)"
                          onKeyDown={e => e.key === "Enter" && addAttachmentLink()} data-testid={`data-request-link-name-${item.id}`} />
                        <button className="icon-button tiny" onClick={addAttachmentLink} data-testid={`data-request-link-submit-${item.id}`}><Check size={13} /></button>
                        <button className="icon-button tiny" onClick={() => setAttachingId(null)}><X size={13} /></button>
                        {attachError && <div className="error" data-testid={`data-request-link-error-${item.id}`}>{attachError}</div>}
                      </div>
                    )}
                  </div>
                  {canDelete && <button className="icon-button" onClick={() => removeItem(item)} data-testid={`delete-data-request-${item.id}`}><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

function AddForm({ team, items, catalog, year, wilayah, defaultSheet, onDone, onCancel, allSheets }) {
  const [name, setName] = useState("");
  const [sheets, setSheets] = useState(defaultSheet ? [defaultSheet] : []);
  const [sheetInput, setSheetInput] = useState("");
  const [pic, setPic] = useState("");
  const [scope, setScope] = useState("pemda");
  const [itemWilayah, setItemWilayah] = useState(wilayah || "");
  const [docYear, setDocYear] = useState(currentYear());
  const [docType, setDocType] = useState("");
  const [error, setError] = useState("");

  const addSheetTag = () => {
    const v = sheetInput.trim();
    if (v && !sheets.includes(v)) setSheets([...sheets, v]);
    setSheetInput("");
  };
  const removeSheetTag = s => setSheets(sheets.filter(x => x !== s));

  const attachToExisting = async existing => {
    const merged = [...new Set([...(existing.sheets || []), ...sheets])];
    await client.patch(`/data-requests/${existing.id}`, { sheets: merged });
    onDone();
  };

  const submit = async e => {
    e.preventDefault();
    const typed = name.trim();
    if (!typed) return;
    const existing = items.find(i =>
      normName(i.name) === normName(typed)
      && Number(i.year || year) === Number(year)
      && Number(i.doc_year || i.year || year) === parseDocYear(docYear, year)
      && itemScope(i) === scope
      && (scope === "pusat" || normName(i.wilayah || wilayah) === normName(itemWilayah || wilayah))
    );
    if (existing) { await attachToExisting(existing); return; }
    const canon = (catalog || []).find(c => c.key === normName(typed) || c.name_key === normName(typed));
    try {
      await client.post(`/teams/${team.id}/data-requests`, {
        name: canon ? canon.name : typed, sheets, pic: pic.trim(),
        year: Number(year),
        doc_year: parseDocYear(docYear, year),
        doc_type: docType.trim(),
        scope,
        wilayah: scope === "pusat" ? "" : (itemWilayah.trim() || wilayah || ""),
      });
      onDone();
    } catch (x) { setError(apiError(x)); }
  };

  return (
    <form className="inline-form dr-add-form" onSubmit={submit} data-testid="data-request-add-form">
      <div className="dr-doc-fields">
        <label>Tanggungan
          <select value={scope} onChange={e => setScope(e.target.value)} data-testid="new-data-scope">
            <option value="pemda">Pemda</option>
            <option value="pusat">Pusat / umum</option>
          </select>
        </label>
        {scope === "pemda" ? (
          <label>Pemda / wilayah
            <input value={itemWilayah} onChange={e => setItemWilayah(e.target.value)} list="dr-wilayah-suggestions" placeholder="Kabupaten / provinsi" data-testid="new-data-wilayah" />
          </label>
        ) : (
          <p className="dr-wilayah-context" data-testid="data-request-wilayah-context">{PUSAT_LABEL} — tidak masuk rekap per pemda</p>
        )}
        <label>Tahun dokumen
          <input type="number" min="1900" max="2100" value={docYear} onChange={e => setDocYear(e.target.value)} placeholder="contoh: 2014" data-testid="new-data-doc-year" />
        </label>
        <label>Jenis dokumen
          <input value={docType} onChange={e => setDocType(e.target.value)} list="dr-doc-type-suggestions" placeholder="LKPD, Peraturan pusat, …" data-testid="new-data-doc-type" />
        </label>
      </div>
      <DataNamePicker
        value={name}
        onChange={setName}
        catalog={catalog}
        teamItems={items}
        year={teamYear(team)}
      />
      <div className="dr-tags editable">
        {sheets.map(s => <span className="dr-tag" key={s}>{s}<button type="button" onClick={() => removeSheetTag(s)}><X size={9} /></button></span>)}
        <input value={sheetInput} onChange={e => setSheetInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSheetTag(); } }}
          placeholder="Nama sheet KKE, Enter untuk tambah…" list="dr-sheet-suggestions" data-testid="data-request-sheet-input" />
        <datalist id="dr-sheet-suggestions">{allSheets.map(s => <option key={s} value={s} />)}</datalist>
        <button type="button" className="secondary" onClick={addSheetTag}>+ Sheet</button>
      </div>
      <input value={pic} onChange={e => setPic(e.target.value)} placeholder="PIC pemda (opsional)" />
      {error && <div className="error">{error}</div>}
      <div><button className="primary" data-testid="submit-data-request-button">Tambah</button><button type="button" className="secondary" onClick={onCancel}>Batal</button></div>
    </form>
  );
}

function DataNamePicker({ value, onChange, catalog, teamItems, year }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  const rows = useMemo(() => {
    const needle = normName(value);
    const teamByKey = new Map();
    (teamItems || []).forEach(i => {
      const k = normName(i.name);
      if (k && !teamByKey.has(k)) teamByKey.set(k, i);
    });
    const out = [];
    const seen = new Set();
    const push = (row) => { if (!seen.has(row.key)) { seen.add(row.key); out.push(row); } };

    if (!needle) {
      (catalog || []).forEach(c => push({
        key: c.key, name: c.name, sheets: c.sheets || [], teamCount: c.team_count,
        inTeam: teamByKey.get(c.key) || null, source: "catalog",
      }));
      teamByKey.forEach((item, key) => push({
        key, name: item.name, sheets: item.sheets || [], teamCount: 1, inTeam: item, source: "team",
      }));
      return out.slice(0, 12);
    }

    const match = (name, sheets) =>
      normName(name).includes(needle) || (sheets || []).some(s => s.toLowerCase().includes(value.trim().toLowerCase()));

    (catalog || []).filter(c => match(c.name, c.sheets)).forEach(c => push({
      key: c.key, name: c.name, sheets: c.sheets || [], teamCount: c.team_count,
      inTeam: teamByKey.get(c.key) || null, source: "catalog",
    }));
    (teamItems || []).filter(i => match(i.name, i.sheets)).forEach(i => push({
      key: normName(i.name), name: i.name, sheets: i.sheets || [], teamCount: 1, inTeam: i, source: "team",
    }));
    return out.slice(0, 12);
  }, [value, catalog, teamItems]);

  const exact = rows.some(r => r.key === normName(value));
  const showNew = value.trim() && !exact;

  useEffect(() => { setActive(0); }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = row => {
    onChange(row.name);
    setOpen(false);
  };

  const onKeyDown = e => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setOpen(true); return; }
    if (!open) return;
    const total = rows.length + (showNew ? 1 : 0);
    if (!total) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(total - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    if (e.key === "Enter" && rows[active]) { e.preventDefault(); pick(rows[active]); }
  };

  return (
    <div className="dr-name-picker" ref={boxRef} data-testid="data-request-name-picker">
      <div className="dr-name-picker-field">
        <input
          autoFocus
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Cari atau ketik nama data…"
          data-testid="data-request-name-input"
          autoComplete="off"
        />
        <button type="button" className="dr-name-picker-toggle" onClick={() => setOpen(o => !o)} tabIndex={-1} aria-label="Buka daftar nama">
          <ChevronDown size={14} />
        </button>
      </div>
      {open && (
        <div className="dr-name-dropdown" data-testid="data-request-name-dropdown">
          <small>Data {year} yang sudah pernah diinput — pilih agar nama seragam</small>
          {rows.map((row, i) => (
            <button
              type="button"
              key={`${row.source}-${row.key}`}
              className={i === active ? "active" : ""}
              onMouseDown={e => { e.preventDefault(); pick(row); }}
              onMouseEnter={() => setActive(i)}
              data-testid={`data-name-option-${row.key}`}
            >
              <span>{row.name}</span>
              <em>
                {row.inTeam ? "sudah di tim ini" : row.teamCount > 1 ? `${row.teamCount} tim` : "rekap tahun ini"}
                {row.sheets.length ? ` · ${row.sheets.join(", ")}` : ""}
              </em>
            </button>
          ))}
          {showNew && (
            <button type="button" className={`dr-name-new ${active === rows.length ? "active" : ""}`} onMouseDown={e => { e.preventDefault(); setOpen(false); }}>
              <span>Pakai nama baru: {value.trim()}</span>
            </button>
          )}
          {!rows.length && !showNew && <p className="muted">Belum ada data tahun ini. Ketik nama baru.</p>}
        </div>
      )}
    </div>
  );
}
