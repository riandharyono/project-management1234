import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ImageRun, VerticalAlign, ShadingType,
} from "docx";

const CONTENT_WIDTH = 9071; // twips, A4 minus BPKP letter margins
const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};
const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
};

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
function formatIndoDate(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${BULAN[m - 1]} ${y}`;
}

function plainCell(text, size, opts = {}) {
  return new TableCell({
    width: { size, type: WidthType.DXA },
    borders: NO_BORDER,
    columnSpan: opts.span,
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({ alignment: opts.align, spacing: { line: 264 }, children: [new TextRun({ text: text || "", bold: opts.bold })] })],
  });
}

function dataCell(text, size, opts = {}) {
  return new TableCell({
    width: { size, type: WidthType.DXA },
    borders: CELL_BORDER,
    shading: opts.header ? { type: ShadingType.CLEAR, fill: "E4E6EE" } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ alignment: opts.align || AlignmentType.LEFT, children: [new TextRun({ text: text || "-", bold: !!opts.header })] })],
  });
}

export function buildSuratDocument({
  team, items, penerimaSurat, nomorSuratTugas, perihal, linkUpload,
  penandatangan, tenggatUploadData, picNama, picWa, logoBytes,
}) {
  const jabatanLabel = penandatangan.jabatan === "koorwas"
    ? `Koordinator Pengawasan Bidang ${penandatangan.bidang || "-"}`
    : "Ketua Tim";
  const halText = `Permintaan Informasi dan Data dalam rangka ${perihal || team?.name || "-"}`;

  const kopSurat = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [1600, 7471],
    borders: NO_BORDER,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1600, type: WidthType.DXA }, borders: NO_BORDER, verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: logoBytes ? [new ImageRun({ data: logoBytes, type: "jpg", transformation: { width: 78, height: 40 } })] : [],
            })],
          }),
          new TableCell({
            width: { size: 7471, type: WidthType.DXA }, borders: NO_BORDER, verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240 }, children: [new TextRun({ text: "BADAN PENGAWASAN KEUANGAN DAN PEMBANGUNAN", bold: true, size: 22 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240 }, children: [new TextRun({ text: "PERWAKILAN PROVINSI PAPUA BARAT", bold: true, size: 22 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240 }, children: [new TextRun({ text: "Jalan Brigjen Marinir (Purn.) Abraham O. Atururi, Arfai, Manokwari 98315", size: 16 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240 }, children: [new TextRun({ text: "Telepon (0986) 2217088  |  E-mail: papbar@bpkp.go.id  |  Website: https://www.bpkp.go.id", size: 16 })] }),
            ],
          }),
        ],
      }),
    ],
  });

  const kopDivider = new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000" } } });

  const infoTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [1300, 180, 4300, 3291],
    borders: NO_BORDER,
    rows: [
      new TableRow({
        children: [
          plainCell("Nomor", 1300), plainCell(":", 180),
          plainCell("........................", 4300),
          plainCell(formatIndoDate(new Date().toISOString().slice(0, 10)), 3291, { align: AlignmentType.RIGHT }),
        ],
      }),
      new TableRow({ children: [plainCell("Lampiran", 1300), plainCell(":", 180), plainCell("Satu Berkas", 7591, { span: 2 })] }),
      new TableRow({ children: [plainCell("Hal", 1300), plainCell(":", 180), plainCell(halText, 7591, { span: 2 })] }),
    ],
  });

  const dataRows = (items || []).map((it, idx) => new TableRow({
    children: [
      dataCell(String(idx + 1), 500, { align: AlignmentType.CENTER }),
      dataCell(it.name, 3800),
      dataCell((it.sheets || []).join(", ") || "-", 1800),
      dataCell(it.notes || "-", 2971),
    ],
  }));
  const dataTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [500, 3800, 1800, 2971],
    rows: [
      new TableRow({
        children: [
          dataCell("No", 500, { align: AlignmentType.CENTER, header: true }),
          dataCell("Uraian Data / Dokumen", 3800, { header: true }),
          dataCell("Sheet KKE", 1800, { header: true }),
          dataCell("Catatan", 2971, { header: true }),
        ],
      }),
      ...(dataRows.length ? dataRows : [new TableRow({ children: [dataCell("-", 500, { align: AlignmentType.CENTER }), dataCell("-", 3800), dataCell("-", 1800), dataCell("-", 2971)] })]),
    ],
  });

  const body = [
    kopSurat, kopDivider, infoTable,
    new Paragraph({ spacing: { after: 200 } }),
    new Paragraph({ text: "Yth." }),
    new Paragraph({ text: penerimaSurat || "-" }),
    new Paragraph({ text: "di" }),
    new Paragraph({ text: "Tempat", spacing: { after: 200 } }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200, line: 300 },
      children: [new TextRun(
        `Menindaklanjuti Surat Tugas Kepala Perwakilan BPKP Provinsi Papua Barat Nomor ${nomorSuratTugas || "-"} tentang ${perihal || "-"}, kami mengharapkan data berikut dapat disampaikan paling lambat tanggal ${formatIndoDate(tenggatUploadData)}.`
      )],
    }),
    new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "Data yang diminta:", bold: true })] }),
    dataTable,
    new Paragraph({ spacing: { before: 200, after: 100, line: 300 }, alignment: AlignmentType.JUSTIFIED, children: [new TextRun(
      `Unggah data melalui tautan: ${linkUpload || "-"}. Mohon folder diberi nama sesuai pemerintah daerah pengirim. Apabila tautan tidak dapat diakses, data dapat dikirim ke pos-el tim atau diserahkan langsung ke Kantor Perwakilan BPKP Provinsi Papua Barat.`
    )] }),
    new Paragraph({ spacing: { after: 100 }, children: [new TextRun(`PIC tim: ${picNama || "-"}, HP/WA ${picWa || "-"}.`)] }),
    new Paragraph({ spacing: { after: 400 }, children: [new TextRun("Atas perhatian dan kerja sama Saudara, kami ucapkan terima kasih.")] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(`${jabatanLabel},`)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: "Ditandatangani secara elektronik", italics: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (penandatangan.nama || "-").toUpperCase(), bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(`NIP ${penandatangan.nip || "-"}`)] }),
  ];

  return new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 794, bottom: 794, left: 1701, right: 1134 },
        },
      },
      children: body,
    }],
  });
}
