#!/usr/bin/env python3
"""
Fish Speech TTS backend for the werewolf TTS pipeline.

Calls the Fish Speech API (/v1/tts) to generate WAV audio.
Voice is selected via reference_id (voice tag from voice_map.json).
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
FISH_DEFAULT_API_BASE = "http://100.66.65.124:8080"
FISH_DEFAULT_FORMAT = "wav"
FISH_DEFAULT_TEMPERATURE = 0.8
FISH_DEFAULT_TOP_P = 0.8
FISH_DEFAULT_REPETITION_PENALTY = 1.1
FISH_DEFAULT_MAX_NEW_TOKENS = 1024

# Strip inline emotion tags like <happy>text</happy> → text
_EMOTION_TAG_RE = re.compile(r"</?[a-zA-Z_][a-zA-Z0-9_]*>")


def load_voice_map(voice_map_path: str | os.PathLike[str]) -> dict[str, str]:
    """Load role → voice tag mapping from voice_map.json.

    Returns dict like {"Narrator": "Yohualtecuhtin_Lord_of_the_Night", "werewolf": "Asfand", ...}
    Skips keys starting with '_'.
    """
    raw = json.loads(Path(voice_map_path).read_text("utf-8"))
    return {k: v for k, v in raw.items() if isinstance(v, str) and not k.startswith("_")}


def strip_emotion_tags(text: str) -> str:
    """Remove inline emotion tags, keeping only the text content."""
    return _EMOTION_TAG_RE.sub("", text).strip()


def generate_tts(
    *,
    text: str,
    reference_id: str | None = None,
    out_wav_path: str | os.PathLike[str],
    api_base: str = FISH_DEFAULT_API_BASE,
    temperature: float = FISH_DEFAULT_TEMPERATURE,
    top_p: float = FISH_DEFAULT_TOP_P,
    repetition_penalty: float = FISH_DEFAULT_REPETITION_PENALTY,
    max_new_tokens: int = FISH_DEFAULT_MAX_NEW_TOKENS,
    normalize: bool = True,
    timeout_s: int = 120,
    request_retries: int = 2,
    request_retry_backoff_s: float = 1.0,
) -> Path:
    """Generate a single WAV file via Fish Speech /v1/tts API.

    Args:
        text: Text to synthesize.
        reference_id: Voice tag (from voice_map). None = server default voice.
        out_wav_path: Where to save the output WAV.
        api_base: Fish Speech server base URL.
        Other args: TTS generation parameters.

    Returns:
        Path to the saved WAV file.
    """
    clean_text = strip_emotion_tags(text)
    if not clean_text:
        raise ValueError(f"Empty text after stripping emotion tags: {text!r}")

    out_path = Path(out_wav_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    body: dict[str, Any] = {
        "text": clean_text,
        "format": "wav",
        "temperature": temperature,
        "top_p": top_p,
        "repetition_penalty": repetition_penalty,
        "max_new_tokens": max_new_tokens,
        "normalize": normalize,
    }
    if reference_id:
        body["reference_id"] = reference_id

    payload = json.dumps(body).encode("utf-8")
    url = f"{api_base.rstrip('/')}/v1/tts"

    last_err: Exception | None = None
    for attempt in range(1 + request_retries):
        if attempt > 0:
            wait = request_retry_backoff_s * attempt
            print(f"  [fish] retry {attempt}/{request_retries} after {wait:.1f}s...")
            time.sleep(wait)

        try:
            req = Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urlopen(req, timeout=timeout_s) as resp:
                wav_data = resp.read()

            if len(wav_data) < 100:
                raise ValueError(f"Fish Speech returned suspiciously small response ({len(wav_data)} bytes)")

            out_path.write_bytes(wav_data)
            return out_path

        except (HTTPError, URLError, OSError, ValueError) as e:
            last_err = e
            print(f"  [fish] attempt {attempt + 1} failed: {e}")

    raise RuntimeError(f"Fish Speech TTS failed after {1 + request_retries} attempts: {last_err}")


def generate_tts_for_role(
    *,
    text: str,
    speaker_id: str,
    voice_map: dict[str, str],
    out_wav_path: str | os.PathLike[str],
    api_base: str = FISH_DEFAULT_API_BASE,
    temperature: float = FISH_DEFAULT_TEMPERATURE,
    top_p: float = FISH_DEFAULT_TOP_P,
    repetition_penalty: float = FISH_DEFAULT_REPETITION_PENALTY,
    max_new_tokens: int = FISH_DEFAULT_MAX_NEW_TOKENS,
    normalize: bool = True,
    timeout_s: int = 120,
    request_retries: int = 2,
    request_retry_backoff_s: float = 1.0,
) -> Path:
    """Generate TTS for a role, resolving voice tag from voice_map.

    Falls back to "Narrator" voice if speaker_id not in voice_map.
    """
    reference_id = voice_map.get(speaker_id) or voice_map.get("Narrator")
    if not reference_id:
        raise ValueError(
            f"No voice mapping for speakerId={speaker_id!r} and no Narrator fallback. "
            f"Add it to characters/voice_map.json."
        )

    return generate_tts(
        text=text,
        reference_id=reference_id,
        out_wav_path=out_wav_path,
        api_base=api_base,
        temperature=temperature,
        top_p=top_p,
        repetition_penalty=repetition_penalty,
        max_new_tokens=max_new_tokens,
        normalize=normalize,
        timeout_s=timeout_s,
        request_retries=request_retries,
        request_retry_backoff_s=request_retry_backoff_s,
    )


def ping(api_base: str = FISH_DEFAULT_API_BASE, timeout_s: int = 5) -> bool:
    """Check if the Fish Speech server is reachable."""
    try:
        req = Request(f"{api_base.rstrip('/')}/v1/health")
        with urlopen(req, timeout=timeout_s) as resp:
            return resp.status == 200
    except Exception:
        return False
