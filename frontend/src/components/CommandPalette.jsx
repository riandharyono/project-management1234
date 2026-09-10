import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ClipboardList, Users, FolderOpen, Plus, Inbox, LayoutGrid, CalendarClock, HelpCircle, Megaphone, Database } from "lucide-react";
import { client } from "../lib/api";
import { currentYear, teamYear } from "../lib/years";

const TABS = [
  { key: "overview", label: "Ringkasan", icon: LayoutGrid },
  { key: "tasks", label: "Papan", icon: ClipboardList },
  { key: "data-recap", label: "Rekap Data", icon: Database },
  { key: "announcements", label: "Pengumuman", icon: Megaphone },
  { key: "schedule", label: "Jadwal", icon: CalendarClock },
  { key: "questions", label: "Check-in", icon: HelpCircle },
  { key: "documents", label: "Dokumen", icon: FolderOpen },
];

export function CommandPalette({ open, onClose, teams, team, onSelectTeam, onOpenTask, onCreateTeam, onCreateTask, onGoHQ, onOpenRecap, onTab, onOpenDocuments, canCreateTeam }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState({ tasks: [], documents: [], teams: [] });
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) { setQ(""); setHits({ tasks: [], documents: [], teams: [] }); setActive(0); return; }
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!q.trim()) { setHits({ tasks: [], documents: [], teams: [] }); return; }
    const t = setTimeout(() => {
      client.get("/search", { params: { q } }).then(r => setHits({
        tasks: r.data.tasks || [],
        documents: r.data.documents || [],
        teams: r.data.teams || [],
      })).catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const actions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = [
      { id: "act-hq", label: "Ke Tugas saya", icon: Inbox, run: onGoHQ },
      { id: "act-recap", label: "Buka Rekap Data", icon: Database, run: onOpenRecap },
    ];
    if (canCreateTeam) list.push({ id: "act-new-team", label: "Buat tim baru", icon: Plus, run: onCreateTeam });
    if (team) {
      list.push({ id: "act-new-task", label: `Buat tugas di ${team.name}`, icon: Plus, run: onCreateTask });
      TABS.forEach(tab => list.push({ id: `act-tab-${tab.key}`, label: `Buka ${tab.label}`, icon: tab.icon, run: () => onTab(tab.key) }));
    }
    teams.forEach(t => {
      const y = teamYear(t);
      list.push({ id: `team-${t.id}`, label: y === currentYear() ? `Buka tim ${t.name}` : `Buka tim ${t.name} (${y})`, icon: Users, run: () => onSelectTeam(t.id) });
    });
    if (!needle) return list.slice(0, 8);
    return list.filter(a => a.label.toLowerCase().includes(needle));
  }, [q, team, teams, onGoHQ, onOpenRecap, onCreateTeam, onCreateTask, onTab, onSelectTeam, canCreateTeam]);

  const rows = useMemo(() => {
    const out = [];
    hits.tasks.forEach(t => out.push({ id: `task-${t.id}`, kind: "Tugas", label: t.title, run: () => onOpenTask(t) }));
    hits.documents.forEach(d => out.push({ id: `doc-${d.id}`, kind: "Dokumen", label: d.filename, run: () => onOpenDocuments?.(d) }));
    hits.teams.forEach(t => {
      const y = teamYear(t);
      out.push({ id: `hit-team-${t.id}`, kind: y === currentYear() ? "Tim" : `Tim ${y}`, label: t.name, run: () => onSelectTeam(t.id) });
    });
    actions.forEach(a => out.push({ id: a.id, kind: "Aksi", label: a.label, icon: a.icon, run: a.run }));
    return out;
  }, [hits, actions, onOpenTask, onOpenDocuments, onSelectTeam]);

  useEffect(() => { setActive(0); }, [rows.length, q]);

  useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(rows.length - 1, i + 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
      if (e.key === "Enter" && rows[active]) { e.preventDefault(); rows[active].run(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, rows, active, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop cmdk-backdrop" onClick={onClose} data-testid="command-palette">
      <section className="cmdk" onClick={e => e.stopPropagation()}>
        <div className="cmdk-search">
          <Search size={16} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Cari tugas, tim, dokumen, atau jalankan aksi…" data-testid="command-palette-input" />
          <kbd>esc</kbd>
        </div>
        <div className="cmdk-list">
          {rows.length ? rows.map((row, i) => (
            <button key={row.id} className={i === active ? "active" : ""} onMouseEnter={() => setActive(i)}
              onClick={() => { row.run(); onClose(); }} data-testid={`command-row-${row.id}`}>
              <span className="cmdk-kind">{row.kind}</span>
              <span>{row.label}</span>
            </button>
          )) : <p className="muted cmdk-empty">Tidak ada hasil. Coba kata lain, atau buat tugas baru.</p>}
        </div>
      </section>
    </div>
  );
}
