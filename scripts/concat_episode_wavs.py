#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, NamedTuple


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


class _ClipRef(NamedTuple):
    clip_id: str
    out_wav: Path


def _iter_wav_paths_by_clip(jobs: Iterable[object]) -> dict[EpisodeGroup, list[_ClipRef]]:
    grouped: dict[EpisodeGroup, list[_ClipRef]] = {}
    for j in jobs:
        clip_id = str(getattr(j, "clip_id"))
        out_wav = Path(getattr(j, "out_wav_path"))
        parts = clip_id.split("/")
        if len(parts) < 3:
            continue
        scenario_id, episode_id, player_key = parts[0], parts[1], parts[2]
        group = EpisodeGroup(scenario_id=scenario_id, episode_id=episode_id, player_key=player_key)
        grouped.setdefault(group, []).append(_ClipRef(clip_id=clip_id, out_wav=out_wav))
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


def _variant_player_count(player_key: str) -> int | None:
    # generate_scenario_audio.py currently uses "p{count}" keys for variants.
    if player_key.startswith("p") and player_key[1:].isdigit():
        return int(player_key[1:])
    return None


def _build_role_wake_order_map(scenario_json: dict) -> dict[tuple[str, str, str], list[str]]:
    """
    Returns map[(scenarioId, episodeId, playerKey)] -> roleWakeOrder list.

    Supports runtime/legacy format ({scenarios:[...]}) and compact single-scenario format.
    """

    def iter_scenarios(raw_obj: dict) -> list[dict]:
        if isinstance(raw_obj.get("scenarios"), list):
            return [s for s in (raw_obj.get("scenarios") or []) if isinstance(s, dict)]
        if raw_obj.get("scenarioId"):
            return [raw_obj]
        return []

    def iter_episodes(scenario_obj: dict) -> list[dict]:
        eps = scenario_obj.get("episodes")
        if isinstance(eps, list):
            return [e for e in eps if isinstance(e, dict)]
        if isinstance(eps, dict):
            out: list[dict] = []
            for k, v in eps.items():
                if isinstance(v, dict):
                    out.append({"episodeId": str(k), **v})
            return out
        return []

    order_map: dict[tuple[str, str, str], list[str]] = {}
    for scenario in iter_scenarios(scenario_json):
        scenario_id = str(scenario.get("scenarioId") or "").strip()
        if not scenario_id:
            continue
        for ep in iter_episodes(scenario):
            episode_id = str(ep.get("episodeId") or "").strip()
            if not episode_id:
                continue
            variants = ep.get("variantByPlayerCount") or {}
            if not isinstance(variants, dict):
                continue
            for player_count_key, variant in variants.items():
                if not isinstance(variant, dict):
                    continue
                wake = variant.get("roleWakeOrder")
                if not isinstance(wake, list):
                    continue
                wake_list = [str(r) for r in wake if str(r).strip()]
                player_key = f"p{player_count_key}"
                order_map[(scenario_id, episode_id, player_key)] = wake_list
    return order_map


def _clip_sort_key(clip_id: str, *, role_wake_order: list[str] | None) -> tuple:
    parts = clip_id.split("/")
    section = "/".join(parts[3:]) if len(parts) > 3 else ""

    def parse_int(s: str, default: int = 9999) -> int:
        try:
            return int(s)
        except Exception:
            return default

    if section.startswith("opening/"):
        return (0, parse_int(section.split("/", 1)[1]))

    if section.startswith("role/"):
        # role/<roleKey>/<before|during|after>/<idx>
        segs = section.split("/")
        role_key = segs[1] if len(segs) > 1 else ""
        part = segs[2] if len(segs) > 2 else ""
        idx = segs[3] if len(segs) > 3 else ""

        role_pos = 9999
        if role_wake_order:
            try:
                role_pos = role_wake_order.index(role_key)
            except ValueError:
                role_pos = 9999

        part_pos = {"before": 0, "during": 1, "after": 2}.get(part, 9)
        return (1, role_pos, part_pos, parse_int(idx))

    if section.startswith("outro/"):
        return (2, parse_int(section.split("/", 1)[1]))

    return (3, section)


