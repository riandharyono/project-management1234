from urllib.parse import urlparse

from fastapi import HTTPException


def normalize_http_url(value, field="Link"):
    """Allow empty, or an http(s) URL with a host. Reject javascript:/data:/file: and control chars."""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if len(s) > 2000 or any(ord(c) < 32 for c in s):
        raise HTTPException(400, f"{field} tidak valid")
    try:
        parsed = urlparse(s)
    except Exception:
        raise HTTPException(400, f"{field} tidak valid")
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(400, f"{field} harus diawali http:// atau https://")
    if parsed.username is not None or parsed.password is not None:
        raise HTTPException(400, f"{field} tidak valid")
    return s
