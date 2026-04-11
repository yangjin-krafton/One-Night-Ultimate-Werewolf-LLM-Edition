#!/usr/bin/env python3
"""
이미지 최적화: PNG 원본 → 리사이즈 + WebP 변환.

카테고리별 타겟 크기:
  roles/       512x512 → 128x128 (아이콘)
  scenarios/   1328x768 → 800x462 (배경)
  episodes/    1328x768 → 800x462 (배경)
  ui/          다양 → 절반 크기

원본은 유지, web/ 하위에 WebP 출력.

사용법:
  python scripts/optimize_images.py
  python scripts/optimize_images.py --quality 80
  python scripts/optimize_images.py --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_BASE = ROOT / "public" / "assets" / "images"
DST_BASE = ROOT / "public" / "assets" / "images_web"

# 카테고리별 리사이즈 규칙 (max_width, max_height)
RESIZE_RULES = {
    "roles":     (128, 128),
    "scenarios": (800, 462),
    "episodes":  (800, 462),
    "ui":        None,  # 개별 처리
}

# ui/ 개별 규칙
UI_RULES = {
    "card_back":          (256, 332),
    "card_back_center":   (256, 332),
    "team_badge_village": (128, 128),
    "team_badge_wolf":    (128, 128),
    "team_badge_tanner":  (128, 128),
    "logo_title":         (664, 256),
    "night_phase_overlay":(800, 462),
    "day_phase_overlay":  (800, 462),
    "vote_phase_overlay": (800, 462),
    "expansion_base":     (320, 160),
    "expansion_daybreak": (320, 160),
    "expansion_bonus1":   (320, 160),
    "expansion_bonus2":   (320, 160),
}


def get_target_size(category: str, stem: str, orig_w: int, orig_h: int) -> tuple[int, int]:
    rule = RESIZE_RULES.get(category)
    if rule is not None:
        max_w, max_h = rule
    elif category == "ui":
        max_w, max_h = UI_RULES.get(stem, (orig_w // 2, orig_h // 2))
    else:
        max_w, max_h = orig_w // 2, orig_h // 2

    # 비율 유지하며 max 안에 맞추기
    ratio = min(max_w / orig_w, max_h / orig_h, 1.0)
    return max(1, round(orig_w * ratio)), max(1, round(orig_h * ratio))


def optimize(src: Path, dst: Path, quality: int, dry_run: bool) -> dict:
    img = Image.open(src)
    orig_w, orig_h = img.size
    orig_size = src.stat().st_size

    # 카테고리 추출: {style}/{category}/{file}
    parts = src.relative_to(SRC_BASE).parts
    category = parts[1] if len(parts) >= 3 else "unknown"
    stem = src.stem

    tw, th = get_target_size(category, stem, orig_w, orig_h)

    if dry_run:
        return {"src": str(src), "orig": f"{orig_w}x{orig_h}", "target": f"{tw}x{th}", "orig_kb": orig_size // 1024}

    # 리사이즈
    if tw != orig_w or th != orig_h:
        img = img.resize((tw, th), Image.LANCZOS)

    # RGB 변환 (RGBA → RGB, WebP lossy에 적합)
    if img.mode in ("RGBA", "P"):
        bg = Image.new("RGB", img.size, (10, 10, 20))  # 게임 배경색
        if img.mode == "P":
            img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[3])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # WebP 저장
    dst.parent.mkdir(parents=True, exist_ok=True)
    webp_path = dst.with_suffix(".webp")
    img.save(webp_path, "WEBP", quality=quality, method=4)

    new_size = webp_path.stat().st_size
    return {
        "src": str(src.relative_to(ROOT)),
        "dst": str(webp_path.relative_to(ROOT)),
        "orig": f"{orig_w}x{orig_h}",
        "target": f"{tw}x{th}",
        "orig_kb": orig_size // 1024,
        "new_kb": new_size // 1024,
        "ratio": f"{new_size / orig_size * 100:.0f}%",
    }


def main():
    parser = argparse.ArgumentParser(description="이미지 최적화 (WebP 변환 + 리사이즈)")
    parser.add_argument("--quality", "-q", type=int, default=82, help="WebP 품질 (0-100)")
    parser.add_argument("--dry-run", action="store_true", help="변환하지 않고 계획만 출력")
    args = parser.parse_args()

    pngs = sorted(SRC_BASE.rglob("*.png"))
    if not pngs:
        print("No PNG files found.")
        return

    print(f"Found {len(pngs)} PNG files, quality={args.quality}\n")

    total_orig = 0
    total_new = 0

    for i, src in enumerate(pngs, 1):
        rel = src.relative_to(SRC_BASE)
        dst = DST_BASE / rel

        result = optimize(src, dst, args.quality, args.dry_run)

        tag = f"[{i}/{len(pngs)}]"
        if args.dry_run:
            print(f"{tag} {rel}  {result['orig']} → {result['target']}  ({result['orig_kb']}KB)")
        else:
            total_orig += result["orig_kb"]
            total_new += result["new_kb"]
            print(f"{tag} {rel}  {result['orig']}→{result['target']}  {result['orig_kb']}KB→{result['new_kb']}KB ({result['ratio']})")

    if not args.dry_run:
        print(f"\nTotal: {total_orig // 1024}MB → {total_new // 1024}MB ({total_new / max(total_orig, 1) * 100:.0f}%)")
        print(f"Output: {DST_BASE.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
