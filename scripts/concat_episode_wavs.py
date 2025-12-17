#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]


def _load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load module: {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


@dataclass(frozen=True)
class EpisodeGroup:
    scenario_id: str
    episode_id: str
    player_key: str  # e.g. "p3"

    @property
    def key(self) -> str:
        return f"{self.scenario_id}/{self.episode_id}/{self.player_key}"


def _iter_wav_paths_in_order(jobs: Iterable[object]) -> dict[EpisodeGroup, list[Path]]:
    grouped: dict[EpisodeGroup, list[Path]] = {}
    for j in jobs:
        clip_id = str(getattr(j, "clip_id"))
        out_wav = Path(getattr(j, "out_wav_path"))
        parts = clip_id.split("/")
        if len(parts) < 3:
            continue
        scenario_id, episode_id, player_key = parts[0], parts[1], parts[2]
        group = EpisodeGroup(scenario_id=scenario_id, episode_id=episode_id, player_key=player_key)
        grouped.setdefault(group, []).append(out_wav)
    return grouped


def concat_wavs(wav_paths: list[Path], out_wav_path: Path) -> Path:
    if not wav_paths:
        raise ValueError("No wav parts to concat")
    if len(wav_paths) == 1:
        out_wav_path.parent.mkdir(parents=True, exist_ok=True)
        out_wav_path.write_bytes(wav_paths[0].read_bytes())
        return out_wav_path

    out_wav_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(wav_paths[0]), "rb") as w0:
        channels = w0.getnchannels()
        sampwidth = w0.getsampwidth()
        framerate = w0.getframerate()
        comptype = w0.getcomptype()
        compname = w0.getcompname()
        frames = [w0.readframes(w0.getnframes())]

    for p in wav_paths[1:]:
        with wave.open(str(p), "rb") as w:
            if (
                w.getnchannels() != channels
                or w.getsampwidth() != sampwidth
                or w.getframerate() != framerate
                or w.getcomptype() != comptype
            ):
                raise ValueError(
                    "WAV params mismatch, cannot concat:\n"
                    f"  first={wav_paths[0]}\n"
                    f"  bad={p}\n"
                    f"  first_params=(ch={channels},sw={sampwidth},hz={framerate},comp={comptype})\n"
                    f"  bad_params=(ch={w.getnchannels()},sw={w.getsampwidth()},hz={w.getframerate()},comp={w.getcomptype()})"
                )
            frames.append(w.readframes(w.getnframes()))

    with wave.open(str(out_wav_path), "wb") as out:
        out.setnchannels(channels)
        out.setsampwidth(sampwidth)
        out.setframerate(framerate)
        if comptype != "NONE":
            out.setcomptype(comptype, compname)
        for chunk in frames:
            out.writeframes(chunk)
    return out_wav_path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Concatenate per-clip voice.wav into one big episode wav per episode (+player-count variant)."
    )
    parser.add_argument(
        "--scenario",
        default=str(ROOT / "scenarios" / "ghost_survey_club.json"),
        help="Scenario JSON path.",
    )
    parser.add_argument(
        "--voices-base",
        default=str(ROOT / "public" / "assets" / "voices"),
        help="Base folder where per-clip voice.wav files exist (same as generate_scenario_audio.py --out-base).",
    )
    parser.add_argument(
        "--out-filename",
        default="_episode.wav",
        help="Output filename to create under each episode variant folder (e.g. _episode.wav).",
    )
    parser.add_argument(
        "--missing",
        choices=["fail", "skip"],
        default="fail",
        help="What to do when a clip wav is missing: fail (default) or skip.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print planned outputs without writing.")
    args = parser.parse_args()

    scenario_path = Path(args.scenario)
    voices_base = Path(args.voices_base)

    gen_mod = _load_module(ROOT / "scripts" / "generate_scenario_audio.py", "one_night_generate_scenario_audio")
    jobs = gen_mod.build_jobs(scenario_json_path=scenario_path, out_base=voices_base)

    grouped = _iter_wav_paths_in_order(jobs)
    if not grouped:
        raise SystemExit("No clips found in scenario.")

    # Determine output locations and run concat.
    raw = json.loads(scenario_path.read_text(encoding="utf-8"))
    scenario_ids = [str(s.get("scenarioId") or "").strip() for s in (raw.get("scenarios") or [])]
    print(f"[info] scenario={scenario_path} scenarioIds={scenario_ids or [scenario_path.stem]}")
    print(f"[info] voices_base={voices_base} episode_variants={len(grouped)}")

    wrote = 0
    for group in sorted(grouped.keys(), key=lambda g: (g.scenario_id, g.episode_id, g.player_key)):
        wavs = grouped[group]
        existing: list[Path] = []
        missing: list[Path] = []
        for p in wavs:
            if p.exists():
                existing.append(p)
            else:
                missing.append(p)

        out_path = voices_base / group.scenario_id / group.episode_id / group.player_key / str(args.out_filename)
        print(f"[plan] {group.key} clips={len(wavs)} ok={len(existing)} missing={len(missing)} -> {out_path}")

        if missing and args.missing == "fail":
            print("[error] missing clip wav(s):")
            for m in missing[:20]:
                print(f"  - {m}")
            if len(missing) > 20:
                print(f"  ... (+{len(missing)-20} more)")
            return 1

        if args.dry_run:
            continue

        if not existing:
            print(f"[warn] skipping empty episode output (no existing wavs): {group.key}")
            continue

        concat_wavs(existing, out_path)
        wrote += 1

    print(f"[done] wrote {wrote} episode wav(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

