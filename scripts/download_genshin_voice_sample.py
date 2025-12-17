#!/usr/bin/env python3
from __future__ import annotations

import argparse
import mimetypes
import re
import time
from urllib.parse import urlparse
from pathlib import Path
from typing import Any

import requests


HF_ROWS_URL = "https://datasets-server.huggingface.co/rows"
HF_SEARCH_URL = "https://datasets-server.huggingface.co/search"


def _http_get_json(url: str, *, params: dict[str, Any], timeout_s: int = 60) -> dict[str, Any]:
    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            resp = requests.get(url, params=params, timeout=timeout_s)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:  # noqa: BLE001 - CLI tool, retry on any failure
            last_err = e
            time.sleep(0.8 * attempt)
    raise RuntimeError(f"HTTP request failed after retries: {url} params={params}") from last_err


def _normalize_in_game_filename(value: str) -> str:
    # Dataset uses Windows-style paths.
    value = (value or "").replace("\\", "/").strip("/")
    # Prevent path traversal and weird edge cases.
    value = re.sub(r"(^|/)\.\.(?=/|$)", "_", value)
    value = re.sub(r"(^|/)\.(?=/|$)", "_", value)
    return value


def _guess_speaker_id(row: dict[str, Any]) -> str:
    speaker = str(row.get("speaker") or "").strip()
    if speaker:
        return speaker

    in_game = _normalize_in_game_filename(str(row.get("inGameFilename") or ""))
    parts = [p for p in in_game.split("/") if p]
    # Common pattern: .../VO_paimon/...
    for part in parts:
        if part.lower().startswith("vo_") and len(part) > 3:
            return part[3:]
    # Fallback: infer from filename tokens like *_paimon_*
    stem = Path(parts[-1]).stem if parts else ""
    m = re.search(r"_(paimon|traveler|lumine|aether|dainsleif|katheryne)_", stem, flags=re.IGNORECASE)
    if m:
        return m.group(1)
    return "unknown"


def _normalize_token(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).lower()


def _normalize_language(value: str) -> str:
    # Keep it simple: exact label matching with case/space normalization.
    return _normalize_token(value)


def _row_matches_filters(
    row: dict[str, Any],
    *,
    language: str | None,
    character: str | None,
    in_game_contains: str | None,
) -> bool:
    if language:
        row_lang = _normalize_language(str(row.get("language") or ""))
        if row_lang != _normalize_language(language):
            return False

    if character:
        want = _normalize_token(character)
        speaker_raw = _normalize_token(str(row.get("speaker") or ""))
        speaker_guess = _normalize_token(_guess_speaker_id(row))
        if want not in {speaker_raw, speaker_guess}:
            return False

    if in_game_contains:
        in_game = _normalize_in_game_filename(str(row.get("inGameFilename") or ""))
        if _normalize_token(in_game_contains) not in _normalize_token(in_game):
            return False

    return True


def _ext_from_audio(audio_obj: dict[str, Any]) -> str:
    src = str(audio_obj.get("src") or "")
    kind = str(audio_obj.get("type") or "")
    if kind:
        guessed = mimetypes.guess_extension(kind.split(";")[0].strip())
        if guessed:
            return guessed
    # Fallback to URL path suffix (avoid matching domain like *.huggingface.co).
    try:
        path = urlparse(src).path
        suffix = Path(path).suffix
        if suffix:
            return suffix
    except Exception:
        pass
    return ".wav"


