import { useEffect, useRef, useState } from "react";
import { FileText, Plus, Download, Trash2 } from "lucide-react";
import { client, fileUrl, formatSize, timeAgo } from "../lib/api";

export function Documents({ team, currentUser, myRole }) {
  const [items, setItems] = useState([]);
  const inputRef = useRef(null);

  const load = () => client.get(`/teams/${team.id}/documents`).then(r => setItems(r.data));
  useEffect(() => { load(); }, [team.id]);

  const upload = async files => {
    for (const file of files) {
      const fd = new FormData(); fd.append("file", file);
      await client.post(`/files/upload?team_id=${team.id}&kind=document`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    }
    load();
  };

  const canDelete = d => d.task_id ? true : (d.uploaded_by === currentUser.id || myRole === "admin");
  const remove = async d => {
    if (!window.confirm(`Hapus "${d.filename}"?`)) return;
    if (d.task_id) await client.delete(`/tasks/${d.task_id}/attachments/${d.file_id}`);
    else await client.delete(`/documents/${d.id}`);
    load();
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div><p className="eyebrow">DOKUMEN & FILE</p><h1>Dokumen & File</h1><p className="muted">Semua berkas tim, termasuk lampiran dari tugas.</p></div>
        <button className="primary" onClick={() => inputRef.current.click()} data-testid="upload-document-button"><Plus size={16} /> Unggah File</button>
        <input ref={inputRef} type="file" multiple hidden onChange={e => upload(e.target.files)} data-testid="document-file-input" />
      </div>
      <div className="documents-list" data-testid="documents-list">
        {items.map(d => (
          <div className="document-row" key={d.id} data-testid={`document-${d.id}`}>
            <FileText size={18} />
            <div><b>{d.filename}</b><small>{formatSize(d.size)} · {d.uploaded_by_name} · {timeAgo(d.created_at)}{d.task_title ? ` · dari tugas "${d.task_title}"` : ""}</small></div>
            <a href={fileUrl(d.file_id)} target="_blank" rel="noreferrer" data-testid={`download-document-${d.id}`}><Download size={15} /></a>
            {canDelete(d) && <button className="icon-button" onClick={() => remove(d)} data-testid={`delete-document-${d.id}`}><Trash2 size={15} /></button>}
          </div>
        ))}
        {!items.length && <p className="muted">Belum ada dokumen.</p>}
      </div>
    </div>
  );
}
