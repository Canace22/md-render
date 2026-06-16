"""Repair Founder obfuscated ToUnicode CMaps in Chinese standard PDFs."""

from __future__ import annotations

import re
import tempfile
from pathlib import Path

import fitz

_FOUNDER_OBFUSCATED_RE = re.compile(r"E-(?:H|F|B)[XZ]9|F-B[XZ]9")
_BFRANGE_RE = re.compile(
    r"<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>"
)


def _font_key_from_registry(registry_name: str) -> str | None:
    base_name = registry_name.split("+", 1)[0]
    match = _FOUNDER_OBFUSCATED_RE.search(base_name)
    return match.group(0) if match else None


def _unicode_for_cid(font_key: str, cid: int) -> int:
    if font_key == "E-FZ9":
        return ord("0") + (cid - 0x00E2)
    if font_key == "E-BZ9":
        if cid == 0x00E0:
            return ord(".")
        if 0x00E2 <= cid <= 0x00EB:
            return ord("0") + (cid - 0x00E2)
        return cid - 1
    if font_key == "E-BX9":
        if cid == 0x0088:
            return 0x00D7
        if cid == 0x00DF:
            return ord("-")
        if cid == 0x00ED:
            return ord("=")
        return cid - 1
    if font_key == "E-HZ9":
        if cid == 0x018A:
            return ord("-")
        return cid - 1
    if font_key == "F-BZ9":
        if cid == 0x00C0:
            return 0x2160
    return cid - 1


def _patch_tounicode_stream(text: str) -> str:
    registry = re.search(r"/Registry \(([^)]+)\)", text)
    if not registry:
        return text

    font_key = _font_key_from_registry(registry.group(1))
    if font_key is None:
        return text

    def repl(match: re.Match[str]) -> str:
        cid_start = int(match.group(1), 16)
        cid_end = int(match.group(2), 16)
        lines = []
        for cid in range(cid_start, cid_end + 1):
            uni = _unicode_for_cid(font_key, cid)
            lines.append(f"<{cid:04x}> <{cid:04x}> <{uni:04x}>")
        return "\n".join(lines)

    return _BFRANGE_RE.sub(repl, text)


def _needs_founder_fix(doc: fitz.Document) -> bool:
    for xref in range(1, doc.xref_length()):
        try:
            stream = doc.xref_stream(xref)
            if not stream:
                continue
            text = stream.decode("latin1", "replace")
            if "beginbfrange" not in text:
                continue
            registry = re.search(r"/Registry \(([^)]+)\)", text)
            if _font_key_from_registry(registry.group(1)) is not None:
                return True
        except Exception:
            continue
    return False


def repair_founder_pdf(pdf_path: Path) -> tuple[Path, bool]:
    """Return a PDF with repaired Founder Latin CMaps and whether repair ran."""
    doc = fitz.open(pdf_path)
    if not _needs_founder_fix(doc):
        doc.close()
        return pdf_path, False

    fixed_streams = 0
    for xref in range(1, doc.xref_length()):
        try:
            stream = doc.xref_stream(xref)
            if not stream:
                continue
            text = stream.decode("latin1", "replace")
            if "beginbfrange" not in text:
                continue
            registry = re.search(r"/Registry \(([^)]+)\)", text)
            if not registry:
                continue
            if _font_key_from_registry(registry.group(1)) is None:
                continue
            patched = _patch_tounicode_stream(text)
            if patched != text:
                doc.update_stream(xref, patched.encode("latin1"))
                fixed_streams += 1
        except Exception:
            continue

    if fixed_streams == 0:
        doc.close()
        return pdf_path, False

    temp_pdf = Path(tempfile.mkstemp(suffix=".pdf", prefix="founder-fixed-")[1])
    doc.save(temp_pdf, garbage=4, deflate=True)
    doc.close()
    return temp_pdf, True
