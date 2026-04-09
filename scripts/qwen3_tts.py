#!/usr/bin/env python3
"""
Qwen3-TTS backend for the werewolf TTS pipeline.

Calls the Qwen3-TTS Gradio API running in a Docker container.
Supports two generation modes:
  - clone: Upload reference audio and clone voice (generate_clone endpoint)
  - clone_from_file: Use server-stored reference audio (generate_clone_from_file endpoint)

Reuses CharacterConfig, emotion tag parsing, and WAV concat from gpt_sovits_tts.py.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import random
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import http.client

# ---------------------------------------------------------------------------
# Import shared utilities from gpt_sovits_tts (same repo)
# ---------------------------------------------------------------------------
from gpt_sovits_tts import (
    CharacterConfig,
    TextSegment,
    concat_wavs,
    load_character_config,
    split_text_by_emotion_tags,
    _choose_ref_for_emotion,
    _normalize_tag,
    _resolve_local_ref_audio_path,
    _read_prompt_text_for_ref,
    _wav_duration_seconds,
)

# ---------------------------------------------------------------------------
# Qwen3-TTS defaults
# ---------------------------------------------------------------------------
QWEN3_DEFAULT_API_BASE = "http://100.66.10.225:3000/tools/qwen3-tts"
QWEN3_DEFAULT_LANGUAGE = "korean"
QWEN3_DEFAULT_MAX_TOKENS = 2048
QWEN3_DEFAULT_TEMPERATURE = 0.7
QWEN3_DEFAULT_TOP_P = 0.95
QWEN3_DEFAULT_TOP_K = 50
QWEN3_DEFAULT_DO_SAMPLE = True
QWEN3_DEFAULT_USE_XVEC = True

import re as _re
import struct as _struct
import wave as _wave

_SENTENCE_SPLIT_RE = _re.compile(r'(?<=[.?!。！？…])\s*')

# Pause durations (seconds) inserted between sentences during concat.
# Keyed by the last character of the preceding sentence.
_PAUSE_AFTER: dict[str, float] = {
    '.': 0.55,   '。': 0.55,
    '!': 0.50,   '！': 0.50,
    '?': 0.50,   '？': 0.50,
    '…': 0.60,
}
_PAUSE_DEFAULT = 0.35   # fallback for other endings (e.g. no punctuation)


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences for per-sentence TTS generation.
    Keeps voice identity stable by avoiding long single-call generations."""
    parts = _SENTENCE_SPLIT_RE.split(text.strip())
    return [p.strip() for p in parts if p.strip()]


def _make_silence_wav(duration_s: float, *, sample_rate: int, sampwidth: int, channels: int) -> bytes:
    """Generate raw PCM silence bytes for the given duration."""
    n_frames = int(sample_rate * duration_s)
    return b'\x00' * (n_frames * sampwidth * channels)


def concat_wavs_with_pause(wav_paths: list[Path], sentences: list[str], out_wav_path: Path) -> Path:
    """Concat WAV files with silence gaps between sentences.
    Gap duration depends on the trailing punctuation of each sentence."""
    if not wav_paths:
        raise ValueError("No wav parts to concat")
    if len(wav_paths) == 1:
        out_wav_path.parent.mkdir(parents=True, exist_ok=True)
        out_wav_path.write_bytes(wav_paths[0].read_bytes())
        return out_wav_path

    out_wav_path.parent.mkdir(parents=True, exist_ok=True)

    # Read first file to get WAV params
    with _wave.open(str(wav_paths[0]), "rb") as w0:
        channels = w0.getnchannels()
        sampwidth = w0.getsampwidth()
        framerate = w0.getframerate()
        comptype = w0.getcomptype()
        compname = w0.getcompname()

    chunks: list[bytes] = []
    for idx, p in enumerate(wav_paths):
        with _wave.open(str(p), "rb") as w:
            chunks.append(w.readframes(w.getnframes()))

        # Insert silence after this sentence (except after the last one)
        if idx < len(wav_paths) - 1:
            sent = sentences[idx] if idx < len(sentences) else ""
            last_char = sent.rstrip()[-1] if sent.rstrip() else ""
            pause_s = _PAUSE_AFTER.get(last_char, _PAUSE_DEFAULT)
            chunks.append(_make_silence_wav(pause_s, sample_rate=framerate, sampwidth=sampwidth, channels=channels))

    with _wave.open(str(out_wav_path), "wb") as out:
        out.setnchannels(channels)
        out.setsampwidth(sampwidth)
        out.setframerate(framerate)
        if comptype != "NONE":
            out.setcomptype(comptype, compname)
        for chunk in chunks:
            out.writeframes(chunk)
    return out_wav_path


# ============================================================================
# Gradio API helpers (stdlib only)
# ============================================================================

def _gradio_upload_file(api_base: str, file_path: Path, *, timeout_s: int = 60) -> str:
    """Upload a local file to the Gradio server. Returns the server-side temp path."""
    boundary = uuid.uuid4().hex
    mime_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    file_bytes = file_path.read_bytes()

    body = b"".join([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="files"; filename="{file_path.name}"\r\n'.encode(),
        f"Content-Type: {mime_type}\r\n".encode(),
        b"\r\n",
        file_bytes,
        f"\r\n--{boundary}--\r\n".encode(),
    ])

    url = f"{api_base.rstrip('/')}/gradio_api/upload"
    req = Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urlopen(req, timeout=timeout_s) as resp:
        paths = json.loads(resp.read())
    if not paths or not isinstance(paths, list):
        raise RuntimeError(f"Gradio upload returned unexpected result: {paths}")
    return paths[0]


