#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import random
import re
import subprocess
import tempfile
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import quote
import http.client


@dataclass(frozen=True)
class CharacterConfig:
    character_id: str
    local_ref_base: Path
    container_ref_base: str
    default_refs: list[str]
    emotion_refs: dict[str, list[str]]
    tag_aliases: dict[str, str]


@dataclass(frozen=True)
class TextSegment:
    emotion: str
    text: str


_REF_DURATION_ERROR_RE = re.compile(r"outside the\\s+(\\d+)-(\\d+)\\s+second range", re.IGNORECASE)
_REF_NOT_EXISTS_RE = re.compile(r"\\bnot\\s+exist(s)?\\b", re.IGNORECASE)
_FAST_LANGDETECT_ERROR_RE = re.compile(r"fast-langdetect|Cache directory not found", re.IGNORECASE)


def _map_container_to_local_path(
    ref_audio_path: str, *, container_ref_base: str, local_ref_base: Path | None
) -> str:
    """
    If refs are stored as container paths (e.g. /workspace/...),
    but the GPT-SoVITS server runs on the host, rewrite to a host path.
    """
    if not ref_audio_path or local_ref_base is None:
        return ref_audio_path

    ref_norm = ref_audio_path.replace("\\", "/")
    base_norm = (container_ref_base or "").replace("\\", "/").rstrip("/")
    if not base_norm:
        return ref_audio_path

    if not ref_norm.startswith("/"):
        return ref_audio_path
    if not ref_norm.lower().startswith(base_norm.lower() + "/") and ref_norm.lower() != base_norm.lower():
        return ref_audio_path

    suffix = ref_norm[len(base_norm) :].lstrip("/")
    return str((local_ref_base / suffix).resolve())


def _normalize_ref_path(
    ref_audio_path: str, *, container_ref_base: str, local_ref_base: Path | None = None
) -> str:
    if not ref_audio_path:
        return ""
    ref_audio_path = ref_audio_path.replace("\\", "/")
    if ref_audio_path.startswith(("http://", "https://")):
        return ref_audio_path

    ref_audio_path = _map_container_to_local_path(
        ref_audio_path, container_ref_base=container_ref_base, local_ref_base=local_ref_base
    ).replace("\\", "/")

    # Absolute paths:
    # - POSIX: /...
    # - UNC: //server/share/...
    # - Windows drive: D:/...
    if ref_audio_path.startswith("/") or re.match(r"^[A-Za-z]:/", ref_audio_path):
        return ref_audio_path

    # If base ends with ".../refs" and the ref also starts with "refs/",
    # avoid generating ".../refs/refs/...".
    if (container_ref_base or "").replace("\\", "/").rstrip("/").lower().endswith("/refs") and ref_audio_path.lower().startswith("refs/"):
        ref_audio_path = ref_audio_path[5:]
    if (container_ref_base or "").replace("\\", "/").rstrip("/").lower().endswith("/ref") and ref_audio_path.lower().startswith("ref/"):
        ref_audio_path = ref_audio_path[4:]

    base = (container_ref_base or "").replace("\\", "/").rstrip("/")
    return f"{base}/{ref_audio_path.lstrip('/')}" if base else ref_audio_path


_TAG_RE = re.compile(r"(\[[^\]]+\]|\{[^}]+\})")


def _normalize_tag(tag: str) -> str:
    tag = (tag or "").strip()
    if tag.startswith("[") and tag.endswith("]"):
        tag = tag[1:-1].strip()
    if tag.startswith("{") and tag.endswith("}"):
        tag = tag[1:-1].strip()
    return tag.strip().lower()


def split_text_by_emotion_tags(text: str) -> list[TextSegment]:
    """
    Split text into segments using tags like:
      - [happy]너무 좋아요!
      - {화남}뭐라고!?
    Tag applies to subsequent text until next tag. Untagged text => emotion "default".
    """
    if not text:
        return []

    parts = _TAG_RE.split(text)
    current_emotion = "default"
    segments: list[TextSegment] = []

    for part in parts:
        if not part:
            continue
        if part.startswith("[") and part.endswith("]") or part.startswith("{") and part.endswith("}"):
            current_emotion = _normalize_tag(part) or "default"
            continue
        cleaned = part.strip()
        if cleaned:
            segments.append(TextSegment(emotion=current_emotion, text=cleaned))

    return segments


