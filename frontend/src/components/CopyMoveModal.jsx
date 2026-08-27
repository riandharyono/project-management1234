import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { client, apiError } from "../lib/api";

export function CopyMoveModal({ task, teams, mode, onClose, onDone }) {
  const [title, setTitle] = useState(`${task.title} (Salinan)`);
  const [keep, setKeep] = useState({ keep_labels: true, keep_assignees: true, keep_checklist: true, keep_attachments: true });
  const [targetTeamId, setTargetTeamId] = useState(task.team_id);
  const [targetLists, setTargetLists] = useState([]);
  const [targetListId, setTargetListId] = useState(task.list_id);
  const [error, setError] = useState("");
  const isCopy = mode === "copy";

  useEffect(() => {
    client.get(`/teams/${targetTeamId}/lists`).then(r => {
      setTargetLists(r.data);
      if (!r.data.some(l => l.id === targetListId)) setTargetListId(r.data[0]?.id || "");
    });
  }, [targetTeamId]); // eslint-disable-line

  const toggleKeep = k => setKeep(v => ({ ...v, [k]: !v[k] }));

  const submit = async () => {
    setError("");
    try {
      if (isCopy) {
        await client.post(`/tasks/${task.id}/duplicate`, { title, target_team_id: targetTeamId, target_list_id: targetListId, ...keep });
      } else {
        await client.patch(`/tasks/${task.id}`, { team_id: targetTeamId, list_id: targetListId });
      }
      onDone();
    } catch (e) { setError(apiError(e)); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal copy-move-modal" onClick={e => e.stopPropagation()} data-testid="copy-move-modal">
        <div className="modal-head"><h2>{isCopy ? "Salin Tugas" : "Pindahkan Tugas"}</h2><button className="icon-button" onClick={onClose} data-testid="close-copy-move-modal"><X size={18} /></button></div>

        {isCopy && (
          <>
            <label className="sf-label">NAMA TUGAS</label>
            <input value={title} onChange={e => setTitle(e.target.value)} data-testid="copy-title-input" />

            <label className="sf-label">PERTAHANKAN…</label>
            <div className="keep-options">
              <label className="keep-row"><input type="checkbox" checked={keep.keep_labels} onChange={() => toggleKeep("keep_labels")} data-testid="keep-labels" /> Label ({(task.labels || []).length})</label>
              <label className="keep-row"><input type="checkbox" checked={keep.keep_assignees} onChange={() => toggleKeep("keep_assignees")} data-testid="keep-assignees" /> Anggota ({(task.assignees || []).length})</label>
              <label className="keep-row"><input type="checkbox" checked={keep.keep_checklist} onChange={() => toggleKeep("keep_checklist")} data-testid="keep-checklist" /> Ceklis (item, lampiran, tenggat & anggota ceklis ikut) ({(task.checklist || []).length})</label>
              <label className="keep-row"><input type="checkbox" checked={keep.keep_attachments} onChange={() => toggleKeep("keep_attachments")} data-testid="keep-attachments" /> Lampiran ({(task.attachments || []).length})</label>
            </div>
          </>
        )}

        <label className="sf-label">{isCopy ? "SALIN TUGAS KE…" : "PINDAHKAN TUGAS KE…"}</label>
        <label>PILIH TIM TUJUAN
          <select value={targetTeamId} onChange={e => setTargetTeamId(e.target.value)} data-testid="target-team-select">
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>PILIH LIST TUJUAN
          <select value={targetListId} onChange={e => setTargetListId(e.target.value)} data-testid="target-list-select">
            {targetLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>

        {error && <div className="error">{error}</div>}
        <button className="primary" onClick={submit} disabled={!targetListId} data-testid="submit-copy-move">{isCopy ? "Copy" : "Pindahkan"}</button>
      </section>
    </div>
  );
}
