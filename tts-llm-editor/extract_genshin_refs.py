from __future__ import annotations

import argparse
import csv
import io
import json
from pathlib import Path
from pathlib import PureWindowsPath
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

def _jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


def _wav_duration_seconds_from_bytes(wav_bytes: bytes) -> float | None:
    try:
        import soundfile as sf

        with sf.SoundFile(io.BytesIO(wav_bytes)) as f:
            if f.frames and f.samplerate:
                return float(f.frames) / float(f.samplerate)
    except Exception:
        return None
    return None


def _ingame_wem_to_wav_relpath(ingame_filename: str) -> Path:
    # Dataset uses Windows-style paths (backslashes). Normalize robustly.
    p = PureWindowsPath(ingame_filename)
    return Path(*p.parts).with_suffix(".wav")


def main() -> int:
    from datasets import Dataset, Audio
    from tqdm import tqdm

    ap = argparse.ArgumentParser(
        description="Extract wav refs from genshin parquet and write a catalog (csv/parquet) with original columns + wav_path."
    )
    ap.add_argument(
        "--src",
        default=str(ROOT / "genshin-voice-ko" / "train-00000-of-00050.parquet"),
        help="input parquet shard path",
    )
    ap.add_argument(
        "--db-name",
        default="",
        help="database name used to namespace outputs (default: derived from --src filename)",
    )
    ap.add_argument(
        "--out",
        default=str(ROOT / "Ref"),
        help="output base directory (wav files mirror inGameFilename under here, plus catalog.*)",
    )
    ap.add_argument("--limit", type=int, default=0, help="optional row limit (0=all)")
    ap.add_argument(
        "--catalog-format",
        choices=["csv", "parquet", "both"],
        default="csv",
        help="write catalog as csv/parquet/both",
    )
    args = ap.parse_args()

    src = Path(args.src)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    db_name = (args.db_name or src.stem).strip()
    if not db_name:
        raise SystemExit("db-name is empty; pass --db-name or a valid --src")

    ds = Dataset.from_parquet(str(src))
    if "audio" not in ds.column_names:
        raise SystemExit(f"Expected an 'audio' column in {src}, got columns={ds.column_names}")

    # Prefer decode=False to avoid torchcodec when possible; we can write bytes directly.
    ds = ds.cast_column("audio", Audio(decode=False))

    base_columns = [c for c in ds.column_names if c != "audio"]
    # We overwrite inGameFilename to point at the extracted wav path,
    # but also keep the original for reference.
    catalog_columns = base_columns + ["original_inGameFilename", "wav_path", "audioduration_s"]
    rows: list[dict[str, Any]] = []

    total = ds.num_rows if not args.limit else min(ds.num_rows, args.limit)
    for i in tqdm(range(total), desc="extracting"):
        ex = ds[i]
        audio = ex["audio"] or {}

        # Mirror dataset inGameFilename under Ref/, extension swapped to .wav.
        ingame = ex.get("inGameFilename") or ex.get("in_game_filename")
        if isinstance(ingame, str) and ingame.strip():
            wav_rel = Path(db_name) / _ingame_wem_to_wav_relpath(ingame.strip())
        else:
            speaker = ex.get("speaker") or ex.get("speaker_id") or "unknown"
            wav_rel = Path(db_name) / str(speaker) / f"{str(ex.get('id', i)).zfill(6)}.wav"

        wav_path = out / wav_rel
        wav_path.parent.mkdir(parents=True, exist_ok=True)
        duration_s: float | None = None

        wav_bytes = audio.get("bytes")
        if isinstance(wav_bytes, (bytes, bytearray)) and wav_bytes:
            wav_path.write_bytes(bytes(wav_bytes))
            duration_s = _wav_duration_seconds_from_bytes(bytes(wav_bytes))
        else:
            # Fallback: decode to array/sr (may require torchcodec/ffmpeg)
            import soundfile as sf

            ex_dec = Dataset.from_dict({k: [ex[k]] for k in ex.keys()}).cast_column("audio", Audio(decode=True))[0]
            audio_dec = ex_dec["audio"]
            arr = audio_dec["array"]
            sr = int(audio_dec["sampling_rate"])
            sf.write(wav_path, arr, sr)
            try:
                duration_s = float(len(arr)) / float(sr)
            except Exception:
                duration_s = None

        row: dict[str, Any] = {}
        for c in base_columns:
            row[c] = _jsonable(ex.get(c))
        row["original_inGameFilename"] = _jsonable(ex.get("inGameFilename"))

        wav_rel_str = str(wav_path.relative_to(ROOT)).replace("\\", "/")
        row["wav_path"] = wav_rel_str
        # Update inGameFilename to the actual local wav path (as requested).
        if "inGameFilename" in row:
            row["inGameFilename"] = wav_rel_str
        row["audioduration_s"] = duration_s
        rows.append(row)

        # Optional sidecar txt (use transcription/text if present)
        transcription = ex.get("transcription") or ex.get("text")
        if isinstance(transcription, str) and transcription.strip():
            wav_path.with_suffix(".txt").write_text(transcription, encoding="utf-8")

    if args.catalog_format in {"csv", "both"}:
        catalog_dir = out / "catalogs"
        catalog_dir.mkdir(parents=True, exist_ok=True)
        csv_path = catalog_dir / f"{db_name}.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=catalog_columns, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow(r)

    if args.catalog_format in {"parquet", "both"}:
        # datasets already pulls in pyarrow; keep it optional at runtime.
        import pyarrow as pa  # type: ignore
        import pyarrow.parquet as pq  # type: ignore

        table = pa.Table.from_pylist(rows)
        catalog_dir = out / "catalogs"
        catalog_dir.mkdir(parents=True, exist_ok=True)
        pq.write_table(table, catalog_dir / f"{db_name}.parquet")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
