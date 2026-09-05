import { useRef, useState } from "react";
import { X, ArrowRightLeft, Copy, MessageCircle, UserPlus, Tag, CalendarClock, Repeat, FileText, Pencil, Paperclip, Lock, Unlock, Archive, Trash2 } from "lucide-react";
import { client, apiError } from "../lib/api";
import { Avatar } from "./Avatar";
import { MentionBox } from "./MentionBox";
import { RichTextEditor } from "./RichTextEditor";
import { CopyMoveModal } from "./CopyMoveModal";
import { REPEAT_LABELS } from "./TaskDetailModal";
import { useConfirm } from "./ConfirmDialog";

export function TaskQuickMenu({ task: initialTask, team, teams, members, teamLabels, myRole, onClose, onReload }) {
  const [task, setTask] = useState(initialTask);
  const [panel, setPanel] = useState(null);
  const [copyMoveMode, setCopyMoveMode] = useState(null);
  const [titleDraft, setTitleDraft] = useState(initialTask.title);
  const [error, setError] = useState("");
  const dirtyRef = useRef(false);
  const fileInput = useRef(null);
  const isAdmin = myRole === "admin";
  const confirm = useConfirm();

  const patch = async (data) => {
    dirtyRef.current = true;
    try { const r = await client.patch(`/tasks/${task.id}`, data); setTask(r.data); }
    catch (e) { setError(apiError(e)); }
  };

  const close = () => { onClose(); if (dirtyRef.current) onReload(); };

  const toggleAssignee = (id) => {
    const current = task.assignees || [];
    patch({ assignees: current.includes(id) ? current.filter(x => x !== id) : [...current, id] });
  };
  const toggleLabel = (id) => {
    const current = task.labels || [];
    patch({ labels: current.includes(id) ? current.filter(x => x !== id) : [...current, id] });
  };
  const saveTitle = () => { if (titleDraft.trim() && titleDraft !== task.title) patch({ title: titleDraft.trim() }); setPanel(null); };
  const saveNotes = (html) => { if (html !== (task.description || "")) patch({ description: html }); };
  const sendComment = async (body, mentions) => {
    await client.post(`/tasks/${task.id}/comments`, { body, mentions });
    dirtyRef.current = true;
    setPanel(null);
  };
  const handleUpload = async (files) => {
    for (const file of files) {
      const fd = new FormData(); fd.append("file", file);
      try {
        const r = await client.post(`/files/upload?team_id=${team.id}&task_id=${task.id}&kind=file`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        dirtyRef.current = true;
        setTask(t => ({ ...t, attachments: [...(t.attachments || []), r.data] }));
      } catch (e) { setError(apiError(e)); }
    }
  };
  const togglePrivate = () => patch({ is_private: !task.is_private });
  const archiveTask = async () => { await patch({ archived: true }); close(); };
  const deleteTask = async () => {
    const ok = await confirm({ title: "Hapus tugas ini?", body: "Tugas akan dihapus secara permanen.", confirmLabel: "Hapus tugas", danger: true });
    if (!ok) return;
    await client.delete(`/tasks/${task.id}`);
    dirtyRef.current = true;
    close();
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <section className="modal task-quick-menu" onClick={e => e.stopPropagation()} data-testid="task-quick-menu">
        <div className="modal-head"><h2>{task.title}</h2><button className="icon-button" onClick={close} data-testid="close-quick-menu"><X size={18} /></button></div>

        <button className="td-sidebar-btn" onClick={() => setCopyMoveMode("move")} data-testid="quick-move-button"><ArrowRightLeft size={14} /> Pindah Tugas</button>
        <button className="td-sidebar-btn" onClick={() => setCopyMoveMode("copy")} data-testid="quick-copy-button"><Copy size={14} /> Salin Tugas</button>

        <button className="td-sidebar-btn" onClick={() => setPanel(panel === "comment" ? null : "comment")} data-testid="quick-comment-button"><MessageCircle size={14} /> Beri Komentar</button>
        {panel === "comment" && (
          <div className="td-panel" data-testid="quick-comment-panel">
            <MentionBox members={members} onSend={sendComment} placeholder="Tulis komentar, ketik @ untuk menandai anggota…" testId="quick-comment-input" />
          </div>
        )}

        <button className="td-sidebar-btn" onClick={() => setPanel(panel === "members" ? null : "members")} data-testid="quick-members-button"><UserPlus size={14} /> Ubah Anggota</button>
        {panel === "members" && (
          <div className="td-panel" data-testid="quick-members-panel">
            {members.map(m => (
              <label className="td-panel-row" key={m.id}>
                <input type="checkbox" checked={(task.assignees || []).includes(m.id)} onChange={() => toggleAssignee(m.id)} data-testid={`quick-assignee-${m.id}`} />
                <Avatar id={m.id} name={m.name} photo={m.avatar} />{m.name}
              </label>
            ))}
            {!members.length && <p className="muted small">Belum ada anggota tim.</p>}
          </div>
        )}

        <button className="td-sidebar-btn" onClick={() => setPanel(panel === "label" ? null : "label")} data-testid="quick-label-button"><Tag size={14} /> Ubah Label</button>
        {panel === "label" && (
          <div className="td-panel" data-testid="quick-label-panel">
            <div className="td-label-chips">
              {(teamLabels || []).map(l => {
                const active = (task.labels || []).includes(l.id);
                return (
                  <button type="button" key={l.id} className={`td-label-toggle ${active ? "active" : ""}`}
                    style={{ background: l.color + "22", color: l.color, borderColor: active ? l.color : "transparent" }}
                    onClick={() => toggleLabel(l.id)} data-testid={`quick-label-${l.id}`}>{l.name}</button>
                );
              })}
              {!(teamLabels || []).length && <p className="muted small">Belum ada label tim.</p>}
            </div>
          </div>
        )}

        <button className="td-sidebar-btn" onClick={() => setPanel(panel === "date" ? null : "date")} data-testid="quick-date-button"><CalendarClock size={14} /> Ubah Tanggal</button>
        {panel === "date" && (
          <div className="td-panel" data-testid="quick-date-panel">
            <input type="date" value={task.due_date || ""} onChange={e => patch({ due_date: e.target.value })} data-testid="quick-due-date-input" />
            {task.due_date && <button className="secondary" onClick={() => patch({ due_date: null })} data-testid="quick-clear-due-date">Hapus tanggal</button>}
          </div>
        )}

        <button className="td-sidebar-btn" onClick={() => setPanel(panel === "repeat" ? null : "repeat")} data-testid="quick-repeat-button"><Repeat size={14} /> Ulangi</button>
        {panel === "repeat" && (
          <div className="td-panel" data-testid="quick-repeat-panel">
            <select value={task.repeat} onChange={e => patch({ repeat: e.target.value })} data-testid="quick-repeat-select">
              {Object.entries(REPEAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        )}

        <button className="td-sidebar-btn" onClick={() => setPanel(panel === "notes" ? null : "notes")} data-testid="quick-notes-button"><FileText size={14} /> Ubah Catatan</button>
        {panel === "notes" && (
          <div className="td-panel" data-testid="quick-notes-panel">
            <RichTextEditor value={task.description} onSave={saveNotes} testId="quick-notes-editor" />
          </div>
        )}

        <button className="td-sidebar-btn" onClick={() => setPanel(panel === "rename" ? null : "rename")} data-testid="quick-rename-button"><Pencil size={14} /> Ubah Nama</button>
        {panel === "rename" && (
          <div className="td-panel" data-testid="quick-rename-panel">
            <input value={titleDraft} onChange={e => setTitleDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && saveTitle()} onBlur={saveTitle} autoFocus data-testid="quick-rename-input" />
          </div>
        )}

        <button className="td-sidebar-btn" onClick={() => fileInput.current.click()} data-testid="quick-upload-button"><Paperclip size={14} /> Unggah File</button>
        <input ref={fileInput} type="file" hidden multiple onChange={e => handleUpload(e.target.files)} data-testid="quick-upload-input" />

        <button className="td-sidebar-btn" onClick={togglePrivate} data-testid="quick-private-button">
          {task.is_private ? <Unlock size={14} /> : <Lock size={14} />} {task.is_private ? "Publikasikan" : "Jadikan Rahasia"}
        </button>
        <button className="td-sidebar-btn" onClick={archiveTask} data-testid="quick-archive-button"><Archive size={14} /> Arsipkan</button>
        {isAdmin && <button className="td-sidebar-btn danger" onClick={deleteTask} data-testid="quick-delete-button"><Trash2 size={14} /> Hapus Tugas</button>}

        {error && <div className="error" data-testid="quick-menu-error">{error}</div>}
      </section>
      {copyMoveMode && (
        <CopyMoveModal task={task} teams={teams} mode={copyMoveMode} onClose={() => setCopyMoveMode(null)}
          onDone={() => { dirtyRef.current = true; setCopyMoveMode(null); if (copyMoveMode === "move") close(); else onReload(); }} />
      )}
    </div>
  );
}
