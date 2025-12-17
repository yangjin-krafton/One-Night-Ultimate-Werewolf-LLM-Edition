#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import importlib.util
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class RefIssue:
    level: str  # "error" | "warn"
    character_id: str
    config_path: Path
    ref_kind: str  # defaultRefs | emotionRefs:<emotion>
    ref_value: str
    message: str


def _normalize_local_ref_base(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return s
    # Strip accidental surrounding quotes from copy/paste.
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        s = s[1:-1].strip()

    # PowerShell users sometimes copy \"D:\\path\" (backslash escaping is not needed in PS),
    # which can result in odd-looking inputs. Try to be forgiving.
    s = s.replace('\\"', '"').strip()

    # On Windows, "D:folder" is drive-relative (missing backslash). Most users meant "D:\\folder".
    if os.name == "nt" and re.match(r"^[A-Za-z]:[^\\\\/].+", s):
        s = s[:2] + "\\" + s[2:]
    return s


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _dump_json(obj: object) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def _iter_character_config_paths(root: Path) -> Iterable[Path]:
    if root.is_file():
        yield root
        return

    if not root.exists():
        return

    # Prefer <id>/character.json, but also allow any **/*.json (theme folders).
    seen: set[Path] = set()
    for p in root.rglob("character.json"):
        if p.is_file():
            seen.add(p)
            yield p

    for p in root.rglob("*.json"):
        if not p.is_file():
            continue
        if p.name == "character.json":
            continue
        if p in seen:
            continue
        yield p


def _coerce_refs_field(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(x) for x in value if isinstance(x, str)]
    return []


def _ref_key_for_emotion(emotion: str) -> str:
    return f"emotionRefs:{emotion}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate character TTS ref audio (.wav) and prompt (.txt) files referenced by character json configs."
    )
    parser.add_argument(
        "--characters-dir",
        default=str(ROOT / "characters"),
        help="Characters folder or a single character json file.",
    )
    parser.add_argument(
        "--local-ref-base",
        default=os.environ.get("GPT_SOVITS_CHARACTER_LOCAL_REF_BASE", ""),
        help="Override localRefBase for all configs (same meaning as generate_scenario_audio.py).",
    )
    parser.add_argument(
        "--min-ref-s",
        type=float,
        default=float(os.environ.get("GPT_SOVITS_REF_MIN_S", "3")),
        help="Minimum allowed ref wav duration in seconds.",
    )
    parser.add_argument(
        "--max-ref-s",
        type=float,
        default=float(os.environ.get("GPT_SOVITS_REF_MAX_S", "10")),
        help="Maximum allowed ref wav duration in seconds.",
    )
    parser.add_argument("--skip-duration-check", action="store_true", help="Skip wav duration check.")
    parser.add_argument("--skip-prompt-check", action="store_true", help="Skip prompt .txt existence check.")
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Prune invalid ref entries from character jsons (writes files).",
    )
    parser.add_argument(
        "--fix-include-warn-prompt-missing",
        action="store_true",
        help="When used with --fix, also prune refs that are missing prompt .txt (normally warn).",
    )
    parser.add_argument(
        "--fix-dry-run",
        action="store_true",
        help="Show what would change with --fix but do not write files.",
    )
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON to stdout.")
    args = parser.parse_args()

    # Reuse the canonical parsing and resolution logic without requiring
    # scripts/ to be a Python package.
    mod_path = ROOT / "scripts" / "gpt_sovits_tts.py"
    spec = importlib.util.spec_from_file_location("one_night_gpt_sovits_tts", mod_path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Failed to load module: {mod_path}")
    tts_mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = tts_mod
    spec.loader.exec_module(tts_mod)

    issues: list[RefIssue] = []
    configs_checked = 0
    refs_checked = 0
    configs_changed = 0
    refs_removed = 0

    root = Path(args.characters_dir)
    config_paths = sorted(_iter_character_config_paths(root))
    if not config_paths:
        raise SystemExit(f"No character config jsons found under: {root}")

    for cfg_path in config_paths:
        raw_cfg: dict | None = None
        try:
            raw_cfg = _load_json(cfg_path)
        except Exception as e:
            issues.append(
                RefIssue(
                    level="error",
                    character_id=cfg_path.stem,
                    config_path=cfg_path,
                    ref_kind="config",
                    ref_value="",
                    message=f"Failed to read JSON: {type(e).__name__}: {e}",
                )
            )
            continue

        try:
            cfg = tts_mod.load_character_config(cfg_path)
        except Exception as e:
            issues.append(
                RefIssue(
                    level="error",
                    character_id=cfg_path.stem,
                    config_path=cfg_path,
                    ref_kind="config",
                    ref_value="",
                    message=f"Failed to parse: {type(e).__name__}: {e}",
                )
            )
            continue

        configs_checked += 1
        cfg_for_check = cfg
        if args.local_ref_base:
            normalized_base = _normalize_local_ref_base(args.local_ref_base)
            cfg_for_check = tts_mod.CharacterConfig(
                character_id=cfg.character_id,
                local_ref_base=Path(normalized_base).expanduser(),
                container_ref_base=cfg.container_ref_base,
                default_refs=cfg.default_refs,
                emotion_refs=cfg.emotion_refs,
                tag_aliases=cfg.tag_aliases,
            )

        # Track refs to prune keyed by "defaultRefs" or "emotionRefs:<emotion>"
        to_prune: dict[str, set[str]] = {}

        def _check_ref(ref_kind: str, ref_value: str) -> None:
            nonlocal refs_checked
            refs_checked += 1

            if not ref_value or not str(ref_value).strip():
                issues.append(
                    RefIssue(
                        level="error",
                        character_id=cfg.character_id,
                        config_path=cfg_path,
                        ref_kind=ref_kind,
                        ref_value=str(ref_value),
                        message="Empty ref path",
                    )
                )
                to_prune.setdefault(ref_kind, set()).add(str(ref_value))
                return

            # If refs are only on container/remote, local check may not be possible; still try.
            local_audio = tts_mod._resolve_local_ref_audio_path(cfg_for_check.local_ref_base, str(ref_value))
            if not local_audio.exists():
                issues.append(
                    RefIssue(
                        level="error",
                        character_id=cfg.character_id,
                        config_path=cfg_path,
                        ref_kind=ref_kind,
                        ref_value=str(ref_value),
                        message=f"Missing local audio file: {local_audio}",
                    )
                )
                to_prune.setdefault(ref_kind, set()).add(str(ref_value))
                return

            if not args.skip_duration_check:
                dur = tts_mod._wav_duration_seconds(local_audio)
                if dur is not None and (dur < float(args.min_ref_s) or dur > float(args.max_ref_s)):
                    issues.append(
                        RefIssue(
                            level="error",
                            character_id=cfg.character_id,
                            config_path=cfg_path,
                            ref_kind=ref_kind,
                            ref_value=str(ref_value),
                            message=f"WAV duration {dur:.2f}s outside {args.min_ref_s:.0f}-{args.max_ref_s:.0f}s: {local_audio}",
                        )
                    )
                    to_prune.setdefault(ref_kind, set()).add(str(ref_value))

            if not args.skip_prompt_check:
                prompt_path = local_audio.with_suffix(".txt")
                if not prompt_path.exists():
                    issues.append(
                        RefIssue(
                            level="warn",
                            character_id=cfg.character_id,
                            config_path=cfg_path,
                            ref_kind=ref_kind,
                            ref_value=str(ref_value),
                            message=f"Missing prompt txt: {prompt_path}",
                        )
                    )
                    if args.fix_include_warn_prompt_missing:
                        to_prune.setdefault(ref_kind, set()).add(str(ref_value))

        for ref in cfg_for_check.default_refs:
            _check_ref("defaultRefs", ref)
        for emotion, refs in (cfg_for_check.emotion_refs or {}).items():
            for ref in refs or []:
                _check_ref(_ref_key_for_emotion(emotion), ref)

        if args.fix and raw_cfg is not None:
            # Apply pruning to the raw JSON (preserving original string values).
            changed = False

            def _prune_list_in_place(lst: list, prune: set[str]) -> tuple[list, int]:
                before = len(lst)
                new_list = [x for x in lst if not (isinstance(x, str) and x in prune)]
                return new_list, before - len(new_list)

            removed_here = 0

            # defaultRefs can be string or list
            if "defaultRefs" in raw_cfg or "default_refs" in raw_cfg:
                key = "defaultRefs" if "defaultRefs" in raw_cfg else "default_refs"
                prune = to_prune.get("defaultRefs") or set()
                if prune:
                    if isinstance(raw_cfg.get(key), str):
                        if raw_cfg.get(key) in prune:
                            raw_cfg[key] = []
                            removed_here += 1
                            changed = True
                    elif isinstance(raw_cfg.get(key), list):
                        new_list, removed = _prune_list_in_place(raw_cfg.get(key) or [], prune)
                        if removed:
                            raw_cfg[key] = new_list
                            removed_here += removed
                            changed = True

            # emotionRefs values are lists
            if "emotionRefs" in raw_cfg or "emotion_refs" in raw_cfg:
                ekey = "emotionRefs" if "emotionRefs" in raw_cfg else "emotion_refs"
                if isinstance(raw_cfg.get(ekey), dict):
                    for emotion, lst in list(raw_cfg[ekey].items()):
                        prune = to_prune.get(_ref_key_for_emotion(str(emotion))) or set()
                        if not prune:
                            continue
                        if isinstance(lst, str):
                            if lst in prune:
                                raw_cfg[ekey][emotion] = []
                                removed_here += 1
                                changed = True
                        elif isinstance(lst, list):
                            new_list, removed = _prune_list_in_place(lst, prune)
                            if removed:
                                raw_cfg[ekey][emotion] = new_list
                                removed_here += removed
                                changed = True
                        # Drop empty emotions to keep JSON tidy.
                        if raw_cfg[ekey].get(emotion) == []:
                            raw_cfg[ekey].pop(emotion, None)

            # Avoid writing configs that become unusable (no refs at all).
            remaining_refs = _coerce_refs_field(raw_cfg.get("defaultRefs") if "defaultRefs" in raw_cfg else raw_cfg.get("default_refs"))
            emotion_obj = raw_cfg.get("emotionRefs") if "emotionRefs" in raw_cfg else raw_cfg.get("emotion_refs")
            if isinstance(emotion_obj, dict):
                for v in emotion_obj.values():
                    remaining_refs.extend(_coerce_refs_field(v))
            remaining_refs = [r for r in remaining_refs if str(r).strip()]

            if changed and not remaining_refs:
                issues.append(
                    RefIssue(
                        level="error",
                        character_id=cfg.character_id,
                        config_path=cfg_path,
                        ref_kind="fix",
                        ref_value="",
                        message="--fix would remove all refs; not writing changes. Add a valid ref first.",
                    )
                )
            elif changed:
                configs_changed += 1
                refs_removed += removed_here
                if not args.fix_dry_run:
                    cfg_path.write_text(_dump_json(raw_cfg), encoding="utf-8")

    if args.json:
        payload = {
            "configsChecked": configs_checked,
            "refsChecked": refs_checked,
            "configsChanged": configs_changed,
            "refsRemoved": refs_removed,
            "issues": [
                {
                    "level": i.level,
                    "characterId": i.character_id,
                    "configPath": str(i.config_path).replace("\\", "/"),
                    "refKind": i.ref_kind,
                    "refValue": i.ref_value,
                    "message": i.message,
                }
                for i in issues
            ],
        }
        sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    else:
        errors = [i for i in issues if i.level == "error"]
        warns = [i for i in issues if i.level != "error"]
        try:
            fix_note = ""
            if args.fix:
                mode = "dry-run" if args.fix_dry_run else "write"
                fix_note = f" changed={configs_changed} removed={refs_removed} fix={mode}"
            print(f"[info] configs={configs_checked} refs={refs_checked} errors={len(errors)} warns={len(warns)}{fix_note}")
            for i in issues:
                tag = "ERR" if i.level == "error" else "WRN"
                print(f"[{tag}] {i.character_id} {i.ref_kind} :: {i.ref_value}")
                print(f"      cfg={i.config_path}")
                print(f"      {i.message}")
        except BrokenPipeError:
            # e.g. piped into `head`; suppress noisy stack traces.
            return 1

    return 1 if any(i.level == "error" for i in issues) else 0


if __name__ == "__main__":
    raise SystemExit(main())
