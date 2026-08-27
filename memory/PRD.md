# Northstar Workspace — PRD (Cicle-inspired multi-team project management)

## Problem Statement
Aplikasi manajemen proyek & kolaborasi tim internal (1-10 orang), terinspirasi "Cicle App"
dari screenshot user. Bahasa aplikasi: Indonesia.

## Core requirements (dari user, Agustus 2026)
- Multi-tim/workspace: sidebar "HQ" + daftar Tim, tiap tim punya tugas/chat/pengumuman sendiri.
- Kanban dengan list custom (bukan status statis): buat/rename/arsipkan/hapus list sendiri,
  drag-and-drop card antar list (posisi & list tersimpan).
- Task detail lengkap: Anggota, Catatan, Lampiran (upload file asli via Emergent Object Storage),
  Ceklis, Label berwarna, Tanggal+Ulangi (repeat), Cover image, Pindahkan/Salin/Rahasiakan/
  Arsipkan/Hapus, Komentar dengan @mention (ketik "@" -> dropdown pilih anggota -> notifikasi).
- Tab tambahan per tim: Chat Grup (polling 8s), Pengumuman, Jadwal (kalender bulanan),
  Pertanyaan (Q&A), Dokumen & File (termasuk lampiran dari semua task).
- Notifikasi (bell + dropdown, unread badge) untuk mention/assignment/announcement/answer/team_add.
- Global search task lintas tim.
- Visual: navy/dark blue sebagai warna utama (sidebar, aksen), ikon fitur playful berwarna
  (teal/amber/violet/pink/indigo) seperti referensi screenshot Cicle App.

## Architecture
- Backend: FastAPI + Motor (MongoDB), JWT cookie auth (existing dari sesi sebelumnya).
- Frontend: React, modular components di `/app/frontend/src/components/`, drag-drop pakai
  `@hello-pangea/dnd`, styling custom di `team.css` (baru) + `App.css`/`extra.css` (lama, auth screen).
- File storage: Emergent Object Storage (put_object/get_object di server.py), bukan base64.
- Collections baru: teams, team_members, lists, chat_messages, announcements, questions,
  documents, files, notifications. `tasks` diperluas: team_id, list_id, order, checklist,
  attachments, cover, is_private, repeat, archived (migrasi otomatis dari skema lama saat startup).

## What's implemented (26 Agustus 2026)
- Rebuild total dari MVP single-workspace lama menjadi multi-tim penuh sesuai spesifikasi di atas.
- Semua endpoint backend (teams/lists/tasks/comments/chat/announcements/questions/documents/
  files/notifications) + seluruh komponen frontend (Sidebar, TopBar, TeamOverview, KanbanBoard,
  TaskDetailModal, NewTaskModal, ChatGroup, Announcements, Schedule, Questions, Documents,
  MembersModal, NotificationsPanel, CreateTeamModal, MentionBox/MentionText).
- Default team "Tim B" auto-seed untuk admin dengan 4 list default (To Do List, Dikerjakan,
  Selesai, Batal).
- Testing: 3 ronde testing_agent (iteration_5/6/7). Bug ditemukan & DIPERBAIKI:
  mobile layout overflow, PATCH tidak bisa clear due_date, is_private tidak ditegakkan di
  server (comments/patch/delete/duplicate/attachment/upload - sudah di-patch pakai helper
  `load_visible_task`), list create/rename/archive/delete kini admin-only (UI + API),
  search regex tidak di-escape, notifikasi & search result belum membuka task modal langsung.
  Semua perbaikan diverifikasi via curl setelah fix terakhir.
- Kredensial: lihat `/app/memory/test_credentials.md` (admin@northstar.team + member1@northstar.team).

