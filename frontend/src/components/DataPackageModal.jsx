import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { client, apiError } from "../lib/api";
import { currentYear } from "../lib/years";
import { DOC_TYPE_SUGGESTIONS, mergeSuggestions } from "../lib/dataDocs";
import { canCreateTeam, canViewAllTeams } from "../lib/roles";
import { useConfirm } from "./ConfirmDialog";

const emptyItem = () => ({ name: "", doc_type: "", scope: "pemda", sheets: "", notes: "" });

export function DataPackageModal({ team, currentUser, existingItems, onClose, onApplied }) {
  const canManage = canCreateTeam(currentUser) || canViewAllTeams(currentUser);
  const confirm = useConfirm();
  const [packages, setPackages] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [docYear, setDocYear] = useState(currentYear());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("apply");
  const [form, setForm] = useState({ name: "", description: "", items: [emptyItem()] });
  const [editingId, setEditingId] = useState(null);

  const load = () => client.get("/data-packages").then(r => {
    setPackages(r.data || []);
    setSelectedId(id => id || r.data?.[0]?.id || "");
  }).catch(() => setPackages([]));

  useEffect(() => { load(); }, []);

  const selected = packages.find(p => p.id === selectedId);

  const apply = async () => {
    if (!selectedId) return;
    setBusy(true); setError("");
    try {
      const r = await client.post(`/teams/${team.id}/data-requests/from-package`, { package_id: selectedId, doc_year: Number(docYear) });
      onApplied(r.data);
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  const startEdit = pkg => {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name,
      description: pkg.description || "",
      items: (pkg.items || []).map(it => ({
        name: it.name || "", doc_type: it.doc_type || "", scope: it.scope === "pusat" ? "pusat" : "pemda",
        sheets: (it.sheets || []).join(", "), notes: it.notes || "",
      })),
    });
    setTab("edit");
  };

  const startNew = () => {
    setEditingId(null);
    setForm({ name: "", description: "", items: [emptyItem()] });
    setTab("edit");
  };

  const saveFromTeam = () => {
    const items = (existingItems || []).map(it => ({
      name: it.name || "",
      doc_type: it.doc_type || "",
      scope: it.scope === "pusat" ? "pusat" : "pemda",
      sheets: (it.sheets || []).join(", "),
      notes: it.notes || "",
    })).filter(it => it.name);
    if (!items.length) { setError("Belum ada data di tim ini untuk disimpan sebagai paket."); return; }
    setEditingId(null);
    setForm({ name: `Paket ${team.name}`, description: "", items });
    setTab("edit");
  };

  const savePackage = async e => {
    e.preventDefault();
    const items = form.items.map(it => ({
      name: it.name.trim(),
      doc_type: it.doc_type.trim(),
      scope: it.scope,
      sheets: it.sheets.split(",").map(s => s.trim()).filter(Boolean),
      notes: it.notes.trim(),
    })).filter(it => it.name);
    if (!form.name.trim() || !items.length) { setError("Nama paket dan minimal satu baris data wajib."); return; }
    setBusy(true); setError("");
    try {
      const body = { name: form.name.trim(), description: form.description.trim(), items };
      if (editingId) await client.patch(`/data-packages/${editingId}`, body);
      else await client.post("/data-packages", body);
      await load();
      setTab("apply");
    } catch (x) { setError(apiError(x)); }
    finally { setBusy(false); }
  };

  const removePackage = async pkg => {
    const ok = await confirm({ title: "Hapus paket ini?", body: `Paket "${pkg.name}" akan dihapus. Tim yang sudah memakai paket tidak terpengaruh.`, confirmLabel: "Hapus", danger: true });
    if (!ok) return;
    try {
      await client.delete(`/data-packages/${pkg.id}`);
      await load();
    } catch (e) { setError(apiError(e)); }
  };

  const types = mergeSuggestions(DOC_TYPE_SUGGESTIONS, form.items.map(i => i.doc_type));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={e => e.stopPropagation()} data-testid="data-package-modal">
        <div className="modal-head">
          <div><span className="eyebrow">PAKET DATA</span><h2>Paket data standar</h2></div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="view-toggle">
          <button type="button" className={tab === "apply" ? "selected" : ""} onClick={() => setTab("apply")}>Pakai paket</button>
          {canManage && <button type="button" className={tab === "edit" ? "selected" : ""} onClick={startNew}>Kelola</button>}
        </div>

        {tab === "apply" ? (
          <>
            <p className="muted">Pilih paket, isi tahun dokumen, lalu generate. Data yang namanya sudah ada di tim ini dilewati.</p>
            {!packages.length ? (
              <p className="muted">Belum ada paket.{canManage ? " Buka tab Kelola untuk membuat." : ""}</p>
            ) : (
              <>
                <label>Paket
                  <select value={selectedId} onChange={e => setSelectedId(e.target.value)} data-testid="data-package-select">
                    {packages.map(p => <option key={p.id} value={p.id}>{p.name} ({(p.items || []).length} data)</option>)}
                  </select>
                </label>
                {selected?.description && <p className="muted">{selected.description}</p>}
                {!!selected?.items?.length && (
                  <ul className="pkg-preview">
                    {selected.items.map((it, i) => (
                      <li key={i}><b>{it.name}</b> · {it.scope === "pusat" ? "Pusat / umum" : "Pemda"}{it.doc_type ? ` · ${it.doc_type}` : ""}</li>
                    ))}
                  </ul>
                )}
                <label>Tahun dokumen
                  <input type="number" min="1900" max="2100" value={docYear} onChange={e => setDocYear(e.target.value)} data-testid="data-package-year" />
                </label>
              </>
            )}
            {canManage && (
              <button type="button" className="secondary" onClick={saveFromTeam}>Simpan daftar tim ini sebagai paket</button>
            )}
            {error && <div className="error">{error}</div>}
            <div className="modal-foot">
              <span />
              <button type="button" className="secondary" onClick={onClose}>Batal</button>
              <button type="button" className="primary" disabled={!selectedId || busy} onClick={apply} data-testid="data-package-apply">
                {busy ? "Memakai…" : "Pakai paket"}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={savePackage}>
            <label>Nama paket<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Keterangan<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
            <div className="pkg-edit-list">
              {form.items.map((it, idx) => (
                <div className="pkg-edit-row" key={idx}>
                  <input placeholder="Nama data" value={it.name} onChange={e => {
                    const items = [...form.items]; items[idx] = { ...it, name: e.target.value }; setForm({ ...form, items });
                  }} />
                  <select value={it.scope} onChange={e => {
                    const items = [...form.items]; items[idx] = { ...it, scope: e.target.value }; setForm({ ...form, items });
                  }}>
                    <option value="pemda">Pemda</option>
                    <option value="pusat">Pusat / umum</option>
                  </select>
                  <input list="pkg-doc-types" placeholder="Jenis" value={it.doc_type} onChange={e => {
                    const items = [...form.items]; items[idx] = { ...it, doc_type: e.target.value }; setForm({ ...form, items });
                  }} />
                  <input placeholder="Sheet (pisah koma)" value={it.sheets} onChange={e => {
                    const items = [...form.items]; items[idx] = { ...it, sheets: e.target.value }; setForm({ ...form, items });
                  }} />
                  <button type="button" className="icon-button" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })}><Trash2 size={14} /></button>
                </div>
              ))}
              <datalist id="pkg-doc-types">{types.map(t => <option key={t} value={t} />)}</datalist>
              <button type="button" className="secondary" onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}><Plus size={14} /> Baris</button>
            </div>
            {!!packages.length && (
              <div className="pkg-manage-list">
                {packages.map(p => (
                  <div key={p.id} className="pkg-manage-row">
                    <span>{p.name} <small className="muted">({(p.items || []).length})</small></span>
                    <button type="button" className="secondary" onClick={() => startEdit(p)}>Ubah</button>
                    <button type="button" className="danger-link" onClick={() => removePackage(p)}>Hapus</button>
                  </div>
                ))}
              </div>
            )}
            {error && <div className="error">{error}</div>}
            <div className="modal-foot">
              <span />
              <button type="button" className="secondary" onClick={() => setTab("apply")}>Kembali</button>
              <button type="submit" className="primary" disabled={busy}>{editingId ? "Simpan perubahan" : "Buat paket"}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
