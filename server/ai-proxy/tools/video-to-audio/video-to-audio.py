#!/usr/bin/env python3
"""Extract audio from video file(s) using ffmpeg."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

VIDEO_SUFFIXES = {".mp4", ".mov", ".mkv", ".avi", ".flv", ".webm", ".m4v"}
AUDIO_SUFFIX = ".mp3"
DEFAULT_SAMPLE_RATE = 16000


def check_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError(
            "ffmpeg not found in PATH. Install with `brew install ffmpeg`."
        )


def collect_video_files(input_path: Path) -> list[Path]:
    if input_path.is_file():
        if input_path.suffix.lower() not in VIDEO_SUFFIXES:
            raise ValueError(f"Not a supported video file: {input_path}")
        return [input_path]

    if not input_path.is_dir():
        raise FileNotFoundError(f"Path not found: {input_path}")

    videos = sorted(
        path
        for path in input_path.iterdir()
        if path.is_file() and path.suffix.lower() in VIDEO_SUFFIXES
    )
    if not videos:
        raise ValueError(f"No video files found in directory: {input_path}")
    return videos


def extract_audio(
    video_path: Path,
    audio_path: Path,
    *,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    bitrate: str = "192k",
) -> None:
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",  # overwrite output
        "-i", str(video_path),
        "-vn",  # no video
        "-f", "mp3",
        "-ar", str(sample_rate),
        "-ab", bitrate,
        str(audio_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr.strip()[:500]}")


def resolve_batch_output(video_path: Path, input_dir: Path, output_dir: Path) -> Path:
    rel = video_path.relative_to(input_dir)
    return output_dir / rel.with_suffix(AUDIO_SUFFIX)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract audio from video file(s) using ffmpeg.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python3 video-to-audio.py input.mp4\n"
            "  python3 video-to-audio.py input.mp4 -o output.mp3\n"
            "  python3 video-to-audio.py ./videos/ -o ./audios/\n"
        ),
    )
    parser.add_argument("input", type=Path, help="Input video file or directory")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output .mp3 file (single) or output directory (batch)",
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=DEFAULT_SAMPLE_RATE,
        help=f"Audio sample rate (default {DEFAULT_SAMPLE_RATE})",
    )
    parser.add_argument(
        "--bitrate",
        default="192k",
        help="Audio bitrate (default 192k)",
    )
    args = parser.parse_args()

    try:
        check_ffmpeg()
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    try:
        videos = collect_video_files(args.input)
    except (FileNotFoundError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    is_batch = args.input.is_dir()
    if is_batch and args.output is not None and args.output.suffix.lower() == AUDIO_SUFFIX:
        print(
            "Error: batch mode requires an output directory, not an .mp3 file.",
            file=sys.stderr,
        )
        return 1

    output_dir = args.output if is_batch else None
    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)

    for video_path in videos:
        if is_batch:
            if output_dir is None:
                audio_path = video_path.with_suffix(AUDIO_SUFFIX)
            else:
                audio_path = resolve_batch_output(video_path, args.input, output_dir)
        else:
            audio_path = args.output or video_path.with_suffix(AUDIO_SUFFIX)
            if audio_path.suffix.lower() != AUDIO_SUFFIX:
                audio_path = audio_path.with_suffix(AUDIO_SUFFIX)

        print(f"Converting: {video_path} -> {audio_path}")
        try:
            extract_audio(
                video_path,
                audio_path,
                sample_rate=args.sample_rate,
                bitrate=args.bitrate,
            )
        except Exception as e:
            print(f"Failed to convert {video_path}: {e}", file=sys.stderr)
            return 1

        print(f"Done: {audio_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())