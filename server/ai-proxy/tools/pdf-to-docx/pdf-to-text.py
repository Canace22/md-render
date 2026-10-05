#!/usr/bin/env python3
"""Extract bounded plain text from a PDF for AI attachment context."""

import sys
from pathlib import Path

import fitz

MAX_PAGES = 200


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: pdf-to-text.py input.pdf", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1])
    try:
        document = fitz.open(input_path)
        chunks = []
        for page_index in range(min(document.page_count, MAX_PAGES)):
            text = document.load_page(page_index).get_text("text").strip()
            if text:
                chunks.append(text)
        print("\n\n".join(chunks))
        return 0
    except Exception as error:  # noqa: BLE001 - CLI must return a readable failure
        print(f"PDF text extraction failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