def load_character_config(path: str | os.PathLike[str]) -> CharacterConfig:
    cfg_path = Path(path)
    raw = json.loads(cfg_path.read_text(encoding="utf-8"))

    def _coerce_refs_field(value: object, field_name: str) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        if isinstance(value, list):
            if any(not isinstance(x, str) for x in value):
                raise ValueError(f"{field_name} must be a string or an array of strings")
            return value
        raise ValueError(f"{field_name} must be a string or an array of strings")

    character_id = (raw.get("characterId") or raw.get("character_id") or cfg_path.parent.name).strip()
    if not character_id:
        raise ValueError("characterId is required")

    local_ref_base_raw = raw.get("localRefBase") or raw.get("local_ref_base") or str(cfg_path.parent)
    local_ref_base = Path(local_ref_base_raw).expanduser()
    if not local_ref_base.is_absolute():
        local_ref_base = (cfg_path.parent / local_ref_base).resolve()

    container_ref_base = (raw.get("containerRefBase") or raw.get("container_ref_base") or "").strip()
    if not container_ref_base:
        container_ref_base = f"/workspace/Ref/{character_id}"

    default_refs_raw: object | None
    if "defaultRefs" in raw:
        default_refs_raw = raw.get("defaultRefs")
    elif "default_refs" in raw:
        default_refs_raw = raw.get("default_refs")
    else:
        default_refs_raw = None

    default_refs = _coerce_refs_field(default_refs_raw, "defaultRefs")
    emotion_refs = raw.get("emotionRefs") or raw.get("emotion_refs") or {}
    tag_aliases = raw.get("tagAliases") or raw.get("tag_aliases") or {}

    if not isinstance(emotion_refs, dict) or any(not isinstance(v, list) for v in emotion_refs.values()):
        raise ValueError("emotionRefs must be an object of arrays")
    if not isinstance(tag_aliases, dict):
        raise ValueError("tagAliases must be an object")

    normalized_emotion_refs: dict[str, list[str]] = {}
    for key, value in emotion_refs.items():
        emotion_key = _normalize_tag(str(key))
        normalized_emotion_refs[emotion_key] = [str(x) for x in value if str(x).strip()]

    normalized_tag_aliases: dict[str, str] = {}
    for key, value in tag_aliases.items():
        src = _normalize_tag(str(key))
        dst = _normalize_tag(str(value))
        if src and dst:
            normalized_tag_aliases[src] = dst

    default_refs_clean = [str(x) for x in default_refs if str(x).strip()]
    if not default_refs_clean and not any(normalized_emotion_refs.values()):
        raise ValueError("Provide at least one ref in defaultRefs or emotionRefs")

    return CharacterConfig(
        character_id=character_id,
        local_ref_base=local_ref_base,
        container_ref_base=container_ref_base,
        default_refs=default_refs_clean,
        emotion_refs=normalized_emotion_refs,
        tag_aliases=normalized_tag_aliases,
    )


def _choose_ref_for_emotion(config: CharacterConfig, emotion: str, rng: random.Random) -> str:
    emotion = _normalize_tag(emotion) or "default"
    emotion = config.tag_aliases.get(emotion, emotion)
    candidates = config.emotion_refs.get(emotion) or []
    if not candidates:
        candidates = config.default_refs
    if not candidates:
        raise ValueError(f"No refs available (emotion={emotion})")
    return rng.choice(candidates)


def _resolve_local_ref_audio_path(
    local_ref_base: Path, ref_audio_path: str, *, container_ref_base: str = ""
) -> Path:
    ref_audio_path = (ref_audio_path or "").replace("\\", "/")
    base_norm = str(local_ref_base).replace("\\", "/").rstrip("/").lower()
    if base_norm.endswith("/refs") and ref_audio_path.lower().startswith("refs/"):
        ref_audio_path = ref_audio_path[5:]
    if base_norm.endswith("/ref") and ref_audio_path.lower().startswith("ref/"):
        ref_audio_path = ref_audio_path[4:]

    ref_audio_path = _map_container_to_local_path(
        ref_audio_path, container_ref_base=container_ref_base, local_ref_base=local_ref_base
    )

    local_audio = Path(ref_audio_path)
    if local_audio.is_absolute():
        return local_audio

    local_audio = (local_ref_base / ref_audio_path).resolve()
    if local_audio.exists():
        return local_audio

    # If the ref omits the leading "refs/" prefix, also try resolving under
    # "<base>/refs/<path>" (and "<base>/ref/<path>").
    if ref_audio_path and not ref_audio_path.lower().startswith(("refs/", "ref/")):
        for prefix in ("refs", "ref"):
            candidate = (local_ref_base / prefix / ref_audio_path).resolve()
            if candidate.exists():
                return candidate

    return local_audio


