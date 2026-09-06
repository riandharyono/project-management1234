import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Paperclip, Trash2, X, Pencil, Check, FileOutput } from "lucide-react";
import { client, apiError, fileUrl, formatSize, shortDate } from "../lib/api";
import { useConfirm } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { ExportSuratModal } from "./ExportSuratModal";

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

export function DataRequests({ team, myRole }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSheet, setOpenSheet] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", pic: "", notes: "" });
  const [attachingId, setAttachingId] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const fileInput = useRef(null);
  const confirm = useConfirm();

  const load = () => client.get(`/teams/${team.id}/data-requests`).then(r => { setItems(r.data); setLoading(false); });
  useEffect(() => { setLoading(true); load(); setOpenSheet(null); }, [team.id]);

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

  const setStatus = async (item, status) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i));
    try { await client.patch(`/data-requests/${item.id}`, { status }); } catch (e) { load(); }
  };
  const startEdit = item => { setEditingId(item.id); setEditForm({ name: item.name, pic: item.pic || "", notes: item.notes || "" }); };
  const saveEdit = async () => {
    const id = editingId; setEditingId(null);
    await client.patch(`/data-requests/${id}`, { name: editForm.name.trim(), pic: editForm.pic.trim(), notes: editForm.notes.trim() });
    load();
  };
  const removeItem = async item => {
    const ok = await confirm({ title: `Hapus "${item.name}"?`, body: "Item permintaan data ini akan dihapus permanen.", confirmLabel: "Hapus", danger: true });
    if (ok) { await client.delete(`/data-requests/${item.id}`); load(); }
  };
  const removeSheetTag = async (item, sheet) => {
    const next = (item.sheets || []).filter(s => s !== sheet);
    await client.patch(`/data-requests/${item.id}`, { sheets: next });
    load();
  };

  const openAttach = itemId => { setAttachingId(itemId); fileInput.current?.click(); };
  const uploadAttachment = async file => {
    if (!file || !attachingId) return;
    const fd = new FormData(); fd.append("file", file);
    const qs = new URLSearchParams({ team_id: team.id, data_request_id: attachingId, kind: "data_request" });
    await client.post(`/files/upload?${qs}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    setAttachingId(null);
    load();
  };
  const removeAttachment = async (item, fileId) => {
    await client.delete(`/data-requests/${item.id}/attachments/${fileId}`);
    load();
  };

  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>;

  return (
    <div className="page dr-page" data-testid="data-requests-page">
      <div className="page-heading">
        <div><h1>Permintaan Data</h1><p className="muted">Data yang dibutuhkan tiap sheet kertas kerja evaluasi, dan status permintaannya ke pemda.</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={() => setExportOpen(true)} data-testid="export-surat-button"><FileOutput size={14} /> Ekspor Surat</button>
          <button className="primary" onClick={() => setOpenSheet("__new__")} data-testid="add-data-request-button"><Plus size={16} /> Tambah Data</button>
        </div>
      </div>
      {exportOpen && (
        <ExportSuratModal
          team={team}
          items={items.filter(i => i.status !== "diterima_lengkap" && i.status !== "tidak_relevan")}
          onClose={() => setExportOpen(false)}
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

      <input ref={fileInput} type="file" hidden onChange={e => uploadAttachment(e.target.files[0])} data-testid="data-request-attachment-input" />

      {openSheet === "__new__" && (
        <AddForm team={team} items={items} defaultSheet="" onDone={() => { setOpenSheet(null); load(); }} onCancel={() => setOpenSheet(null)} allSheets={allSheets} />
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
                <b>{sheet}</b>
                <div className="mini-track"><i style={{ width: `${pct}%` }} /></div>
                <span className="prog">{done}/{rows.length} lengkap</span>
                <button className="add-btn" onClick={() => setOpenSheet(sheet)} data-testid={`add-to-sheet-${sheet}`}>+ Tambah data</button>
              </div>
              {openSheet === sheet && (
                <AddForm team={team} items={items} defaultSheet={sheet === NO_SHEET ? "" : sheet} onDone={() => { setOpenSheet(null); load(); }} onCancel={() => setOpenSheet(null)} allSheets={allSheets} />
              )}
              {rows.map(item => (
                <div className="dr-row" key={item.id} data-testid={`data-request-row-${item.id}`}>
                  <div className="dr-main">
                    {editingId === item.id ? (
                      <div className="dr-edit-form">
                        <input autoFocus value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Nama data" data-testid={`edit-name-${item.id}`} />
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
                        {item.notes && <p className="dr-note">{item.notes}</p>}
                        {!!item.sheets?.length && (
                          <div className="dr-tags">
                            {item.sheets.map(s => (
                              <span className="dr-tag" key={s}>{s}<button onClick={() => removeSheetTag(item, s)} title="Hapus dari sheet ini"><X size={9} /></button></span>
                            ))}
                          </div>
                        )}
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
                        <a href={fileUrl(a.id)} target="_blank" rel="noreferrer" title={`${a.filename} (${formatSize(a.size)})`}>{a.filename}</a>
                        <button onClick={() => removeAttachment(item, a.id)} data-testid={`remove-attachment-${item.id}-${a.id}`}><X size={10} /></button>
                      </span>
                    ))}
                    <button className="icon-button tiny" onClick={() => openAttach(item.id)} title="Unggah bukti" data-testid={`attach-data-request-${item.id}`}><Paperclip size={13} /></button>
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

function AddForm({ team, items, defaultSheet, onDone, onCancel, allSheets }) {
  const [name, setName] = useState("");
  const [sheets, setSheets] = useState(defaultSheet ? [defaultSheet] : []);
  const [sheetInput, setSheetInput] = useState("");
  const [pic, setPic] = useState("");
  const [error, setError] = useState("");

  const similar = name.trim().length >= 2
    ? items.filter(i => i.name.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 4)
    : [];

  const addSheetTag = () => {
    const v = sheetInput.trim();
    if (v && !sheets.includes(v)) setSheets([...sheets, v]);
    setSheetInput("");
  };
  const removeSheetTag = s => setSheets(sheets.filter(x => x !== s));

  const submit = async e => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await client.post(`/teams/${team.id}/data-requests`, { name: name.trim(), sheets, pic: pic.trim() });
      onDone();
    } catch (x) { setError(apiError(x)); }
  };

  const attachToExisting = async existing => {
    const merged = [...new Set([...(existing.sheets || []), ...sheets])];
    await client.patch(`/data-requests/${existing.id}`, { sheets: merged });
    onDone();
  };

  return (
    <form className="inline-form dr-add-form" onSubmit={submit} data-testid="data-request-add-form">
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Nama data yang dibutuhkan…" data-testid="data-request-name-input" />
      {!!similar.length && (
        <div className="dr-similar" data-testid="data-request-similar-hint">
          <small>Sudah ada data serupa — mungkin tidak perlu diminta ulang:</small>
          {similar.map(s => (
            <button type="button" key={s.id} onClick={() => attachToExisting(s)} data-testid={`use-existing-${s.id}`}>
              {s.name} <em>({s.sheets?.join(", ") || "tanpa sheet"})</em> — pakai &amp; tambahkan sheet ini
            </button>
          ))}
        </div>
      )}
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
