#!/usr/bin/env python3
"""
ComfyUI API 유틸리티.

Qwen Image 2512 + 2-step Turbo LoRA 워크플로우 기반 T2I 생성.
워크플로우 JSON: public/assets/image_qwen_image_2512_with_2steps_lora.json
"""
from __future__ import annotations

import io
import json
import random
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any

COMFYUI_URL = "http://100.66.10.225:8188"
ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / "public" / "assets" / "image_qwen_image_2512_with_2steps_lora.json"

# ComfyUI API 노드 ID (워크플로우 JSON 기준)
NODE_IDS = {
    "vae_loader":    "103",
    "clip_loader":   "104",
    "unet_loader":   "105",
    "ksampler":      "106",
    "latent_image":  "107",
    "clip_encode":   "108",
    "vae_decode":    "109",
    "aura_flow":     "110",
    "lora_loader":   "114",
    "save_image":    "123",
    "cond_zero_out": "128",
}


def load_workflow() -> dict:
    """기본 워크플로우 JSON을 로드."""
    return json.loads(WORKFLOW_PATH.read_text("utf-8"))


def build_prompt(
    text: str,
    *,
    width: int = 1024,
    height: int = 1328,
    seed: int | None = None,
    filename_prefix: str = "werewolf",
) -> dict:
    """워크플로우를 복제하고 프롬프트/해상도/시드를 주입."""
    wf = load_workflow()

    # 프롬프트 텍스트
    wf[NODE_IDS["clip_encode"]]["inputs"]["text"] = text

    # 해상도
    wf[NODE_IDS["latent_image"]]["inputs"]["width"] = width
    wf[NODE_IDS["latent_image"]]["inputs"]["height"] = height

    # 시드 (None이면 랜덤)
    if seed is None:
        seed = random.randint(0, 2**53 - 1)
    wf[NODE_IDS["ksampler"]]["inputs"]["seed"] = seed

    # 출력 파일명 접두사
    wf[NODE_IDS["save_image"]]["inputs"]["filename_prefix"] = filename_prefix

    return wf


def _post_json(path: str, data: Any) -> dict:
    """ComfyUI API에 JSON POST."""
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFYUI_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def _get_json(path: str) -> dict:
    """ComfyUI API에 GET."""
    req = urllib.request.Request(f"{COMFYUI_URL}{path}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def _get_bytes(path: str) -> bytes:
    """ComfyUI API에서 바이너리 GET."""
    req = urllib.request.Request(f"{COMFYUI_URL}{path}")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def queue_prompt(workflow: dict) -> str:
    """워크플로우를 큐에 등록하고 prompt_id를 반환."""
    result = _post_json("/prompt", {"prompt": workflow})
    return result["prompt_id"]


def get_history(prompt_id: str) -> dict | None:
    """prompt_id로 생성 결과 히스토리 조회. 아직 없으면 None."""
    data = _get_json(f"/history/{prompt_id}")
    return data.get(prompt_id)


def wait_for_completion(prompt_id: str, poll_interval: float = 1.0, timeout: float = 300) -> dict:
    """prompt_id가 완료될 때까지 폴링. 히스토리 dict 반환."""
    start = time.time()
    while time.time() - start < timeout:
        hist = get_history(prompt_id)
        if hist and hist.get("status", {}).get("completed", False):
            return hist
        # status_str에서도 확인
        if hist and "outputs" in hist:
            return hist
        time.sleep(poll_interval)
    raise TimeoutError(f"ComfyUI prompt {prompt_id} timed out after {timeout}s")


def download_images(history: dict, output_dir: Path) -> list[Path]:
    """히스토리에서 생성된 이미지들을 output_dir에 저장. 저장된 파일 경로 목록 반환."""
    output_dir.mkdir(parents=True, exist_ok=True)
    saved = []

    outputs = history.get("outputs", {})
    for node_id, node_output in outputs.items():
        images = node_output.get("images", [])
        for img_info in images:
            filename = img_info["filename"]
            subfolder = img_info.get("subfolder", "")
            img_type = img_info.get("type", "output")

            params = f"filename={filename}&type={img_type}"
            if subfolder:
                params += f"&subfolder={subfolder}"

            img_bytes = _get_bytes(f"/view?{params}")
            out_path = output_dir / filename
            out_path.write_bytes(img_bytes)
            saved.append(out_path)

    return saved


def generate_and_save(
    text: str,
    output_dir: Path,
    *,
    width: int = 1024,
    height: int = 1328,
    seed: int | None = None,
    filename_prefix: str = "werewolf",
    timeout: float = 300,
) -> list[Path]:
    """프롬프트 텍스트로 이미지 생성 후 저장. 원스톱 함수. 첫 실행 시 모델 로딩에 시간이 걸릴 수 있음."""
    wf = build_prompt(
        text,
        width=width,
        height=height,
        seed=seed,
        filename_prefix=filename_prefix,
    )
    prompt_id = queue_prompt(wf)
    print(f"  queued: {prompt_id} (seed={wf[NODE_IDS['ksampler']]['inputs']['seed']})")

    history = wait_for_completion(prompt_id, timeout=timeout)
    paths = download_images(history, output_dir)
    return paths


# ── CLI quick test ──────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="ComfyUI 단일 이미지 생성 테스트")
    parser.add_argument("--prompt", "-p", required=True, help="T2I 프롬프트 텍스트")
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1328)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--output", "-o", type=Path, default=Path("./test_output"))
    parser.add_argument("--prefix", default="test")
    args = parser.parse_args()

    paths = generate_and_save(
        args.prompt,
        args.output,
        width=args.width,
        height=args.height,
        seed=args.seed,
        filename_prefix=args.prefix,
    )
    for p in paths:
        print(f"  saved: {p}")
