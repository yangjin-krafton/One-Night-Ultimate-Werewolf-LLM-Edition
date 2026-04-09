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
CHARACTERS_DIR = ROOT / "characters" / "Thema_01"

# Night wake order for preview concat
WAKE_ORDER = [
    "sentinel", "werewolf", "alpha_wolf", "mystic_wolf", "dream_wolf",
    "minion", "mason",
    "seer", "apprentice_seer", "paranormal_investigator",
    "robber", "witch", "troublemaker",
    "village_idiot", "drunk", "curator",
    "insomniac", "revealer", "bodyguard",
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


def step_preview():
    """5) 에피소드별 미리듣기 통합본 생성"""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("[preview] ERROR: ffmpeg not found")
        return

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    for ep in ["ep1", "ep2"]:
        files: list[Path] = []
        # Opening
        f = VOICES_DIR / ep / "p10" / "opening" / "001" / "voice.m4a"
        if f.exists():
            files.append(f)
        # Role clips in wake order
        for role in WAKE_ORDER:
            for part in ["during", "after"]:
                f = VOICES_DIR / ep / "p10" / "role" / role / part / "001" / "voice.m4a"
                if f.exists():
                    files.append(f)
        # Outro
        f = VOICES_DIR / ep / "p10" / "outro" / "001" / "voice.m4a"
        if f.exists():
            files.append(f)

        if not files:
            print(f"[preview] {ep}: no files found")
            continue

        list_file = PREVIEW_DIR / f"_{ep}_list.txt"
        list_file.write_text(
            "\n".join(f"file '{p}'" for p in files),
            encoding="utf-8",
        )

        out = PREVIEW_DIR / f"full_moon_{ep}_preview.m4a"
        result = subprocess.run(
            [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
             "-c:a", "aac", "-b:a", "64k", "-ar", "32000", "-ac", "1", str(out)],
            capture_output=True,
        )
        list_file.unlink(missing_ok=True)

        if result.returncode == 0:
            size_kb = out.stat().st_size // 1024
            print(f"[preview] {ep} -> {out.name} ({size_kb}KB)")
        else:
            print(f"[preview] {ep} FAILED")


def main():
    parser = argparse.ArgumentParser(description="Full TTS build pipeline")
    parser.add_argument("--skip-generate", action="store_true", help="WAV 생성 건너뛰기 (M4A 변환 + preview만)")
    parser.add_argument("--skip-clean", action="store_true", help="기존 파일 삭제 건너뛰기")
    parser.add_argument("--dry-run", action="store_true", help="생성 없이 클립 목록만 출력")
    parser.add_argument("--no-preview", action="store_true", help="Preview 생성 건너뛰기")
    args = parser.parse_args()

    print("=" * 60)
    print("  TTS Build Pipeline: full_moon scenario")
    print("=" * 60)

    if not args.skip_clean and not args.skip_generate:
        step_clean()

    if not args.skip_generate:
        step_generate(dry_run=args.dry_run)
        if args.dry_run:
            return

    step_convert_m4a()
    step_update_manifest()

    if not args.no_preview:
        step_preview()

    # Summary
    m4a_count = len(list(VOICES_DIR.rglob("voice.m4a")))
    total_size = sum(f.stat().st_size for f in VOICES_DIR.rglob("*") if f.is_file())
    print()
    print(f"  DONE: {m4a_count} clips, {total_size // 1024 // 1024}MB total")
    print("=" * 60)


if __name__ == "__main__":
    main()