def _gradio_download_file(api_base: str, server_path: str, out_path: Path, *, timeout_s: int = 120) -> Path:
    """Download a file from the Gradio server using its temp path."""
    url = f"{api_base.rstrip('/')}/gradio_api/file={server_path}"
    req = Request(url, method="GET")
    with urlopen(req, timeout=timeout_s) as resp:
        data = resp.read()
    if not data:
        raise RuntimeError(f"Empty response downloading {url}")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(data)
    return out_path


def _gradio_call(
    api_base: str,
    endpoint: str,
    data: list[Any],
    *,
    timeout_s: int = 120,
) -> list[Any]:
    """
    Call a named Gradio API endpoint (non-streaming).

    1. POST /gradio_api/call/{endpoint} with {"data": [...]}
    2. Parse SSE stream for 'complete' event
    3. Return the result data array
    """
    base = api_base.rstrip("/")
    call_url = f"{base}/gradio_api/call/{endpoint}"

    # Step 1: Initiate the call
    body = json.dumps({"data": data}).encode("utf-8")
    req = Request(call_url, data=body, method="POST", headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=timeout_s) as resp:
        result = json.loads(resp.read())
    event_id = result.get("event_id")
    if not event_id:
        raise RuntimeError(f"No event_id in Gradio response: {result}")

    # Step 2: Stream SSE for result
    sse_url = f"{call_url}/{event_id}"
    with urlopen(sse_url, timeout=timeout_s) as resp:
        current_event: str | None = None
        for raw_line in resp:
            line = raw_line.decode("utf-8", errors="replace").rstrip("\n\r")
            if line.startswith("event:"):
                current_event = line[6:].strip()
            elif line.startswith("data:"):
                data_str = line[5:].strip()
                if current_event == "error":
                    raise RuntimeError(f"Qwen3-TTS API error ({endpoint}): {data_str}")
                if current_event == "complete":
                    return json.loads(data_str)

    raise RuntimeError(f"SSE stream ended without completion for endpoint={endpoint}")


def _extract_audio_path_from_result(result: Any) -> str | None:
    """Extract the server file path from a Gradio Audio output."""
    if isinstance(result, dict):
        return result.get("path") or result.get("url")
    if isinstance(result, (list, tuple)) and len(result) >= 1:
        # Sometimes returned as (sample_rate, array) but serialized as file
        if isinstance(result[0], dict):
            return result[0].get("path") or result[0].get("url")
    return None


# ============================================================================
# Voice library: query & lock (consistent voice per tag)
# ============================================================================

def query_voice_library(api_base: str, *, timeout_s: int = 30) -> list[dict[str, Any]]:
    """Query all voices from the Qwen3-TTS voice library."""
    result = _gradio_call(api_base, "get_all_voices", [], timeout_s=timeout_s)
    if result and isinstance(result[0], list):
        return result[0]
    return result if isinstance(result, list) else []


def resolve_voice_lock(
    voices: list[dict[str, Any]],
    tags: list[str],
    *,
    seed: int | None = None,
) -> dict[str, dict[str, Any]]:
    """
    For each tag, pick ONE specific voice deterministically.

    Returns a dict mapping tag → voice dict (with audio_filename, prompt_text, etc.).
    This ensures the same reference voice is used for all clips sharing a tag.
    """
    rng = random.Random(seed)
    lock: dict[str, dict[str, Any]] = {}
    for tag in tags:
        if tag in lock:
            continue
        matching = [v for v in voices if v.get("tag") == tag]
        if matching:
            lock[tag] = rng.choice(matching)
    return lock


def load_voice_map(voice_map_path: str | os.PathLike[str]) -> dict[str, str]:
    """Load role→voice tag base mapping from voice_map.json.

    Returns dict like {"Narrator": "lynette", "werewolf": "neuvillette", ...}
    """
    raw = json.loads(Path(voice_map_path).read_text("utf-8"))
    return {k: v for k, v in raw.items() if not k.startswith("_")}


def build_voice_lock_from_map(
    voice_map: dict[str, str],
    all_voices: list[dict[str, Any]],
    *,
    seed: int | None = 42,
) -> dict[str, dict[str, Any]]:
    """Build a voice_lock from voice_map + voice library.

    For each role's voice tag base (e.g. "lynette"), locks "{base}_기본" to a
    specific voice entry from the library.
    Returns dict mapping full tag (e.g. "lynette_기본") → voice dict.
    """
    needed_tags: set[str] = set()
    for voice_base in voice_map.values():
        needed_tags.add(f"{voice_base}_기본")
    return resolve_voice_lock(all_voices, sorted(needed_tags), seed=seed)