def _download_file(url: str, out_path: Path, *, timeout_s: int = 120) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=timeout_s) as r:
        r.raise_for_status()
        with out_path.open("wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                if chunk:
                    f.write(chunk)


def _pick_row(
    *,
    dataset: str,
    config: str,
    split: str,
    query: str | None,
    index: int,
) -> dict[str, Any]:
    if query:
        data = _http_get_json(
            HF_SEARCH_URL,
            params={
                "dataset": dataset,
                "config": config,
                "split": split,
                "query": query,
                "offset": index,
                "length": 1,
            },
        )
    else:
        data = _http_get_json(
            HF_ROWS_URL,
            params={
                "dataset": dataset,
                "config": config,
                "split": split,
                "offset": index,
                "length": 1,
            },
        )
    rows = data.get("rows") or []
    if not rows:
        raise RuntimeError("No rows returned (check query/index).")
    return rows[0]["row"]


def _iter_rows(
    *,
    dataset: str,
    config: str,
    split: str,
    query: str | None,
    start: int,
    limit: int | None,
    batch_size: int,
) -> tuple[int | None, list[dict[str, Any]]]:
    """
    Yield batches of rows.
    Returns (num_rows_total, rows_batch).
    """
    if batch_size <= 0:
        raise ValueError("--batch-size must be > 0")
    if start < 0:
        raise ValueError("--start must be >= 0")
    if limit is not None and limit < 0:
        raise ValueError("--limit must be >= 0")

    offset = start
    remaining = limit
    total: int | None = None

    while True:
        length = batch_size if remaining is None else min(batch_size, remaining)
        if length == 0:
            break

        if query:
            data = _http_get_json(
                HF_SEARCH_URL,
                params={
                    "dataset": dataset,
                    "config": config,
                    "split": split,
                    "query": query,
                    "offset": offset,
                    "length": length,
                },
            )
        else:
            data = _http_get_json(
                HF_ROWS_URL,
                params={
                    "dataset": dataset,
                    "config": config,
                    "split": split,
                    "offset": offset,
                    "length": length,
                },
            )

        if total is None:
            maybe_total = data.get("num_rows_total")
            if isinstance(maybe_total, int):
                total = maybe_total

        rows = data.get("rows") or []
        if not rows:
            break

        out = [r["row"] for r in rows]
        yield total, out

        offset += len(out)
        if remaining is not None:
            remaining -= len(out)
            if remaining <= 0:
                break


def _build_output_paths(
    *,
    out_dir: Path,
    layout: str,
    row: dict[str, Any],
    audio_ext: str,
) -> tuple[Path, Path]:
    language = str(row.get("language") or "Unknown").strip() or "Unknown"
    clip_type = str(row.get("type") or "Unknown").strip() or "Unknown"
    speaker_id = _guess_speaker_id(row)

    in_game = _normalize_in_game_filename(str(row.get("inGameFilename") or "clip"))
    stem = Path(in_game).stem or "clip"

    if layout == "flat":
        base = out_dir / stem
    elif layout == "language":
        base = out_dir / language / stem
    elif layout == "language_speaker":
        base = out_dir / language / speaker_id / stem
    elif layout == "language_speaker_type":
        base = out_dir / language / speaker_id / clip_type / stem
    elif layout == "in_game_path":
        base = out_dir / language / Path(in_game).with_suffix("")
    else:
        raise ValueError(f"Unknown layout: {layout}")

    return base.with_suffix(audio_ext), base.with_suffix(".txt")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download audio rows from the Hugging Face dataset simon3000/genshin-voice.",
    )
    parser.add_argument("--dataset", default="simon3000/genshin-voice")
    parser.add_argument("--config", default="default")
    parser.add_argument("--split", default="train")
    parser.add_argument(
        "--query",
        default="Paimon Korean",
        help="Search query (uses datasets-server /search). Set empty to use /rows.",
    )
    parser.add_argument(
        "--index",
        type=int,
        default=0,
        help="0-based index within the search results (or rows). Used only when downloading a single item.",
    )
    parser.add_argument("--all", action="store_true", help="Download all matching rows (paged).")
    parser.add_argument(
        "--limit",
        type=int,
        default=1,
        help="How many rows to download (ignored if --all). Set to 0 to download nothing.",
    )
    parser.add_argument("--start", type=int, default=0, help="Start offset within search results (or rows).")
    parser.add_argument("--batch-size", type=int, default=100, help="Rows per request when using --all/--limit.")
    parser.add_argument("--sleep", type=float, default=0.0, help="Seconds to sleep between downloads.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing wav/txt if present.")
    parser.add_argument(
        "--language",
        default="",
        help='Post-filter by exact language label (e.g. "Korean", "English(US)").',
    )
    parser.add_argument(
        "--character",
        default="",
        help='Post-filter by character (matches speaker or in-game VO folder, e.g. "paimon").',
    )
    parser.add_argument(
        "--in-game-contains",
        default="",
        help='Post-filter by substring in inGameFilename (e.g. "VO_paimon").',
    )
    parser.add_argument("--out-dir", default="out/genshin-voice", help="Output directory root.")
    parser.add_argument(
        "--layout",
        default="in_game_path",
        choices=["flat", "language", "language_speaker", "language_speaker_type", "in_game_path"],
        help="How to place files under out-dir.",
    )
    args = parser.parse_args()

    query = (args.query or "").strip() or None
    language = (args.language or "").strip() or None
    character = (args.character or "").strip() or None
    in_game_contains = (args.in_game_contains or "").strip() or None

    # Hugging Face /search is a broad full-text match, so make common queries safer:
    # If user writes "Paimon Korean" but didn't specify filters, infer them.
    if query and language is None and character is None and in_game_contains is None:
        qn = _normalize_token(query)
        if "korean" in qn:
            language = "Korean"
        if "paimon" in qn:
            character = "paimon"
            in_game_contains = "VO_paimon"

    if not args.all and args.limit == 1:
        row = _pick_row(
            dataset=args.dataset,
            config=args.config,
            split=args.split,
            query=query,
            index=args.index,
        )
        rows_batches = [(None, [row])]
    else:
        limit: int | None = None if args.all else args.limit
        rows_batches = _iter_rows(
            dataset=args.dataset,
            config=args.config,
            split=args.split,
            query=query,
            start=args.start,
            limit=limit,
            batch_size=args.batch_size,
        )

    downloaded = 0
    skipped = 0
    filtered = 0
    seen_total: int | None = None

    for total, batch in rows_batches:
        if total is not None:
            seen_total = total
        for row in batch:
            if not _row_matches_filters(
                row,
                language=language,
                character=character,
                in_game_contains=in_game_contains,
            ):
                filtered += 1
                continue

            audio_obj = (row.get("audio") or [{}])[0] or {}
            src = str(audio_obj.get("src") or "").strip()
            if not src:
                skipped += 1
                continue

            wav_path, txt_path = _build_output_paths(
                out_dir=Path(args.out_dir),
                layout=args.layout,
                row=row,
                audio_ext=".wav",
            )

            if not args.overwrite and wav_path.exists() and txt_path.exists():
                skipped += 1
                continue

            _download_file(src, wav_path)
            transcription = str(row.get("transcription") or "")
            txt_path.parent.mkdir(parents=True, exist_ok=True)
            txt_path.write_text(transcription + "\n", encoding="utf-8")

            downloaded += 1
            if downloaded % 25 == 0:
                suffix = f"/{seen_total}" if seen_total is not None else ""
                print(f"Progress: {downloaded}{suffix} downloaded, {skipped} skipped, {filtered} filtered")
            if args.sleep > 0:
                time.sleep(args.sleep)

    suffix = f"/{seen_total}" if seen_total is not None else ""
    print(f"Done: {downloaded}{suffix} downloaded, {skipped} skipped, {filtered} filtered")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