def concat_episode_wavs_from_jobs(
    *,
    jobs: Iterable[object],
    scenario_json_path: Path,
    voices_base: Path,
    wake_order_scenario_path: Path | None = None,
    out_dir_mode: str = "scenario",
    out_name_template: str = "{scenarioId}__{episodeId}__{playerKey}__episode.wav",
    out_filename: str = "",
    missing: str = "fail",
    dry_run: bool = False,
) -> int:
    """
    Concatenate generated per-clip wavs into one episode wav per (scenarioId, episodeId, pN).

    This is the same logic as the CLI `main()` but accepts already-built jobs so callers
    (e.g. generate_scenario_audio.py) can run it as a post-processing step.
    """
    grouped = _iter_wav_paths_by_clip(jobs)
    if not grouped:
        print("[warn] concat: no clips found in jobs; skipping")
        return 0

    scenario_path = Path(scenario_json_path)
    raw = json.loads(scenario_path.read_text(encoding="utf-8"))
    wake_src_path = wake_order_scenario_path or scenario_path
    wake_src = json.loads(Path(wake_src_path).read_text(encoding="utf-8"))
    wake_order_map = _build_role_wake_order_map(wake_src)

    if isinstance(raw.get("scenarios"), list):
        scenario_ids = [str(s.get("scenarioId") or "").strip() for s in (raw.get("scenarios") or [])]
    else:
        scenario_ids = [str(raw.get("scenarioId") or "").strip()] if raw.get("scenarioId") else []

    print(f"[info] concat: scenario={scenario_path} scenarioIds={scenario_ids or [scenario_path.stem]}")
    if Path(wake_src_path) != scenario_path:
        print(f"[info] concat: wake_order_scenario={wake_src_path}")
    print(f"[info] concat: voices_base={voices_base} episode_variants={len(grouped)}")

    wrote = 0
    for group in sorted(grouped.keys(), key=lambda g: (g.scenario_id, g.episode_id, g.player_key)):
        role_wake_order = wake_order_map.get((group.scenario_id, group.episode_id, group.player_key))
        clip_refs = sorted(grouped[group], key=lambda r: _clip_sort_key(r.clip_id, role_wake_order=role_wake_order))
        wavs = [r.out_wav for r in clip_refs]

        existing: list[Path] = []
        missing_paths: list[Path] = []
        for p in wavs:
            if p.exists():
                existing.append(p)
            else:
                missing_paths.append(p)

        if str(out_filename).strip():
            out_name = str(out_filename).strip()
        else:
            out_name = str(out_name_template).format(
                scenarioId=group.scenario_id, episodeId=group.episode_id, playerKey=group.player_key
            )

        if str(out_dir_mode) == "variant":
            out_path = voices_base / group.scenario_id / group.episode_id / group.player_key / out_name
        elif str(out_dir_mode) == "episode":
            out_path = voices_base / group.scenario_id / group.episode_id / out_name
        else:
            out_path = voices_base / group.scenario_id / out_name

        print(f"[plan] concat: {group.key} clips={len(wavs)} ok={len(existing)} missing={len(missing_paths)} -> {out_path}")

        if missing_paths and str(missing) == "fail":
            print("[error] concat: missing clip wav(s):")
            for m in missing_paths[:20]:
                print(f"  - {m}")
            if len(missing_paths) > 20:
                print(f"  ... (+{len(missing_paths)-20} more)")
            return 1

        if dry_run:
            continue

        if not existing:
            print(f"[warn] concat: skipping empty episode output (no existing wavs): {group.key}")
            continue

        concat_wavs(existing, out_path)
        wrote += 1

    print(f"[done] concat: wrote {wrote} episode wav(s)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Concatenate per-clip voice.wav into one big episode wav per episode (+player-count variant)."
    )
    parser.add_argument(
        "--scenario",
        default=str(ROOT / "scenarios_tts" / "ghost_survey_club.tts.json"),
        help="Scenario JSON path.",
    )
    parser.add_argument(
        "--wake-order-scenario",
        default="",
        help=(
            "Optional JSON path to read roleWakeOrder from (e.g. runtime scenario under scenarios/). "
            "If omitted, uses --scenario."
        ),
    )
    parser.add_argument(
        "--voices-base",
        default=str(ROOT / "public" / "assets" / "voices"),
        help="Base folder where per-clip voice.wav files exist (same as generate_scenario_audio.py --out-base).",
    )
    parser.add_argument(
        "--out-filename",
        default="",
        help=(
            "Output filename (legacy). If provided, overrides --out-name-template and writes to the selected output folder."
        ),
    )
    parser.add_argument(
        "--out-dir-mode",
        choices=["scenario", "episode", "variant"],
        default="scenario",
        help=(
            "Where to write the concatenated wav: "
            "scenario = under the scenario folder (voices_base/scenario/...), "
            "episode = under the episode folder (voices_base/scenario/episode/...), "
            "variant = inside each pN folder (voices_base/scenario/episode/pN/...)."
        ),
    )
    parser.add_argument(
        "--out-name-template",
        default="{scenarioId}__{episodeId}__{playerKey}__episode.wav",
        help=(
            "Output filename template when --out-filename is not set. "
            "Supported placeholders: {scenarioId}, {episodeId}, {playerKey}."
        ),
    )
    parser.add_argument(
        "--missing",
        choices=["fail", "skip"],
        default="fail",
        help="What to do when a clip wav is missing: fail (default) or skip.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print planned outputs without writing.")
    parser.add_argument(
        "--variant-mode",
        choices=["all", "max-only", "best-fit"],
        default="all",
        help="Which episode variants to process: all (default), max-only, or best-fit.",
    )
    parser.add_argument(
        "--best-fit-player-count",
        type=int,
        default=0,
        help="Used when --variant-mode best-fit: pick the smallest variant >= this count (else max).",
    )
    args = parser.parse_args()

    scenario_path = Path(args.scenario)
    voices_base = Path(args.voices_base)

    gen_mod = _load_module(ROOT / "scripts" / "generate_scenario_audio.py", "one_night_generate_scenario_audio")
    jobs = gen_mod.build_jobs(
        scenario_json_path=scenario_path,
        out_base=voices_base,
        variant_mode=str(args.variant_mode),
        best_fit_player_count=(int(args.best_fit_player_count) if int(args.best_fit_player_count) > 0 else None),
    )

    grouped = _iter_wav_paths_by_clip(jobs)
    if not grouped:
        raise SystemExit("No clips found in scenario.")

    # Determine output locations and run concat.
    raw = json.loads(scenario_path.read_text(encoding="utf-8"))
    wake_src_path = Path(args.wake_order_scenario) if str(args.wake_order_scenario).strip() else scenario_path
    wake_src = json.loads(wake_src_path.read_text(encoding="utf-8"))
    wake_order_map = _build_role_wake_order_map(wake_src)
    if isinstance(raw.get("scenarios"), list):
        scenario_ids = [str(s.get("scenarioId") or "").strip() for s in (raw.get("scenarios") or [])]
    else:
        scenario_ids = [str(raw.get("scenarioId") or "").strip()] if raw.get("scenarioId") else []
    print(f"[info] scenario={scenario_path} scenarioIds={scenario_ids or [scenario_path.stem]}")
    if wake_src_path != scenario_path:
        print(f"[info] wake_order_scenario={wake_src_path}")
    print(f"[info] voices_base={voices_base} episode_variants={len(grouped)}")

    wrote = 0
    for group in sorted(grouped.keys(), key=lambda g: (g.scenario_id, g.episode_id, g.player_key)):
        role_wake_order = wake_order_map.get((group.scenario_id, group.episode_id, group.player_key))
        clip_refs = sorted(
            grouped[group],
            key=lambda r: _clip_sort_key(r.clip_id, role_wake_order=role_wake_order),
        )
        wavs = [r.out_wav for r in clip_refs]
        existing: list[Path] = []
        missing: list[Path] = []
        for p in wavs:
            if p.exists():
                existing.append(p)
            else:
                missing.append(p)

        if str(args.out_filename).strip():
            out_name = str(args.out_filename).strip()
        else:
            out_name = str(args.out_name_template).format(
                scenarioId=group.scenario_id, episodeId=group.episode_id, playerKey=group.player_key
            )

        if str(args.out_dir_mode) == "variant":
            out_path = voices_base / group.scenario_id / group.episode_id / group.player_key / out_name
        elif str(args.out_dir_mode) == "episode":
            out_path = voices_base / group.scenario_id / group.episode_id / out_name
        else:
            out_path = voices_base / group.scenario_id / out_name

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
