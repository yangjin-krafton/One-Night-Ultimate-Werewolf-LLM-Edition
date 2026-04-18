#!/usr/bin/env python3
"""역할 초상화 동물화(수인) 버전 27장 생성.

원본 generate_role_portraits.py 와 동일한 파이프라인을 쓰되,
- 프롬프트: scripts/role_portraits_prompts_animal.json
- 출력:    public/assets/images_web/taisho_roman/roles_animal/
로 분리해 원본 초상화를 건드리지 않는다. 필요 시 roles_animal/ 을
roles/ 로 교체하면 일괄 스왑이 된다.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image

from comfyui_api import generate_and_save, ROOT

PROMPTS_PATH = ROOT / "scripts" / "role_portraits_prompts_animal.json"
OUTPUT_DIR = ROOT / "public" / "assets" / "images_web" / "taisho_roman" / "roles_animal"
TEMP_DIR = ROOT / "scripts" / "_tmp_role_portraits_animal"
WEBP_QUALITY = 85


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=1, help="시작 번호 (1-based)")
    parser.add_argument("--end", type=int, default=0, help="끝 번호 (0=전체)")
    parser.add_argument("--only", help="특정 role_id만 (쉼표 구분, 예: seer,robber)")
    parser.add_argument("--skip-existing", action="store_true", help="이미 생성된 파일 건너뛰기")
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

    print(f"=== 역할 초상화(동물화) {len(items)}장 생성 시작 ===")
    print(f"출력 디렉토리: {OUTPUT_DIR}")
    print()

    for i, item in enumerate(items):
        item_id = item["id"]
        title = item["title"]
        prompt = prefix + item["prompt"] + suffix
        dst = OUTPUT_DIR / f"{item_id}.webp"

        print(f"[{i+1}/{len(items)}] {title} ({item_id})")

        if args.skip_existing and dst.exists():
            print(f"  skip: {dst} 이미 존재")
            print()
            continue

        print(f"  prompt: {prompt[:80]}...")

        try:
            paths = generate_and_save(
                prompt,
                TEMP_DIR,
                width=img_w,
                height=img_h,
                filename_prefix=f"{item_id}_animal",
                timeout=300,
            )
            if paths:
                src = paths[0]
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
    print("교체할 때: 이 폴더의 파일들을 roles/ 로 덮어쓰기.")


if __name__ == "__main__":
    main()
