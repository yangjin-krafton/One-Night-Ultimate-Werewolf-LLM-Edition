#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import socket
from pathlib import Path
from urllib.parse import urlencode, urljoin, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import http.client


def _can_connect(host: str, port: int, timeout_s: float) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout_s):
            return True
    except OSError:
        return False


def _try_get(*, api_base: str, params: dict[str, object], timeout_s: int) -> bytes:
    api_base = api_base.rstrip("/") + "/"
    # Match api_v2.py docs: GET /tts?...
    # Use %20 for spaces (not '+') to avoid overly strict parsers/proxies.
    qs = urlencode({k: str(v) for k, v in params.items() if v is not None}, safe="/:", quote_via=quote)
    url = urljoin(api_base, "tts") + "?" + qs
    req = Request(url, method="GET")
    print(f"[GET] {url}")
    with urlopen(req, timeout=timeout_s) as resp:
        print(f"[GET] status={getattr(resp, 'status', 200)} content_type={resp.headers.get('Content-Type')}")
        return resp.read()


def _try_post(*, api_base: str, payload: dict[str, object], timeout_s: int) -> bytes:
    api_base = api_base.rstrip("/") + "/"
    url = urljoin(api_base, "tts")
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(url, data=body, method="POST", headers={"Content-Type": "application/json; charset=utf-8"})
    print(f"[POST] {url} (json {len(body)} bytes)")
    with urlopen(req, timeout=timeout_s) as resp:
        print(f"[POST] status={getattr(resp, 'status', 200)} content_type={resp.headers.get('Content-Type')}")
        return resp.read()


def _probe_health(*, api_base: str, timeout_s: int) -> None:
    api_base = api_base.rstrip("/") + "/"
    for path in ("openapi.json", "docs", "ref_library"):
        try:
            url = urljoin(api_base, path)
            req = Request(url, method="GET")
            with urlopen(req, timeout=timeout_s) as resp:
                print(f"[probe] GET /{path} status={getattr(resp, 'status', 200)}")
                return
        except Exception:
            continue
    print("[probe] failed to fetch /openapi.json, /docs, or /ref_library (server may be unreachable)")


def _qwen3_probe_health(*, api_base: str, timeout_s: int) -> None:
    api_base = api_base.rstrip("/")
    for path in ("config", "gradio_api/call/get_loaded_models", "gradio_api/call/list_voices"):
        try:
            if path.startswith("gradio_api/call/"):
                # POST-based Gradio endpoints
                url = f"{api_base}/{path}"
                body = json.dumps({"data": []}).encode("utf-8")
                req = Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
                with urlopen(req, timeout=timeout_s) as resp:
                    result = json.loads(resp.read())
                    event_id = result.get("event_id", "")
                    print(f"[probe] POST /{path} -> event_id={event_id[:12]}...")
                    if event_id:
                        # Read SSE to get actual result
                        sse_url = f"{url}/{event_id}"
                        with urlopen(sse_url, timeout=timeout_s) as sse_resp:
                            for raw_line in sse_resp:
                                line = raw_line.decode("utf-8", errors="replace").strip()
                                if line.startswith("data:") and "complete" in line[:20]:
                                    pass  # just drain the stream
                        print(f"[probe] /{path} SSE stream OK")
            else:
                url = f"{api_base}/{path}"
                req = Request(url, method="GET")
                with urlopen(req, timeout=timeout_s) as resp:
                    print(f"[probe] GET /{path} status={getattr(resp, 'status', 200)}")
            return
        except Exception as e:
            print(f"[probe] /{path} failed: {type(e).__name__}: {e}")
            continue
    print("[probe] all Qwen3-TTS endpoints unreachable")


