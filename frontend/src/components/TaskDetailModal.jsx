import { useEffect, useRef, useState } from "react";
import { X, Plus, Paperclip, CheckSquare, Tag, CalendarClock, Repeat, Image as ImageIcon, ArrowRightLeft, Copy, Lock, Unlock, Archive, Trash2, MessageCircle, Download, FileText, UserPlus, Pencil, ShieldCheck } from "lucide-react";
import { client, apiError, fileUrl, formatSize, timeAgo, shortDate, LABEL_COLORS } from "../lib/api";
import { Avatar } from "./Avatar";
import { MentionBox } from "./MentionBox";
import { MentionText } from "./MentionText";
import { RichTextEditor, sanitizeNotesHtml } from "./RichTextEditor";
import { CopyMoveModal } from "./CopyMoveModal";
import { useConfirm } from "./ConfirmDialog";

export const REPEAT_LABELS = { none: "Tidak berulang", daily: "Harian", weekly: "Mingguan", monthly: "Bulanan" };

export function TaskDetailModal({ task: initialTask, team, teams, lists, members, teamLabels, onLabelCreated, myRole, currentUser, onClose, onReload }) {
  const [task, setTask] = useState(initialTask);
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [panel, setPanel] = useState(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [title, setTitle] = useState(initialTask.title);
  const [checklistText, setChecklistText] = useState("");
  const [subDraft, setSubDraft] = useState({});
  const [labelDraft, setLabelDraft] = useState("");
  const [renamingLabel, setRenamingLabel] = useState(null);
  const [renameText, setRenameText] = useState("");
  const [confirmDeleteLabel, setConfirmDeleteLabel] = useState(null);
  const [showChecklist, setShowChecklist] = useState((initialTask.checklist || []).length > 0);
  const [error, setError] = useState("");
  const [assigneePickerFor, setAssigneePickerFor] = useState(null);
  const [datePickerFor, setDatePickerFor] = useState(null);
  const [dateDraft, setDateDraft] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemText, setEditingItemText] = useState("");
  const [attachingItemId, setAttachingItemId] = useState(null);
  const [copyMoveMode, setCopyMoveMode] = useState(null);
  const attachInput = useRef(null);
  const coverInput = useRef(null);
  const checklistAttachInput = useRef(null);
  const dirtyRef = useRef(false);
  const confirm = useConfirm();

  useEffect(() => {
    client.get(`/tasks/${task.id}/comments`).then(r => setComments(r.data));
    client.get(`/tasks/${task.id}/activity`).then(r => setActivity(r.data || [])).catch(() => setActivity([]));
  }, [task.id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const list = lists.find(l => l.id === task.list_id);

  const patch = async (data) => {
    dirtyRef.current = true;
    try { const r = await client.patch(`/tasks/${task.id}`, data); setTask(r.data); }
    catch (e) { setError(apiError(e)); }
  };

  const close = () => { onClose(); if (dirtyRef.current) onReload(); };

  const toggleDatePanel = () => {
    if (panel === "date") { setPanel(null); return; }
    setDateDraft({
      startEnabled: !!task.start_date, start_date: task.start_date || "",
      dueEnabled: !!task.due_date, due_date: task.due_date || "", due_time: task.due_time || "",
    });
    setPanel("date");
  };
  const saveDates = async () => {
    await patch({
      start_date: dateDraft.startEnabled ? (dateDraft.start_date || null) : null,
      due_date: dateDraft.dueEnabled ? (dateDraft.due_date || null) : null,
      due_time: dateDraft.dueEnabled ? (dateDraft.due_time || null) : null,
    });
    setPanel(null);
  };
  const clearDates = async () => {
    await patch({ start_date: null, due_date: null, due_time: null });
    setPanel(null);
  };

  const toggleAssignee = (id) => {
    const current = task.assignees || [];
    patch({ assignees: current.includes(id) ? current.filter(x => x !== id) : [...current, id] });
  };

  const toggleComplete = () => {
    if (list?.is_done) {
      const target = lists.find(l => !l.is_done) || lists[0];
      if (target) patch({ list_id: target.id });
    } else {
      const done = lists.find(l => l.is_done);
      if (done) patch({ list_id: done.id });
    }
  };
  const saveNotes = (html) => { if (html !== (task.description || "")) patch({ description: html }); };
  const saveTitle = () => { if (title.trim() && title !== task.title) patch({ title: title.trim() }); };

  const handleUpload = async (files, kind) => {
    for (const file of files) {
      const fd = new FormData(); fd.append("file", file);
      try {
        const r = await client.post(`/files/upload?team_id=${team.id}&task_id=${task.id}&kind=${kind}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        dirtyRef.current = true;
        if (kind === "cover") setTask(t => ({ ...t, cover: r.data.id }));
        else setTask(t => ({ ...t, attachments: [...(t.attachments || []), r.data] }));
      } catch (e) { setError(apiError(e)); }
    }
  };

  const removeAttachment = async (id) => {
    await client.delete(`/tasks/${task.id}/attachments/${id}`);
    dirtyRef.current = true;
    setTask(t => ({ ...t, attachments: (t.attachments || []).filter(a => a.id !== id) }));
  };

  const addChecklistItem = () => {
    if (!checklistText.trim()) return;
    const items = [...(task.checklist || []), { id: Date.now().toString(), text: checklistText.trim(), done: false }];
    setChecklistText("");
    patch({ checklist: items });
  };
  const toggleChecklistItem = (id) => patch({ checklist: (task.checklist || []).map(c => c.id === id ? { ...c, done: !c.done } : c) });
  const removeChecklistItem = (id) => patch({ checklist: (task.checklist || []).filter(c => c.id !== id) });
  const addSubItem = (parentId) => {
    const text = (subDraft[parentId] || "").trim();
    if (!text) return;
    const sub = { id: Date.now().toString(), text, done: false };
    patch({ checklist: (task.checklist || []).map(c => c.id === parentId ? { ...c, subitems: [...(c.subitems || []), sub] } : c) });
    setSubDraft(d => ({ ...d, [parentId]: "" }));
  };
  const toggleSubItem = (parentId, subId) => patch({
    checklist: (task.checklist || []).map(c => c.id === parentId
      ? { ...c, subitems: (c.subitems || []).map(s => s.id === subId ? { ...s, done: !s.done } : s) } : c)
  });
  const removeSubItem = (parentId, subId) => patch({
    checklist: (task.checklist || []).map(c => c.id === parentId
      ? { ...c, subitems: (c.subitems || []).filter(s => s.id !== subId) } : c)
  });
  const setItemAssignee = (itemId, memberId) => {
    patch({ checklist: (task.checklist || []).map(c => c.id === itemId ? { ...c, assignee_id: memberId || null } : c) });
    setAssigneePickerFor(null);
  };
  const setItemDueDate = (itemId, date) => {
    patch({ checklist: (task.checklist || []).map(c => c.id === itemId ? { ...c, due_date: date || null } : c) });
  };
  const duplicateChecklistItem = (item) => {
    const clone = { ...item, id: Date.now().toString(), done: false };
    const items = [...(task.checklist || [])];
    items.splice(items.findIndex(c => c.id === item.id) + 1, 0, clone);
    patch({ checklist: items });
  };
  const startEditItem = (item) => { setEditingItemId(item.id); setEditingItemText(item.text); };
  const saveEditItem = () => {
    if (editingItemText.trim()) patch({ checklist: (task.checklist || []).map(c => c.id === editingItemId ? { ...c, text: editingItemText.trim() } : c) });
    setEditingItemId(null);
  };
  const openChecklistAttach = (itemId) => { setAttachingItemId(itemId); checklistAttachInput.current?.click(); };
  const uploadChecklistAttachment = async (file) => {
    if (!file || !attachingItemId) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await client.post(`/files/upload?team_id=${team.id}&task_id=${task.id}&kind=attachment`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      dirtyRef.current = true;
      patch({ checklist: (task.checklist || []).map(c => c.id === attachingItemId ? { ...c, attachment: { id: r.data.id, filename: r.data.filename } } : c) });
    } catch (e) { setError(apiError(e)); }
    setAttachingItemId(null);
  };

  const sendComment = async (body, mentions) => {
    const r = await client.post(`/tasks/${task.id}/comments`, { body, mentions });
    setComments(c => [...c, r.data]);
    client.get(`/tasks/${task.id}/activity`).then(x => setActivity(x.data || [])).catch(() => {});
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
  const startRenameLabel = (l) => { setRenamingLabel(l.id); setRenameText(l.name); };
  const saveRenameLabel = async () => {
    if (renameText.trim()) { await client.patch(`/labels/${renamingLabel}`, { name: renameText.trim() }); dirtyRef.current = true; onReload(); }
    setRenamingLabel(null);
  };
  const deleteLabel = async (id) => { await client.delete(`/labels/${id}`); dirtyRef.current = true; setConfirmDeleteLabel(null); onReload(); };

  const assignedMembers = members.filter(m => (task.assignees || []).includes(m.id));
  const checklistMainDone = (task.checklist || []).filter(c => c.done).length;
  const checklistMainTotal = (task.checklist || []).length;
  const checklistSubTotal = (task.checklist || []).reduce((s, c) => s + (c.subitems || []).length, 0);
  const checklistSubDone = (task.checklist || []).reduce((s, c) => s + (c.subitems || []).filter(x => x.done).length, 0);
  const checklistDone = checklistMainDone + checklistSubDone;
  const checklistTotal = checklistMainTotal + checklistSubTotal;

  return (
    <div className="modal-backdrop" onClick={close}>
      <section className="task-detail" data-testid="task-detail-modal" onClick={e => e.stopPropagation()}>
        <button className="icon-button td-close" onClick={close} data-testid="close-task-detail-button"><X size={19} /></button>
        {task.cover && (
          <div className="td-cover-wrap">
            <img src={fileUrl(task.cover)} className="td-cover" alt="" />
            <button className="td-cover-remove" onClick={() => patch({ cover: null })} data-testid="remove-cover-button">Hapus cover</button>
          </div>
        )}
        <div className="td-body">
          <div className="td-main">
            <button className={`td-status-dot ${list?.is_done ? "done" : ""}`} onClick={toggleComplete} data-testid="task-complete-toggle" />
            <input className="td-title-input" value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle} data-testid="task-title-input" />
            <p className="td-breadcrumb">di dalam list <b>{list?.name}</b> di <b>{team.name}</b></p>
            <div className="td-creator">
              <Avatar id={task.created_by} name={task.created_by_name} photo={members.find(m => m.id === task.created_by)?.avatar} />
              <div><b>{task.created_by_name}</b><small>{timeAgo(task.created_at)}</small></div>
              <span className="td-access"><ShieldCheck size={14} /> Akses</span>
            </div>

            <div className="td-section">
              <div className="td-section-head"><span>ANGGOTA</span></div>
              <div className="td-avatars">
                {assignedMembers.map(m => <Avatar key={m.id} id={m.id} name={m.name} photo={m.avatar} title={m.name} />)}
                <button className="td-add-avatar" onClick={() => setPanel(panel === "members" ? null : "members")} data-testid="task-add-member-button"><Plus size={13} /></button>
              </div>
              {panel === "members" && (
                <div className="td-panel" data-testid="task-members-panel">
                  {members.map(m => (
                    <label key={m.id} className="td-panel-row">
                      <input type="checkbox" checked={(task.assignees || []).includes(m.id)} onChange={() => toggleAssignee(m.id)} data-testid={`task-member-toggle-${m.id}`} />
                      <Avatar id={m.id} name={m.name} photo={m.avatar} />{m.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="td-section">
              <div className="td-section-head"><span>Catatan</span><button className="notes-edit-button" onClick={() => setEditingNotes(!editingNotes)} data-testid="task-edit-notes-button"><Pencil size={13} /> {editingNotes ? "Selesai" : "Edit"}</button></div>
              {editingNotes ? (
                <RichTextEditor value={task.description || ""} onSave={saveNotes} testId="task-notes-input" />
              ) : task.description ? (
                <div className="td-notes" data-testid="task-notes-text" dangerouslySetInnerHTML={{ __html: sanitizeNotesHtml(task.description) }} />
              ) : (
                <p className="td-notes muted" data-testid="task-notes-text">Belum ada catatan.</p>
              )}
            </div>

            <div className="td-section">
              <div className="td-section-head"><span>Lampiran</span><button className="icon-button" onClick={() => attachInput.current.click()} data-testid="task-add-attachment-button"><Plus size={14} /></button></div>
              <input ref={attachInput} type="file" multiple hidden onChange={e => handleUpload(e.target.files, "attachment")} data-testid="task-attachment-file-input" />
              <div className="td-dropzone" onClick={() => attachInput.current.click()}
                onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files, "attachment"); }} data-testid="task-attachment-dropzone">
                Klik atau lepaskan file disini untuk mengunggah
              </div>
              {!!(task.attachments || []).length && (
                <div className="td-attachments" data-testid="task-attachments-list">
                  {task.attachments.map(a => (
                    <div className="td-attachment" key={a.id} data-testid={`task-attachment-${a.id}`}>
                      <FileText size={15} />
                      <div><b>{a.filename}</b><small>{formatSize(a.size)}</small></div>
                      <a href={fileUrl(a.id)} target="_blank" rel="noreferrer" data-testid={`download-attachment-${a.id}`}><Download size={14} /></a>
                      <button onClick={() => removeAttachment(a.id)} data-testid={`remove-attachment-${a.id}`}><X size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {showChecklist && (
              <div className="td-section">
                <div className="td-section-head"><span>Ceklis</span><small data-testid="checklist-progress-count">{checklistDone}/{checklistTotal}{checklistTotal > 0 ? ` · ${Math.round((checklistDone / checklistTotal) * 100)}%` : ""}</small></div>
                {checklistTotal > 0 && <div className="td-progress" data-testid="checklist-progress-bar"><div style={{ width: `${(checklistDone / checklistTotal) * 100}%` }} /></div>}
                <input ref={checklistAttachInput} type="file" hidden onChange={e => uploadChecklistAttachment(e.target.files[0])} data-testid="checklist-attachment-file-input" />
                {(task.checklist || []).map(c => {
                  const itemAssignee = members.find(m => m.id === c.assignee_id);
                  const itemOverdue = c.due_date && !c.done && c.due_date < new Date().toISOString().slice(0, 10);
                  return (
                  <div key={c.id} className="td-checklist-group" data-testid={`checklist-group-${c.id}`}>
                    <label className="td-checklist-item" data-testid={`checklist-item-${c.id}`}>
                      <input type="checkbox" checked={c.done} onChange={() => toggleChecklistItem(c.id)} data-testid={`checklist-toggle-${c.id}`} />
                      {editingItemId === c.id ? (
                        <input autoFocus className="td-item-edit-input" value={editingItemText} onChange={e => setEditingItemText(e.target.value)}
                          onBlur={saveEditItem} onKeyDown={e => e.key === "Enter" && saveEditItem()} data-testid={`checklist-edit-input-${c.id}`} />
                      ) : (
                        <span className={c.done ? "done" : ""}>{c.text}</span>
                      )}
                      <div className="td-item-meta">
                        {itemAssignee && <Avatar id={itemAssignee.id} name={itemAssignee.name} photo={itemAssignee.avatar} className="tiny" title={itemAssignee.name} />}
                        {c.due_date && <span className={`td-item-due ${itemOverdue ? "overdue" : ""}`}>{shortDate(c.due_date)}</span>}
                        {c.attachment && <a className="td-item-attach" href={fileUrl(c.attachment.id)} target="_blank" rel="noreferrer" title={c.attachment.filename}><Paperclip size={11} /></a>}
                      </div>
                      <div className="td-item-tools">
                        <button type="button" onClick={() => setAssigneePickerFor(assigneePickerFor === c.id ? null : c.id)} data-testid={`checklist-assign-${c.id}`}><UserPlus size={13} /></button>
                        <button type="button" onClick={() => openChecklistAttach(c.id)} data-testid={`checklist-attach-${c.id}`}><Paperclip size={13} /></button>
                        <button type="button" onClick={() => setDatePickerFor(datePickerFor === c.id ? null : c.id)} data-testid={`checklist-date-${c.id}`}><CalendarClock size={13} /></button>
                        <button type="button" onClick={() => duplicateChecklistItem(c)} data-testid={`checklist-duplicate-${c.id}`}><Copy size={13} /></button>
                        <button type="button" onClick={() => startEditItem(c)} data-testid={`checklist-edit-${c.id}`}><Pencil size={13} /></button>
                        <button type="button" onClick={() => removeChecklistItem(c.id)} data-testid={`checklist-remove-${c.id}`}><Trash2 size={13} /></button>
                      </div>
                    </label>
                    {assigneePickerFor === c.id && (
                      <div className="td-item-picker" data-testid={`checklist-assign-picker-${c.id}`}>
                        {members.map(m => (
                          <button type="button" key={m.id} onClick={() => setItemAssignee(c.id, m.id)} data-testid={`checklist-assign-option-${c.id}-${m.id}`}>
                            <Avatar id={m.id} name={m.name} photo={m.avatar} className="tiny" /> {m.name}
                          </button>
                        ))}
                        {c.assignee_id && <button type="button" className="danger" onClick={() => setItemAssignee(c.id, null)} data-testid={`checklist-assign-clear-${c.id}`}>Hapus penugasan</button>}
                      </div>
                    )}
                    {datePickerFor === c.id && (
                      <div className="td-item-picker">
                        <input type="date" value={c.due_date || ""} onChange={e => setItemDueDate(c.id, e.target.value)} data-testid={`checklist-date-input-${c.id}`} />
                        {c.due_date && <button type="button" className="danger" onClick={() => setItemDueDate(c.id, null)} data-testid={`checklist-date-clear-${c.id}`}>Hapus tanggal</button>}
                      </div>
                    )}
                    {!!(c.subitems || []).length && (
                      <div className="td-subchecklist" data-testid={`subchecklist-${c.id}`}>
                        {c.subitems.map(s => (
                          <label className="td-checklist-item td-sub-item" key={s.id} data-testid={`subchecklist-item-${s.id}`}>
                            <input type="checkbox" checked={s.done} onChange={() => toggleSubItem(c.id, s.id)} data-testid={`subchecklist-toggle-${s.id}`} />
                            <span className={s.done ? "done" : ""}>{s.text}</span>
                            <button onClick={() => removeSubItem(c.id, s.id)} data-testid={`subchecklist-remove-${s.id}`}><X size={11} /></button>
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="td-checklist-add td-sub-add">
                      <input value={subDraft[c.id] || ""} onChange={e => setSubDraft(d => ({ ...d, [c.id]: e.target.value }))}
                        placeholder="Tambah sub-item…" onKeyDown={e => e.key === "Enter" && addSubItem(c.id)}
                        data-testid={`subchecklist-new-item-input-${c.id}`} />
                      <button className="secondary" onClick={() => addSubItem(c.id)} data-testid={`subchecklist-add-button-${c.id}`}>+</button>
                    </div>
                  </div>
                  );
                })}
                <div className="td-checklist-add">
                  <input value={checklistText} onChange={e => setChecklistText(e.target.value)} placeholder="Tambah item…" onKeyDown={e => e.key === "Enter" && addChecklistItem()} data-testid="checklist-new-item-input" />
                  <button className="secondary" onClick={addChecklistItem} data-testid="checklist-add-button">Tambah</button>
                </div>
              </div>
            )}

            <div className="td-section td-comments" data-testid="task-comments">
              <div className="td-section-head"><MessageCircle size={15} /><span>Komentar & Aktifitas</span><small>{comments.length}</small></div>
              {comments.map(c => (
                <div className="comment" key={c.id} data-testid={`comment-${c.id}`}>
                  <Avatar id={c.author_id} name={c.author} photo={members.find(m => m.id === c.author_id)?.avatar} />
                  <p><b>{c.author}</b><MentionText body={c.body} mentionIds={c.mentions} members={members} /><small>{timeAgo(c.created_at)}</small></p>
                </div>
              ))}
              <MentionBox members={members} onSend={sendComment} placeholder="Tulis komentar, ketik @ untuk menandai anggota…" testId="comment-input" />
              {!!activity.length && (
                <div className="td-activity" data-testid="task-activity">
                  {activity.map(a => (
                    <p key={a.id} className="td-activity-row">
                      <b>{a.user_name}</b> {a.detail || a.action} <small>{timeAgo(a.created_at)}</small>
                    </p>
                  ))}
                </div>
              )}
            </div>
            {error && <div className="error" data-testid="task-detail-error">{error}</div>}
          </div>

          <aside className="td-sidebar">
            <p className="td-sidebar-label">KELOLA TUGAS</p>
            <button className="td-sidebar-btn" onClick={() => setPanel(panel === "members" ? null : "members")} data-testid="sidebar-anggota-button"><UserPlus size={14} /> Anggota</button>
            <button className="td-sidebar-btn" onClick={() => setPanel(panel === "label" ? null : "label")} data-testid="sidebar-label-button"><Tag size={14} /> Label</button>
            <button className="td-sidebar-btn" onClick={toggleDatePanel} data-testid="sidebar-tanggal-button"><CalendarClock size={14} /> Tanggal</button>
            <button className="td-sidebar-btn" onClick={() => setPanel(panel === "repeat" ? null : "repeat")} data-testid="sidebar-ulangi-button"><Repeat size={14} /> Ulangi</button>
            <button className="td-sidebar-btn" onClick={() => setShowChecklist(true)} data-testid="sidebar-ceklis-button"><CheckSquare size={14} /> Ceklis</button>
            <button className="td-sidebar-btn" onClick={() => attachInput.current.click()} data-testid="sidebar-upload-button"><Paperclip size={14} /> Unggah File</button>
            <button className="td-sidebar-btn" onClick={() => coverInput.current.click()} data-testid="sidebar-cover-button"><ImageIcon size={14} /> Cover</button>
            <input ref={coverInput} type="file" hidden onChange={e => handleUpload(e.target.files, "cover")} data-testid="task-cover-file-input" />

            {panel === "label" && (
              <div className="td-panel" data-testid="label-panel">
                <div className="td-label-chips">
                  {(teamLabels || []).map(l => {
                    const active = (task.labels || []).includes(l.id);
                    if (renamingLabel === l.id) {
                      return (
                        <div key={l.id} className="td-label-row td-label-rename-row">
                          <input autoFocus value={renameText} onChange={e => setRenameText(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && saveRenameLabel()} onBlur={saveRenameLabel}
                            data-testid={`rename-label-input-${l.id}`} />
                        </div>
                      );
                    }
                    if (confirmDeleteLabel === l.id) {
                      return (
                        <div key={l.id} className="td-label-row td-label-confirm-row">
                          <span className="small">Hapus "{l.name}" dari semua tugas?</span>
                          <button type="button" className="td-label-icon danger" onClick={() => deleteLabel(l.id)} data-testid={`confirm-delete-team-label-${l.id}`}>Ya</button>
                          <button type="button" className="td-label-icon" onClick={() => setConfirmDeleteLabel(null)} data-testid={`cancel-delete-team-label-${l.id}`}>Batal</button>
                        </div>
                      );
                    }
                    return (
                      <div key={l.id} className="td-label-row">
                        <button type="button" className={`td-label-toggle ${active ? "active" : ""}`}
                          style={{ background: l.color + "22", color: l.color, borderColor: active ? l.color : "transparent" }}
                          onClick={() => patch({ labels: active ? (task.labels || []).filter(id => id !== l.id) : [...(task.labels || []), l.id] })}
                          data-testid={`team-label-${l.id}`}>{l.name}</button>
                        {myRole === "admin" && (
                          <>
                            <button type="button" className="td-label-icon" onClick={() => startRenameLabel(l)} data-testid={`rename-team-label-${l.id}`}><Pencil size={11} /></button>
                            <button type="button" className="td-label-icon" onClick={() => setConfirmDeleteLabel(l.id)} data-testid={`delete-team-label-${l.id}`}><Trash2 size={11} /></button>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {!(teamLabels || []).length && <p className="muted small">Belum ada label tim.</p>}
                </div>
                {myRole === "admin" && (
                  <>
                    <input value={labelDraft} onChange={e => setLabelDraft(e.target.value)} placeholder="Buat label baru untuk tim" data-testid="label-name-input" />
                    <div className="td-label-swatches">
                      {LABEL_COLORS.map(c => (
                        <button key={c} style={{ background: c }} onClick={async () => {
                          if (!labelDraft.trim()) return;
                          const r = await client.post(`/teams/${team.id}/labels`, { name: labelDraft.trim(), color: c });
                          onLabelCreated?.(r.data);
                          patch({ labels: [...(task.labels || []), r.data.id] });
                          setLabelDraft("");
                        }} data-testid={`label-swatch-${c}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {panel === "date" && dateDraft && (
              <div className="td-panel td-date-panel" data-testid="date-panel">
                <p className="td-panel-title">Ubah Tanggal</p>
                <label className="td-panel-row">
                  <input type="checkbox" checked={dateDraft.startEnabled} onChange={e => setDateDraft(d => ({ ...d, startEnabled: e.target.checked }))} data-testid="start-date-toggle" />
                  Tanggal Mulai
                </label>
                {dateDraft.startEnabled && (
                  <input type="date" value={dateDraft.start_date} onChange={e => setDateDraft(d => ({ ...d, start_date: e.target.value }))} data-testid="start-date-input" />
                )}
                <label className="td-panel-row">
                  <input type="checkbox" checked={dateDraft.dueEnabled} onChange={e => setDateDraft(d => ({ ...d, dueEnabled: e.target.checked }))} data-testid="due-date-toggle" />
                  Tenggat
                </label>
                {dateDraft.dueEnabled && (
                  <div className="td-date-fields">
                    <input type="date" value={dateDraft.due_date} onChange={e => setDateDraft(d => ({ ...d, due_date: e.target.value }))} data-testid="task-due-date-input" />
                    <input type="time" value={dateDraft.due_time} onChange={e => setDateDraft(d => ({ ...d, due_time: e.target.value }))} data-testid="task-due-time-input" />
                  </div>
                )}
                <div className="td-date-actions">
                  <button className="primary" onClick={saveDates} data-testid="save-date-button">Simpan</button>
                  <button className="btn-danger" onClick={clearDates} data-testid="clear-due-date-button">Hapus</button>
                </div>
              </div>
            )}
            {panel === "repeat" && (
              <div className="td-panel" data-testid="repeat-panel">
                <select value={task.repeat} onChange={e => patch({ repeat: e.target.value })} data-testid="task-repeat-select">
                  {Object.entries(REPEAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}

            <p className="td-sidebar-label">AKSI</p>
            <button className="td-sidebar-btn" onClick={() => setCopyMoveMode("move")} data-testid="sidebar-pindahkan-button"><ArrowRightLeft size={14} /> Pindahkan</button>
            <button className="td-sidebar-btn" onClick={() => setCopyMoveMode("copy")} data-testid="sidebar-salin-button"><Copy size={14} /> Salin</button>
            <button className="td-sidebar-btn" onClick={togglePrivate} data-testid="sidebar-rahasiakan-button">{task.is_private ? <Unlock size={14} /> : <Lock size={14} />} {task.is_private ? "Publikasikan" : "Rahasiakan"}</button>
            <button className="td-sidebar-btn" onClick={archiveTask} data-testid="sidebar-arsipkan-button"><Archive size={14} /> Arsipkan</button>
            <button className="td-sidebar-btn danger" onClick={deleteTask} data-testid="delete-task-button"><Trash2 size={14} /> Hapus Tugas</button>
          </aside>
        </div>
      </section>
      {copyMoveMode && (
        <CopyMoveModal task={task} teams={teams} mode={copyMoveMode} onClose={() => setCopyMoveMode(null)}
          onDone={() => { dirtyRef.current = true; setCopyMoveMode(null); if (copyMoveMode === "move") close(); else onReload(); }} />
      )}
    </div>
  );
}
