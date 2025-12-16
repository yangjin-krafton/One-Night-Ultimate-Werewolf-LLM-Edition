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
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen


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


def _normalize_ref_path(ref_audio_path: str, container_ref_base: str) -> str:
    if not ref_audio_path:
        return ""
    ref_audio_path = ref_audio_path.replace("\\", "/")
    if ref_audio_path.startswith(("http://", "https://")):
        return ref_audio_path
    if ref_audio_path.startswith("/"):
        return ref_audio_path
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

    default_refs = raw.get("defaultRefs") or raw.get("default_refs") or []
    emotion_refs = raw.get("emotionRefs") or raw.get("emotion_refs") or {}
    tag_aliases = raw.get("tagAliases") or raw.get("tag_aliases") or {}

    if not isinstance(default_refs, list) or any(not isinstance(x, str) for x in default_refs):
        raise ValueError("defaultRefs must be an array of strings")
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


def _read_prompt_text_for_ref(local_ref_base: Path, ref_audio_path: str) -> str:
    ref_audio_path = ref_audio_path.replace("\\", "/")
    local_audio = Path(ref_audio_path)
    if not local_audio.is_absolute():
        local_audio = (local_ref_base / ref_audio_path).resolve()
    prompt_path = local_audio.with_suffix(".txt")
    if not prompt_path.exists():
        raise FileNotFoundError(f"Missing prompt txt for ref: {prompt_path}")
    return prompt_path.read_text(encoding="utf-8").strip()


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
    api_base: str = "http://127.0.0.1:9880",
    text_lang: str = "ko-KR",
    prompt_lang: Optional[str] = None,
    media_type: str = "wav",
    streaming_mode: bool = False,
    timeout_s: int = 120,
    seed: Optional[int] = None,
    keep_parts_dir: str | os.PathLike[str] | None = None,
) -> Path:
    config = load_character_config(character_config_path)
    rng = random.Random(seed)

    segments = split_text_by_emotion_tags(text)
    if not segments:
        raise ValueError("Empty text after parsing emotion tags")

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
            chosen_ref = _choose_ref_for_emotion(config, seg.emotion, rng)
            prompt_text = _read_prompt_text_for_ref(config.local_ref_base, chosen_ref)
            part_path = parts_dir / f"{out_path.stem}.part{i:03d}.{media_type}"
            gpt_sovits_tts_to_wav(
                text=seg.text,
                ref_audio_path=chosen_ref,
                out_wav_path=part_path,
                api_base=api_base,
                container_ref_base=config.container_ref_base,
                text_lang=text_lang,
                prompt_lang=prompt_lang,
                prompt_text=prompt_text,
                media_type=media_type,
                streaming_mode=streaming_mode,
                timeout_s=timeout_s,
            )
            wav_parts.append(part_path)

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
    text_lang: str = "ko-KR",
    prompt_lang: Optional[str] = None,
    prompt_text: str = "",
    media_type: str = "wav",
    streaming_mode: bool = False,
    timeout_s: int = 120,
) -> Path:
    """
    Call GPT-SoVITS `GET /tts` (api_v2.py) and write the returned audio to `out_wav_path`.

    Request params:
      - text, text_lang, prompt_lang, ref_audio_path, media_type, streaming_mode, (optional) prompt_text
    """
    api_base = api_base.rstrip("/") + "/"
    resolved_ref = _normalize_ref_path(ref_audio_path, container_ref_base)
    if not resolved_ref:
        raise ValueError("ref_audio_path is empty")

    params = {
        "text": text or "",
        "text_lang": text_lang,
        "prompt_lang": prompt_lang or text_lang,
        "ref_audio_path": resolved_ref,
        "media_type": media_type,
        "streaming_mode": "true" if streaming_mode else "false",
    }
    if prompt_text.strip():
        params["prompt_text"] = prompt_text.strip()

    tts_url = urljoin(api_base, "tts") + "?" + urlencode(params, safe="/:")
    req = Request(tts_url, method="GET")

    out_path = Path(out_wav_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(req, timeout=timeout_s) as resp:
        if getattr(resp, "status", 200) >= 400:
            raise RuntimeError(f"HTTP {resp.status}")
        audio_bytes = resp.read()
    out_path.write_bytes(audio_bytes)
    return out_path


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
    parser.add_argument("--text", default="")
    parser.add_argument("--text-file", default="", help="Read text from a UTF-8 file (overrides --text).")
    parser.add_argument("--out", required=True, help="Output .wav path.")
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
    if args.text_file:
        text = Path(args.text_file).read_text(encoding="utf-8")
    if not text.strip():
        raise SystemExit("Empty text. Provide --text or --text-file.")

    if args.tts == "windows":
        if args.character:
            generate_windows_tts_wav(
                text=text,
                out_wav_path=args.out,
                voice=args.windows_voice,
                rate=args.windows_rate,
                volume=args.windows_volume,
                sample_rate_hz=args.windows_sample_rate,
                keep_parts_dir=(args.keep_parts_dir or None),
            )
        else:
            windows_tts_to_wav(
                text=text,
                out_wav_path=args.out,
                voice=args.windows_voice,
                rate=args.windows_rate,
                volume=args.windows_volume,
                sample_rate_hz=args.windows_sample_rate,
            )
    else:
        if args.character:
            generate_character_tts_wav(
                character_config_path=args.character,
                text=text,
                out_wav_path=args.out,
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
            gpt_sovits_tts_to_wav(
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
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