def _read_prompt_text_for_ref(
    local_ref_base: Path, ref_audio_path: str, *, container_ref_base: str = ""
) -> str:
    local_audio = _resolve_local_ref_audio_path(
        local_ref_base, ref_audio_path, container_ref_base=container_ref_base
    )
    prompt_path = local_audio.with_suffix(".txt")
    if not prompt_path.exists():
        raise FileNotFoundError(f"Missing prompt txt for ref: {prompt_path}")
    return prompt_path.read_text(encoding="utf-8").strip()


def _wav_duration_seconds(path: Path) -> float | None:
    if path.suffix.lower() != ".wav":
        return None
    try:
        with wave.open(str(path), "rb") as w:
            fr = w.getframerate() or 0
            if fr <= 0:
                return None
            return float(w.getnframes()) / float(fr)
    except Exception:
        return None


def concat_wavs(wav_paths: list[Path], out_wav_path: Path) -> Path:
    if not wav_paths:
        raise ValueError("No wav parts to concat")
    if len(wav_paths) == 1:
        out_wav_path.parent.mkdir(parents=True, exist_ok=True)
        out_wav_path.write_bytes(wav_paths[0].read_bytes())
        return out_wav_path

    out_wav_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(wav_paths[0]), "rb") as w0:
        channels = w0.getnchannels()
        sampwidth = w0.getsampwidth()
        framerate = w0.getframerate()
        comptype = w0.getcomptype()
        compname = w0.getcompname()
        frames = [w0.readframes(w0.getnframes())]

    for p in wav_paths[1:]:
        with wave.open(str(p), "rb") as w:
            if (
                w.getnchannels() != channels
                or w.getsampwidth() != sampwidth
                or w.getframerate() != framerate
                or w.getcomptype() != comptype
            ):
                raise ValueError(f"WAV params mismatch, cannot concat: {wav_paths[0].name} vs {p.name}")
            frames.append(w.readframes(w.getnframes()))

    with wave.open(str(out_wav_path), "wb") as out:
        out.setnchannels(channels)
        out.setsampwidth(sampwidth)
        out.setframerate(framerate)
        if comptype != "NONE":
            out.setcomptype(comptype, compname)
        for chunk in frames:
            out.writeframes(chunk)
    return out_wav_path


