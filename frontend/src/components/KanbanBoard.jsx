import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Plus, MoreHorizontal, Archive, ArchiveRestore, Trash2, Pencil, Filter, LayoutGrid, List as ListIcon, X, ListTodo, CheckCircle2, Ban } from "lucide-react";
import { client, apiError, shortDate } from "../lib/api";
import { TaskCard } from "./TaskCard";
import { TaskQuickMenu } from "./TaskQuickMenu";
import { useConfirm } from "./ConfirmDialog";
import { Avatar } from "./Avatar";
import { priorityLabel, priorityKey } from "../lib/priority";

export function KanbanBoard({ team, teams, lists, tasks, members, labels, myRole, onOpenTask, onCreateTask, onReload }) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const [localLists, setLocalLists] = useState(lists);
  const [view, setView] = useState(() => { try { return localStorage.getItem(`pmng_view_${team.id}`) || "kanban"; } catch (e) { return "kanban"; } });
  const [sort, setSort] = useState({ key: "due", dir: "asc" });
  const [menuFor, setMenuFor] = useState(null);
  const [quickMenuTask, setQuickMenuTask] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [filters, setFilters] = useState({ priority: "", assignee: "" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [archiveView, setArchiveView] = useState(null);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [archivedLists, setArchivedLists] = useState([]);
  const [error, setError] = useState("");
  const confirm = useConfirm();
  const loadOnboardDismissed = () => { try { return new Set(JSON.parse(localStorage.getItem(`pmng_onboard_${team.id}`) || "[]")); } catch (e) { return new Set(); } };
  const [onboardDismissed, setOnboardDismissed] = useState(loadOnboardDismissed);
  const isAdmin = myRole === "admin";
  const dismissOnboard = (listId) => {
    setOnboardDismissed(prev => { const next = new Set(prev); next.add(listId); try { localStorage.setItem(`pmng_onboard_${team.id}`, JSON.stringify([...next])); } catch (e) { } return next; });
  };
  const showOnboardFor = (list) => byList(list.id).length === 0 && !onboardDismissed.has(list.id);
  const onboardTip = (list) => list.is_done
    ? { title: "Ini kolom tugas selesai", body: "Seret tugas ke sini kalau sudah kelar, atau centang statusnya lewat detail tugas." }
    : list.is_cancelled
    ? { title: "Ini kolom tugas dibatalkan", body: "Seret tugas ke sini kalau tidak jadi dikerjakan." }
    : { title: "Klik [+ Buat Tugas] dan buat tugas pertamamu!", body: "Klik tombol + Buat Tugas, ketik tugas pertamamu, lalu tekan Enter untuk melanjutkan." };

  useEffect(() => { setLocalTasks(tasks); }, [tasks]);
  useEffect(() => { setLocalLists(lists); }, [lists]);
  useEffect(() => { if (!error) return; const t = setTimeout(() => setError(""), 3500); return () => clearTimeout(t); }, [error]);

  const visibleLists = localLists.filter(l => !l.archived).sort((a, b) => a.order - b.order);
  const activeLists = visibleLists.filter(l => !l.is_done && !l.is_cancelled);
  const stageOf = (list) => list.is_done ? "done" : list.is_cancelled ? "cancelled" : activeLists[0]?.id === list.id ? "todo" : "progress";
  const listStageIcon = (list) => list.is_done
    ? <CheckCircle2 size={15} />
    : list.is_cancelled
    ? <Ban size={15} />
    : <ListTodo size={15} />;
  const byList = id => localTasks.filter(t => t.list_id === id && !t.archived
    && (!filters.priority || t.priority === filters.priority)
    && (!filters.assignee || (t.assignees || []).includes(filters.assignee))
  ).sort((a, b) => a.order - b.order);

  const handleTaskDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const moved = localTasks.find(t => t.id === draggableId);
    const rest = localTasks.filter(t => t.id !== draggableId);
    const destTasks = rest.filter(t => t.list_id === destination.droppableId).sort((a, b) => a.order - b.order);
    destTasks.splice(destination.index, 0, { ...moved, list_id: destination.droppableId });
    const reindexed = destTasks.map((t, i) => ({ ...t, order: i }));
    const others = rest.filter(t => t.list_id !== destination.droppableId);
    setLocalTasks([...others, ...reindexed]);
    await Promise.all(reindexed.map(t => client.patch(`/tasks/${t.id}`, { list_id: t.list_id, order: t.order })));
    onReload();
  };

  const handleColumnDragEnd = async (result) => {
    const { source, destination } = result;
    if (!destination || source.index === destination.index) return;
    const reordered = Array.from(visibleLists);
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    const reindexed = reordered.map((l, i) => ({ ...l, order: i }));
    const archived = localLists.filter(l => l.archived);
    setLocalLists([...reindexed, ...archived]);
    await Promise.all(reindexed.map(l => client.patch(`/lists/${l.id}`, { order: l.order })));
    onReload();
  };

  const handleDragEnd = (result) => result.type === "COLUMN" ? handleColumnDragEnd(result) : handleTaskDragEnd(result);
  const setViewPersist = (next) => {
    setView(next);
    try { localStorage.setItem(`pmng_view_${team.id}`, next); } catch (e) { /* ignore */ }
  };
  const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  const tableRows = visibleLists.flatMap(list => byList(list.id).map(t => ({ ...t, listName: list.name, stage: stageOf(list) })));
  const sortedRows = [...tableRows].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    if (sort.key === "title") return a.title.localeCompare(b.title, "id") * dir;
    if (sort.key === "list") return a.listName.localeCompare(b.listName, "id") * dir;
    if (sort.key === "priority") {
      const order = { High: 0, Medium: 1, Low: 2 };
      return ((order[a.priority] ?? 9) - (order[b.priority] ?? 9)) * dir;
    }
    return (a.due_date || "9999").localeCompare(b.due_date || "9999") * dir;
  });

  const createList = async () => {
    if (!newListName.trim()) return;
    try { await client.post(`/teams/${team.id}/lists`, { name: newListName.trim() }); setNewListName(""); setNewListOpen(false); onReload(); }
    catch (e) { setError(apiError(e)); setNewListOpen(false); }
  };
  const renameList = async (id) => {
    if (!renameValue.trim()) { setRenaming(null); return; }
    try { await client.patch(`/lists/${id}`, { name: renameValue.trim() }); } catch (e) { setError(apiError(e)); }
    setRenaming(null); onReload();
  };
  const archiveList = async (id) => {
    try { await client.patch(`/lists/${id}`, { archived: true }); onReload(); } catch (e) { setError(apiError(e)); }
    setMenuFor(null);
  };
  const deleteList = async (id) => {
    const ok = await confirm({ title: "Hapus list ini?", body: "Semua tugas di list ini akan ikut terhapus.", confirmLabel: "Hapus list", danger: true });
    if (ok) {
      try { await client.delete(`/lists/${id}`); onReload(); } catch (e) { setError(apiError(e)); }
    }
    setMenuFor(null);
  };

  const openArchivedTasks = async () => { const r = await client.get(`/teams/${team.id}/tasks`, { params: { archived: true } }); setArchivedTasks(r.data); setArchiveView("tasks"); };
  const openArchivedLists = async () => { const r = await client.get(`/teams/${team.id}/lists`, { params: { archived: true } }); setArchivedLists(r.data); setArchiveView("lists"); };
  const restoreTask = async (id) => { await client.patch(`/tasks/${id}`, { archived: false }); openArchivedTasks(); onReload(); };
  const restoreList = async (id) => { await client.patch(`/lists/${id}`, { archived: false }); openArchivedLists(); onReload(); };

  return (
    <div className="page kanban-page">
      <div className="kb-toolbar">
        <div className="kb-toolbar-actions">
          <div className="kb-filter-wrap">
            <button className="secondary" onClick={() => setFilterOpen(!filterOpen)} data-testid="filter-button"><Filter size={14} /> Filter</button>
            {filterOpen && (
              <div className="td-panel kb-filter-panel" data-testid="filter-panel">
                <select value={filters.priority} onChange={e => setFilters({ ...filters, priority: e.target.value })} data-testid="filter-priority-select"><option value="">Semua prioritas</option><option value="High">Tinggi</option><option value="Medium">Sedang</option><option value="Low">Rendah</option></select>
                <select value={filters.assignee} onChange={e => setFilters({ ...filters, assignee: e.target.value })} data-testid="filter-assignee-select"><option value="">Semua anggota</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              </div>
            )}
          </div>
          <div className="view-toggle">
            <button className={view === "kanban" ? "selected" : ""} onClick={() => setViewPersist("kanban")} data-testid="kanban-view-button"><LayoutGrid size={14} /> Kanban</button>
            <button className={view === "list" ? "selected" : ""} onClick={() => setViewPersist("list")} data-testid="list-view-button"><ListIcon size={14} /> List</button>
          </div>
          <button className="secondary" onClick={openArchivedTasks} data-testid="archive-tasks-button"><Archive size={14} /> Arsip Tugas</button>
          {isAdmin && <button className="secondary" onClick={openArchivedLists} data-testid="archive-lists-button"><Archive size={14} /> Arsip List</button>}
        </div>
      </div>
      {error && <div className="error kb-error" data-testid="kanban-error">{error}</div>}

      {view === "kanban" ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="board-columns" direction="horizontal" type="COLUMN">
            {(boardProvided) => (
              <div className="kb-board" data-testid="kanban-board" ref={boardProvided.innerRef} {...boardProvided.droppableProps}>
                {visibleLists.map((list, colIdx) => (
                  <Draggable draggableId={`col-${list.id}`} index={colIdx} key={list.id} isDragDisabled={!isAdmin}>
                    {(colProvided) => (
                      <div className={`kb-column stage-${stageOf(list)}`} data-testid={`kanban-column-${list.id}`} ref={colProvided.innerRef} {...colProvided.draggableProps}>
                        <div className="kb-column-head" {...colProvided.dragHandleProps}>
                          <span className="kb-stage-icon">{listStageIcon(list)}</span>
                          {renaming === list.id ? (
                            <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={() => renameList(list.id)} onKeyDown={e => e.key === "Enter" && renameList(list.id)} data-testid={`rename-list-input-${list.id}`} />
                          ) : (<b>{list.name}</b>)}
                          <span className="column-count">{byList(list.id).length}</span>
                          {isAdmin && <button className="icon-button" onClick={() => setMenuFor(menuFor === list.id ? null : list.id)} data-testid={`list-menu-${list.id}`}><MoreHorizontal size={15} /></button>}
                          {menuFor === list.id && (
                            <div className="kb-list-menu" data-testid={`list-menu-dropdown-${list.id}`}>
                              <button onClick={() => { setRenaming(list.id); setRenameValue(list.name); setMenuFor(null); }} data-testid={`rename-list-${list.id}`}><Pencil size={13} /> Ganti nama</button>
                              <button onClick={() => archiveList(list.id)} data-testid={`archive-list-${list.id}`}><Archive size={13} /> Arsipkan list</button>
                              <button className="danger" onClick={() => deleteList(list.id)} data-testid={`delete-list-${list.id}`}><Trash2 size={13} /> Hapus list</button>
                            </div>
                          )}
                        </div>
                        <Droppable droppableId={list.id} type="TASK">
                          {(provided) => (
                            <div className="kb-column-body" ref={provided.innerRef} {...provided.droppableProps}>
                              {byList(list.id).map((t, idx) => (
                                <Draggable draggableId={t.id} index={idx} key={t.id}>
                                  {(p) => (
                                    <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}>
                                      <TaskCard task={t} members={members} labels={labels} stage={stageOf(list)} onOpen={() => onOpenTask(t)} onQuickMenu={() => setQuickMenuTask(t)} />
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                        <button className="kb-add-task" onClick={() => onCreateTask(list.id)} data-testid={`add-task-${list.id}`}><Plus size={14} /> Buat Tugas</button>
                        {showOnboardFor(list) && (
                          <div className="kb-onboard-tip" data-testid={`onboard-tooltip-${list.id}`}>
                            <button className="kb-onboard-close" onClick={() => dismissOnboard(list.id)} data-testid={`onboard-tooltip-close-${list.id}`}><X size={14} /></button>
                            <b>{onboardTip(list).title}</b>
                            <p>{onboardTip(list).body}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {boardProvided.placeholder}
                <div className="kb-column kb-new-list">
                  {!isAdmin ? null : newListOpen ? (
                    <div className="kb-new-list-form">
                      <input autoFocus value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="Nama list" onKeyDown={e => e.key === "Enter" && createList()} data-testid="new-list-name-input" />
                      <div><button className="primary" onClick={createList} data-testid="confirm-new-list-button">Tambah</button><button className="secondary" onClick={() => setNewListOpen(false)} data-testid="cancel-new-list-button">Batal</button></div>
                    </div>
                  ) : (
                    <button className="kb-add-list" onClick={() => setNewListOpen(true)} data-testid="create-list-button"><Plus size={15} /> Buat List</button>
                  )}
                </div>
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <div className="task-table-wrap" data-testid="task-list-view">
          <table className="task-table">
            <thead>
              <tr>
                <th><button type="button" onClick={() => toggleSort("title")}>Tugas {sort.key === "title" ? (sort.dir === "asc" ? "↑" : "↓") : ""}</button></th>
                <th><button type="button" onClick={() => toggleSort("list")}>List {sort.key === "list" ? (sort.dir === "asc" ? "↑" : "↓") : ""}</button></th>
                <th><button type="button" onClick={() => toggleSort("priority")}>Prioritas</button></th>
                <th>Anggota</th>
                <th><button type="button" onClick={() => toggleSort("due")}>Tenggat {sort.key === "due" ? (sort.dir === "asc" ? "↑" : "↓") : ""}</button></th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(t => {
                const assigned = members.filter(m => (t.assignees || []).includes(m.id));
                const chips = (t.labels || []).map(id => (labels || []).find(l => l.id === id)).filter(Boolean);
                const overdue = t.due_date && t.stage !== "done" && t.due_date < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={t.id} onClick={() => onOpenTask(t)} data-testid={`task-row-${t.id}`}>
                    <td className="task-table-title">{t.title}</td>
                    <td><span className="badge-status">{t.listName}</span></td>
                    <td><span className={`kb-priority-dot ${priorityKey(t.priority)}`} /> {priorityLabel(t.priority)}</td>
                    <td><div className="kb-avatars">{assigned.slice(0, 3).map(m => <Avatar key={m.id} id={m.id} name={m.name} photo={m.avatar} />)}</div></td>
                    <td>{t.due_date ? <span className={`due ${overdue ? "overdue" : ""}`}>{shortDate(t.due_date)}</span> : <span className="muted">—</span>}</td>
                    <td className="tags">{chips.map(l => <span key={l.id} className="kb-label-chip" style={{ background: l.color + "26", color: l.color }}>{l.name}</span>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!sortedRows.length && <p className="muted" style={{ padding: 20 }}>Belum ada tugas di papan ini.</p>}
        </div>
      )}

      {archiveView && (
        <div className="modal-backdrop" onClick={() => setArchiveView(null)}>
          <section className="modal" onClick={e => e.stopPropagation()} data-testid={`archive-${archiveView}-modal`}>
            <div className="modal-head"><h2>{archiveView === "tasks" ? "Arsip Tugas" : "Arsip List"}</h2><button className="icon-button" onClick={() => setArchiveView(null)} data-testid="close-archive-modal"><X size={18} /></button></div>
            <div className="archive-list">
              {archiveView === "tasks" ? (
                archivedTasks.length ? archivedTasks.map(t => (
                  <div className="archive-row" key={t.id} data-testid={`archived-task-${t.id}`}><span>{t.title}</span><button className="secondary" onClick={() => restoreTask(t.id)} data-testid={`restore-task-${t.id}`}><ArchiveRestore size={13} /> Kembalikan</button></div>
                )) : <p className="muted">Tidak ada tugas diarsipkan</p>
              ) : (
                archivedLists.length ? archivedLists.map(l => (
                  <div className="archive-row" key={l.id} data-testid={`archived-list-${l.id}`}><span>{l.name}</span><button className="secondary" onClick={() => restoreList(l.id)} data-testid={`restore-list-${l.id}`}><ArchiveRestore size={13} /> Kembalikan</button></div>
                )) : <p className="muted">Tidak ada list diarsipkan</p>
              )}
            </div>
          </section>
        </div>
      )}

      {quickMenuTask && (
        <TaskQuickMenu task={quickMenuTask} team={team} teams={teams} members={members} teamLabels={labels} myRole={myRole}
          onClose={() => setQuickMenuTask(null)} onReload={onReload} />
      )}
    </div>
  );
}
