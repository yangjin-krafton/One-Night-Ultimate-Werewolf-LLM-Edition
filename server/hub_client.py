"""
Hub Client - Hub에 동적으로 등록하기 위한 클라이언트 모듈
(D:\Weeks\hub\src\launcher\hub_client.py 복사본)
"""

import atexit
import json
import os
import urllib.request
import urllib.error
from typing import Optional


class HubClient:
    """Hub 서버와 통신하는 클라이언트"""

    def __init__(self, hub_url: Optional[str] = None):
        self.hub_url = (hub_url or os.environ.get("HUB_URL", "http://localhost:3000")).rstrip("/")
        self._registered_apps: list[str] = []
        self._auto_unregister = True

    def _request(self, method: str, path: str, data: Optional[dict] = None) -> dict:
        url = f"{self.hub_url}{path}"
        headers = {"Content-Type": "application/json"}
        body = json.dumps(data).encode("utf-8") if data else None

        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                return json.loads(e.read().decode("utf-8"))
            except Exception:
                return {"ok": False, "error": "http_error", "status": e.code}
        except urllib.error.URLError as e:
            return {"ok": False, "error": "connection_failed", "detail": str(e.reason)}
        except Exception as e:
            return {"ok": False, "error": "unknown", "detail": str(e)}

    def register(
        self,
        app_id: str,
        name: str,
        proxy: str,
        *,
        route: Optional[str] = None,
        description: str = "",
        tags: Optional[list[str]] = None,
        status: str = "running",
        static_dir: Optional[str] = None,
        project_dir: Optional[str] = None,
        app_type: str = "dynamic",
        auto_unregister: bool = True,
    ) -> dict:
        data = {
            "id": app_id,
            "name": name,
            "proxy": proxy,
            "type": app_type,
            "description": description,
            "tags": tags or [],
            "status": status,
        }
        if route:
            data["route"] = route
        if static_dir:
            data["staticDir"] = static_dir
        if project_dir:
            data["projectDir"] = project_dir

        result = self._request("POST", "/api/register", data)

        if result.get("ok"):
            self._registered_apps.append(app_id)
            if auto_unregister and self._auto_unregister:
                self._setup_auto_unregister()
            print(f"[hub-client] registered: {app_id} -> {proxy}")
        else:
            print(f"[hub-client] register failed: {result}")

        return result

    def unregister(self, app_id: str) -> dict:
        result = self._request("DELETE", f"/api/register/{app_id}")
        if result.get("ok") and app_id in self._registered_apps:
            self._registered_apps.remove(app_id)
            print(f"[hub-client] unregistered: {app_id}")
        return result

    def unregister_all(self) -> None:
        for app_id in list(self._registered_apps):
            self.unregister(app_id)

    def is_hub_running(self) -> bool:
        result = self._request("GET", "/api/hub")
        return result.get("ok", False)

    def _setup_auto_unregister(self) -> None:
        if not hasattr(self, "_atexit_registered"):
            atexit.register(self.unregister_all)
            self._atexit_registered = True


_default_client: Optional[HubClient] = None


def get_client(hub_url: Optional[str] = None) -> HubClient:
    global _default_client
    if _default_client is None:
        _default_client = HubClient(hub_url)
    return _default_client


def register_to_hub(
    app_id: str = "one-night-werewolf",
    name: str = "One Night Werewolf (LLM Edition)",
    port: int = 8001,
    **kwargs,
) -> dict:
    """편의 함수: Hub에 이 서버 등록"""
    client = get_client()
    if not client.is_hub_running():
        print("[hub-client] Hub is not running, skipping registration")
        return {"ok": False, "error": "hub_not_running"}

    return client.register(
        app_id=app_id,
        name=name,
        proxy=f"http://127.0.0.1:{port}",
        route=f"/games/{app_id}/",
        description="원나잇 늑대인간 LLM 에디션 (FastAPI/WS)",
        tags=["party", "llm", "multiplayer"],
        status="running",
        **kwargs,
    )