## Simplifications diketahui (MVP scope)
- Chat Grup pakai polling 8 detik, bukan WebSocket real-time.
- Label task tidak shared team-wide (dibuat ad-hoc per task).
- Cover image tidak punya tombol "hapus" (hanya via due_date pattern, belum diperluas ke cover).
- Tab aktif tidak persist di URL/localStorage (reset ke Ringkasan saat reload penuh) - minor UX.

## Update 26 Agustus 2026 (lanjutan)
- URL persistence: tab & tim aktif disimpan di query string (?team=&tab=), reload tidak reset ke Ringkasan.
- Chat Grup real-time via WebSocket (`/api/ws/chat/{team_id}`), dengan auto-reconnect + backoff dan indikator status koneksi.
- Kanban: admin bisa drag-reorder kolom/list itu sendiri (member biasa tidak bisa, isDragDisabled).
- Label jadi shared registry per tim (`GET/POST /api/teams/{id}/labels`), dedupe by name+color, dipakai ulang lintas task.
- Testing (iteration_8.json): 100% pass backend (13/13) & frontend (5/5 flow baru) + notifikasi popup re-confirmed working.
- Fixed setelah testing: WS reconnect+backoff, guard duplikat label name+color.

## Update 26 Agustus 2026 (fitur ke-4 + 3 ronde perbaikan)
- 4 fitur baru: persentase progress tim di Ringkasan (`is_done` flag per list, bukan cocok nama "Selesai"),
  reaksi emoji di Chat Grup (WS broadcast + toggle + agregasi + persist), pagination notifikasi
  (skip/limit + "Muat lebih banyak"), label tim jadi cascade penuh (tasks simpan `label_id`, rename/delete
  di registry langsung update semua task card via `$pull`).
- Testing iteration_9 menemukan 1 bug HIGH (chat pesan duplikat dari WS reconnect ganda), 1 MEDIUM
  (toggle selesai tugas satu arah + coupling ke nama list "Selesai"), 1 LOW (halaman notifikasi collapse
  setelah mark-read), 2 minor backend (notifikasi/chat tanpa limit atas) - SEMUA DIPERBAIKI & diverifikasi
  ulang di iteration_10 (100% pass Playwright, 33/35 pytest - 1 gap permission ditemukan & 1 infra CORS
  quirk lama).
- iteration_10 menemukan gap: pembuatan label tim tidak admin-only (member bisa buat). Diperbaiki +
  4 polish lain (Escape close modal, kontras chip label, race kondisi fetch riwayat chat vs WS) →
  diverifikasi iteration_11 (17/17 pytest, 100% Playwright, 0 issue baru).
- member1@northstar.team diperbaiki dari role admin ke member (data fix, bukan bug kode) agar skenario
  testing multi-role akurat.

## Backlog (belum dikerjakan, non-blocking polish)
- P2: Referensi label di task pakai label_id (bukan copy name+color) agar rename/delete di registry ikut update semua task. **[DONE - 26 Agustus 2026]**
- P2: Endpoint bulk-reorder (satu request) untuk drag list/task, bukan N request PATCH paralel.
- P2: Tombol hapus cover image di task detail.
- P2: File Attachments — pastikan flow upload file asli (Emergent Object Storage) di UI task attachment & tab Dokumen sudah solid end-to-end (belum diverifikasi testing_agent secara spesifik).
- P2: Global Search — hardening UI pencarian cepat lintas tugas/dokumen.
- P3: Perbaiki warning "nested scroll container" dari @hello-pangea/dnd (kosmetik, drag tetap berfungsi).
- P3: Browser back/forward belum restore tab/tim sebelumnya (pakai replaceState, bukan pushState).
- P3: Kontras teks chip label di Kanban card masih ~3.5:1 (di bawah WCAG AA 4.5:1) - kosmetik minor.
- P3: Input tanggal tugas masih native `<input type=date>` (format MM/DD/YYYY), belum pakai shadcn calendar/lokal Indonesia.
- P3: Advanced Notifications (dropdown/toast in-app lebih kaya, di luar dropdown + badge yang sudah ada).
