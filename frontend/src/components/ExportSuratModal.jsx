import { useState } from "react";
import { X, Download } from "lucide-react";
import { Packer } from "docx";
import bpkpLogo from "../assets/bpkp-logo.jpeg";
import { buildSuratDocument } from "../lib/suratPermintaanData";

const BIDANG_OPTIONS = ["Akuntabilitas Pemerintahan Daerah", "Isi sendiri"];

export function ExportSuratModal({ team, items, onClose }) {
  const [penerimaSurat, setPenerimaSurat] = useState("");
  const [nomorSuratTugas, setNomorSuratTugas] = useState("");
  const [perihal, setPerihal] = useState(team?.name || "");
  const [linkUpload, setLinkUpload] = useState("");
  const [jabatan, setJabatan] = useState("koorwas");
  const [tandaTangan, setTandaTangan] = useState("elektronik");
  const [bidang, setBidang] = useState(BIDANG_OPTIONS[0]);
  const [bidangCustom, setBidangCustom] = useState("");
  const [nama, setNama] = useState("");
  const [nip, setNip] = useState("");
  const [tenggatUploadData, setTenggatUploadData] = useState("");
  const [picNama, setPicNama] = useState("");
  const [picWa, setPicWa] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const logoBytes = await fetch(bpkpLogo).then(r => r.arrayBuffer());
      const doc = buildSuratDocument({
        team, items,
        penerimaSurat, nomorSuratTugas, perihal, linkUpload,
        penandatangan: {
          jabatan,
          bidang: jabatan === "koorwas" ? (bidang === "Isi sendiri" ? bidangCustom : bidang) : undefined,
          nama, nip, tandaTangan,
        },
        tenggatUploadData, picNama, picWa,
        logoBytes: new Uint8Array(logoBytes),
      });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Surat Permintaan Data - ${team?.name || "Tim"}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      setError("Gagal membuat surat. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal export-surat-modal" onClick={e => e.stopPropagation()} data-testid="export-surat-modal">
        <div className="modal-head"><h2>Ekspor Surat Permintaan Data</h2><button className="icon-button" onClick={onClose} data-testid="close-export-surat-modal"><X size={18} /></button></div>
        <form onSubmit={submit} className="inline-form">
          <label>PEJABAT PENERIMA SURAT
            <input value={penerimaSurat} onChange={e => setPenerimaSurat(e.target.value)} placeholder="Kepala BPKAD Kabupaten …" required data-testid="surat-penerima-input" />
          </label>
          <label>NOMOR SURAT TUGAS
            <input value={nomorSuratTugas} onChange={e => setNomorSuratTugas(e.target.value)} placeholder="PE.09.02/ST-.../PW.../2026" required data-testid="surat-nomor-tugas-input" />
          </label>
          <label>PERIHAL
            <input value={perihal} onChange={e => setPerihal(e.target.value)} placeholder="Evaluasi … Tahun …" required data-testid="surat-perihal-input" />
          </label>
          <label>LINK UPLOAD DATA
            <input value={linkUpload} onChange={e => setLinkUpload(e.target.value)} placeholder="https://…" required data-testid="surat-link-upload-input" />
          </label>
          <label>TENGGAT UPLOAD DATA
            <input type="date" value={tenggatUploadData} onChange={e => setTenggatUploadData(e.target.value)} required data-testid="surat-tenggat-input" />
          </label>

          <label>PENANDATANGAN
            <select value={jabatan} onChange={e => setJabatan(e.target.value)} data-testid="surat-jabatan-select">
              <option value="koorwas">Koordinator Pengawasan</option>
              <option value="ketua_tim">Ketua Tim</option>
            </select>
          </label>
          {jabatan === "koorwas" && (
            <label>BIDANG
              <select value={bidang} onChange={e => setBidang(e.target.value)} data-testid="surat-bidang-select">
                {BIDANG_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {bidang === "Isi sendiri" && (
                <input value={bidangCustom} onChange={e => setBidangCustom(e.target.value)} placeholder="Nama bidang…" required data-testid="surat-bidang-custom-input" style={{ marginTop: 6 }} />
              )}
            </label>
          )}
          <label>NAMA {jabatan === "koorwas" ? "KOORWAS" : "KETUA TIM"}
            <input value={nama} onChange={e => setNama(e.target.value)} placeholder="Nama lengkap" required data-testid="surat-nama-input" />
          </label>
          <label>NIP
            <input value={nip} onChange={e => setNip(e.target.value)} placeholder="NIP" required data-testid="surat-nip-input" />
          </label>
          <label>JENIS TANDA TANGAN
            <select value={tandaTangan} onChange={e => setTandaTangan(e.target.value)} data-testid="surat-tandatangan-select">
              <option value="elektronik">Elektronik</option>
              <option value="manual">Manual</option>
            </select>
          </label>

          <label>NAMA PIC
            <input value={picNama} onChange={e => setPicNama(e.target.value)} placeholder="Nama lengkap PIC" required data-testid="surat-pic-nama-input" />
          </label>
          <label>KONTAK WA PIC
            <input value={picWa} onChange={e => setPicWa(e.target.value)} placeholder="08xxxxxxxxxx" required data-testid="surat-pic-wa-input" />
          </label>

          <p className="muted" style={{ fontSize: 12 }}>{items.length} item data (status belum lengkap) akan otomatis dimasukkan ke tabel surat.</p>
          {error && <div className="error" data-testid="export-surat-error">{error}</div>}
          <div>
            <button className="primary" disabled={busy} data-testid="submit-export-surat-button"><Download size={14} /> {busy ? "Membuat…" : "Unduh Surat (.docx)"}</button>
            <button type="button" className="secondary" onClick={onClose}>Batal</button>
          </div>
        </form>
      </section>
    </div>
  );
}