def _qwen3_smoke_test(*, api_base: str, text: str, voice_tag: str, language: str,
                       timeout_s: int, out: str) -> int:
    """Run a quick TTS generation test via Qwen3-TTS generate_single_segment."""
    api_base = api_base.rstrip("/")
    call_url = f"{api_base}/gradio_api/call/generate_single_segment"

    # Inputs: tag, text, language, use_voice_defaults, mtok, do_s, temp, tp, tk
    data = [voice_tag, text, language, True, 512, True, 0.9, 0.95, 50]
    body = json.dumps({"data": data}).encode("utf-8")
    req = Request(call_url, data=body, method="POST", headers={"Content-Type": "application/json"})

    print(f"[POST] {call_url}")
    with urlopen(req, timeout=timeout_s) as resp:
        result = json.loads(resp.read())
    event_id = result.get("event_id", "")
    if not event_id:
        print(f"[error] No event_id: {result}")
        return 2

    print(f"[sse] streaming event_id={event_id[:12]}...")
    sse_url = f"{call_url}/{event_id}"
    audio_path = None
    with urlopen(sse_url, timeout=timeout_s) as resp:
        current_event = None
        for raw_line in resp:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if line.startswith("event:"):
                current_event = line[6:].strip()
            elif line.startswith("data:"):
                data_str = line[5:].strip()
                if current_event == "error":
                    print(f"[error] Qwen3-TTS error: {data_str}")
                    return 2
                if current_event == "complete":
                    parsed = json.loads(data_str)
                    if isinstance(parsed, list) and len(parsed) >= 2:
                        audio_obj = parsed[0]
                        status_text = parsed[1]
                        print(f"[sse] status: {status_text}")
                        if isinstance(audio_obj, dict):
                            audio_path = audio_obj.get("path") or audio_obj.get("url")

    if not audio_path:
        print("[error] No audio path in response")
        return 2

    # Download the audio file
    file_url = f"{api_base}/gradio_api/file={audio_path}"
    print(f"[GET] {file_url}")
    with urlopen(file_url, timeout=timeout_s) as resp:
        audio_bytes = resp.read()

    out_path = Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(audio_bytes)
    print(f"[ok] wrote {len(audio_bytes)} bytes -> {out_path}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Quick connectivity smoke test for GPT-SoVITS or Qwen3-TTS.")
    p.add_argument(
        "--backend",
        default="gpt-sovits",
        choices=["gpt-sovits", "qwen3"],
        help="TTS backend to test.",
    )
    p.add_argument("--api-base", default="", help="Server URL (auto-detected per backend if empty).")
    p.add_argument("--ref-audio-path", default="", help="(GPT-SoVITS) Path as seen by the server container.")
    p.add_argument("--text", default="테스트입니다.", help="Text to synthesize.")
    p.add_argument("--text-lang", default="ko", help="(GPT-SoVITS) e.g. ko, zh, ja, en")
    p.add_argument("--prompt-lang", default="ko", help="(GPT-SoVITS) e.g. ko, zh, ja, en")
    p.add_argument("--prompt-text", default="", help="(GPT-SoVITS) Optional prompt text for the reference audio.")
    p.add_argument("--media-type", default="wav", choices=["wav", "ogg", "aac", "raw"])
    p.add_argument("--streaming-mode", default="false", help="true/false or 0/1/2/3 depending on server")
    p.add_argument("--timeout-s", type=int, default=60)
    p.add_argument("--out", default="out_smoke.wav", help="Output path for returned bytes.")
    p.add_argument("--method", default="auto", choices=["auto", "get", "post"])
    p.add_argument("--ping-only", action="store_true", help="Only probe server endpoints; do not call TTS.")
    # Qwen3 specific
    p.add_argument("--voice-tag", default="", help="(Qwen3) Voice library tag for generation.")
    p.add_argument("--language", default="korean", help="(Qwen3) Language for TTS generation.")
    args = p.parse_args()

    # Auto-detect api-base per backend
    if not args.api_base:
        if args.backend == "qwen3":
            args.api_base = "http://100.66.10.225:3000/tools/qwen3-tts"
        else:
            args.api_base = "http://127.0.0.1:9880"

    # Quick TCP check to catch the common Docker port mapping issue.
    try:
        from urllib.parse import urlparse

        u = urlparse(args.api_base)
        host = u.hostname or "127.0.0.1"
        port = int(u.port or (443 if u.scheme == "https" else 80))
        if not _can_connect(host, port, timeout_s=min(2.0, float(args.timeout_s))):
            print(f"[net] cannot connect to {host}:{port}")
            if args.backend == "qwen3":
                print("[net] If Qwen3-TTS is running in Docker, ensure the port is published: `docker run ... -p 8010:8000 ...`")
                _qwen3_probe_health(api_base=args.api_base, timeout_s=args.timeout_s)
            else:
                print("[net] If GPT-SoVITS is running in Docker, ensure the port is published: `docker run ... -p 9880:9880 ...`")
                _probe_health(api_base=args.api_base, timeout_s=args.timeout_s)
            return 3
    except Exception:
        pass

    # ── Qwen3-TTS backend ──
    if args.backend == "qwen3":
        if args.ping_only:
            _qwen3_probe_health(api_base=args.api_base, timeout_s=args.timeout_s)
            return 0
        if not args.voice_tag:
            print("[error] --voice-tag is required for --backend qwen3 (unless --ping-only)")
            return 2
        try:
            return _qwen3_smoke_test(
                api_base=args.api_base,
                text=args.text,
                voice_tag=args.voice_tag,
                language=args.language,
                timeout_s=args.timeout_s,
                out=args.out,
            )
        except HTTPError as e:
            body = b""
            try:
                body = e.read() or b""
            except Exception:
                body = b""
            print(f"[error] HTTPError {e.code} {e.reason}")
            if body:
                print(body.decode("utf-8", errors="replace")[:4000])
            return 2
        except (URLError, TimeoutError, ConnectionError, http.client.RemoteDisconnected) as e:
            print(f"[error] {type(e).__name__}: {e}")
            _qwen3_probe_health(api_base=args.api_base, timeout_s=args.timeout_s)
            return 3
        except Exception as e:
            print(f"[error] {type(e).__name__}: {e}")
            return 4

    # ── GPT-SoVITS backend ──
    if args.ping_only:
        _probe_health(api_base=args.api_base, timeout_s=args.timeout_s)
        return 0

    if not args.ref_audio_path.strip():
        print("[error] --ref-audio-path is required unless --ping-only is set")
        return 2

    params: dict[str, object] = {
        "text": args.text,
        "text_lang": args.text_lang,
        "ref_audio_path": args.ref_audio_path,
        "prompt_lang": args.prompt_lang,
        "prompt_text": args.prompt_text,
        "media_type": args.media_type,
        "streaming_mode": args.streaming_mode,
    }
    payload = dict(params)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        audio = b""
        if args.method == "get":
            audio = _try_get(api_base=args.api_base, params=params, timeout_s=args.timeout_s)
        elif args.method == "post":
            audio = _try_post(api_base=args.api_base, payload=payload, timeout_s=args.timeout_s)
        else:
            # auto: prefer GET, but fall back to POST on common connection errors.
            try:
                audio = _try_get(api_base=args.api_base, params=params, timeout_s=args.timeout_s)
            except (URLError, TimeoutError, ConnectionError, http.client.RemoteDisconnected) as e:
                print(f"[warn] GET failed ({type(e).__name__}); trying POST")
                audio = _try_post(api_base=args.api_base, payload=payload, timeout_s=args.timeout_s)

        out_path.write_bytes(audio)
        print(f"[ok] wrote {len(audio)} bytes -> {out_path}")
        return 0
    except HTTPError as e:
        body = b""
        try:
            body = e.read() or b""
        except Exception:
            body = b""
        print(f"[error] HTTPError {e.code} {e.reason}")
        if body:
            try:
                print(body.decode("utf-8", errors="replace")[:4000])
            except Exception:
                print(body[:200])
        return 2
    except URLError as e:
        print(f"[error] URLError: {e}")
        _probe_health(api_base=args.api_base, timeout_s=args.timeout_s)
        return 3
    except http.client.RemoteDisconnected as e:
        print(f"[error] RemoteDisconnected: {e}")
        _probe_health(api_base=args.api_base, timeout_s=args.timeout_s)
        return 3
    except Exception as e:
        print(f"[error] {type(e).__name__}: {e}")
        _probe_health(api_base=args.api_base, timeout_s=args.timeout_s)
        return 4


if __name__ == "__main__":
    raise SystemExit(main())
