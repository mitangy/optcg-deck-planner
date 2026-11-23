"""Text out of a TCGplayer Order History page saved as PDF (#1433)."""

from __future__ import annotations

import io

from pypdf import PdfReader
from pypdf.errors import PyPdfError

from app.core.errors import Invalid

MAX_PDF_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 30
MAX_TEXT_CHARS = 400_000
# TCGplayer shows 10 orders per Order History page: one PDF each (#1437).
MAX_HISTORY_PDFS = 10


def extract_order_history_text(data: bytes) -> str:
    if len(data) > MAX_PDF_BYTES:
        raise Invalid("That PDF is too big (5 MB at most)")
    if not data.lstrip()[:5] == b"%PDF-":
        raise Invalid("That file is not a PDF")
    try:
        reader = PdfReader(io.BytesIO(data))
        if len(reader.pages) > MAX_PDF_PAGES:
            raise Invalid(f"That PDF has too many pages ({MAX_PDF_PAGES} at most)")
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except Invalid:
        raise
    except (PyPdfError, ValueError, KeyError, OSError, RecursionError) as exc:
        raise Invalid("Couldn't read that PDF") from exc
    text = text.strip()
    if not text:
        raise Invalid("Couldn't read any text in that PDF")
    if len(text) > MAX_TEXT_CHARS:
        raise Invalid("That PDF has too much text")
    return text
