#!/usr/bin/env python3
"""역할 초상화 아이콘 27장 생성 (Taisho Roman 스타일)."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image

from comfyui_api import generate_and_save, ROOT

PROMPTS_PATH = ROOT / "scripts" / "role_portraits_prompts.json"
OUTPUT_DIR = ROOT / "public" / "assets" / "images_web" / "taisho_roman" / "roles"
TEMP_DIR = ROOT / "scripts" / "_tmp_role_portraits"
WEBP_QUALITY = 85


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=1, help="시작 번호 (1-based)")
    parser.add_argument("--end", type=int, default=0, help="끝 번호 (0=전체)")
    parser.add_argument("--only", help="특정 role_id만 (쉼표 구분, 예: werewolf,seer)")
    args = parser.parse_args()

    data = json.loads(PROMPTS_PATH.read_text("utf-8"))
    prefix = data["style_prefix"]
    suffix = data["style_suffix"]
    res = data.get("resolution", {})
    img_w = res.get("width", 1024)
    img_h = res.get("height", 1024)
    items = data["items"]

    if args.only:
        only_set = set(args.only.split(","))
        items = [it for it in items if it["id"] in only_set]
    else:
        start_idx = args.start - 1
        end_idx = args.end if args.end > 0 else len(items)
        items = items[start_idx:end_idx]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"=== 역할 초상화 {len(items)}장 생성 시작 ===")
    print(f"출력 디렉토리: {OUTPUT_DIR}")
    print()

    for i, item in enumerate(items):
        item_id = item["id"]
        title = item["title"]
        prompt = prefix + item["prompt"] + suffix

        print(f"[{i+1}/{len(items)}] {title} ({item_id})")
        print(f"  prompt: {prompt[:80]}...")

        try:
            paths = generate_and_save(
                prompt,
                TEMP_DIR,
                width=img_w,
                height=img_h,
                filename_prefix=item_id,
                timeout=300,
            )
            if paths:
                src = paths[0]
                dst = OUTPUT_DIR / f"{item_id}.webp"
                Image.open(src).save(dst, "webp", quality=WEBP_QUALITY)
                print(f"  saved: {dst}")
            else:
                print(f"  WARNING: no output files")
        except Exception as e:
            print(f"  ERROR: {e}")

        print()

    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR, ignore_errors=True)

    print("=== 완료 ===")
    print(f"WebP 파일이 {OUTPUT_DIR} 에 저장되었습니다.")


if __name__ == "__main__":
    main()
