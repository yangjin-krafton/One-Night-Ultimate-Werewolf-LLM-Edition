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


def _load_qwen3_tts_module() -> Any:
    mod_path = ROOT / "scripts" / "qwen3_tts.py"
    spec = importlib.util.spec_from_file_location("one_night_qwen3_tts", mod_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load module: {mod_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _load_fish_speech_module() -> Any:
    mod_path = ROOT / "scripts" / "fish_speech_tts.py"
    spec = importlib.util.spec_from_file_location("one_night_fish_speech_tts", mod_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load module: {mod_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _load_concat_module() -> Any:
    mod_path = ROOT / "scripts" / "concat_episode_wavs.py"
    spec = importlib.util.spec_from_file_location("one_night_concat_episode_wavs", mod_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load module: {mod_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ASSETS_DIR = ROOT / "public" / "assets"
SCENARIOS_DIR = ASSETS_DIR / "scenarios"


def _auto_wake_order_scenario_path(*, tts_scenario_path: Path) -> Path | None:
    """
    Try to locate a runtime scenario JSON that contains roleWakeOrder.

    Convention:
      public/assets/scenarios_tts/<id>.tts.json  ->  public/assets/scenarios/<id>.json
      OR public/assets/scenarios/<scenarioId>.json if scenarioId exists in the TTS JSON.
    """
    tts_scenario_path = Path(tts_scenario_path)

    # 1) Filename convention: foo.tts.json -> foo.json
    name = tts_scenario_path.name
    if name.endswith(".tts.json"):
        stem = name[: -len(".tts.json")]
        candidate = SCENARIOS_DIR / f"{stem}.json"
        if candidate.exists():
            return candidate

    # 2) Try by scenarioId inside the TTS JSON.
    try:
        raw = json.loads(tts_scenario_path.read_text(encoding="utf-8"))
        scenario_id = str(raw.get("scenarioId") or "").strip()
        if scenario_id:
            candidate = SCENARIOS_DIR / f"{scenario_id}.json"
            if candidate.exists():
                return candidate
    except Exception:
        pass

    return None


def _iter_clips_from_variant(narration: dict[str, Any]) -> Iterable[tuple[str, str, str]]:
    """
    Yield tuples: (section_key, speakerId, text)
    section_key is stable and used for clipId/path.
    """
    def _coerce_clip_list(v: Any, *, default_speaker_id: str) -> list[dict[str, Any]]:
        if v is None:
            return []
        if isinstance(v, str):
            return [{"speakerId": default_speaker_id, "text": v}]
        if isinstance(v, dict):
            # Single clip object.
            if "text" in v or "speakerId" in v:
                return [v]
            return []
        if isinstance(v, list):
            out: list[dict[str, Any]] = []
            for item in v:
                if isinstance(item, str):
                    out.append({"speakerId": default_speaker_id, "text": item})
                elif isinstance(item, dict):
                    out.append(item)
            return out
        return []

    # Opening — 같은 speakerId 끼리 텍스트를 합쳐서 하나의 클립으로 생성
    opening_clips = _coerce_clip_list(narration.get("openingClips"), default_speaker_id="Narrator")
    if opening_clips:
        merged_text = " ".join(str(c.get("text") or "") for c in opening_clips).strip()
        merged_speaker = str(opening_clips[0].get("speakerId") or "Narrator")
        if merged_text:
            yield (f"opening/001", merged_speaker, merged_text)

    role_clips = narration.get("roleClips") or {}
    for role_key in sorted(role_clips.keys()):
        role_obj = role_clips.get(role_key) or {}
        # Legacy format: role -> { before/during/after: [ {speakerId,text}, ... ] }
        if any(k in role_obj for k in ("before", "during", "after")):
            for part in ("before", "during", "after"):
                clips = _coerce_clip_list(role_obj.get(part), default_speaker_id=str(role_key))
                for idx, clip in enumerate(clips, start=1):
                    yield (
                        f"role/{role_key}/{part}/{idx:03d}",
                        str(clip.get("speakerId") or "Narrator"),
                        str(clip.get("text") or ""),
                    )
            continue

        # Compact format: role -> clip or [clip, ...] (no parts). Keep paths stable by mapping to /during/.
        clips = _coerce_clip_list(role_obj, default_speaker_id=str(role_key))
        for idx, clip in enumerate(clips, start=1):
            yield (
                f"role/{role_key}/during/{idx:03d}",
                str(clip.get("speakerId") or "Narrator"),
                str(clip.get("text") or ""),
            )

    # Outro — 같은 speakerId 끼리 텍스트를 합쳐서 하나의 클립으로 생성
    outro_clips = _coerce_clip_list(narration.get("nightOutroClips"), default_speaker_id="Narrator")
    if outro_clips:
        merged_text = " ".join(str(c.get("text") or "") for c in outro_clips).strip()
        merged_speaker = str(outro_clips[0].get("speakerId") or "Narrator")
        if merged_text:
            yield (f"outro/001", merged_speaker, merged_text)


def build_jobs(
    *,
    scenario_json_path: Path,
    out_base: Path,
    variant_mode: str = "all",
    best_fit_player_count: int | None = None,
) -> list[ClipJob]:
    raw = json.loads(scenario_json_path.read_text(encoding="utf-8"))
    jobs: list[ClipJob] = []

    def iter_scenarios(raw_obj: dict[str, Any]) -> list[dict[str, Any]]:
        # Support two formats:
        #  1) runtime/legacy: { scenarios: [ {scenarioId, episodes:[{variantByPlayerCount:{...}}]} ] }
        #  2) compact tts-only: { scenarioId, playerCount, episodes: [...]|{...} }
        if isinstance(raw_obj.get("scenarios"), list):
            return [s for s in (raw_obj.get("scenarios") or []) if isinstance(s, dict)]
        if raw_obj.get("scenarioId"):
            return [raw_obj]
        return []

    def iter_episodes(scenario_obj: dict[str, Any]) -> list[dict[str, Any]]:
        eps = scenario_obj.get("episodes")
        if isinstance(eps, list):
            return [e for e in eps if isinstance(e, dict)]
        if isinstance(eps, dict):
            out: list[dict[str, Any]] = []
            for k, v in eps.items():
                if isinstance(v, dict):
                    out.append({"episodeId": str(k), **v})
            return out
        return []

    def select_variant_keys(variants: dict[str, Any]) -> list[str]:
        keys = [str(k) for k in (variants or {}).keys() if str(k).isdigit()]
        keys.sort(key=lambda x: int(x))
        if not keys:
            return []
        if variant_mode == "all":
            return keys
        if variant_mode == "max-only":
            return [keys[-1]]
        if variant_mode == "best-fit":
            if not best_fit_player_count or best_fit_player_count <= 0:
                raise ValueError("--variant-mode best-fit requires --best-fit-player-count > 0")
            for k in keys:
                if int(k) >= int(best_fit_player_count):
                    return [k]
            return [keys[-1]]
        raise ValueError(f"Unknown variant_mode={variant_mode}")

    for scenario in iter_scenarios(raw):
        scenario_id = str(scenario.get("scenarioId") or "").strip() or scenario_json_path.stem
        for episode in iter_episodes(scenario):
            episode_id = str(episode.get("episodeId") or "").strip() or "episode"
            variants = episode.get("variantByPlayerCount")
            if isinstance(variants, dict):
                # Runtime/legacy format (variants keyed by player count)
                for player_key in select_variant_keys(variants):
                    variant = variants.get(player_key) or {}
                    narration = (variant.get("narration") or {}) if isinstance(variant, dict) else {}
                    for section_key, speaker_id, text in _iter_clips_from_variant(narration):
                        if not text.strip():
                            continue
                        clip_id = f"{scenario_id}/{episode_id}/p{player_key}/{section_key}"
                        out_dir = out_base / scenario_id / episode_id / f"p{player_key}" / section_key
                        out_wav = out_dir / "voice.wav"
                        url = (
                            f"/assets/voices/{scenario_id}/{episode_id}/p{player_key}/{section_key}/voice.wav".replace("\\", "/")
                        )
                        jobs.append(
                            ClipJob(
                                clip_id=clip_id,
                                speaker_id=speaker_id,
                                text=text,
                                out_wav_path=out_wav,
                                url_path=url,
                            )
                        )
                continue

            # Compact tts-only format (single variant or runtime_deck_builder)
            player_key = str(
                scenario.get("playerCount")
                or scenario.get("variantPlayerCount")
                or scenario.get("maxPlayerCount")
                or episode.get("playerCount")
                or episode.get("variantPlayerCount")
                or episode.get("maxPlayerCount")
                or ""
            ).strip()
            if not player_key.isdigit():
                # runtime_deck_builder: no fixed playerCount, use "all" as universal key
                player_key = "all"

            narration = (episode.get("narration") or {}) if isinstance(episode.get("narration"), dict) else dict(episode)
            for section_key, speaker_id, text in _iter_clips_from_variant(narration):
                if not text.strip():
                    continue
                clip_id = f"{scenario_id}/{episode_id}/p{player_key}/{section_key}"
                out_dir = out_base / scenario_id / episode_id / f"p{player_key}" / section_key
                out_wav = out_dir / "voice.wav"
                url = f"/assets/voices/{scenario_id}/{episode_id}/p{player_key}/{section_key}/voice.wav".replace("\\", "/")
                jobs.append(
                    ClipJob(
                        clip_id=clip_id,
                        speaker_id=speaker_id,
                        text=text,
                        out_wav_path=out_wav,
                        url_path=url,
                    )
                )

    return jobs


def resolve_character_config(*, characters_dir: Path, speaker_id: str) -> Path | None:
    # Support both layouts:
    #  - characters/<speakerId>/character.json
    #  - characters/<theme>/<speakerId>.json
    candidate = characters_dir / speaker_id / "character.json"
    if candidate.exists():
        return candidate
    flat = characters_dir / f"{speaker_id}.json"
    if flat.exists():
        return flat
    return None


class CharacterConfigResolver:
    def __init__(self, characters_dir: Path) -> None:
        self._root = characters_dir
        self._index: dict[str, Path] | None = None

    def _build_index(self) -> dict[str, Path]:
        index: dict[str, Path] = {}
        if not self._root.exists():
            return index

        # Highest priority: <root>/<id>/character.json
        try:
            for p in self._root.rglob("character.json"):
                if p.parent.name and p.parent.name not in index:
                    index[p.parent.name] = p
        except OSError:
            pass

        # Next: any <root>/**/*.json where stem matches id (excluding character.json).
        try:
            for p in self._root.rglob("*.json"):
                if p.name == "character.json":
                    continue
                if p.stem and p.stem not in index:
                    index[p.stem] = p
        except OSError:
            pass

        return index

    def resolve(self, speaker_id: str) -> Path | None:
        # Fast-path for the common direct layouts.
        direct = resolve_character_config(characters_dir=self._root, speaker_id=speaker_id)
        if direct:
            return direct

        if self._index is None:
            self._index = self._build_index()

        if speaker_id in self._index:
            return self._index[speaker_id]

        # Optional case-insensitive fallback (useful when IDs differ only by case).
        sid = (speaker_id or "").strip()
        if sid:
            sid_lower = sid.lower()
            for k, v in self._index.items():
                if k.lower() == sid_lower:
                    return v
        return None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate scenario narration audio resources (voice.wav) from scenario JSON."
    )
    parser.add_argument(
        "--scenario",
        default=str(ASSETS_DIR / "scenarios_tts" / "beginner_dark_fantasy.tts.json"),
        help="Scenario JSON path.",
    )
    parser.add_argument(
        "--wake-order-scenario",
        default=os.environ.get("TTS_WAKE_ORDER_SCENARIO", ""),
        help=(
            "Optional JSON path to read roleWakeOrder from when concatenating episode wavs. "
            "Useful when the TTS JSON doesn't include roleWakeOrder (e.g. use scenarios/<id>.json)."
        ),
    )
    parser.add_argument(
        "--out-base",
        default=str(ROOT / "public" / "assets" / "voices"),
        help="Output base folder for voice assets.",
    )
    parser.add_argument(
        "--tts",
        default=os.environ.get("TTS_BACKEND", "fish"),
        choices=["auto", "gpt-sovits", "qwen3", "fish", "windows"],
        help="TTS backend. fish=Fish Speech (default). auto=gpt-sovits when character config exists, else windows. qwen3=Qwen3-TTS (legacy).",
    )
    parser.add_argument(
        "--on-error",
        default=os.environ.get("TTS_ON_ERROR", "fail"),
        choices=["fail", "skip", "windows"],
        help="When a clip fails to generate: fail (default), skip, or fallback to Windows TTS.",
    )
    parser.add_argument(
        "--characters-dir",
        default=str(ROOT / "characters"),
        help="Characters directory (can be a theme folder). Scans for <id>/character.json or **/<id>.json.",
    )
    default_api_base = os.environ.get("GPT_SOVITS_API_BASE")
    if not default_api_base:
        # In WSL2+Docker setups, Windows often reaches the container via portproxy on localhost.
        # Keeping the default as localhost reduces confusion and matches the README guidance.
        default_api_base = "http://localhost:9880" if os.name == "nt" else "http://127.0.0.1:9880"
    parser.add_argument("--api-base", default=default_api_base)
    parser.add_argument("--text-lang", default=os.environ.get("GPT_SOVITS_TEXT_LANG", "ko-KR"))
    parser.add_argument("--prompt-lang", default=os.environ.get("GPT_SOVITS_PROMPT_LANG", ""))
    parser.add_argument(
        "--sovits-http-method",
        default=os.environ.get("GPT_SOVITS_HTTP_METHOD", "auto"),
        choices=["auto", "get", "post"],
        help="Force GPT-SoVITS /tts request method (auto/get/post). post can reduce disconnects on long GET URLs.",
    )
    parser.add_argument(
        "--sovits-max-url-chars",
        type=int,
        default=int(os.environ.get("GPT_SOVITS_MAX_URL_CHARS", "1800")),
        help="If GET URL exceeds this and prompt_text is set, retry without prompt_text. (0 disables)",
    )
    parser.add_argument(
        "--sovits-request-retries",
        type=int,
        default=int(os.environ.get("GPT_SOVITS_REQUEST_RETRIES", "2")),
        help="Extra retries for GPT-SoVITS /tts requests on transient network errors.",
    )
    parser.add_argument(
        "--character-local-ref-base",
        default=os.environ.get("GPT_SOVITS_CHARACTER_LOCAL_REF_BASE", ""),
        help="Override character config localRefBase for reading prompt .txt on the host.",
    )
    parser.add_argument(
        "--character-container-ref-base",
        default=os.environ.get("GPT_SOVITS_CHARACTER_CONTAINER_REF_BASE", ""),
        help="Override character config containerRefBase used to build ref_audio_path for the GPT-SoVITS server.",
    )
    parser.add_argument("--timeout-s", type=int, default=120)
    parser.add_argument("--windows-voice", default=os.environ.get("WINDOWS_TTS_VOICE", ""))
    parser.add_argument("--windows-rate", type=int, default=int(os.environ.get("WINDOWS_TTS_RATE", "0")))
    parser.add_argument("--windows-volume", type=int, default=int(os.environ.get("WINDOWS_TTS_VOLUME", "100")))
    parser.add_argument("--windows-sample-rate", type=int, default=int(os.environ.get("WINDOWS_TTS_SAMPLE_RATE", "16000")))

    # Qwen3-TTS arguments
    default_qwen3_api_base = os.environ.get("QWEN3_TTS_API_BASE")
    if not default_qwen3_api_base:
        default_qwen3_api_base = "http://100.66.10.225:3000/tools/qwen3-tts"
    parser.add_argument("--qwen3-api-base", default=default_qwen3_api_base, help="Qwen3-TTS Gradio server URL.")
    parser.add_argument(
        "--qwen3-mode",
        default=os.environ.get("QWEN3_TTS_MODE", "tag"),
        choices=["clone", "clone_from_file", "tag"],
        help="Qwen3-TTS generation mode: tag (voice library, default), clone (upload ref), clone_from_file (server ref).",
    )
    parser.add_argument("--qwen3-language", default=os.environ.get("QWEN3_TTS_LANGUAGE", "korean"))
    parser.add_argument("--qwen3-use-xvec", action="store_true", default=False, help="Qwen3 x-vector only mode.")
    parser.add_argument("--qwen3-max-tokens", type=int, default=int(os.environ.get("QWEN3_TTS_MAX_TOKENS", "2048")))
    parser.add_argument("--qwen3-temperature", type=float, default=float(os.environ.get("QWEN3_TTS_TEMPERATURE", "0.7")))
    parser.add_argument("--qwen3-top-p", type=float, default=float(os.environ.get("QWEN3_TTS_TOP_P", "0.95")))
    parser.add_argument("--qwen3-top-k", type=int, default=int(os.environ.get("QWEN3_TTS_TOP_K", "50")))
    parser.add_argument("--qwen3-request-retries", type=int, default=int(os.environ.get("QWEN3_TTS_REQUEST_RETRIES", "2")))

    # Fish Speech arguments
    default_fish_api_base = os.environ.get("FISH_SPEECH_API_BASE", "http://100.66.68.140:8080")
    parser.add_argument("--fish-api-base", default=default_fish_api_base, help="Fish Speech server URL.")
    parser.add_argument("--fish-temperature", type=float, default=float(os.environ.get("FISH_SPEECH_TEMPERATURE", "0.8")))
    parser.add_argument("--fish-top-p", type=float, default=float(os.environ.get("FISH_SPEECH_TOP_P", "0.8")))
    parser.add_argument("--fish-repetition-penalty", type=float, default=float(os.environ.get("FISH_SPEECH_REP_PENALTY", "1.1")))
    parser.add_argument("--fish-max-new-tokens", type=int, default=int(os.environ.get("FISH_SPEECH_MAX_TOKENS", "1024")))
    parser.add_argument("--fish-request-retries", type=int, default=int(os.environ.get("FISH_SPEECH_REQUEST_RETRIES", "2")))

    parser.add_argument("--limit", type=int, default=0, help="If set, generate only first N clips.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned outputs without generating.")
    parser.add_argument(
        "--concat-episodes",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="After generating per-clip voice.wav files, also write concatenated per-episode wav(s).",
    )
    parser.add_argument(
        "--concat-missing",
        choices=["fail", "skip"],
        default=os.environ.get("TTS_CONCAT_MISSING", "skip"),
        help="When concatenating episode wavs: fail or skip missing clip wavs (default: skip).",
    )
    parser.add_argument(
        "--concat-out-dir-mode",
        choices=["scenario", "episode", "variant"],
        default=os.environ.get("TTS_CONCAT_OUT_DIR_MODE", "scenario"),
        help="Where to write concatenated wavs (default: scenario).",
    )
    parser.add_argument(
        "--concat-out-name-template",
        default=os.environ.get("TTS_CONCAT_OUT_NAME_TEMPLATE", "{scenarioId}__{episodeId}__{playerKey}__episode.wav"),
        help="Filename template for concatenated episode wavs.",
    )
    parser.add_argument(
        "--variant-mode",
        choices=["all", "max-only", "best-fit"],
        default="all",
        help="Which episode variants to generate: all (default), max-only, or best-fit.",
    )
    parser.add_argument(
        "--best-fit-player-count",
        type=int,
        default=0,
        help="Used when --variant-mode best-fit: pick the smallest variant >= this count (else max).",
    )
    args = parser.parse_args()

    scenario_path = Path(args.scenario)
    out_base = Path(args.out_base)
    characters_dir = Path(args.characters_dir)
    character_resolver = CharacterConfigResolver(characters_dir)

    jobs = build_jobs(
        scenario_json_path=scenario_path,
        out_base=out_base,
        variant_mode=str(args.variant_mode),
        best_fit_player_count=(int(args.best_fit_player_count) if int(args.best_fit_player_count) > 0 else None),
    )
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
    qwen3_mod = _load_qwen3_tts_module() if args.tts == "qwen3" else None
    fish_mod = _load_fish_speech_module() if args.tts == "fish" else None

    # ── Fish Speech: load voice_map ──
    fish_voice_map: dict[str, str] | None = None
    if fish_mod is not None:
        voice_map_path = characters_dir / "voice_map.json"
        if not voice_map_path.exists():
            voice_map_path = ROOT / "characters" / "voice_map.json"
        if voice_map_path.exists():
            fish_voice_map = fish_mod.load_voice_map(voice_map_path)
            print(f"[info] Loaded voice_map: {len(fish_voice_map)} roles from {voice_map_path.name}")
        else:
            print(f"[warn] voice_map.json not found at {voice_map_path}")
        # Ping server
        if fish_mod.ping(args.fish_api_base):
            print(f"[info] Fish Speech server OK: {args.fish_api_base}")
        else:
            print(f"[warn] Fish Speech server unreachable: {args.fish_api_base}")

    # ── Qwen3 (legacy): load voice_map and build voice_lock ──
    qwen3_voice_map: dict[str, str] | None = None
    qwen3_voice_lock: dict[str, dict[str, Any]] | None = None
    if qwen3_mod is not None:
        voice_map_path = characters_dir / "voice_map.json"
        if not voice_map_path.exists():
            voice_map_path = ROOT / "characters" / "voice_map.json"
        if voice_map_path.exists():
            qwen3_voice_map = qwen3_mod.load_voice_map(voice_map_path)
            print(f"[info] Loaded voice_map: {len(qwen3_voice_map)} roles from {voice_map_path.name}")
        try:
            print("[info] Querying Qwen3-TTS voice library for voice locking...")
            all_voices = qwen3_mod.query_voice_library(args.qwen3_api_base)
            if qwen3_voice_map:
                qwen3_voice_lock = qwen3_mod.build_voice_lock_from_map(qwen3_voice_map, all_voices, seed=42)
            else:
                all_tags: set[str] = set()
                for job in jobs:
                    cfg_path = character_resolver.resolve(job.speaker_id)
                    if cfg_path:
                        cfg = qwen3_mod.load_character_config(cfg_path)
                        qwen3_cfg = qwen3_mod._get_qwen3_config(Path(cfg_path))
                        voice_tag_base = qwen3_cfg.get("voiceTag", "") or qwen3_mod._guess_voice_name_from_refs(cfg) or cfg.character_id
                        tag_map = qwen3_mod._build_emotion_voice_tag_map(voice_tag_base, cfg.tag_aliases)
                        all_tags.update(tag_map.values())
                qwen3_voice_lock = qwen3_mod.resolve_voice_lock(all_voices, sorted(all_tags), seed=42)
            locked_tags = [f"{t} -> {v.get('audio_filename', '?')}" for t, v in qwen3_voice_lock.items()]
            print(f"[info] Locked {len(qwen3_voice_lock)} voice tags:")
            for desc in locked_tags[:20]:
                print(f"  {desc}")
            if len(locked_tags) > 20:
                print(f"  ... (+{len(locked_tags)-20} more)")
        except Exception as e:
            print(f"[warn] Failed to query voice library for locking: {e}. Falling back to random selection.")
            qwen3_voice_lock = None

    manifest: list[dict[str, Any]] = []
    for i, job in enumerate(jobs, start=1):
        job.out_wav_path.parent.mkdir(parents=True, exist_ok=True)

        character_cfg = character_resolver.resolve(job.speaker_id)
        backend = args.tts
        if backend == "auto":
            backend = "gpt-sovits" if character_cfg else "windows"

        # Skip if output already exists (resume support) — check both .wav and .m4a
        existing_path = job.out_wav_path
        m4a_path = job.out_wav_path.with_suffix(".m4a")
        if not (existing_path.exists() and existing_path.stat().st_size > 0):
            existing_path = m4a_path
        if existing_path.exists() and existing_path.stat().st_size > 0:
            print(f"[{i}/{len(jobs)}] SKIP (exists) {job.clip_id}")
            manifest.append({
                "clipId": job.clip_id, "speakerId": job.speaker_id, "backend": backend,
                "text": job.text, "wavPath": str(job.out_wav_path).replace("\\", "/"), "url": job.url_path,
            })
            continue

        print(f"[{i}/{len(jobs)}] {backend} {job.clip_id} ({job.speaker_id}) -> {job.out_wav_path}")

        error: str | None = None
        used_backend = backend
        try:
            if backend == "fish":
                assert fish_mod is not None and fish_voice_map is not None
                fish_mod.generate_tts_for_role(
                    text=job.text,
                    speaker_id=job.speaker_id,
                    voice_map=fish_voice_map,
                    out_wav_path=str(job.out_wav_path),
                    api_base=args.fish_api_base,
                    temperature=float(args.fish_temperature),
                    top_p=float(args.fish_top_p),
                    repetition_penalty=float(args.fish_repetition_penalty),
                    max_new_tokens=int(args.fish_max_new_tokens),
                    timeout_s=int(args.timeout_s),
                    request_retries=int(args.fish_request_retries),
                )
            elif backend == "qwen3":
                assert qwen3_mod is not None
                # Resolve voice tag base for this speaker
                voice_tag_base = (qwen3_voice_map or {}).get(job.speaker_id)
                if not voice_tag_base and character_cfg:
                    cfg = qwen3_mod.load_character_config(character_cfg)
                    voice_tag_base = qwen3_mod._guess_voice_name_from_refs(cfg) or cfg.character_id
                if not voice_tag_base:
                    raise SystemExit(
                        f"No voice mapping for speakerId={job.speaker_id}. "
                        f"Add it to characters/voice_map.json."
                    )
                # Lazy-init voice_lock on first qwen3 clip (in case initial query failed)
                if qwen3_voice_lock is None and qwen3_voice_map:
                    try:
                        all_voices = qwen3_mod.query_voice_library(args.qwen3_api_base)
                        qwen3_voice_lock = qwen3_mod.build_voice_lock_from_map(qwen3_voice_map, all_voices, seed=42)
                        print(f"[info] Voice lock recovered: {len(qwen3_voice_lock)} tags")
                    except Exception as e2:
                        raise SystemExit(f"Cannot connect to Qwen3-TTS server: {e2}")
                if not qwen3_voice_lock:
                    raise SystemExit("No voice_lock available. Check Qwen3-TTS server and voice_map.json.")
                qwen3_mod.generate_tts_for_role(
                    text=job.text,
                    voice_tag_base=voice_tag_base,
                    out_wav_path=str(job.out_wav_path),
                    voice_lock=qwen3_voice_lock,
                    api_base=args.qwen3_api_base,
                    language=args.qwen3_language,
                    use_xvec=args.qwen3_use_xvec,
                    max_tokens=int(args.qwen3_max_tokens),
                    temperature=float(args.qwen3_temperature),
                    top_p=float(args.qwen3_top_p),
                    top_k=int(args.qwen3_top_k),
                    timeout_s=int(args.timeout_s),
                    request_retries=int(args.qwen3_request_retries),
                    request_retry_backoff_s=1.0,
                )
            elif backend == "gpt-sovits":
                if not character_cfg:
                    raise SystemExit(
                        f"Missing character config for speakerId={job.speaker_id}. "
                        f"Create {characters_dir / job.speaker_id / 'character.json'} or use --tts windows/auto."
                    )
                tts_mod.generate_character_tts_wav(
                    character_config_path=str(character_cfg),
                    text=job.text,
                    out_wav_path=str(job.out_wav_path),
                    character_local_ref_base=(args.character_local_ref_base or None),
                    character_container_ref_base=(args.character_container_ref_base or None),
                    api_base=args.api_base,
                    text_lang=args.text_lang,
                    prompt_lang=(args.prompt_lang or None),
                    media_type="wav",
                    streaming_mode=False,
                    timeout_s=int(args.timeout_s),
                    request_retries=int(args.sovits_request_retries),
                    request_retry_backoff_s=1.0,
                    max_url_chars=int(args.sovits_max_url_chars),
                    http_method=str(args.sovits_http_method),
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
        except Exception as e:
            error = f"{type(e).__name__}: {e}"
            if args.on_error == "fail":
                raise
            if args.on_error == "windows" and backend != "windows":
                print(f"[warn] clip failed; falling back to Windows TTS: {error}")
                used_backend = "windows"
                try:
                    tts_mod.generate_windows_tts_wav(
                        text=job.text,
                        out_wav_path=str(job.out_wav_path),
                        voice=args.windows_voice,
                        rate=int(args.windows_rate),
                        volume=int(args.windows_volume),
                        sample_rate_hz=int(args.windows_sample_rate),
                        keep_parts_dir=None,
                    )
                    error = None
                except Exception as e2:
                    error = f"{type(e2).__name__}: {e2}"
                    if args.on_error == "fail":
                        raise
            if error is not None:
                print(f"[warn] clip failed; skipping: {error}")

        manifest.append(
            {
                "clipId": job.clip_id,
                "speakerId": job.speaker_id,
                "backend": used_backend,
                "text": job.text,
                "wavPath": str(job.out_wav_path).replace("\\", "/"),
                "url": job.url_path,
                **({"error": error} if error else {}),
            }
        )

    manifest_path = (
        out_base / Path(jobs[0].clip_id.split("/")[0]) / "_manifest.json"
        if jobs
        else (out_base / "_manifest.json")
    )
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps({"generatedFrom": str(scenario_path).replace("\\", "/"), "clips": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[done] wrote manifest: {manifest_path}")

    if args.concat_episodes:
        concat_mod = _load_concat_module()
        wake_src = Path(str(args.wake_order_scenario)).resolve() if str(args.wake_order_scenario).strip() else None
        if wake_src is None:
            wake_src = _auto_wake_order_scenario_path(tts_scenario_path=scenario_path)
            if wake_src is not None:
                print(f"[info] concat: auto wake-order scenario: {wake_src}")
        rc = concat_mod.concat_episode_wavs_from_jobs(
            jobs=jobs,
            scenario_json_path=scenario_path,
            voices_base=out_base,
            wake_order_scenario_path=wake_src,
            out_dir_mode=str(args.concat_out_dir_mode),
            out_name_template=str(args.concat_out_name_template),
            out_filename="",
            missing=str(args.concat_missing),
            dry_run=bool(args.dry_run),
        )
        if rc != 0:
            return int(rc)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
