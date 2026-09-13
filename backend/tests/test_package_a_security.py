"""Paket A: URL http(s) only. Tidak butuh server hidup."""
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from url_safety import normalize_http_url


@pytest.mark.parametrize("value", [
    "https://drive.google.com/drive/folders/abc",
    "http://example.com/path",
    "https://docs.google.com/spreadsheets/d/xyz",
])
def test_accepts_http_https_urls(value):
    assert normalize_http_url(value) == value


@pytest.mark.parametrize("value", [None, "", "   "])
def test_empty_becomes_none(value):
    assert normalize_http_url(value) is None


@pytest.mark.parametrize("value", [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "https://user:pass@evil.example/",
    "http://",
    "https://",
    "ftp://files.example.com/x",
    "https://evil.example\nhttps://good.example",
])
def test_rejects_dangerous_urls(value):
    with pytest.raises(HTTPException) as exc:
        normalize_http_url(value)
    assert exc.value.status_code == 400
