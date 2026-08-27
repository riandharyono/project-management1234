#!/usr/bin/env bash
# Backup harian: dump MongoDB + folder file upload.
# Simpan hasilnya di luar VPS ini juga (rsync/rclone ke storage lain) —
# backup yang cuma ada di server yang sama tidak melindungi dari server itu hilang.
#
# Cara pakai di VPS:
#   1. Sesuaikan variabel di bawah.
#   2. chmod +x backup.sh
#   3. Jadwalkan lewat cron, contoh jam 03:00 setiap hari:
#      0 3 * * * /var/www/project-mng/deploy/backup.sh >> /var/log/project-mng-backup.log 2>&1

set -euo pipefail

DB_NAME="project_mng"
STORAGE_DIR="/var/www/project-mng/backend/storage"
BACKUP_DIR="/var/backups/project-mng"
DATE=$(date +%Y%m%d-%H%M%S)
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

echo "[$DATE] Dumping MongoDB ($DB_NAME)..."
mongodump --db "$DB_NAME" --archive="$BACKUP_DIR/mongo-$DATE.archive" --gzip

echo "[$DATE] Archiving storage folder..."
tar -czf "$BACKUP_DIR/storage-$DATE.tar.gz" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"

echo "[$DATE] Membersihkan backup lebih tua dari $KEEP_DAYS hari..."
find "$BACKUP_DIR" -type f -mtime "+$KEEP_DAYS" -delete

echo "[$DATE] Selesai. Ingat: salin folder $BACKUP_DIR ke penyimpanan di luar VPS ini secara berkala."
