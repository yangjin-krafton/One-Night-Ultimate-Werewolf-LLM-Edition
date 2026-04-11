#!/usr/bin/env python3
"""
이미지 리소스 배치 생성 스크립트.

스타일(5) × 아이템(42) = 210장 조립 방식.
  최종 프롬프트 = style.prefix + item.prompt + style.suffix

사용법:
  # 전체 생성 (5스타일 × 42아이템 = 210장)
  python scripts/generate_images.py

  # 스타일 지정
  python scripts/generate_images.py --style dark_oil
  python scripts/generate_images.py --style anime_cel,ink_gothic

  # 카테고리 지정
  python scripts/generate_images.py --category role_cards

  # 특정 아이템만
  python scripts/generate_images.py --only werewolf,seer,robber

  # 스타일 + 카테고리 + 아이템 조합
  python scripts/generate_images.py --style dark_oil --category role_cards --only werewolf

  # 기존 파일 건너뛰기 (이어하기)
  python scripts/generate_images.py --skip-existing

  # 시드 고정 (재현용, 모든 아이템 동일 시드)
  python scripts/generate_images.py --seed 42

  # dry-run (프롬프트만 출력)
  python scripts/generate_images.py --dry-run

  # 스타일 목록 보기
  python scripts/generate_images.py --list-styles
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from comfyui_api import generate_and_save  # noqa: E402

PROMPTS_PATH = ROOT / "scripts" / "image_prompts.json"


def load_prompts() -> dict:
    return json.loads(PROMPTS_PATH.read_text("utf-8"))


def assemble_prompt(style_def: dict, category_id: str, item_prompt: str) -> str:
    """스타일 prefix + 아이템 prompt + 스타일 suffix 조립."""
    cat_style = style_def["per_category"].get(category_id, {})
    prefix = cat_style.get("prefix", "")
    suffix = cat_style.get("suffix", "")
    return f"{prefix}{item_prompt}{suffix}"


def iter_jobs(
    data: dict,
    *,
    style_filter: set[str] | None = None,
    category_filter: str | None = None,
    only_filter: set[str] | None = None,
) -> list[dict]:
    """스타일 × 아이템 전체 작업 목록 생성."""
    styles = data["styles"]
    categories = data["categories"]
    default_res = data.get("default_resolution", {"width": 1024, "height": 1024})
    jobs = []

    for style_id, style_def in styles.items():
        if style_filter and style_id not in style_filter:
            continue

        for cat_id, cat in categories.items():
            if category_filter and cat_id != category_filter:
                continue

            cat_resolution = cat.get("resolution", default_res)

            for item_id, item in cat["items"].items():
                if only_filter and item_id not in only_filter:
                    continue

                # 해상도: 아이템 > 카테고리 > 전역
                res = item.get("resolution", cat_resolution)
                width = res.get("width", 1024)
                height = res.get("height", 1328)

                # 프롬프트 조립
                full_prompt = assemble_prompt(style_def, cat_id, item["prompt"])

                # 출력 경로: images/{style_id}/{category}/
                base_output = cat.get("output_dir", f"public/assets/images/{cat_id}")
                output_dir = ROOT / base_output.replace(
                    "public/assets/images/",
                    f"public/assets/images/{style_id}/"
                )

                jobs.append({
                    "style_id": style_id,
                    "style_name": style_def.get("name_ko", style_id),
                    "category": cat_id,
                    "item_id": item_id,
                    "name_ko": item.get("name_ko", item_id),
                    "team": item.get("team", ""),
                    "prompt": full_prompt,
                    "width": width,
                    "height": height,
                    "output_dir": output_dir,
                    "filename_prefix": item_id,
                })

    return jobs


def print_styles(data: dict):
    """스타일 목록 출력."""
    print("Available styles:\n")
    for sid, sdef in data["styles"].items():
        print(f"  {sid:20s}  {sdef['name_ko']}")
        print(f"  {'':20s}  {sdef['description']}")
        print()


def print_summary(jobs: list[dict]):
    """작업 요약 출력."""
    by_style: dict[str, int] = {}
    by_cat: dict[str, int] = {}
    for j in jobs:
        by_style[j["style_id"]] = by_style.get(j["style_id"], 0) + 1
        by_cat[j["category"]] = by_cat.get(j["category"], 0) + 1

    print(f"Total: {len(jobs)} images\n")
    print("  By style:")
    for s, n in by_style.items():
        print(f"    {s:20s} {n:>4d}")
    print("\n  By category:")
    for c, n in by_cat.items():
        print(f"    {c:25s} {n:>4d}")
    print()


def main():
    parser = argparse.ArgumentParser(description="T2I 이미지 배치 생성 (스타일 × 아이템 조립)")
    parser.add_argument("--style", "-s", help="스타일 (쉼표 구분, 예: dark_oil,anime_cel)")
    parser.add_argument("--category", "-c", help="카테고리 (role_cards, scenario_backgrounds, ui_elements)")
    parser.add_argument("--only", help="특정 아이템만 (쉼표 구분)")
    parser.add_argument("--skip-existing", action="store_true", help="기존 파일 건너뛰기")
    parser.add_argument("--seed", type=int, default=None, help="시드 고정")
    parser.add_argument("--dry-run", action="store_true", help="생성하지 않고 프롬프트만 출력")
    parser.add_argument("--delay", type=float, default=1.0, help="생성 사이 대기 (초)")
    parser.add_argument("--list-styles", action="store_true", help="스타일 목록 출력")
    parser.add_argument("--summary", action="store_true", help="작업 요약만 출력")
    args = parser.parse_args()

    data = load_prompts()

    if args.list_styles:
        print_styles(data)
        return

    style_filter = set(args.style.split(",")) if args.style else None
    only_filter = set(args.only.split(",")) if args.only else None

    jobs = iter_jobs(
        data,
        style_filter=style_filter,
        category_filter=args.category,
        only_filter=only_filter,
    )

    if not jobs:
        print("No images to generate.")
        return

    print_summary(jobs)

    if args.summary:
        return

    success = 0
    failed = 0
    skipped = 0

    for i, job in enumerate(jobs, 1):
        tag = f"[{i}/{len(jobs)}]"
        label = f"{job['style_id']}/{job['category']}/{job['item_id']} ({job['name_ko']})"

        # skip-existing 체크 (최종 파일명 기준)
        final_path = job["output_dir"] / f"{job['item_id']}.png"
        if args.skip_existing and final_path.exists():
            print(f"{tag} SKIP {label}")
            skipped += 1
            continue

        print(f"{tag} {label}")
        print(f"     [{job['style_name']}] {job['width']}x{job['height']}")

        if args.dry_run:
            print(f"     PROMPT: {job['prompt'][:150]}...")
            print(f"     OUTPUT: {job['output_dir'].relative_to(ROOT)}/")
            print()
            continue

        try:
            paths = generate_and_save(
                job["prompt"],
                job["output_dir"],
                width=job["width"],
                height=job["height"],
                seed=args.seed,
                filename_prefix=job["filename_prefix"],
                timeout=300,
            )
            # 리네이밍: ComfyUI 출력 -> {item_id}.png
            for p in paths:
                renamed = p.parent / f"{job['item_id']}.png"
                p.rename(renamed)
                print(f"     -> {renamed.relative_to(ROOT)}")
            success += 1
        except Exception as e:
            print(f"     ERROR: {e}")
            failed += 1

        if i < len(jobs) and not args.dry_run:
            time.sleep(args.delay)

        print()

    if not args.dry_run:
        print(f"\nDone: {success} ok, {failed} fail, {skipped} skip (total {len(jobs)})")


if __name__ == "__main__":
    main()
