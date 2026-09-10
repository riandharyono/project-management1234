#!/usr/bin/env bash
# Update aplikasi di VPS dari GitHub (branch main).
#
# Cara pakai (di server):
#   cd /var/www/project-mng
#   sudo -u www-data bash deploy/deploy.sh
# Kalau git/yarn butuh user lain, jalankan sebagai user yang punya akses folder ini,
# lalu restart service dengan sudo.
#
# Prasyarat: repo sudah di-clone ke /var/www/project-mng, backend/.env dan
# frontend/.env.production sudah terisi, systemd unit project-mng-backend aktif.

set -euo pipefail

ROOT="${ROOT:-/var/www/project-mng}"
cd "$ROOT"

echo "==> Mengambil kode terbaru dari GitHub"
git fetch origin
git checkout main
git pull --ff-only origin main

echo "==> Restart backend"
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl restart project-mng-backend
  sudo systemctl --no-pager --full status project-mng-backend | head -n 20
else
  echo "systemctl tidak ada — restart uvicorn secara manual."
fi

echo "==> Build frontend"
cd "$ROOT/frontend"
if [ ! -f .env.production ] && [ ! -f .env ]; then
  echo "ERROR: frontend/.env.production belum ada. Salin dari .env.production.example dan isi REACT_APP_BACKEND_URL."
  exit 1
fi
if command -v yarn >/dev/null 2>&1; then
  yarn install --frozen-lockfile
  yarn build
else
  npm ci
  npm run build
fi

if command -v nginx >/dev/null 2>&1; then
  echo "==> Reload nginx"
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo "==> Deploy selesai. Cek situs di browser (hard refresh: Ctrl+F5)."
