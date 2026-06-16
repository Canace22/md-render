#!/usr/bin/env python3
"""Convert PDF file(s) to Word (.docx) format."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pdf_founder_fix import repair_founder_pdf

PDF_SUFFIX = ".pdf"
DOCX_SUFFIX = ".docx"


def resolve_output_path(input_path: Path, output_path: Path | None) -> Path:
    if output_path is not None:
        return output_path
    return input_path.with_suffix(DOCX_SUFFIX)


def convert_pdf_to_docx(
    pdf_path: Path,
    docx_path: Path,
    *,
    start_page: int | None = None,
    end_page: int | None = None,
    fix_founder: bool = True,
) -> None:
    from pdf2docx import Converter

    docx_path.parent.mkdir(parents=True, exist_ok=True)

    source_pdf = pdf_path
    repaired_pdf: Path | None = None
    if fix_founder:
        repaired_pdf, repaired = repair_founder_pdf(pdf_path)
        if repaired:
            source_pdf = repaired_pdf
            print("Applied Founder font encoding fix before conversion.")

    converter = Converter(str(source_pdf))
    try:
        convert_kwargs: dict[str, int] = {}
        if start_page is not None:
            convert_kwargs["start"] = start_page
        if end_page is not None:
            convert_kwargs["end"] = end_page
        converter.convert(str(docx_path), **convert_kwargs)
    finally:
        converter.close()
        if repaired_pdf is not None and repaired_pdf != pdf_path:
            repaired_pdf.unlink(missing_ok=True)


def collect_pdf_files(input_path: Path) -> list[Path]:
    if input_path.is_file():
        if input_path.suffix.lower() != PDF_SUFFIX:
            raise ValueError(f"Not a PDF file: {input_path}")
        return [input_path]

    if not input_path.is_dir():
        raise FileNotFoundError(f"Path not found: {input_path}")

    pdf_files = sorted(
        path
        for path in input_path.iterdir()
        if path.is_file() and path.suffix.lower() == PDF_SUFFIX
    )
    if not pdf_files:
        raise ValueError(f"No PDF files found in directory: {input_path}")
    return pdf_files


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert PDF file(s) to Word (.docx).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python3 scripts/pdf-to-docx.py report.pdf\n"
            "  python3 scripts/pdf-to-docx.py report.pdf -o output/report.docx\n"
            "  python3 scripts/pdf-to-docx.py ./pdfs/ -o ./docx/\n"
            "  python3 scripts/pdf-to-docx.py report.pdf --start 0 --end 2\n"
        ),
    )
    parser.add_argument(
        "input",
        type=Path,
        help="Input PDF file or directory containing PDF files",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output .docx file (single input) or output directory (batch input)",
    )
    parser.add_argument(
        "--start",
        type=int,
        default=None,
        help="Start page index (0-based, inclusive)",
    )
    parser.add_argument(
        "--end",
        type=int,
        default=None,
        help="End page index (0-based, inclusive)",
    )
    parser.add_argument(
        "--no-fix-founder",
        action="store_true",
        help="Skip Founder obfuscated-font repair for Chinese standard PDFs",
    )
    return parser.parse_args()


def resolve_batch_output_path(
    pdf_path: Path,
    input_dir: Path,
    output_dir: Path,
) -> Path:
    relative_path = pdf_path.relative_to(input_dir)
    return output_dir / relative_path.with_suffix(DOCX_SUFFIX)


def main() -> int:
    args = parse_args()

    try:
        pdf_files = collect_pdf_files(args.input)
    except (FileNotFoundError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    is_batch = args.input.is_dir()
    if is_batch and args.output is not None and args.output.suffix.lower() == DOCX_SUFFIX:
        print(
            "Error: batch mode requires an output directory, not a .docx file.",
            file=sys.stderr,
        )
        return 1

    if not is_batch and args.output is not None and args.output.suffix.lower() != DOCX_SUFFIX:
        print("Error: single-file mode output must end with .docx.", file=sys.stderr)
        return 1

    output_dir = args.output if is_batch else None
    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)

    for pdf_path in pdf_files:
        if is_batch:
            if output_dir is None:
                docx_path = pdf_path.with_suffix(DOCX_SUFFIX)
            else:
                docx_path = resolve_batch_output_path(pdf_path, args.input, output_dir)
        else:
            docx_path = resolve_output_path(pdf_path, args.output)

        print(f"Converting: {pdf_path} -> {docx_path}")
        try:
            convert_pdf_to_docx(
                pdf_path,
                docx_path,
                start_page=args.start,
                end_page=args.end,
                fix_founder=not args.no_fix_founder,
            )
        except Exception as error:  # noqa: BLE001 - surface library errors to CLI
            print(f"Failed to convert {pdf_path}: {error}", file=sys.stderr)
            return 1

        print(f"Done: {docx_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
