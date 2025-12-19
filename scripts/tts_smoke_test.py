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


def main() -> int:
    p = argparse.ArgumentParser(description="Quick connectivity smoke test for GPT-SoVITS api_v2.py /tts.")
    p.add_argument("--api-base", default="http://127.0.0.1:9880", help="e.g. http://127.0.0.1:9880")
    p.add_argument("--ref-audio-path", default="", help="Path as seen by the server container, e.g. /workspace/refs/...")
    p.add_argument("--text", default="테스트입니다.", help="Text to synthesize.")
    p.add_argument("--text-lang", default="ko", help="e.g. ko, zh, ja, en")
    p.add_argument("--prompt-lang", default="ko", help="e.g. ko, zh, ja, en")
    p.add_argument("--prompt-text", default="", help="Optional prompt text for the reference audio.")
    p.add_argument("--media-type", default="wav", choices=["wav", "ogg", "aac", "raw"])
    p.add_argument("--streaming-mode", default="false", help="true/false or 0/1/2/3 depending on server")
    p.add_argument("--timeout-s", type=int, default=60)
    p.add_argument("--out", default="out_smoke.wav", help="Output path for returned bytes.")
    p.add_argument("--method", default="auto", choices=["auto", "get", "post"])
    p.add_argument("--ping-only", action="store_true", help="Only probe server endpoints; do not call /tts.")
    args = p.parse_args()

    # Quick TCP check to catch the common Docker port mapping issue.
    try:
        from urllib.parse import urlparse

        u = urlparse(args.api_base)
        host = u.hostname or "127.0.0.1"
        port = int(u.port or (443 if u.scheme == "https" else 80))
        if not _can_connect(host, port, timeout_s=min(2.0, float(args.timeout_s))):
            print(f"[net] cannot connect to {host}:{port}")
            print("[net] If GPT-SoVITS is running in Docker, ensure the port is published: `docker run ... -p 9880:9880 ...`")
            _probe_health(api_base=args.api_base, timeout_s=args.timeout_s)
            return 3
    except Exception:
        pass

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
