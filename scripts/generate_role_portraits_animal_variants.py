#!/usr/bin/env python3
"""역할별 배리언트(기본 5장) 추가 생성.

기본 픽(roles_animal/<id>.webp)은 유지하고, 선택용 후보를
roles_animal_variants/<id>/01.webp ~ NN.webp 에 저장한다.

각 배리언트마다 베이스 프롬프트에 각도·표정 힌트를 덧붙여
단순 시드 랜덤보다 확실한 다양성을 확보한다.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image

from comfyui_api import generate_and_save, ROOT

PROMPTS_PATH = ROOT / "scripts" / "role_portraits_prompts_animal.json"
OUTPUT_ROOT = ROOT / "public" / "assets" / "images_web" / "taisho_roman" / "roles_animal_variants"
TEMP_DIR = ROOT / "scripts" / "_tmp_role_portraits_animal_variants"
WEBP_QUALITY = 85

VARIATION_HINTS = [
    " [variation 1: slight head tilt to the opposite side from the base pose, alternate micro-expression, soft frontal-lean angle]",
    " [variation 2: sharper three-quarter angle turned further away from camera, more introspective mood, eyes cast aside]",
    " [variation 3: near-profile side view with chin slightly lifted, dramatic silhouette against the medallion]",
    " [variation 4: dynamic tilted-head pose with wind-blown fur or feathers, mouth slightly parted in alternate emotion]",
    " [variation 5: frontal facing pose with direct intense gaze at the viewer, stronger backlit moonlit rim-light mood]",
]


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="특정 role_id만 (쉼표 구분, 예: seer,prince)")
    parser.add_argument("--count", type=int, default=5, help="역할당 생성 장수 (기본 5)")
    parser.add_argument("--skip-existing", action="store_true", help="이미 있는 배리언트 파일은 건너뜀")
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

    count = max(1, min(args.count, len(VARIATION_HINTS)))

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    total = len(items) * count
    print(f"=== 배리언트 {len(items)}역할 × {count}장 = {total}장 생성 시작 ===")
    print(f"출력 루트: {OUTPUT_ROOT}")
    print()

    made = 0
    for i, item in enumerate(items):
        item_id = item["id"]
        title = item["title"]
        role_dir = OUTPUT_ROOT / item_id
        role_dir.mkdir(parents=True, exist_ok=True)

        for v in range(count):
            made += 1
            variant_no = v + 1
            dst = role_dir / f"{variant_no:02d}.webp"
            print(f"[{made}/{total}] {title} ({item_id}) #{variant_no:02d}")

            if args.skip_existing and dst.exists():
                print(f"  skip: {dst} 이미 존재")
                continue

            prompt = prefix + item["prompt"] + VARIATION_HINTS[v] + suffix

            try:
                paths = generate_and_save(
                    prompt,
                    TEMP_DIR,
                    width=img_w,
                    height=img_h,
                    filename_prefix=f"{item_id}_v{variant_no:02d}",
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
    print(f"배리언트 파일 트리:")
    print(f"  {OUTPUT_ROOT}/<role_id>/01.webp ~ {count:02d}.webp")
    print("고른 파일을 roles_animal/<role_id>.webp 로 복사하면 교체 완료.")


if __name__ == "__main__":
    main()
