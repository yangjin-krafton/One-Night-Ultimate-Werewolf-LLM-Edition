#!/usr/bin/env python3
"""
전체 TTS 파이프라인: 삭제 → WAV 생성 → M4A 변환 → Manifest 업데이트 → Preview 생성

사용법:
  python scripts/build_tts.py
  python scripts/build_tts.py --skip-generate   # M4A 변환 + preview만
  python scripts/build_tts.py --dry-run          # 생성 없이 클립 목록만
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS_DIR = ROOT / "characters"

# Fallback night wake order for preview concat (used when scenario JSON has no roleWakeOrder)
DEFAULT_WAKE_ORDER = [
    "doppelganger", "werewolf", "alpha_wolf", "mystic_wolf", "dream_wolf",
    "minion", "squire", "mason", "thing",
    "seer", "apprentice_seer", "paranormal_investigator",
    "robber", "witch", "troublemaker",
    "village_idiot", "drunk", "aura_seer", "beholder",
    "revealer", "insomniac",
]


def _resolve_paths(scenario_tts: Path):
    """시나리오 TTS JSON에서 scenarioId를 읽어 출력 경로를 결정."""
    raw = json.loads(scenario_tts.read_text("utf-8"))
    sid = raw.get("scenarioId", scenario_tts.stem.replace(".tts", ""))
    voices_dir = ROOT / "public" / "assets" / "voices" / sid
    return sid, voices_dir


def step_clean(voices_dir: Path):
    """1) 기존 음성 파일 삭제"""
    if voices_dir.exists():
        shutil.rmtree(voices_dir)
        print("[clean] deleted:", voices_dir)
    else:
        print("[clean] nothing to delete")


def step_generate(scenario_tts: Path, dry_run: bool = False):
    """2) TTS WAV 생성"""
    cmd = [
        sys.executable, str(ROOT / "scripts" / "generate_scenario_audio.py"),
        "--scenario", str(scenario_tts),
        "--tts", "qwen3",
        "--characters-dir", str(CHARACTERS_DIR),
        "--no-concat-episodes",
        "--qwen3-use-xvec",
    ]
    if dry_run:
        cmd.append("--dry-run")

    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"}
    print("[generate]", " ".join(cmd[-6:]))
    result = subprocess.run(cmd, env=env)
    if result.returncode != 0:
        print("[generate] FAILED (exit", result.returncode, ")")
        sys.exit(result.returncode)


def step_convert_m4a(voices_dir: Path):
    """3) WAV → M4A 변환 (ffmpeg)"""
    wavs = sorted(voices_dir.rglob("voice.wav"))
    if not wavs:
        print("[m4a] no WAV files to convert")
        return

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("[m4a] ERROR: ffmpeg not found in PATH")
        sys.exit(1)

    ok = 0
    for wav in wavs:
        m4a = wav.with_suffix(".m4a")
        result = subprocess.run(
            [ffmpeg, "-y", "-i", str(wav), "-c:a", "aac", "-b:a", "64k", "-ar", "32000", "-ac", "1", str(m4a)],
            capture_output=True,
        )
        if result.returncode == 0:
            wav.unlink()
            ok += 1
        else:
            print(f"[m4a] FAIL: {wav}")

    print(f"[m4a] converted {ok}/{len(wavs)} files")


def step_update_manifest(voices_dir: Path):
    """4) Manifest URL을 .wav → .m4a로 업데이트"""
    MANIFEST_PATH = voices_dir / "_manifest.json"
    if not MANIFEST_PATH.exists():
        print("[manifest] not found:", MANIFEST_PATH)
        return

    m = json.loads(MANIFEST_PATH.read_text("utf-8"))
    for c in m["clips"]:
        c["wavPath"] = c["wavPath"].replace(".wav", ".m4a")
        c["url"] = c["url"].replace(".wav", ".m4a")
    MANIFEST_PATH.write_text(json.dumps(m, ensure_ascii=False, indent=2), "utf-8")
    print(f"[manifest] updated {len(m['clips'])} clips")


def _load_wake_order(scenario_id: str) -> list[str]:
    """시나리오 JSON에서 roleWakeOrder를 읽어 반환. 없으면 DEFAULT_WAKE_ORDER."""
    scenario_json = ROOT / "scenarios" / f"{scenario_id}.json"
    if scenario_json.exists():
        try:
            data = json.loads(scenario_json.read_text("utf-8"))
            order = data.get("roleWakeOrder")
            if isinstance(order, list) and order:
                return [str(r) for r in order]
        except Exception:
            pass
    return list(DEFAULT_WAKE_ORDER)


def _collect_numbered_clips(base_dir: Path) -> list[Path]:
    """base_dir 아래 001/, 002/, ... 순서대로 voice.m4a 를 수집."""
    if not base_dir.exists():
        return []
    clips: list[Path] = []
    for num_dir in sorted(base_dir.iterdir()):
        if not num_dir.is_dir():
            continue
        f = num_dir / "voice.m4a"
        if f.exists():
            clips.append(f)
    return clips


def step_preview(scenario_id: str, voices_dir: Path):
    """5) 에피소드별 미리듣기 통합본 생성"""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("[preview] ERROR: ffmpeg not found")
        return

    preview_dir = voices_dir / "preview"
    preview_dir.mkdir(parents=True, exist_ok=True)

    wake_order = _load_wake_order(scenario_id)

    # 에피소드 폴더 동적 탐색
    ep_dirs = sorted(
        d for d in voices_dir.iterdir()
        if d.is_dir() and d.name.startswith("ep")
    )
    if not ep_dirs:
        print("[preview] no episode directories found")
        return

    for ep_dir in ep_dirs:
        ep = ep_dir.name
        # player variant 폴더 동적 탐색 (pall, p10, etc.)
        variant_dirs = sorted(
            d for d in ep_dir.iterdir()
            if d.is_dir() and d.name.startswith("p")
        )
        if not variant_dirs:
            print(f"[preview] {ep}: no variant directories found")
            continue

        for variant_dir in variant_dirs:
            variant = variant_dir.name
            files: list[Path] = []

            # Opening — 모든 번호 클립 수집
            files.extend(_collect_numbered_clips(variant_dir / "opening"))

            # Role clips in wake order
            role_base = variant_dir / "role"
            for role in wake_order:
                for part in ["before", "during", "after"]:
                    files.extend(_collect_numbered_clips(role_base / role / part))
            # wake_order에 없지만 디렉토리에 존재하는 role도 포함
            if role_base.exists():
                existing_roles = {d.name for d in role_base.iterdir() if d.is_dir()}
                extra_roles = sorted(existing_roles - set(wake_order))
                for role in extra_roles:
                    for part in ["before", "during", "after"]:
                        files.extend(_collect_numbered_clips(role_base / role / part))

            # Outro — 모든 번호 클립 수집
            files.extend(_collect_numbered_clips(variant_dir / "outro"))

            if not files:
                print(f"[preview] {ep}/{variant}: no files found")
                continue

            list_file = preview_dir / f"_{ep}_{variant}_list.txt"
            list_file.write_text(
                "\n".join(f"file '{p}'" for p in files),
                encoding="utf-8",
            )

            out = preview_dir / f"{scenario_id}_{ep}_{variant}_preview.m4a"
            result = subprocess.run(
                [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
                 "-c:a", "aac", "-b:a", "64k", "-ar", "32000", "-ac", "1", str(out)],
                capture_output=True,
            )
            list_file.unlink(missing_ok=True)

            if result.returncode == 0:
                size_kb = out.stat().st_size // 1024
                print(f"[preview] {ep}/{variant} -> {out.name} ({size_kb}KB)")
            else:
                stderr = result.stderr.decode("utf-8", errors="replace")[:200] if result.stderr else ""
                print(f"[preview] {ep}/{variant} FAILED: {stderr}")


def _find_all_scenario_tts() -> list[Path]:
    """scenarios_tts/ 아래 모든 *.tts.json 파일을 찾는다."""
    d = ROOT / "scenarios_tts"
    return sorted(d.glob("*.tts.json")) if d.exists() else []


def main():
    all_tts = _find_all_scenario_tts()
    choices = [p.stem.replace(".tts", "") for p in all_tts]

    parser = argparse.ArgumentParser(
        description="Full TTS build pipeline",
        epilog=f"사용 가능한 시나리오: {', '.join(choices) or '(없음)'}",
    )
    parser.add_argument(
        "scenario",
        nargs="?",
        default=None,
        help="시나리오 이름 (예: full_moon). 생략하면 모든 시나리오를 빌드합니다.",
    )
    parser.add_argument("--skip-generate", action="store_true", help="WAV 생성 건너뛰기 (M4A 변환 + preview만)")
    parser.add_argument("--skip-clean", action="store_true", help="기존 파일 삭제 건너뛰기")
    parser.add_argument("--dry-run", action="store_true", help="생성 없이 클립 목록만 출력")
    parser.add_argument("--no-preview", action="store_true", help="Preview 생성 건너뛰기")
    args = parser.parse_args()

    # Resolve which scenarios to build
    if args.scenario:
        tts_path = ROOT / "scenarios_tts" / f"{args.scenario}.tts.json"
        if not tts_path.exists():
            print(f"[error] 시나리오를 찾을 수 없습니다: {tts_path}")
            print(f"  사용 가능: {', '.join(choices)}")
            sys.exit(1)
        targets = [tts_path]
    else:
        targets = all_tts
        if not targets:
            print("[error] scenarios_tts/ 에 *.tts.json 파일이 없습니다.")
            sys.exit(1)

    for tts_path in targets:
        scenario_id, voices_dir = _resolve_paths(tts_path)

        print("=" * 60)
        print(f"  TTS Build: {scenario_id}  ({tts_path.name})")
        print("=" * 60)

        if not args.skip_clean and not args.skip_generate and not args.dry_run:
            step_clean(voices_dir)

        if not args.skip_generate:
            step_generate(tts_path, dry_run=args.dry_run)
            if args.dry_run:
                continue

        step_convert_m4a(voices_dir)
        step_update_manifest(voices_dir)

        if not args.no_preview:
            step_preview(scenario_id, voices_dir)

        # Summary
        m4a_count = len(list(voices_dir.rglob("voice.m4a")))
        total_size = sum(f.stat().st_size for f in voices_dir.rglob("*") if f.is_file())
        print()
        print(f"  DONE [{scenario_id}]: {m4a_count} clips, {total_size // 1024 // 1024}MB total")
        print("=" * 60)


if __name__ == "__main__":
    main()