def generate_tts_for_role(
    *,
    text: str,
    voice_tag_base: str,
    out_wav_path: str | os.PathLike[str],
    voice_lock: dict[str, dict[str, Any]],
    api_base: str = QWEN3_DEFAULT_API_BASE,
    language: str = QWEN3_DEFAULT_LANGUAGE,
    use_xvec: bool = QWEN3_DEFAULT_USE_XVEC,
    max_tokens: int = QWEN3_DEFAULT_MAX_TOKENS,
    do_sample: bool = QWEN3_DEFAULT_DO_SAMPLE,
    temperature: float = QWEN3_DEFAULT_TEMPERATURE,
    top_p: float = QWEN3_DEFAULT_TOP_P,
    top_k: int = QWEN3_DEFAULT_TOP_K,
    timeout_s: int = 120,
    request_retries: int = 2,
    request_retry_backoff_s: float = 1.0,
) -> Path:
    """Generate TTS for a single clip using voice_map + voice_lock.

    Strips emotion tags from text, splits by sentence, generates each sentence
    with the locked voice, inserts pauses, and concatenates.
    """
    out_path = Path(out_wav_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Strip leading emotion tag: [xxx] or {xxx}
    import re
    clean_text = re.sub(r'^\s*[\[{][^\]}>]+[\]}]\s*', '', text).strip()
    if not clean_text:
        clean_text = text.strip()

    tag = f"{voice_tag_base}_기본"
    locked = voice_lock.get(tag)
    if not locked:
        raise RuntimeError(f"Voice lock missing for tag '{tag}'")

    ref_name = locked.get("audio_filename", "")
    ref_text = locked.get("prompt_text", "")

    sentences = _split_sentences(clean_text)
    if len(sentences) <= 1:
        qwen3_tts_to_wav_from_file(
            text=clean_text, ref_voice_name=ref_name, ref_text=ref_text,
            out_wav_path=out_path, api_base=api_base, language=language,
            use_xvec=use_xvec, max_tokens=max_tokens, do_sample=do_sample,
            temperature=temperature, top_p=top_p, top_k=top_k,
            timeout_s=timeout_s, request_retries=request_retries,
            request_retry_backoff_s=request_retry_backoff_s,
        )
    else:
        with tempfile.TemporaryDirectory(prefix="tts_vm_") as td:
            parts: list[Path] = []
            for si, sent in enumerate(sentences):
                sp = Path(td) / f"s{si:03d}.wav"
                qwen3_tts_to_wav_from_file(
                    text=sent, ref_voice_name=ref_name, ref_text=ref_text,
                    out_wav_path=sp, api_base=api_base, language=language,
                    use_xvec=use_xvec, max_tokens=max_tokens, do_sample=do_sample,
                    temperature=temperature, top_p=top_p, top_k=top_k,
                    timeout_s=timeout_s, request_retries=request_retries,
                    request_retry_backoff_s=request_retry_backoff_s,
                )
                parts.append(sp)
            concat_wavs_with_pause(parts, sentences, out_path)
    return out_path


# ============================================================================
# Qwen3-TTS generation functions
# ============================================================================

def qwen3_tts_to_wav(
    *,
    text: str,
    ref_audio_local_path: Path,
    ref_text: str = "",
    out_wav_path: str | os.PathLike[str],
    api_base: str = QWEN3_DEFAULT_API_BASE,
    language: str = QWEN3_DEFAULT_LANGUAGE,
    use_xvec: bool = QWEN3_DEFAULT_USE_XVEC,
    max_tokens: int = QWEN3_DEFAULT_MAX_TOKENS,
    do_sample: bool = QWEN3_DEFAULT_DO_SAMPLE,
    temperature: float = QWEN3_DEFAULT_TEMPERATURE,
    top_p: float = QWEN3_DEFAULT_TOP_P,
    top_k: int = QWEN3_DEFAULT_TOP_K,
    timeout_s: int = 120,
    request_retries: int = 2,
    request_retry_backoff_s: float = 1.0,
) -> Path:
    """
    Generate TTS using Qwen3-TTS generate_clone endpoint.
    Uploads the reference audio file and clones the voice.
    """
    out_path = Path(out_wav_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    last_err: Exception | None = None
    attempts = max(1, int(request_retries) + 1)

    for attempt in range(1, attempts + 1):
        try:
            # Upload reference audio
            server_ref_path = _gradio_upload_file(api_base, ref_audio_local_path, timeout_s=timeout_s)

            # Call generate_clone
            # Inputs: ref_audio, ref_text, xvec_only, text, language, mtok, do_s, temp, tp, tk
            result = _gradio_call(
                api_base,
                "generate_clone",
                [
                    {"path": server_ref_path, "meta": {"_type": "gradio.FileData"}},
                    ref_text or "",
                    bool(use_xvec),
                    text,
                    language,
                    int(max_tokens),
                    bool(do_sample),
                    float(temperature),
                    float(top_p),
                    int(top_k),
                ],
                timeout_s=timeout_s,
            )

            # Extract audio from result: [audio_data, status_text]
            if not result or len(result) < 2:
                raise RuntimeError(f"Unexpected Qwen3-TTS result format: {result}")

            status_text = result[1] if len(result) > 1 else ""
            if isinstance(status_text, str) and "error" in status_text.lower():
                raise RuntimeError(f"Qwen3-TTS generation error: {status_text}")

            audio_path = _extract_audio_path_from_result(result[0])
            if not audio_path:
                raise RuntimeError(f"No audio path in Qwen3-TTS response: {result[0]}")

            _gradio_download_file(api_base, audio_path, out_path, timeout_s=timeout_s)
            return out_path

        except (URLError, TimeoutError, ConnectionError, http.client.RemoteDisconnected) as e:
            last_err = e
            if attempt >= attempts:
                break
            sleep_s = request_retry_backoff_s * (2 ** (attempt - 1))
            print(f"[warn] Qwen3-TTS request error ({type(e).__name__}); retry {attempt}/{attempts} after {sleep_s:.1f}s")
            time.sleep(sleep_s)
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"Qwen3-TTS generate_clone failed: {type(e).__name__}: {e}") from e

    raise RuntimeError(
        f"Qwen3-TTS generate_clone failed after {attempts} attempts.\n"
        f"api_base={api_base}\n"
        f"error={type(last_err).__name__ if last_err else 'Unknown'}: {last_err}"
    ) from last_err


def qwen3_tts_to_wav_from_file(
    *,
    text: str,
    ref_voice_name: str,
    ref_text: str = "",
    out_wav_path: str | os.PathLike[str],
    api_base: str = QWEN3_DEFAULT_API_BASE,
    language: str = QWEN3_DEFAULT_LANGUAGE,
    use_xvec: bool = QWEN3_DEFAULT_USE_XVEC,
    max_tokens: int = QWEN3_DEFAULT_MAX_TOKENS,
    do_sample: bool = QWEN3_DEFAULT_DO_SAMPLE,
    temperature: float = QWEN3_DEFAULT_TEMPERATURE,
    top_p: float = QWEN3_DEFAULT_TOP_P,
    top_k: int = QWEN3_DEFAULT_TOP_K,
    timeout_s: int = 120,
    request_retries: int = 2,
    request_retry_backoff_s: float = 1.0,
) -> Path:
    """
    Generate TTS using Qwen3-TTS generate_clone_from_file endpoint.
    Uses a reference audio file already stored on the server (/data/voices/ref/).
    """
    out_path = Path(out_wav_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    last_err: Exception | None = None
    attempts = max(1, int(request_retries) + 1)

    for attempt in range(1, attempts + 1):
        try:
            # Inputs: ref_voice_name, ref_txt, use_xvec, text, language, mtok, do_s, temp, tp, tk
            result = _gradio_call(
                api_base,
                "generate_clone_from_file",
                [
                    ref_voice_name,
                    ref_text or "",
                    bool(use_xvec),
                    text,
                    language,
                    int(max_tokens),
                    bool(do_sample),
                    float(temperature),
                    float(top_p),
                    int(top_k),
                ],
                timeout_s=timeout_s,
            )

            if not result or len(result) < 2:
                raise RuntimeError(f"Unexpected Qwen3-TTS result format: {result}")

            status_text = result[1] if len(result) > 1 else ""
            if isinstance(status_text, str) and "error" in status_text.lower():
                raise RuntimeError(f"Qwen3-TTS generation error: {status_text}")

            audio_path = _extract_audio_path_from_result(result[0])
            if not audio_path:
                raise RuntimeError(f"No audio path in Qwen3-TTS response: {result[0]}")

            _gradio_download_file(api_base, audio_path, out_path, timeout_s=timeout_s)
            return out_path

        except (URLError, TimeoutError, ConnectionError, http.client.RemoteDisconnected) as e:
            last_err = e
            if attempt >= attempts:
                break
            sleep_s = request_retry_backoff_s * (2 ** (attempt - 1))
            print(f"[warn] Qwen3-TTS request error ({type(e).__name__}); retry {attempt}/{attempts} after {sleep_s:.1f}s")
            time.sleep(sleep_s)
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"Qwen3-TTS generate_clone_from_file failed: {type(e).__name__}: {e}") from e

    raise RuntimeError(
        f"Qwen3-TTS generate_clone_from_file failed after {attempts} attempts.\n"
        f"api_base={api_base}\n"
        f"error={type(last_err).__name__ if last_err else 'Unknown'}: {last_err}"
    ) from last_err


def qwen3_tts_to_wav_by_tag(
    *,
    text: str,
    voice_tag: str,
    out_wav_path: str | os.PathLike[str],
    api_base: str = QWEN3_DEFAULT_API_BASE,
    language: str = QWEN3_DEFAULT_LANGUAGE,
    use_voice_defaults: bool = True,
    max_tokens: int = QWEN3_DEFAULT_MAX_TOKENS,
    do_sample: bool = QWEN3_DEFAULT_DO_SAMPLE,
    temperature: float = QWEN3_DEFAULT_TEMPERATURE,
    top_p: float = QWEN3_DEFAULT_TOP_P,
    top_k: int = QWEN3_DEFAULT_TOP_K,
    timeout_s: int = 120,
    request_retries: int = 2,
    request_retry_backoff_s: float = 1.0,
) -> Path:
    """
    Generate TTS using Qwen3-TTS generate_single_segment endpoint.
    Uses a voice library tag (voices must be pre-registered on the server).
    """
    out_path = Path(out_wav_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    last_err: Exception | None = None
    attempts = max(1, int(request_retries) + 1)

    for attempt in range(1, attempts + 1):
        try:
            # Inputs: tag, text, language, use_voice_defaults, mtok, do_s, temp, tp, tk
            result = _gradio_call(
                api_base,
                "generate_single_segment",
                [
                    voice_tag,
                    text,
                    language,
                    bool(use_voice_defaults),
                    int(max_tokens),
                    bool(do_sample),
                    float(temperature),
                    float(top_p),
                    int(top_k),
                ],
                timeout_s=timeout_s,
            )

            if not result or len(result) < 2:
                raise RuntimeError(f"Unexpected Qwen3-TTS result format: {result}")

            status_text = result[1] if len(result) > 1 else ""
            if isinstance(status_text, str) and "error" in status_text.lower():
                raise RuntimeError(f"Qwen3-TTS generation error: {status_text}")

            audio_path = _extract_audio_path_from_result(result[0])
            if not audio_path:
                raise RuntimeError(f"No audio path in Qwen3-TTS response: {result[0]}")

            _gradio_download_file(api_base, audio_path, out_path, timeout_s=timeout_s)
            return out_path

        except (URLError, TimeoutError, ConnectionError, http.client.RemoteDisconnected) as e:
            last_err = e
            if attempt >= attempts:
                break
            sleep_s = request_retry_backoff_s * (2 ** (attempt - 1))
            print(f"[warn] Qwen3-TTS request error ({type(e).__name__}); retry {attempt}/{attempts} after {sleep_s:.1f}s")
            time.sleep(sleep_s)
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"Qwen3-TTS generate_single_segment failed: {type(e).__name__}: {e}") from e

    raise RuntimeError(
        f"Qwen3-TTS generate_single_segment failed after {attempts} attempts.\n"
        f"api_base={api_base}\n"
        f"error={type(last_err).__name__ if last_err else 'Unknown'}: {last_err}"
    ) from last_err


# ============================================================================
# Character-config-aware TTS (emotion tags, ref selection, WAV concat)
# ============================================================================

def _get_qwen3_config(character_config_path: Path) -> dict[str, Any]:
    """Read the optional 'qwen3' section from a character config JSON."""
    raw = json.loads(character_config_path.read_text(encoding="utf-8"))
    return raw.get("qwen3") or {}


# Standard English→Korean emotion name mapping for voice library tags.
# Voice library uses pattern: {voiceName}_{감정한국어} (e.g. lynette_기본, yunjin_기쁨)
_EMOTION_TO_KOREAN: dict[str, str] = {
    "default": "기본",
    "happy": "기쁨",
    "sad": "슬픔",
    "angry": "분노",
    "fearful": "공포",
    "surprised": "놀람",
}


def _build_emotion_voice_tag_map(
    voice_tag_base: str,
    tag_aliases: dict[str, str],
) -> dict[str, str]:
    """
    Auto-build emotion→voice_tag mapping for the Qwen3 voice library.

    Voice library tag pattern: {voiceTagBase}_{감정한국어}
    e.g. voice_tag_base="lynette" → { "default": "lynette_기본", "happy": "lynette_기쁨", ... }

    Uses tagAliases (Korean→English) in reverse to find the Korean emotion name,
    with _EMOTION_TO_KOREAN as fallback.
    """
    # Build reverse map: English emotion → first Korean alias
    reverse: dict[str, str] = {}
    for korean_key, english_val in tag_aliases.items():
        english_lower = english_val.strip().lower()
        if english_lower and english_lower not in reverse:
            reverse[english_lower] = korean_key

    # Merge with standard mapping (tagAliases take priority)
    for eng, kor in _EMOTION_TO_KOREAN.items():
        if eng not in reverse:
            reverse[eng] = kor

    result: dict[str, str] = {}
    for eng_emotion, kor_emotion in reverse.items():
        result[eng_emotion] = f"{voice_tag_base}_{kor_emotion}"
    # Ensure "default" always maps
    if "default" not in result:
        result["default"] = f"{voice_tag_base}_기본"

    return result


def _guess_voice_name_from_refs(config: CharacterConfig) -> str | None:
    """
    Guess the genshin character name from ref audio paths.
    Path pattern: genshin-voice/Korean/VO_{category}/VO_{characterName}/filename.wav
    e.g. "genshin-voice/Korean/VO_COOP/VO_lynette/..." → "lynette"

    Uses the last VO_{name} directory before the filename.
    """
    import re
    for ref in (config.default_refs or []):
        # Find all VO_{name} segments; the last one is the character name
        # Preserve original case to match voice library tags (e.g. yaeMiko, not yaemiko)
        matches = re.findall(r"/VO_([a-zA-Z]+)(?=/)", ref.replace("\\", "/"))
        if matches:
            return matches[-1]
    return None


def generate_character_tts_wav(
    *,
    character_config_path: str | os.PathLike[str],
    text: str,
    out_wav_path: str | os.PathLike[str],
    character_local_ref_base: str | os.PathLike[str] | None = None,
    character_container_ref_base: str | None = None,
    api_base: str = QWEN3_DEFAULT_API_BASE,
    text_lang: str = QWEN3_DEFAULT_LANGUAGE,
    qwen3_mode: str = "tag",
    use_xvec: bool = QWEN3_DEFAULT_USE_XVEC,
    max_tokens: int = QWEN3_DEFAULT_MAX_TOKENS,
    do_sample: bool = QWEN3_DEFAULT_DO_SAMPLE,
    temperature: float = QWEN3_DEFAULT_TEMPERATURE,
    top_p: float = QWEN3_DEFAULT_TOP_P,
    top_k: int = QWEN3_DEFAULT_TOP_K,
    timeout_s: int = 120,
    request_retries: int = 2,
    request_retry_backoff_s: float = 1.0,
    seed: Optional[int] = None,
    max_ref_attempts: int = 8,
    keep_parts_dir: str | os.PathLike[str] | None = None,
    voice_lock: dict[str, dict[str, Any]] | None = None,
    # Ignored params kept for interface compatibility with gpt_sovits_tts
    prompt_lang: Optional[str] = None,
    media_type: str = "wav",
    streaming_mode: bool = False,
    max_url_chars: int = 0,
    http_method: str = "auto",
) -> Path:
    """
    Generate TTS for a character using Qwen3-TTS.

    Modes:
      - "tag": Use voice library tag → generate_single_segment (default)
              Auto-maps emotions to tags like {voiceTag}_{감정한국어}
      - "clone": Upload local ref audio → generate_clone endpoint
      - "clone_from_file": Use server-stored ref → generate_clone_from_file

    Character config JSON may optionally include a "qwen3" section:
    {
      "qwen3": {
        "mode": "tag",
        "voiceTag": "lynette",
        "language": "korean",
        "emotionVoiceTags": { "happy": "lynette_기쁨" }
      }
    }
    If "voiceTag" is not set, auto-guesses from ref audio paths (e.g. VO_lynette → "lynette").
    """
    cfg_path = Path(character_config_path)
    config = load_character_config(cfg_path)
    qwen3_cfg = _get_qwen3_config(cfg_path)

    # Override config from qwen3 section if present
    mode = qwen3_cfg.get("mode", qwen3_mode)
    language = qwen3_cfg.get("language", text_lang)
    use_xvec = qwen3_cfg.get("useXvec", use_xvec)
    max_tokens = int(qwen3_cfg.get("maxTokens", max_tokens))
    temperature = float(qwen3_cfg.get("temperature", temperature))
    top_p = float(qwen3_cfg.get("topP", top_p))
    top_k = int(qwen3_cfg.get("topK", top_k))

    # Voice tag resolution: explicit > auto-guess from refs > characterId
    voice_tag = qwen3_cfg.get("voiceTag", "")
    if not voice_tag:
        voice_tag = _guess_voice_name_from_refs(config) or config.character_id
    # Build emotion → voice tag map (explicit overrides take priority)
    auto_emotion_tags = _build_emotion_voice_tag_map(voice_tag, config.tag_aliases)
    emotion_voice_tags: dict[str, str] = {**auto_emotion_tags, **(qwen3_cfg.get("emotionVoiceTags") or {})}

    if character_local_ref_base:
        config = CharacterConfig(
            character_id=config.character_id,
            local_ref_base=Path(character_local_ref_base).expanduser(),
            container_ref_base=config.container_ref_base,
            default_refs=config.default_refs,
            emotion_refs=config.emotion_refs,
            tag_aliases=config.tag_aliases,
        )
    if character_container_ref_base:
        config = CharacterConfig(
            character_id=config.character_id,
            local_ref_base=config.local_ref_base,
            container_ref_base=str(character_container_ref_base),
            default_refs=config.default_refs,
            emotion_refs=config.emotion_refs,
            tag_aliases=config.tag_aliases,
        )

    rng = random.Random(seed)
    segments = split_text_by_emotion_tags(text)
    if not segments:
        raise ValueError("Empty text after parsing emotion tags")

    # Auto-create voice_lock if not provided (ensures consistent voice within this clip)
    if voice_lock is None and mode == "tag":
        try:
            all_voices = query_voice_library(api_base, timeout_s=30)
            needed_tags = sorted(set(emotion_voice_tags.values()))
            voice_lock = resolve_voice_lock(all_voices, needed_tags, seed=seed or 42)
        except Exception as e:
            print(f"[warn] Auto voice-lock failed: {e}. Falling back to random selection.")

    min_ref_s = float(os.environ.get("GPT_SOVITS_REF_MIN_S", "3"))
    max_ref_s = float(os.environ.get("GPT_SOVITS_REF_MAX_S", "10"))
    max_ref_attempts = int(os.environ.get("GPT_SOVITS_MAX_REF_ATTEMPTS", str(int(max_ref_attempts or 8))))

    out_path = Path(out_wav_path)

    if keep_parts_dir is None:
        tmp_ctx = tempfile.TemporaryDirectory(prefix=f"tts_qwen3_{config.character_id}_")
        parts_dir = Path(tmp_ctx.name)
    else:
        tmp_ctx = None
        parts_dir = Path(keep_parts_dir)
        parts_dir.mkdir(parents=True, exist_ok=True)

    wav_parts: list[Path] = []
    try:
        for i, seg in enumerate(segments, start=1):
            emotion_key = _normalize_tag(seg.emotion) or "default"
            emotion_key = config.tag_aliases.get(emotion_key, emotion_key)
            part_path = parts_dir / f"{out_path.stem}.part{i:03d}.wav"

            if mode == "tag":
                # Tag-based generation: use voice library tags
                # Try emotion-specific tag first, fallback to default tag
                seg_tag = emotion_voice_tags.get(emotion_key)
                default_tag = emotion_voice_tags.get("default", f"{voice_tag}_기본")
                tags_to_try = [seg_tag, default_tag] if seg_tag and seg_tag != default_tag else [default_tag]

                tag_success = False
                for try_tag in tags_to_try:
                    if not try_tag:
                        continue

                    # If voice_lock has a locked voice for this tag,
                    # use generate_clone_from_file for consistent voice.
                    # Split long text into sentences to prevent voice drift.
                    locked_voice = (voice_lock or {}).get(try_tag)
                    if locked_voice:
                        ref_name = locked_voice.get("audio_filename", "")
                        ref_text = locked_voice.get("prompt_text", "")
                        locked_xvec = locked_voice.get("xvec_only", use_xvec)
                        try:
                            sentences = _split_sentences(seg.text)
                            if len(sentences) <= 1:
                                # Short text: single call
                                qwen3_tts_to_wav_from_file(
                                    text=seg.text, ref_voice_name=ref_name, ref_text=ref_text,
                                    out_wav_path=part_path, api_base=api_base, language=language,
                                    use_xvec=bool(locked_xvec), max_tokens=max_tokens,
                                    do_sample=do_sample, temperature=temperature,
                                    top_p=top_p, top_k=top_k, timeout_s=timeout_s,
                                    request_retries=request_retries,
                                    request_retry_backoff_s=request_retry_backoff_s,
                                )
                            else:
                                # Long text: generate per-sentence, concat with pauses
                                sent_parts: list[Path] = []
                                for si, sent in enumerate(sentences):
                                    sp = parts_dir / f"{out_path.stem}.part{i:03d}.s{si:03d}.wav"
                                    qwen3_tts_to_wav_from_file(
                                        text=sent, ref_voice_name=ref_name, ref_text=ref_text,
                                        out_wav_path=sp, api_base=api_base, language=language,
                                        use_xvec=bool(locked_xvec), max_tokens=max_tokens,
                                        do_sample=do_sample, temperature=temperature,
                                        top_p=top_p, top_k=top_k, timeout_s=timeout_s,
                                        request_retries=request_retries,
                                        request_retry_backoff_s=request_retry_backoff_s,
                                    )
                                    sent_parts.append(sp)
                                concat_wavs_with_pause(sent_parts, sentences, part_path)
                            tag_success = True
                            break
                        except RuntimeError as e:
                            if "찾을 수 없습니다" in str(e) and try_tag != default_tag:
                                print(f"[warn] Locked voice '{ref_name}' for tag '{try_tag}' not found; falling back to '{default_tag}'")
                                continue
                            raise
                    else:
                        # No lock: use generate_single_segment (random selection)
                        try:
                            qwen3_tts_to_wav_by_tag(
                                text=seg.text,
                                voice_tag=try_tag,
                                out_wav_path=part_path,
                                api_base=api_base,
                                language=language,
                                use_voice_defaults=True,
                                max_tokens=max_tokens,
                                do_sample=do_sample,
                                temperature=temperature,
                                top_p=top_p,
                                top_k=top_k,
                                timeout_s=timeout_s,
                                request_retries=request_retries,
                                request_retry_backoff_s=request_retry_backoff_s,
                            )
                            tag_success = True
                            break
                        except RuntimeError as e:
                            if "해당하는 음성을 찾을 수 없습니다" in str(e) and try_tag != default_tag:
                                print(f"[warn] Voice tag '{try_tag}' not found; falling back to '{default_tag}'")
                                continue
                            raise
                if not tag_success:
                    raise RuntimeError(f"No voice tag found for emotion={emotion_key} (tried: {tags_to_try})")
                wav_parts.append(part_path)
                continue

            # Clone mode: select ref audio from character config
            candidates = (config.emotion_refs.get(emotion_key) or []) or config.default_refs
            if not candidates:
                raise ValueError(f"No refs available (emotion={emotion_key})")

            remaining = [c for c in candidates if str(c).strip()]
            last_err: Exception | None = None
            attempts_count = min(int(max_ref_attempts), len(remaining)) if remaining else 1

            generated = False
            for attempt in range(1, attempts_count + 1):
                chosen_ref = rng.choice(remaining) if remaining else _choose_ref_for_emotion(config, emotion_key, rng)

                local_audio = _resolve_local_ref_audio_path(
                    config.local_ref_base, chosen_ref, container_ref_base=config.container_ref_base
                )

                # Duration check
                dur = _wav_duration_seconds(local_audio) if local_audio.exists() else None
                if dur is not None and (dur < min_ref_s or dur > max_ref_s):
                    print(
                        f"[warn] Skipping ref outside {min_ref_s:.0f}-{max_ref_s:.0f}s: {chosen_ref} "
                        f"(duration={dur:.2f}s)"
                    )
                    if chosen_ref in remaining and len(remaining) > 1:
                        remaining.remove(chosen_ref)
                        continue

                if not local_audio.exists():
                    print(f"[warn] Ref audio not found: {local_audio}")
                    if chosen_ref in remaining and len(remaining) > 1:
                        remaining.remove(chosen_ref)
                        continue

                # Read prompt text
                try:
                    prompt_text = _read_prompt_text_for_ref(
                        config.local_ref_base, chosen_ref, container_ref_base=config.container_ref_base
                    )
                except FileNotFoundError:
                    prompt_text = ""
                    print(f"[warn] Missing prompt txt for ref: {chosen_ref}. Continuing without prompt_text.")

                try:
                    if mode == "clone_from_file":
                        # Use server-stored ref: ref_voice_name is the filename
                        ref_name = local_audio.name
                        qwen3_tts_to_wav_from_file(
                            text=seg.text,
                            ref_voice_name=ref_name,
                            ref_text=prompt_text,
                            out_wav_path=part_path,
                            api_base=api_base,
                            language=language,
                            use_xvec=use_xvec,
                            max_tokens=max_tokens,
                            do_sample=do_sample,
                            temperature=temperature,
                            top_p=top_p,
                            top_k=top_k,
                            timeout_s=timeout_s,
                            request_retries=request_retries,
                            request_retry_backoff_s=request_retry_backoff_s,
                        )
                    else:
                        # Default clone mode: upload ref audio
                        qwen3_tts_to_wav(
                            text=seg.text,
                            ref_audio_local_path=local_audio,
                            ref_text=prompt_text,
                            out_wav_path=part_path,
                            api_base=api_base,
                            language=language,
                            use_xvec=use_xvec,
                            max_tokens=max_tokens,
                            do_sample=do_sample,
                            temperature=temperature,
                            top_p=top_p,
                            top_k=top_k,
                            timeout_s=timeout_s,
                            request_retries=request_retries,
                            request_retry_backoff_s=request_retry_backoff_s,
                        )
                    generated = True
                    break
                except RuntimeError as e:
                    last_err = e
                    print(f"[warn] Qwen3-TTS failed for ref {chosen_ref}: {e}")
                    if chosen_ref in remaining and len(remaining) > 1:
                        remaining.remove(chosen_ref)
                        continue
                    raise

            if not generated:
                if last_err is not None:
                    raise last_err
                raise RuntimeError("Failed to generate TTS after ref retries")
            wav_parts.append(part_path)

        concat_wavs(wav_parts, out_path)
        return out_path
    finally:
        if tmp_ctx is not None:
            tmp_ctx.cleanup()


# ============================================================================
# CLI
# ============================================================================

def _main() -> int:
    parser = argparse.ArgumentParser(description="Generate a TTS .wav via Qwen3-TTS Gradio API.")
    parser.add_argument(
        "--api-base",
        default=os.environ.get("QWEN3_TTS_API_BASE", QWEN3_DEFAULT_API_BASE),
        help=f"Qwen3-TTS Gradio server URL (default: {QWEN3_DEFAULT_API_BASE})",
    )
    parser.add_argument(
        "--mode",
        default=os.environ.get("QWEN3_TTS_MODE", "clone"),
        choices=["clone", "clone_from_file", "tag"],
        help="Generation mode: clone (upload ref), clone_from_file (server ref), tag (voice library).",
    )
    parser.add_argument("--text", default="", help="Text to synthesize.")
    parser.add_argument("--text-file", default="", help="Read text from a UTF-8 file (overrides --text).")
    parser.add_argument("--language", default=os.environ.get("QWEN3_TTS_LANGUAGE", QWEN3_DEFAULT_LANGUAGE))
    parser.add_argument("--character", default="", help="Character config json path. Enables emotion-tag splitting.")
    parser.add_argument("--voice-tag", default="", help="Voice library tag (for --mode tag).")
    parser.add_argument("--ref-audio", default="", help="Local path to reference audio (for --mode clone).")
    parser.add_argument("--ref-voice-name", default="", help="Server ref filename (for --mode clone_from_file).")
    parser.add_argument("--ref-text", default="", help="Transcript of the reference audio.")
    parser.add_argument("--use-xvec", action="store_true", help="Use x-vector only mode.")
    parser.add_argument("--max-tokens", type=int, default=QWEN3_DEFAULT_MAX_TOKENS)
    parser.add_argument("--temperature", type=float, default=QWEN3_DEFAULT_TEMPERATURE)
    parser.add_argument("--top-p", type=float, default=QWEN3_DEFAULT_TOP_P)
    parser.add_argument("--top-k", type=int, default=QWEN3_DEFAULT_TOP_K)
    parser.add_argument("--timeout-s", type=int, default=120)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--out", default="", help="Output .wav path.")
    parser.add_argument("--keep-parts-dir", default="", help="Keep generated wav parts in this directory.")
    parser.add_argument(
        "--character-local-ref-base",
        default=os.environ.get("QWEN3_TTS_CHARACTER_LOCAL_REF_BASE", ""),
    )
    parser.add_argument(
        "--character-container-ref-base",
        default=os.environ.get("QWEN3_TTS_CHARACTER_CONTAINER_REF_BASE", ""),
    )
    args = parser.parse_args()

    text = args.text
    text_file_path: Path | None = None
    if args.text_file:
        text_file_path = Path(args.text_file)
        text = text_file_path.read_text(encoding="utf-8")
    if not text.strip():
        raise SystemExit("Empty text. Provide --text or --text-file.")

    if not args.out:
        out_dir = Path("out") / "tts"
        out_dir.mkdir(parents=True, exist_ok=True)
        suffix = text_file_path.stem if text_file_path else "text"
        prefix = ""
        if args.character:
            try:
                prefix = load_character_config(args.character).character_id
            except Exception:
                prefix = Path(args.character).stem or "character"
        filename = f"{prefix}_{suffix}.wav" if prefix else f"{suffix}.wav"
        args.out = str(out_dir / filename)
        print(f"[info] --out not provided; defaulting to: {args.out}")

    if args.character:
        out_path = generate_character_tts_wav(
            character_config_path=args.character,
            text=text,
            out_wav_path=args.out,
            character_local_ref_base=(args.character_local_ref_base or None),
            character_container_ref_base=(args.character_container_ref_base or None),
            api_base=args.api_base,
            text_lang=args.language,
            qwen3_mode=args.mode,
            use_xvec=args.use_xvec,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            top_p=args.top_p,
            top_k=args.top_k,
            timeout_s=args.timeout_s,
            seed=args.seed,
            keep_parts_dir=(args.keep_parts_dir or None),
        )
    elif args.mode == "tag":
        if not args.voice_tag:
            raise SystemExit("--voice-tag is required for --mode tag (without --character).")
        out_path = qwen3_tts_to_wav_by_tag(
            text=text,
            voice_tag=args.voice_tag,
            out_wav_path=args.out,
            api_base=args.api_base,
            language=args.language,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            top_p=args.top_p,
            top_k=args.top_k,
            timeout_s=args.timeout_s,
        )
    elif args.mode == "clone_from_file":
        if not args.ref_voice_name:
            raise SystemExit("--ref-voice-name is required for --mode clone_from_file.")
        out_path = qwen3_tts_to_wav_from_file(
            text=text,
            ref_voice_name=args.ref_voice_name,
            ref_text=args.ref_text,
            out_wav_path=args.out,
            api_base=args.api_base,
            language=args.language,
            use_xvec=args.use_xvec,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            top_p=args.top_p,
            top_k=args.top_k,
            timeout_s=args.timeout_s,
        )
    else:
        if not args.ref_audio:
            raise SystemExit("--ref-audio is required for --mode clone.")
        ref_path = Path(args.ref_audio)
        if not ref_path.exists():
            raise SystemExit(f"Reference audio not found: {ref_path}")
        out_path = qwen3_tts_to_wav(
            text=text,
            ref_audio_local_path=ref_path,
            ref_text=args.ref_text,
            out_wav_path=args.out,
            api_base=args.api_base,
            language=args.language,
            use_xvec=args.use_xvec,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            top_p=args.top_p,
            top_k=args.top_k,
            timeout_s=args.timeout_s,
        )

    print(f"[done] wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
