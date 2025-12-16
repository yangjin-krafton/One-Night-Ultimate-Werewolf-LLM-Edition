#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class ClipJob:
    clip_id: str
    speaker_id: str
    text: str
    out_wav_path: Path
    url_path: str


def _load_gpt_sovits_module() -> Any:
    mod_path = ROOT / "scripts" / "gpt_sovits_tts.py"
    # Use a stable module name and ensure it's registered in sys.modules
    # before exec_module() so dataclasses can resolve cls.__module__.
    spec = importlib.util.spec_from_file_location("one_night_gpt_sovits_tts", mod_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load module: {mod_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _iter_clips_from_variant(narration: dict[str, Any]) -> Iterable[tuple[str, str, str]]:
    """
    Yield tuples: (section_key, speakerId, text)
    section_key is stable and used for clipId/path.
    """
    for idx, clip in enumerate(narration.get("openingClips") or [], start=1):
        yield (f"opening/{idx:03d}", str(clip.get("speakerId") or "Narrator"), str(clip.get("text") or ""))

    role_clips = narration.get("roleClips") or {}
    for role_key in sorted(role_clips.keys()):
        role_obj = role_clips.get(role_key) or {}
        for part in ("before", "during", "after"):
            clips = role_obj.get(part) or []
            for idx, clip in enumerate(clips, start=1):
                yield (
                    f"role/{role_key}/{part}/{idx:03d}",
                    str(clip.get("speakerId") or "Narrator"),
                    str(clip.get("text") or ""),
                )

    for idx, clip in enumerate(narration.get("nightOutroClips") or [], start=1):
        yield (f"outro/{idx:03d}", str(clip.get("speakerId") or "Narrator"), str(clip.get("text") or ""))


def build_jobs(
    *,
    scenario_json_path: Path,
    out_base: Path,
) -> list[ClipJob]:
    raw = json.loads(scenario_json_path.read_text(encoding="utf-8"))
    jobs: list[ClipJob] = []

    for scenario in raw.get("scenarios") or []:
        scenario_id = str(scenario.get("scenarioId") or "").strip() or scenario_json_path.stem
        for episode in scenario.get("episodes") or []:
            episode_id = str(episode.get("episodeId") or "").strip() or "episode"
            variants = episode.get("variantByPlayerCount") or {}
            for player_count in sorted(variants.keys(), key=lambda x: int(x) if str(x).isdigit() else 9999):
                variant = variants.get(player_count) or {}
                narration = (variant.get("narration") or {}) if isinstance(variant, dict) else {}
                for section_key, speaker_id, text in _iter_clips_from_variant(narration):
                    if not text.strip():
                        continue
                    clip_id = f"{scenario_id}/{episode_id}/p{player_count}/{section_key}"
                    out_dir = out_base / scenario_id / episode_id / f"p{player_count}" / section_key
                    out_wav = out_dir / "voice.wav"
                    url = f"/assets/voices/{scenario_id}/{episode_id}/p{player_count}/{section_key}/voice.wav".replace("\\", "/")
                    jobs.append(ClipJob(clip_id=clip_id, speaker_id=speaker_id, text=text, out_wav_path=out_wav, url_path=url))

    return jobs


def resolve_character_config(*, characters_dir: Path, speaker_id: str) -> Path | None:
    candidate = characters_dir / speaker_id / "character.json"
    if candidate.exists():
        return candidate
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate scenario narration audio resources (voice.wav) from scenario JSON.")
    parser.add_argument("--scenario", default=str(ROOT / "scenarios" / "ghost_survey_club.json"), help="Scenario JSON path.")
    parser.add_argument("--out-base", default=str(ROOT / "public" / "assets" / "voices"), help="Output base folder for voice assets.")
    parser.add_argument(
        "--tts",
        default=os.environ.get("TTS_BACKEND", "auto"),
        choices=["auto", "gpt-sovits", "windows"],
        help="TTS backend. auto=use gpt-sovits when character config exists, else windows.",
    )
    parser.add_argument("--characters-dir", default=str(ROOT / "characters"), help="Characters directory (speakerId/character.json).")
    parser.add_argument("--api-base", default=os.environ.get("GPT_SOVITS_API_BASE", "http://127.0.0.1:9880"))
    parser.add_argument("--text-lang", default=os.environ.get("GPT_SOVITS_TEXT_LANG", "ko-KR"))
    parser.add_argument("--prompt-lang", default=os.environ.get("GPT_SOVITS_PROMPT_LANG", ""))
    parser.add_argument("--timeout-s", type=int, default=120)
    parser.add_argument("--windows-voice", default=os.environ.get("WINDOWS_TTS_VOICE", ""))
    parser.add_argument("--windows-rate", type=int, default=int(os.environ.get("WINDOWS_TTS_RATE", "0")))
    parser.add_argument("--windows-volume", type=int, default=int(os.environ.get("WINDOWS_TTS_VOLUME", "100")))
    parser.add_argument("--windows-sample-rate", type=int, default=int(os.environ.get("WINDOWS_TTS_SAMPLE_RATE", "16000")))
    parser.add_argument("--limit", type=int, default=0, help="If set, generate only first N clips.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned outputs without generating.")
    args = parser.parse_args()

    scenario_path = Path(args.scenario)
    out_base = Path(args.out_base)
    characters_dir = Path(args.characters_dir)

    jobs = build_jobs(scenario_json_path=scenario_path, out_base=out_base)
    if args.limit and args.limit > 0:
        jobs = jobs[: args.limit]

    print(f"[info] scenario={scenario_path}")
    print(f"[info] jobs={len(jobs)} out_base={out_base}")

    if args.dry_run:
        for j in jobs[:10]:
            print(f"  - {j.clip_id} -> {j.out_wav_path}")
        if len(jobs) > 10:
            print(f"  ... (+{len(jobs)-10} more)")
        return 0

    tts_mod = _load_gpt_sovits_module()

    manifest: list[dict[str, Any]] = []
    for i, job in enumerate(jobs, start=1):
        job.out_wav_path.parent.mkdir(parents=True, exist_ok=True)

        character_cfg = resolve_character_config(characters_dir=characters_dir, speaker_id=job.speaker_id)
        backend = args.tts
        if backend == "auto":
            backend = "gpt-sovits" if character_cfg else "windows"

        print(f"[{i}/{len(jobs)}] {backend} {job.clip_id} ({job.speaker_id}) -> {job.out_wav_path}")

        if backend == "gpt-sovits":
            if not character_cfg:
                raise SystemExit(
                    f"Missing character config for speakerId={job.speaker_id}. "
                    f"Create {characters_dir / job.speaker_id / 'character.json'} or use --tts windows/auto."
                )
            tts_mod.generate_character_tts_wav(
                character_config_path=str(character_cfg),
                text=job.text,
                out_wav_path=str(job.out_wav_path),
                api_base=args.api_base,
                text_lang=args.text_lang,
                prompt_lang=(args.prompt_lang or None),
                media_type="wav",
                streaming_mode=False,
                timeout_s=int(args.timeout_s),
                seed=None,
                keep_parts_dir=None,
            )
        else:
            tts_mod.generate_windows_tts_wav(
                text=job.text,
                out_wav_path=str(job.out_wav_path),
                voice=args.windows_voice,
                rate=int(args.windows_rate),
                volume=int(args.windows_volume),
                sample_rate_hz=int(args.windows_sample_rate),
                keep_parts_dir=None,
            )

        manifest.append(
            {
                "clipId": job.clip_id,
                "speakerId": job.speaker_id,
                "text": job.text,
                "wavPath": str(job.out_wav_path).replace("\\", "/"),
                "url": job.url_path,
            }
        )

    manifest_path = out_base / Path(jobs[0].clip_id.split("/")[0]) / "_manifest.json" if jobs else (out_base / "_manifest.json")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps({"generatedFrom": str(scenario_path).replace("\\", "/"), "clips": manifest}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[done] wrote manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