def generate_character_tts_wav(
    *,
    character_config_path: str | os.PathLike[str],
    text: str,
    out_wav_path: str | os.PathLike[str],
    character_local_ref_base: str | os.PathLike[str] | None = None,
    character_container_ref_base: str | None = None,
    default_prompt_text: str = "",
    api_base: str = "http://127.0.0.1:9880",
    text_lang: str = "ko-KR",
    prompt_lang: Optional[str] = None,
    media_type: str = "wav",
    streaming_mode: bool = False,
    timeout_s: int = 120,
    request_retries: int = 2,
    request_retry_backoff_s: float = 1.0,
    max_url_chars: int = 1800,
    http_method: str = "auto",
    seed: Optional[int] = None,
    max_ref_attempts: int = 8,
    keep_parts_dir: str | os.PathLike[str] | None = None,
) -> Path:
    config = load_character_config(character_config_path)

    if character_local_ref_base:
        base = Path(character_local_ref_base).expanduser()
        config = CharacterConfig(
            character_id=config.character_id,
            local_ref_base=base,
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

    min_ref_s = float(os.environ.get("GPT_SOVITS_REF_MIN_S", "3"))
    max_ref_s = float(os.environ.get("GPT_SOVITS_REF_MAX_S", "10"))
    max_ref_attempts = int(os.environ.get("GPT_SOVITS_MAX_REF_ATTEMPTS", str(int(max_ref_attempts or 8))))

    out_path = Path(out_wav_path)

    if keep_parts_dir is None:
        tmp_ctx = tempfile.TemporaryDirectory(prefix=f"tts_{config.character_id}_")
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
            candidates = (config.emotion_refs.get(emotion_key) or []) or config.default_refs
            if not candidates:
                raise ValueError(f"No refs available (emotion={emotion_key})")

            remaining = [c for c in candidates if str(c).strip()]
            last_err: Exception | None = None

            attempts = min(int(max_ref_attempts), len(remaining)) if remaining else 0
            if attempts <= 0:
                attempts = 1

            generated_part: Path | None = None
            for attempt in range(1, attempts + 1):
                chosen_ref = rng.choice(remaining) if remaining else _choose_ref_for_emotion(config, emotion_key, rng)

                local_audio = _resolve_local_ref_audio_path(
                    config.local_ref_base, chosen_ref, container_ref_base=config.container_ref_base
                )
                dur = _wav_duration_seconds(local_audio) if local_audio.exists() else None
                if dur is not None and (dur < min_ref_s or dur > max_ref_s):
                    print(
                        f"[warn] Skipping ref outside {min_ref_s:.0f}-{max_ref_s:.0f}s: {chosen_ref} "
                        f"(duration={dur:.2f}s, local={local_audio})"
                    )
                    if chosen_ref in remaining and len(remaining) > 1:
                        remaining.remove(chosen_ref)
                        continue

                try:
                    try:
                        prompt_text = _read_prompt_text_for_ref(
                            config.local_ref_base, chosen_ref, container_ref_base=config.container_ref_base
                        )
                    except FileNotFoundError:
                        prompt_text = (default_prompt_text or "").strip()
                        if prompt_text:
                            print(
                                f"[warn] Missing prompt txt for ref: {chosen_ref} "
                                f"(base={config.local_ref_base}). Falling back to --prompt-text."
                            )
                        else:
                            print(
                                f"[warn] Missing prompt txt for ref: {chosen_ref} "
                                f"(base={config.local_ref_base}). Continuing without prompt_text."
                            )

                    part_path = parts_dir / f"{out_path.stem}.part{i:03d}.{media_type}"
                    try:
                        gpt_sovits_tts_to_wav(
                            text=seg.text,
                            ref_audio_path=chosen_ref,
                            out_wav_path=part_path,
                            api_base=api_base,
                            container_ref_base=config.container_ref_base,
                            local_ref_base=config.local_ref_base,
                            text_lang=text_lang,
                            prompt_lang=prompt_lang,
                            prompt_text=prompt_text,
                            media_type=media_type,
                            streaming_mode=streaming_mode,
                            timeout_s=timeout_s,
                            request_retries=int(request_retries),
                            request_retry_backoff_s=float(request_retry_backoff_s),
                            max_url_chars=int(max_url_chars),
                            http_method=str(http_method),
                        )
                    except RuntimeError as e:
                        # Some GPT-SoVITS setups fail when fast-langdetect models/cache aren't present.
                        # If that happens and we sent prompt_text, retry once without it so batch jobs continue.
                        # Keep prompt_lang (or let it default to text_lang) because some servers require it.
                        if prompt_text.strip() and _FAST_LANGDETECT_ERROR_RE.search(str(e)):
                            print("[warn] SoVITS fast-langdetect error; retrying without prompt_text.")
                            gpt_sovits_tts_to_wav(
                                text=seg.text,
                                ref_audio_path=chosen_ref,
                                out_wav_path=part_path,
                                api_base=api_base,
                                container_ref_base=config.container_ref_base,
                                local_ref_base=config.local_ref_base,
                                text_lang=text_lang,
                                prompt_lang=prompt_lang,
                                prompt_text="",
                                media_type=media_type,
                                streaming_mode=streaming_mode,
                                timeout_s=timeout_s,
                                request_retries=int(request_retries),
                                request_retry_backoff_s=float(request_retry_backoff_s),
                                max_url_chars=int(max_url_chars),
                                http_method=str(http_method),
                            )
                        else:
                            raise
                    generated_part = part_path
                    break
                except RuntimeError as e:
                    last_err = e
                    msg = str(e)
                    if _REF_DURATION_ERROR_RE.search(msg) or "Reference audio is outside" in msg:
                        print(f"[warn] Ref rejected by SoVITS (duration). retry {attempt}/{attempts}: {chosen_ref}")
                        if chosen_ref in remaining and len(remaining) > 1:
                            remaining.remove(chosen_ref)
                            continue
                    if _REF_NOT_EXISTS_RE.search(msg):
                        print(f"[warn] Ref rejected by SoVITS (missing file). retry {attempt}/{attempts}: {chosen_ref}")
                        if chosen_ref in remaining and len(remaining) > 1:
                            remaining.remove(chosen_ref)
                            continue
                    raise
            else:
                if last_err is not None:
                    raise last_err
                raise RuntimeError("Failed to generate TTS after ref retries")
            if generated_part is None:
                raise RuntimeError("Failed to generate TTS part (no output path)")
            wav_parts.append(generated_part)

        if media_type != "wav":
            raise ValueError("Only media_type=wav is supported for concatenation")
        concat_wavs(wav_parts, out_path)
        return out_path
    finally:
        if tmp_ctx is not None:
            tmp_ctx.cleanup()


def gpt_sovits_tts_to_wav(
    *,
    text: str,
    ref_audio_path: str,
    out_wav_path: str | os.PathLike[str],
    api_base: str = "http://127.0.0.1:9880",
    container_ref_base: str = "/workspace/Ref",
    local_ref_base: Path | None = None,
    text_lang: str = "ko-KR",
    prompt_lang: Optional[str] = None,
    prompt_text: str = "",
    media_type: str = "wav",
    streaming_mode: bool = False,
    timeout_s: int = 120,
    request_retries: int = 2,
    request_retry_backoff_s: float = 1.0,
    max_url_chars: int = 1800,
    http_method: str = "auto",
) -> Path:
    """
    Call GPT-SoVITS `GET /tts` (api_v2.py) and write the returned audio to `out_wav_path`.

    Request params:
      - text, text_lang, prompt_lang, ref_audio_path, media_type, streaming_mode, (optional) prompt_text
    """
    api_base = api_base.rstrip("/") + "/"
    resolved_ref = _normalize_ref_path(
        ref_audio_path, container_ref_base=container_ref_base, local_ref_base=local_ref_base
    )
    if not resolved_ref:
        raise ValueError("ref_audio_path is empty")
    if resolved_ref.replace("\\", "/") != (ref_audio_path or "").replace("\\", "/"):
        print(f"[info] mapped ref_audio_path: {ref_audio_path} -> {resolved_ref}")

    def _normalize_sovits_lang(lang: str) -> str:
        lang = (lang or "").strip()
        if not lang:
            return lang
        if lang.lower() == "auto":
            return "auto"
        # Common Windows/BCP47 style codes (e.g., ko-KR) often need to be "ko" for GPT-SoVITS.
        if "-" in lang:
            return lang.split("-", 1)[0].strip().lower()
        return lang

    params = {
        "text": text or "",
        "text_lang": _normalize_sovits_lang(text_lang),
        "ref_audio_path": resolved_ref,
        "media_type": media_type,
        "streaming_mode": "true" if streaming_mode else "false",
    }
    # Only add prompt_lang if it's not explicitly disabled (empty string)
    if prompt_lang != "":
        params["prompt_lang"] = _normalize_sovits_lang(prompt_lang or text_lang)
    if prompt_text.strip():
        params["prompt_text"] = prompt_text.strip()

    def _build_get_url(p: dict[str, str]) -> str:
        # Use %20 for spaces (not '+') to match stricter servers.
        return urljoin(api_base, "tts") + "?" + urlencode(p, safe="/:", quote_via=quote)

    def _make_request(*, method: str, url: str, p: dict[str, str]) -> Request:
        method = (method or "GET").upper()
        if method == "GET":
            return Request(url, method="GET")
        if method == "POST":
            # api_v2.py expects JSON for POST /tts (FastAPI pydantic model).
            body = json.dumps(p, ensure_ascii=False).encode("utf-8")
            return Request(
                urljoin(api_base, "tts"),
                data=body,
                method="POST",
                headers={"Content-Type": "application/json; charset=utf-8"},
            )
        raise ValueError(f"Unsupported http_method: {method}")

    tts_url = _build_get_url(params)
    if int(max_url_chars) > 0 and len(tts_url) > int(max_url_chars) and "prompt_text" in params:
        # Some HTTP stacks/proxies silently drop overly-long URLs (common symptom: RemoteDisconnected).
        # Prefer dropping prompt_text (quality may drop a bit) over hard-failing an entire batch job.
        print(
            f"[warn] GPT-SoVITS /tts URL too long ({len(tts_url)} chars). "
            "Retrying without prompt_text to avoid server/proxy disconnects."
        )
        params.pop("prompt_text", None)
        tts_url = _build_get_url(params)

    method_pref = (http_method or "auto").strip().lower()
    if method_pref not in ("auto", "get", "post"):
        raise ValueError("http_method must be one of: auto, get, post")

    out_path = Path(out_wav_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    last_err: Exception | None = None
    attempts = max(1, int(request_retries) + 1)
    for attempt in range(1, attempts + 1):
        try:
            if method_pref == "post":
                req = _make_request(method="POST", url=tts_url, p=params)
            else:
                req = _make_request(method="GET", url=tts_url, p=params)

            with urlopen(req, timeout=timeout_s) as resp:
                if getattr(resp, "status", 200) >= 400:
                    raise RuntimeError(f"HTTP {resp.status}")
                audio_bytes = resp.read()
                if not audio_bytes:
                    raise RuntimeError("Empty audio response from GPT-SoVITS /tts")
                out_path.write_bytes(audio_bytes)
                return out_path
        except HTTPError as e:
            body = ""
            try:
                body = (e.read() or b"").decode("utf-8", errors="replace")
            except Exception:
                body = "<failed to read error body>"
            if method_pref == "auto" and e.code in (405, 415) and attempt == 1:
                # Some servers only support GET for /tts; others only accept POST.
                # On early method-related errors, flip once.
                method_pref = "post" if req.get_method() == "GET" else "get"
                last_err = e
                continue
            raise RuntimeError(
                "GPT-SoVITS /tts request failed.\n"
                f"HTTP {e.code} {e.reason}\n"
                f"url={tts_url}\n"
                f"body={body[:2000]}"
            ) from e
        except (URLError, TimeoutError, ConnectionError, http.client.RemoteDisconnected) as e:
            last_err = e
            if method_pref == "auto" and isinstance(e, http.client.RemoteDisconnected) and attempt == 1:
                # If the server closes connections on long/complex GETs, try POST once.
                method_pref = "post"
                continue
            if attempt >= attempts:
                break
            sleep_s = request_retry_backoff_s * (2 ** (attempt - 1))
            print(f"[warn] GPT-SoVITS request error ({type(e).__name__}); retry {attempt}/{attempts} after {sleep_s:.1f}s")
            time.sleep(sleep_s)
        except Exception as e:
            # Non-network error: don't retry, but include the URL for debugging.
            raise RuntimeError(f"GPT-SoVITS /tts request failed. url={tts_url}. error={type(e).__name__}: {e}") from e

    raise RuntimeError(
        "GPT-SoVITS /tts request failed after retries.\n"
        f"url={tts_url}\n"
        f"error={type(last_err).__name__ if last_err else 'Unknown'}: {last_err}\n"
        "hint=Check GPT-SoVITS server logs; RemoteDisconnected often means the server process crashed while handling the request."
    ) from last_err


def windows_tts_to_wav(
    *,
    text: str,
    out_wav_path: str | os.PathLike[str],
    voice: str = "",
    rate: int = 0,
    volume: int = 100,
    sample_rate_hz: int = 16000,
) -> Path:
    if os.name != "nt":
        raise RuntimeError("windows TTS backend is only supported on Windows.")

    out_path = Path(out_wav_path).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Avoid quoting issues by passing UTF-8 base64 text to PowerShell.
    text_b64 = base64.b64encode((text or "").encode("utf-8")).decode("ascii")
    ps_script = r"""
param(
  [Parameter(Mandatory=$true)][string]$TextB64,
  [Parameter(Mandatory=$true)][string]$Out,
  [string]$Voice = "",
  [int]$Rate = 0,
  [int]$Volume = 100,
  [int]$SampleRate = 16000
)
try {
  $ErrorActionPreference = 'Stop'
  Add-Type -AssemblyName System.Speech
  $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextB64))
  $sp = New-Object System.Speech.Synthesis.SpeechSynthesizer
  if ($Voice -and $Voice.Trim().Length -gt 0) { $sp.SelectVoice($Voice) }
  $sp.Rate = $Rate
  $sp.Volume = $Volume
  try {
    $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
      $SampleRate,
      [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
      [System.Speech.AudioFormat.AudioChannel]::Mono
    )
    $sp.SetOutputToWaveFile($Out, $fmt)
    $sp.Speak($text)
  } finally {
    $sp.Dispose()
  }
} catch {
  Write-Error $_
  exit 1
}
"""

    with tempfile.TemporaryDirectory(prefix="win_tts_") as td:
        ps1 = Path(td) / "tts.ps1"
        ps1.write_text(ps_script, encoding="utf-8")
        cmd = [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(ps1),
            "-TextB64",
            text_b64,
            "-Out",
            str(out_path),
            "-Voice",
            voice or "",
            "-Rate",
            str(int(rate)),
            "-Volume",
            str(int(volume)),
            "-SampleRate",
            str(int(sample_rate_hz)),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if proc.returncode != 0:
            raise RuntimeError(
                "Windows TTS failed.\n"
                f"stdout:\n{proc.stdout}\n"
                f"stderr:\n{proc.stderr}\n"
            )

    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError("Windows TTS did not produce a wav file.")

    return out_path


def generate_windows_tts_wav(
    *,
    text: str,
    out_wav_path: str | os.PathLike[str],
    voice: str = "",
    rate: int = 0,
    volume: int = 100,
    sample_rate_hz: int = 16000,
    keep_parts_dir: str | os.PathLike[str] | None = None,
) -> Path:
    segments = split_text_by_emotion_tags(text)
    if not segments:
        raise ValueError("Empty text after parsing emotion tags")

    out_path = Path(out_wav_path)

    if keep_parts_dir is None:
        tmp_ctx = tempfile.TemporaryDirectory(prefix="tts_windows_")
        parts_dir = Path(tmp_ctx.name)
    else:
        tmp_ctx = None
        parts_dir = Path(keep_parts_dir)
        parts_dir.mkdir(parents=True, exist_ok=True)

    wav_parts: list[Path] = []
    try:
        for i, seg in enumerate(segments, start=1):
            part_path = parts_dir / f"{out_path.stem}.part{i:03d}.wav"
            windows_tts_to_wav(
                text=seg.text,
                out_wav_path=part_path,
                voice=voice,
                rate=rate,
                volume=volume,
                sample_rate_hz=sample_rate_hz,
            )
            wav_parts.append(part_path)
        concat_wavs(wav_parts, out_path)
        return out_path
    finally:
        if tmp_ctx is not None:
            tmp_ctx.cleanup()


def _main() -> int:
    parser = argparse.ArgumentParser(description="Generate a TTS .wav via GPT-SoVITS api_v2.py (/tts).")
    parser.add_argument(
        "--tts",
        default=os.environ.get("TTS_BACKEND", "gpt-sovits"),
        choices=["gpt-sovits", "windows"],
        help="TTS backend: gpt-sovits (default) or windows (SAPI).",
    )
    parser.add_argument("--api-base", default=os.environ.get("GPT_SOVITS_API_BASE", "http://127.0.0.1:9880"))
    parser.add_argument("--container-ref-base", default=os.environ.get("GPT_SOVITS_CONTAINER_REF_BASE", "/workspace/Ref"))
    parser.add_argument("--text-lang", default=os.environ.get("GPT_SOVITS_TEXT_LANG", "ko-KR"))
    parser.add_argument("--prompt-lang", default=os.environ.get("GPT_SOVITS_PROMPT_LANG", ""))
    parser.add_argument("--prompt-text", default=os.environ.get("GPT_SOVITS_PROMPT_TEXT", ""))
    parser.add_argument("--ref-audio-path", default="", help="Path as seen by the GPT-SoVITS server/container.")
    parser.add_argument("--character", default="", help="Character config json path. Enables emotion-tag splitting.")
    parser.add_argument(
        "--character-local-ref-base",
        default=os.environ.get("GPT_SOVITS_CHARACTER_LOCAL_REF_BASE", ""),
        help="Override character config localRefBase for reading prompt .txt on the host.",
    )
    parser.add_argument(
        "--character-container-ref-base",
        default=os.environ.get("GPT_SOVITS_CHARACTER_CONTAINER_REF_BASE", ""),
        help="Override character config containerRefBase used to build ref_audio_path for the GPT-SoVITS server.",
    )
    parser.add_argument("--text", default="")
    parser.add_argument("--text-file", default="", help="Read text from a UTF-8 file (overrides --text).")
    parser.add_argument(
        "--out",
        default="",
        help=(
            "Output .wav path. If omitted, writes to ./out/tts/<name>.wav "
            "(derived from --text-file/--character)."
        ),
    )
    parser.add_argument("--timeout-s", type=int, default=120)
    parser.add_argument("--streaming-mode", action="store_true", help="Enable streaming_mode=true (default false).")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for ref selection.")
    parser.add_argument("--keep-parts-dir", default="", help="If set, keep generated wav parts in this directory.")
    parser.add_argument("--windows-voice", default=os.environ.get("WINDOWS_TTS_VOICE", ""), help="SAPI voice name.")
    parser.add_argument("--windows-rate", type=int, default=int(os.environ.get("WINDOWS_TTS_RATE", "0")))
    parser.add_argument("--windows-volume", type=int, default=int(os.environ.get("WINDOWS_TTS_VOLUME", "100")))
    parser.add_argument(
        "--windows-sample-rate",
        "--windows-format",
        dest="windows_sample_rate",
        type=int,
        default=int(os.environ.get("WINDOWS_TTS_SAMPLE_RATE", "16000")),
        help="Output WAV sample rate in Hz (16-bit mono PCM).",
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

        suffix = "text"
        if text_file_path is not None:
            suffix = text_file_path.stem or "text"

        prefix = ""
        if args.character:
            try:
                prefix = load_character_config(args.character).character_id
            except Exception:
                prefix = Path(args.character).stem or "character"

        filename = f"{prefix}_{suffix}.wav" if prefix else f"{suffix}.wav"
        args.out = str(out_dir / filename)
        print(f"[info] --out not provided; defaulting to: {args.out}")

    if text_file_path is not None and text_file_path.suffix.lower() == ".json":
        print(
            "[warn] --text-file looks like JSON. If you meant 'generate per-clip voice.wav' assets, "
            "use: python scripts/generate_scenario_audio.py --scenario <file.json>",
        )

    if args.tts == "windows":
        if args.character:
            out_path = generate_windows_tts_wav(
                text=text,
                out_wav_path=args.out,
                voice=args.windows_voice,
                rate=args.windows_rate,
                volume=args.windows_volume,
                sample_rate_hz=args.windows_sample_rate,
                keep_parts_dir=(args.keep_parts_dir or None),
            )
        else:
            out_path = windows_tts_to_wav(
                text=text,
                out_wav_path=args.out,
                voice=args.windows_voice,
                rate=args.windows_rate,
                volume=args.windows_volume,
                sample_rate_hz=args.windows_sample_rate,
            )
    else:
        if args.character:
            out_path = generate_character_tts_wav(
                character_config_path=args.character,
                text=text,
                out_wav_path=args.out,
                character_local_ref_base=(args.character_local_ref_base or None),
                character_container_ref_base=(args.character_container_ref_base or None),
                default_prompt_text=args.prompt_text,
                api_base=args.api_base,
                text_lang=args.text_lang,
                prompt_lang=(args.prompt_lang or None),
                media_type="wav",
                streaming_mode=bool(args.streaming_mode),
                timeout_s=args.timeout_s,
                seed=args.seed,
                keep_parts_dir=(args.keep_parts_dir or None),
            )
        else:
            if not args.ref_audio_path:
                raise SystemExit("--ref-audio-path is required when --character is not used.")
            out_path = gpt_sovits_tts_to_wav(
                text=text,
                ref_audio_path=args.ref_audio_path,
                out_wav_path=args.out,
                api_base=args.api_base,
                container_ref_base=args.container_ref_base,
                text_lang=args.text_lang,
                prompt_lang=(args.prompt_lang or None),
                prompt_text=args.prompt_text,
                streaming_mode=bool(args.streaming_mode),
                timeout_s=args.timeout_s,
            )

    print(f"[done] wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
