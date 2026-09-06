import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ImageRun, VerticalAlign, ShadingType,
} from "docx";

const CONTENT_WIDTH = 9071; // twips, A4 minus BPKP letter margins
const BODY_FONT = "Arial";
const BODY_SIZE = 24; // half-points -> 12pt
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

// TextRun with the letter's body font/size baked in, so every run stays
// consistent without repeating font/size at every call site.
function run(textOrOpts) {
  const opts = typeof textOrOpts === "string" ? { text: textOrOpts } : textOrOpts;
  return new TextRun({ font: BODY_FONT, size: BODY_SIZE, ...opts });
}

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
    children: [new Paragraph({ alignment: opts.align, spacing: { line: 264 }, children: [run({ text: text || "", bold: opts.bold })] })],
  });
}

function dataCell(text, size, opts = {}) {
  return new TableCell({
    width: { size, type: WidthType.DXA },
    borders: CELL_BORDER,
    shading: opts.header ? { type: ShadingType.CLEAR, fill: "E4E6EE" } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ alignment: opts.align || AlignmentType.LEFT, children: [run({ text: text || "-", bold: !!opts.header })] })],
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
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240 }, children: [run({ text: "BADAN PENGAWASAN KEUANGAN DAN PEMBANGUNAN", bold: true, size: 22 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240 }, children: [run({ text: "PERWAKILAN PROVINSI PAPUA BARAT", bold: true, size: 22 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240 }, children: [run({ text: "Jalan Brigjen Marinir (Purn.) Abraham O. Atururi, Arfai, Manokwari 98315", size: 16 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240 }, children: [run({ text: "Telepon (0986) 2217088  |  E-mail: papbar@bpkp.go.id  |  Website: https://www.bpkp.go.id", size: 16 })] }),
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
      new TableRow({ children: [plainCell("Lampiran", 1300), plainCell(":", 180), plainCell("-", 7591, { span: 2 })] }),
      new TableRow({ children: [plainCell("Hal", 1300), plainCell(":", 180), plainCell(halText, 7591, { span: 2 })] }),
    ],
  });

  const outstanding = items && items.length ? items : [];

  const introParagraph = new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 200, line: 300 },
    children: [run(
      `Menindaklanjuti Surat Tugas Nomor ${nomorSuratTugas || "-"}, dalam rangka ${perihal || team?.name || "-"} di Wilayah Provinsi Papua Barat, kami mengharapkan ${penerimaSurat || "-"} memberikan informasi dan data kepada kami berupa:`
    )],
  });

  const dataRows = outstanding.map((it, idx) => new TableRow({
    children: [
      dataCell(String(idx + 1), 500, { align: AlignmentType.CENTER }),
      dataCell(it.name, 5271),
      dataCell(it.pic || "-", 3300),
    ],
  }));
  const dataTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [500, 5271, 3300],
    rows: [
      new TableRow({
        children: [
          dataCell("No", 500, { align: AlignmentType.CENTER, header: true }),
          dataCell("Nama Dokumen", 5271, { header: true }),
          dataCell("OPD", 3300, { header: true }),
        ],
      }),
      ...(dataRows.length ? dataRows : [new TableRow({ children: [dataCell("-", 500, { align: AlignmentType.CENTER }), dataCell("-", 5271), dataCell("-", 3300)] })]),
    ],
  });

  const dataParagraphs = [introParagraph, dataTable, new Paragraph({ spacing: { after: 200 } })];

  const closingParagraph = new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 300, line: 300 },
    children: [
      run("Data tersebut agar dapat disampaikan dan dapat kami terima paling lambat "),
      run({ text: formatIndoDate(tenggatUploadData), bold: true }),
      run(" melalui tautan "),
      run({ text: linkUpload || "-", bold: true }),
      run(". Informasi lebih lanjut dapat menghubungi narahubung kami yaitu "),
      run({ text: `${picNama || "-"} (HP/WA ${picWa || "-"})`, bold: true }),
      run("."),
    ],
  });

  const thanksParagraph = new Paragraph({
    spacing: { after: 500 },
    children: [run("Demikian permintaan ini kami sampaikan. Atas perhatian dan kerja sama yang baik, kami mengucapkan terima kasih.")],
  });

  const signatureBlock = penandatangan.tandaTangan === "manual"
    ? [
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(`${jabatanLabel},`)] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, text: "" }),
        new Paragraph({ alignment: AlignmentType.RIGHT, text: "" }),
        new Paragraph({ alignment: AlignmentType.RIGHT, text: "" }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(penandatangan.nama || "-")] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(`NIP ${penandatangan.nip || "-"}`)] }),
      ]
    : [
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(`${jabatanLabel},`)] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 400 }, children: [run({ text: "Ditandatangani secara elektronik oleh", italics: true })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(penandatangan.nama || "-")] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(`NIP ${penandatangan.nip || "-"}`)] }),
      ];

  const body = [
    kopSurat, kopDivider, infoTable,
    new Paragraph({ spacing: { after: 200 } }),
    new Paragraph({ children: [run("Yth.")] }),
    new Paragraph({ children: [run(penerimaSurat || "-")] }),
    new Paragraph({ children: [run("di")] }),
    new Paragraph({ spacing: { after: 200 }, children: [run("Tempat")] }),
    ...dataParagraphs,
    closingParagraph,
    thanksParagraph,
    ...signatureBlock,
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
