#!/usr/bin/env python3
"""
역할 삽화 + 추가 UI 이미지 생성.
image_prompts_extra.json을 읽고 ComfyUI로 생성 → 바로 WebP 최적화.

사용법:
  python scripts/generate_extra_images.py
  python scripts/generate_extra_images.py --category role_illustrations
  python scripts/generate_extra_images.py --category ui_extra
  python scripts/generate_extra_images.py --only werewolf_hunt,seer_vision
  python scripts/generate_extra_images.py --skip-existing
  python scripts/generate_extra_images.py --dry-run
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

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

PROMPTS_PATH = ROOT / "scripts" / "image_prompts_extra.json"
WEB_BASE = ROOT / "public" / "assets" / "images_web" / "taisho_roman"

# WebP 최적화 타겟 크기
OPTIMIZE_RULES = {
    "role_illustrations": (640, 320),
    "rules_illustrations": (800, 462),
    "ui_extra": None,  # 개별
}
UI_OPTIMIZE = {
    "btn_play": (800, 200),
    "bg_m_home": (512, 512), "bg_m_setup": (512, 512), "bg_m_join": (512, 512),
    "bg_m_night": (512, 512), "bg_m_day": (512, 512), "bg_m_vote": (512, 512),
    "bg_m_lobby": (512, 512),
}


def optimize_to_webp(png_path: Path, webp_path: Path, category: str, item_id: str, quality: int = 82):
    if not HAS_PIL:
        # No Pillow: just copy
        import shutil
        webp_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(png_path, webp_path.with_suffix(".png"))
        return

    img = Image.open(png_path)
    w, h = img.size

    rule = OPTIMIZE_RULES.get(category)
    if rule:
        max_w, max_h = rule
    elif category == "ui_extra":
        max_w, max_h = UI_OPTIMIZE.get(item_id, (w // 2, h // 2))
    else:
        max_w, max_h = w // 2, h // 2

    ratio = min(max_w / w, max_h / h, 1.0)
    tw, th = max(1, round(w * ratio)), max(1, round(h * ratio))
    if tw != w or th != h:
        img = img.resize((tw, th), Image.LANCZOS)

    if img.mode in ("RGBA", "P"):
        bg = Image.new("RGB", img.size, (10, 10, 20))
        if img.mode == "P":
            img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[3])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    webp_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(webp_path, "WEBP", quality=quality, method=4)


def main():
    parser = argparse.ArgumentParser(description="역할 삽화 + UI 이미지 생성")
    parser.add_argument("--category", "-c")
    parser.add_argument("--only")
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--delay", type=float, default=0.3)
    args = parser.parse_args()

    data = json.loads(PROMPTS_PATH.read_text("utf-8"))
    style = data["style"]
    only_set = set(args.only.split(",")) if args.only else None

    SUBDIR_MAP = {
        "role_illustrations": "illustrations",
        "rules_illustrations": "rules",
        "ui_extra": "ui",
        "scenario_episodes": None,  # per-item: episodes/ or scenarios/
    }

    jobs = []
    for cat_id in ["role_illustrations", "rules_illustrations", "ui_extra", "scenario_episodes"]:
        if cat_id not in data:
            continue
        if args.category and cat_id != args.category:
            continue
        cat = data[cat_id]
        cat_style = style.get(cat_id, {})
        prefix = cat_style.get("prefix", "")
        suffix = cat_style.get("suffix", "")
        default_res = cat.get("resolution", {"width": 1024, "height": 512})

        for item_id, item in cat["items"].items():
            if only_set and item_id not in only_set:
                continue
            res = item.get("resolution", default_res)
            prompt = f"{prefix}{item['prompt']}{suffix}"

            # output subdir
            out_subdir = SUBDIR_MAP.get(cat_id)
            if out_subdir is None:
                out_subdir = "scenarios" if item.get("type") == "scenario" else "episodes"
            webp_path = WEB_BASE / out_subdir / f"{item_id}.webp"

            jobs.append({
                "category": cat_id,
                "item_id": item_id,
                "prompt": prompt,
                "width": res["width"],
                "height": res["height"],
                "webp_path": webp_path,
                "out_subdir": out_subdir,
            })

    print(f"Total: {len(jobs)} images\n")

    success = 0
    failed = 0
    skipped = 0

    for i, job in enumerate(jobs, 1):
        tag = f"[{i}/{len(jobs)}]"
        label = f"{job['category']}/{job['item_id']}"

        if args.skip_existing and job["webp_path"].exists():
            print(f"{tag} SKIP {label}")
            skipped += 1
            continue

        print(f"{tag} {label}  {job['width']}x{job['height']}")

        if args.dry_run:
            print(f"     PROMPT: {job['prompt'][:120]}...")
            print()
            continue

        try:
            # 임시 디렉터리에 PNG 생성
            tmp_dir = ROOT / "public" / "assets" / "_tmp_gen"
            paths = generate_and_save(
                job["prompt"],
                tmp_dir,
                width=job["width"],
                height=job["height"],
                seed=args.seed,
                filename_prefix=job["item_id"],
                timeout=300,
            )
            # 리네이밍 + WebP 최적화
            for p in paths:
                renamed = p.parent / f"{job['item_id']}.png"
                if p != renamed:
                    p.rename(renamed)
                optimize_to_webp(renamed, job["webp_path"], job["category"], job["item_id"])
                renamed.unlink(missing_ok=True)
                print(f"     -> {job['webp_path'].relative_to(ROOT)} ({job['webp_path'].stat().st_size // 1024}KB)")
            success += 1
        except Exception as e:
            print(f"     ERROR: {e}")
            failed += 1

        if i < len(jobs) and not args.dry_run:
            time.sleep(args.delay)
        print()

    # 임시 디렉터리 정리
    tmp_dir = ROOT / "public" / "assets" / "_tmp_gen"
    if tmp_dir.exists():
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)

    if not args.dry_run:
        print(f"\nDone: {success} ok, {failed} fail, {skipped} skip (total {len(jobs)})")


if __name__ == "__main__":
    main()
