import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { client, apiError, LABEL_COLORS } from "../lib/api";
import { currentYear, yearChoices } from "../lib/years";

export function CreateTeamModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[0]);
  const [year, setYear] = useState(currentYear());
  const [wilayah, setWilayah] = useState("");
  const [wilayahs, setWilayahs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => { client.get("/wilayahs").then(r => setWilayahs(r.data || [])).catch(() => setWilayahs([])); }, []);

  const submit = async e => {
    e.preventDefault();
    try { const r = await client.post("/teams", { name, color, year: Number(year), wilayah: wilayah.trim() || null }); onCreated(r.data); }
    catch (x) { setError(apiError(x)); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={e => e.stopPropagation()} data-testid="create-team-modal">
        <div className="modal-head"><div><span className="eyebrow">TIM BARU</span><h2>Buat tim baru</h2></div><button className="icon-button" onClick={onClose} data-testid="close-create-team-modal"><X size={18} /></button></div>
        <form onSubmit={submit}>
          <label>Nama tim<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Contoh: Tim Marketing" data-testid="new-team-name-input" /></label>
          <label>Tahun penugasan
            <select value={year} onChange={e => setYear(Number(e.target.value))} data-testid="new-team-year-select">
              {yearChoices().map(y => <option key={y} value={y}>{y}{y === currentYear() ? " (tahun ini)" : ""}</option>)}
            </select>
          </label>
          <p className="muted" style={{ marginTop: -8, fontSize: 12 }}>Tim tahun lalu otomatis masuk arsip di sidebar, tetap bisa dibuka kapan saja.</p>
          <label>Wilayah / pemda
            <input value={wilayah} onChange={e => setWilayah(e.target.value)} list="new-team-wilayahs" placeholder="Contoh: Kabupaten Karawang, Provinsi Jawa Barat" data-testid="new-team-wilayah-input" />
            <datalist id="new-team-wilayahs">{wilayahs.map(w => <option key={w} value={w} />)}</datalist>
          </label>
          <label>Warna<div className="td-label-swatches">{LABEL_COLORS.map(c => <button type="button" key={c} style={{ background: c, outline: color === c ? "2px solid #10213b" : "none" }} onClick={() => setColor(c)} data-testid={`team-color-${c}`} />)}</div></label>
          {error && <div className="error" data-testid="create-team-error">{error}</div>}
          <div className="modal-foot"><span /><button type="button" className="secondary" onClick={onClose} data-testid="cancel-create-team-button">Batal</button><button className="primary" disabled={!name.trim()} data-testid="submit-create-team-button">Buat Tim</button></div>
        </form>
      </section>
    </div>
  );
}
