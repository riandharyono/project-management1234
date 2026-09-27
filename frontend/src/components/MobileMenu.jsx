import { BarChart3, Database, Flag, LogOut, Moon, Plus, Sun, User, Users } from "lucide-react";

export function MobileMenu({ open, onClose, user, canCreate, canMonitor, isSuperAdmin, theme, onTheme, onProfile, onRecap, onFindings, onMonitoring, onUsers, onCreateTeam, onLogout }) {
  if (!open) return null;
  return (
    <div className="m-sheet-backdrop" onClick={onClose} data-testid="mobile-menu">
      <div className="m-sheet" onClick={e => e.stopPropagation()}>
        <div className="m-sheet-handle" />
        <p className="m-sheet-user">{user?.name}</p>
        <button type="button" onClick={() => { onClose(); onProfile(); }}><User size={16} /> Profil</button>
        <button type="button" onClick={onTheme}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} {theme === "dark" ? "Mode terang" : "Mode gelap"}</button>
        <button type="button" onClick={() => { onClose(); onRecap(); }}><Database size={16} /> Rekap Data</button>
        <button type="button" onClick={() => { onClose(); onFindings(); }}><Flag size={16} /> Rekap Temuan</button>
        {canMonitor && <button type="button" onClick={() => { onClose(); onMonitoring(); }}><BarChart3 size={16} /> Monitoring</button>}
        {isSuperAdmin && <button type="button" onClick={() => { onClose(); onUsers(); }}><Users size={16} /> Pengguna</button>}
        {canCreate && <button type="button" onClick={() => { onClose(); onCreateTeam(); }}><Plus size={16} /> Buat Tim</button>}
        <button type="button" className="danger" onClick={() => { onClose(); onLogout(); }}><LogOut size={16} /> Keluar</button>
      </div>
    </div>
  );
}
