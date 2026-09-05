import { useEffect, useRef, useState } from "react";
import { FileText, Plus, Download, Trash2, FolderOpen, FolderPlus, X, Image as ImageIcon } from "lucide-react";
import { client, fileUrl, formatSize, timeAgo, isImageFile } from "../lib/api";
import { useConfirm } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";

const isPdf = name => /\.pdf$/i.test(name || "");

export function Documents({ team, currentUser, myRole }) {
  const [items, setItems] = useState([]);
  const [folder, setFolder] = useState("");
  const [draftFolder, setDraftFolder] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  const confirm = useConfirm();

  const load = () => client.get(`/teams/${team.id}/documents`).then(r => setItems(r.data));
  useEffect(() => { load(); setFolder(""); }, [team.id]);

  const folders = [...new Set(items.filter(d => !d.task_id && d.folder).map(d => d.folder))].sort();
  const filtered = items.filter(d => {
    if (!folder) return true;
    if (folder === "__tasks__") return !!d.task_id;
    if (folder === "__none__") return !d.task_id && !d.folder;
    return !d.task_id && d.folder === folder;
  });

  const upload = async files => {
    const dest = folder && !folder.startsWith("__") ? folder : "";
    for (const file of files) {
      const fd = new FormData(); fd.append("file", file);
      const qs = new URLSearchParams({ team_id: team.id, kind: "document" });
      if (dest) qs.set("folder", dest);
      await client.post(`/files/upload?${qs}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    }
    load();
  };

  const canDelete = d => d.task_id ? true : (d.uploaded_by === currentUser.id || myRole === "admin");
  const remove = async d => {
    const ok = await confirm({ title: `Hapus "${d.filename}"?`, body: "Berkas ini akan dihapus dari tim.", confirmLabel: "Hapus", danger: true });
    if (!ok) return;
    if (d.task_id) await client.delete(`/tasks/${d.task_id}/attachments/${d.file_id}`);
    else await client.delete(`/documents/${d.id}`);
    if (preview?.id === d.id) setPreview(null);
    load();
  };
  const moveTo = async (d, nextFolder) => {
    if (d.task_id) return;
    await client.patch(`/documents/${d.id}`, { folder: nextFolder });
    load();
  };
  const addFolder = () => {
    const name = draftFolder.trim();
    if (!name) return;
    setFolder(name);
    setDraftFolder("");
    setCreatingFolder(false);
  };
  const openPreview = d => {
    if (isImageFile(d.filename) || isPdf(d.filename)) setPreview(d);
    else window.open(fileUrl(d.file_id), "_blank");
  };

  return (
    <div className="page docs-page">
      <div className="page-heading">
        <div><h1>Dokumen</h1><p className="muted">Berkas tim, terkelompok per folder. Klik gambar atau PDF untuk pratinjau.</p></div>
        <button className="primary" onClick={() => inputRef.current.click()} data-testid="upload-document-button"><Plus size={16} /> Unggah File</button>
        <input ref={inputRef} type="file" multiple hidden onChange={e => upload(e.target.files)} data-testid="document-file-input" />
      </div>
      <div className="docs-layout">
        <aside className="docs-folders">
          <button className={!folder ? "active" : ""} onClick={() => setFolder("")}>Semua</button>
          <button className={folder === "__none__" ? "active" : ""} onClick={() => setFolder("__none__")}>Tanpa folder</button>
          <button className={folder === "__tasks__" ? "active" : ""} onClick={() => setFolder("__tasks__")}>Lampiran tugas</button>
          {folders.map(f => (
            <button key={f} className={folder === f ? "active" : ""} onClick={() => setFolder(f)}><FolderOpen size={13} /> {f}</button>
          ))}
          {folder && !folder.startsWith("__") && !folders.includes(folder) && (
            <button className="active"><FolderOpen size={13} /> {folder}</button>
          )}
          {creatingFolder ? (
            <div className="docs-new-folder">
              <input autoFocus value={draftFolder} onChange={e => setDraftFolder(e.target.value)} onKeyDown={e => e.key === "Enter" && addFolder()} placeholder="Nama folder" />
              <button className="primary" onClick={addFolder}>Buat</button>
            </div>
          ) : (
            <button className="docs-add-folder" onClick={() => setCreatingFolder(true)} data-testid="create-folder-button"><FolderPlus size={13} /> Folder baru</button>
          )}
        </aside>
        <div className="documents-list" data-testid="documents-list">
          {filtered.map(d => (
            <div className="document-row" key={d.id} data-testid={`document-${d.id}`}>
              {isImageFile(d.filename) ? <ImageIcon size={18} /> : <FileText size={18} />}
              <button className="docs-open" onClick={() => openPreview(d)}>
                <b>{d.filename}</b>
                <small>{formatSize(d.size)} · {d.uploaded_by_name} · {timeAgo(d.created_at)}{d.task_title ? ` · dari tugas "${d.task_title}"` : d.folder ? ` · ${d.folder}` : ""}</small>
              </button>
              {!d.task_id && (
                <select className="docs-move" value={d.folder || ""} onChange={e => moveTo(d, e.target.value)} title="Pindahkan folder">
                  <option value="">Tanpa folder</option>
                  {folders.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              )}
              <a href={fileUrl(d.file_id)} target="_blank" rel="noreferrer" data-testid={`download-document-${d.id}`}><Download size={15} /></a>
              {canDelete(d) && <button className="icon-button" onClick={() => remove(d)} data-testid={`delete-document-${d.id}`}><Trash2 size={15} /></button>}
            </div>
          ))}
          {!filtered.length && (
            <EmptyState
              icon={<FolderOpen size={22} />}
              title="Belum ada dokumen"
              body="Unggah berkas tim, atau lampirkan file di tugas — semuanya akan terkumpul di sini."
              action={<button className="primary" onClick={() => inputRef.current.click()}><Plus size={16} /> Unggah file pertama</button>}
            />
          )}
        </div>
      </div>
      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)} data-testid="document-preview">
          <section className="modal docs-preview" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h2>{preview.filename}</h2><button className="icon-button" onClick={() => setPreview(null)}><X size={18} /></button></div>
            {isImageFile(preview.filename)
              ? <img src={fileUrl(preview.file_id)} alt={preview.filename} />
              : <iframe title={preview.filename} src={fileUrl(preview.file_id)} />}
          </section>
        </div>
      )}
    </div>
  );
}
