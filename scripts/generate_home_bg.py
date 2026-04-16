#!/usr/bin/env python3
"""홈 타이틀 배경 이미지 10장 생성 (Qwen Image 2512 + 2steps LoRA)."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from comfyui_api import generate_and_save, ROOT

PROMPTS_PATH = ROOT / "scripts" / "home_bg_prompts.json"
OUTPUT_DIR = ROOT / "public" / "assets" / "images_web" / "taisho_roman" / "ui"
TEMP_DIR = ROOT / "scripts" / "_tmp_home_bg"


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=1, help="시작 번호 (1-based)")
    parser.add_argument("--end", type=int, default=0, help="끝 번호 (0=전체)")
    args = parser.parse_args()

    data = json.loads(PROMPTS_PATH.read_text("utf-8"))
    prefix = data["style_prefix"]
    suffix = data["style_suffix"]
    res = data.get("resolution", {})
    img_w = res.get("width", 1024)
    img_h = res.get("height", 1024)
    items = data["items"]

    start_idx = args.start - 1
    end_idx = args.end if args.end > 0 else len(items)
    items = items[start_idx:end_idx]

    print(f"=== 홈 배경 이미지 #{args.start}~#{end_idx} ({len(items)}장) 생성 시작 ===")
    print(f"출력 디렉토리: {OUTPUT_DIR}")
    print()

    for i, item in enumerate(items):
        item_id = item["id"]
        title = item["title"]
        prompt = prefix + item["prompt"] + suffix

        # Use id from JSON (bg_home_01, bg_home_11, etc.)
        file_id = item_id

        print(f"[{i+1}/{len(items)}] {title} ({file_id})")
        print(f"  prompt: {prompt[:80]}...")

        try:
            paths = generate_and_save(
                prompt,
                TEMP_DIR,
                width=img_w,
                height=img_h,
                filename_prefix=file_id,
                timeout=120,
            )
            if paths:
                # ComfyUI saves as PNG — copy to output as-is (or convert later)
                src = paths[0]
                # Just copy with the right name (PNG for now, webp conversion separate)
                dst = OUTPUT_DIR / f"{file_id}.png"
                shutil.copy2(src, dst)
                print(f"  saved: {dst}")
            else:
                print(f"  WARNING: no output files")
        except Exception as e:
            print(f"  ERROR: {e}")

        print()

    # Cleanup temp
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR, ignore_errors=True)

    print("=== 완료 ===")
    print()
    print("PNG → WebP 변환이 필요합니다:")
    print(f'  cd "{OUTPUT_DIR}"')
    print('  for f in bg_home_*.png; do cwebp -q 85 "$f" -o "${f%.png}.webp" && rm "$f"; done')
    print()
    print("또는 Python:")
    print("  from PIL import Image")
    print('  for i in range(1,11): Image.open(f"bg_home_{i:02d}.png").save(f"bg_home_{i:02d}.webp", "webp", quality=85)')


if __name__ == "__main__":
    main()
