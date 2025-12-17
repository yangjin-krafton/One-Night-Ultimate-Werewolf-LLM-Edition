from __future__ import annotations

import asyncio
import json
import os
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles


ROOT = Path(__file__).resolve().parents[1]
SCENARIOS_DIR = ROOT / "scenarios"
PUBLIC_DIR = ROOT / "public"


PHASE_WAIT = "WAIT"
PHASE_NIGHT = "NIGHT"
PHASE_DEBATE = "DEBATE"
PHASE_VOTE = "VOTE"
PHASE_RESULT = "RESULT"
PHASE_REVEAL = "REVEAL"
PHASE_ENDING = "ENDING"


COLOR_PALETTE = [
    "#6EE7FF",
    "#A78BFA",
    "#34D399",
    "#FBBF24",
    "#F87171",
    "#60A5FA",
    "#F472B6",
    "#22C55E",
]


def _now_ms() -> int:
    return int(time.time() * 1000)


def _safe_name(name: str) -> str:
    cleaned = (name or "").strip()
    return cleaned[:20] if cleaned else "Player"


def _generate_seat_color(seat_index: int) -> str:
    return COLOR_PALETTE[(seat_index - 1) % len(COLOR_PALETTE)]


def load_scenarios() -> dict[str, dict[str, Any]]:
    scenarios: dict[str, dict[str, Any]] = {}
    if not SCENARIOS_DIR.exists():
        return scenarios

    for p in sorted(SCENARIOS_DIR.glob("*.json")):
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        for s in raw.get("scenarios") or []:
            sid = str(s.get("scenarioId") or "").strip()
            if sid:
                scenarios[sid] = s
    return scenarios


def select_variant_for_player_count(episode: dict[str, Any] | None, player_count: int) -> dict[str, Any] | None:
    """
    Pick an episode variant given a current player count.

    Rule:
      - Prefer the smallest numeric key >= player_count
      - Otherwise fall back to the largest numeric key
    """
    if not episode:
        return None
    variants = episode.get("variantByPlayerCount") or {}
    items: list[tuple[int, dict[str, Any]]] = []
    for k, v in variants.items():
        ks = str(k).strip()
        if not ks.isdigit():
            continue
        if isinstance(v, dict):
            items.append((int(ks), v))
    if not items:
        return None
    items.sort(key=lambda x: x[0])
    for n, variant in items:
        if n >= int(player_count):
            return variant
    return items[-1][1]


def effective_role_deck(variant: dict[str, Any] | None, player_count: int) -> list[str]:
    if not variant:
        return []
    deck = list(variant.get("roleDeck") or [])
    need = max(0, int(player_count) + 3)
    if need <= 0:
        return []
    return deck[: min(len(deck), need)]


def scenario_can_start(scenario: dict[str, Any] | None, player_count: int) -> bool:
    if not scenario:
        return False
    episodes = scenario.get("episodes") or []
    if not episodes:
        return False
    first = episodes[0] or {}
    v = select_variant_for_player_count(first, player_count)
    return bool(v)


@dataclass
class Player:
    client_id: str
    name: str
    seat: int
    color: str
    ws: WebSocket | None = None


@dataclass
class RoomState:
    players: list[Player] = field(default_factory=list)
    host_client_id: str | None = None
    selected_scenario_id: str | None = None
    phase: str = PHASE_WAIT
    phase_ends_at_ms: int | None = None
    votes: dict[str, int] = field(default_factory=dict)  # clientId -> targetSeat
    role_by_client_id: dict[str, str] = field(default_factory=dict)  # private: clientId -> roleId
    center_roles: list[str] = field(default_factory=list)  # private-ish: 3 cards

    # Night step sequencing (host drives with step_done ack; server has a timeout fallback).
    night_step_id: int = 0
    night_queue: list[dict[str, Any]] = field(default_factory=list)  # items: {kind, roleId?, sectionKey}
    night_index: int = 0
    night_step_ends_at_ms: int | None = None
    night_episode_id: str | None = None
    night_variant_player_count: int | None = None

    def reseat(self) -> None:
        for idx, p in enumerate(self.players, start=1):
            p.seat = idx
            p.color = _generate_seat_color(idx)

    def connected_count(self) -> int:
        return sum(1 for p in self.players if p.ws is not None)

    def snapshot(self) -> dict[str, Any]:
        return {
            "players": [
                {
                    "clientId": p.client_id,
                    "name": p.name,
                    "seat": p.seat,
                    "color": p.color,
                    "connected": p.ws is not None,
                    "isHost": p.client_id == self.host_client_id,
                }
                for p in self.players
            ],
            "hostClientId": self.host_client_id,
            "selectedScenarioId": self.selected_scenario_id,
            "phase": self.phase,
            "phaseEndsAtMs": self.phase_ends_at_ms,
            "votes": dict(self.votes),
        }


class GameServer:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._room = RoomState()
        self._scenarios = load_scenarios()
        self._debug_enabled = os.environ.get("DEBUG_COMMANDS", "").strip() == "1" or (
            os.environ.get("NODE_ENV", "").strip().lower() == "development"
        )
        self._phase_task: asyncio.Task[None] | None = None
        self._night_task: asyncio.Task[None] | None = None

    def _cancel_phase_task(self) -> None:
        if self._phase_task and not self._phase_task.done():
            self._phase_task.cancel()
        self._phase_task = None
        if self._night_task and not self._night_task.done():
            self._night_task.cancel()
        self._night_task = None

    async def _set_phase_locked(self, phase: str, duration_ms: int | None) -> None:
        self._room.phase = phase
        self._room.phase_ends_at_ms = (_now_ms() + duration_ms) if duration_ms else None
        await self.broadcast({"type": "phase_changed", "data": {"phase": self._room.phase, "phaseEndsAtMs": self._room.phase_ends_at_ms}})
        await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})
        self._cancel_phase_task()
        if self._room.phase_ends_at_ms:
            self._phase_task = asyncio.create_task(self._phase_timer(self._room.phase, self._room.phase_ends_at_ms))

    async def _send_to(self, client_id: str, payload: dict[str, Any]) -> None:
        for p in self._room.players:
            if p.client_id != client_id or p.ws is None:
                continue
            try:
                await p.ws.send_json(payload)
            except Exception:
                # Let broadcast cleanup handle disconnects.
                return

    async def _phase_timer(self, phase: str, ends_at_ms: int) -> None:
        delay = max(0.0, (ends_at_ms - _now_ms()) / 1000.0)
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            return

        async with self._lock:
            if self._room.phase != phase or self._room.phase_ends_at_ms != ends_at_ms:
                return

            if phase == PHASE_NIGHT:
                # Night is driven by the night-step sequencer.
                return
            if phase == PHASE_DEBATE:
                await self._set_phase_locked(PHASE_VOTE, 30_000)
            elif phase == PHASE_VOTE:
                # Vote timeout: finalize with whatever votes are in.
                await self._finalize_vote_locked(timeout=True)
            elif phase == PHASE_RESULT:
                await self._set_phase_locked(PHASE_REVEAL, 15_000)
            elif phase == PHASE_REVEAL:
                await self._set_phase_locked(PHASE_ENDING, 15_000)
            elif phase == PHASE_ENDING:
                self._room.votes.clear()
                await self._set_phase_locked(PHASE_WAIT, None)

    def _reset_night_locked(self) -> None:
        self._room.night_queue = []
        self._room.night_index = 0
        self._room.night_step_ends_at_ms = None
        self._room.night_episode_id = None
        self._room.night_variant_player_count = None

    def _build_night_queue_locked(self, *, episode: dict[str, Any], variant: dict[str, Any], player_count: int) -> list[dict[str, Any]]:
        """
        Build a list of step items to play on host during NIGHT.
        Each item: { kind: 'opening'|'role'|'outro', sectionKey: str, roleId?: str }
        """
        narr = (variant.get("narration") or {}) if isinstance(variant.get("narration"), dict) else {}

        opening_count = int(narr.get("openingClipCount") or 0)
        outro_count = int(narr.get("nightOutroClipCount") or 0)
        role_counts = narr.get("roleClipCounts") or {}

        deck = effective_role_deck(variant, player_count)
        roles_in_deck = set(deck)
        wake_order = [r for r in (variant.get("roleWakeOrder") or []) if (not roles_in_deck) or (r in roles_in_deck)]

        queue: list[dict[str, Any]] = []
        for i in range(1, max(0, opening_count) + 1):
            queue.append({"kind": "opening", "sectionKey": f"opening/{i:03d}"})

        for role_id in wake_order:
            c = role_counts.get(role_id) or {}
            during = int(c.get("during") or 0)
            for i in range(1, max(0, during) + 1):
                queue.append({"kind": "role", "roleId": str(role_id), "sectionKey": f"role/{role_id}/during/{i:03d}"})

        for i in range(1, max(0, outro_count) + 1):
            queue.append({"kind": "outro", "sectionKey": f"outro/{i:03d}"})

        return queue

    async def _broadcast_night_step_locked(self) -> None:
        if self._room.phase != PHASE_NIGHT:
            return
        if not self._room.night_queue:
            return
        if self._room.night_index >= len(self._room.night_queue):
            return

        item = self._room.night_queue[self._room.night_index]
        self._room.night_step_id += 1
        step_id = self._room.night_step_id
        # Fallback timeout if host doesn't ack.
        self._room.night_step_ends_at_ms = _now_ms() + 12_000

        scenario_id = self._room.selected_scenario_id or ""
        payload = {
            "type": "night_step",
            "data": {
                "stepId": step_id,
                "kind": item.get("kind"),
                "roleId": item.get("roleId"),
                "sectionKey": item.get("sectionKey"),
                "scenarioId": scenario_id,
                "episodeId": self._room.night_episode_id,
                "variantPlayerCount": self._room.night_variant_player_count,
                "stepIndex": self._room.night_index + 1,
                "stepCount": len(self._room.night_queue),
                "stepEndsAtMs": self._room.night_step_ends_at_ms,
            },
        }
        await self.broadcast(payload)
        self._night_task = asyncio.create_task(self._night_step_timer(step_id, self._room.night_step_ends_at_ms))

    async def _night_step_timer(self, step_id: int, ends_at_ms: int | None) -> None:
        if not ends_at_ms:
            return
        delay = max(0.0, (ends_at_ms - _now_ms()) / 1000.0)
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            return
        async with self._lock:
            if self._room.phase != PHASE_NIGHT:
                return
            if self._room.night_step_id != step_id or self._room.night_step_ends_at_ms != ends_at_ms:
                return
            await self._advance_night_locked(reason="timeout")

    async def _advance_night_locked(self, *, reason: str) -> None:
        if self._room.phase != PHASE_NIGHT:
            return
        self._room.night_index += 1
        if self._room.night_index >= len(self._room.night_queue):
            self._reset_night_locked()
            await self._set_phase_locked(PHASE_DEBATE, 60_000)
            return
        await self._broadcast_night_step_locked()

    async def handle_night_step_done(self, client_id: str, step_id: int) -> None:
        async with self._lock:
            if client_id != self._room.host_client_id:
                return
            if self._room.phase != PHASE_NIGHT:
                return
            if int(step_id) != int(self._room.night_step_id):
                return
            await self._advance_night_locked(reason="ack")

    def scenario_list(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for sid, s in self._scenarios.items():
            has_bgm = bool(((s.get("bgm") or {}).get("tracks") or []))
            if not has_bgm:
                for ep in s.get("episodes") or []:
                    if (ep.get("bgm") or {}).get("tracks"):
                        has_bgm = True
                        break
            out.append(
                {
                    "scenarioId": sid,
                    "title": s.get("title") or sid,
                    "tags": s.get("tags") or [],
                    "recommendedPlayerCounts": s.get("recommendedPlayerCounts") or [],
                    "hasBgm": has_bgm,
                }
            )
        return out

    def scenario_get(self, scenario_id: str) -> dict[str, Any] | None:
        return self._scenarios.get(scenario_id)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        dead: list[str] = []
        for p in self._room.players:
            if p.ws is None:
                continue
            try:
                await p.ws.send_json(payload)
            except Exception:
                dead.append(p.client_id)
        if dead:
            for cid in dead:
                await self._disconnect_client_locked(cid)

    async def _disconnect_client_locked(self, client_id: str) -> None:
        for i, p in enumerate(list(self._room.players)):
            if p.client_id != client_id:
                continue
            try:
                if p.ws is not None:
                    await p.ws.close()
            except Exception:
                pass
            self._room.players.pop(i)
            break

        if self._room.host_client_id == client_id:
            self._room.host_client_id = self._room.players[0].client_id if self._room.players else None

        self._room.votes.pop(client_id, None)
        self._room.reseat()

    async def handle_join(self, ws: WebSocket, client_id: str, name: str) -> None:
        async with self._lock:
            client_id = (client_id or "").strip()
            if not client_id:
                raise ValueError("clientId is required")

            name = _safe_name(name)

            existing = next((p for p in self._room.players if p.client_id == client_id), None)
            if existing:
                existing.ws = ws
                existing.name = name
            else:
                seat = len(self._room.players) + 1
                self._room.players.append(
                    Player(
                        client_id=client_id,
                        name=name,
                        seat=seat,
                        color=_generate_seat_color(seat),
                        ws=ws,
                    )
                )
                if self._room.host_client_id is None:
                    self._room.host_client_id = client_id

            self._room.reseat()

            scenario = self._scenarios.get(self._room.selected_scenario_id or "")
            can_start = scenario_can_start(scenario, self._room.connected_count())

            await ws.send_json({"type": "hello", "serverTimeMs": _now_ms(), "debugEnabled": self._debug_enabled})
            await ws.send_json({"type": "room_snapshot", "data": self._room.snapshot()})
            await self.broadcast({"type": "host_changed", "data": {"hostClientId": self._room.host_client_id}})
            await self.broadcast(
                {
                    "type": "scenario_state",
                    "data": {
                        "selectedScenarioId": self._room.selected_scenario_id,
                        "canStart": can_start,
                        "playerCount": self._room.connected_count(),
                    },
                }
            )
            await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})

    async def handle_disconnect(self, client_id: str) -> None:
        async with self._lock:
            await self._disconnect_client_locked(client_id)
            scenario = self._scenarios.get(self._room.selected_scenario_id or "")
            can_start = scenario_can_start(scenario, self._room.connected_count())
            await self.broadcast({"type": "host_changed", "data": {"hostClientId": self._room.host_client_id}})
            await self.broadcast(
                {
                    "type": "scenario_state",
                    "data": {
                        "selectedScenarioId": self._room.selected_scenario_id,
                        "canStart": can_start,
                        "playerCount": self._room.connected_count(),
                    },
                }
            )
            await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})

    async def handle_scenario_select(self, client_id: str, scenario_id: str) -> None:
        async with self._lock:
            if client_id != self._room.host_client_id:
                return
            scenario_id = (scenario_id or "").strip()
            if scenario_id not in self._scenarios:
                return
            self._room.selected_scenario_id = scenario_id

            scenario = self._scenarios.get(scenario_id)
            can_start = scenario_can_start(scenario, self._room.connected_count())
            await self.broadcast(
                {
                    "type": "scenario_state",
                    "data": {
                        "selectedScenarioId": self._room.selected_scenario_id,
                        "canStart": can_start,
                        "playerCount": self._room.connected_count(),
                    },
                }
            )
            await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})

    async def _assign_roles_locked(self, *, scenario: dict[str, Any], player_count: int) -> bool:
        episodes = scenario.get("episodes") or []
        if not episodes:
            return False
        ep = episodes[0] or {}
        variant = select_variant_for_player_count(ep, player_count)
        if not variant:
            return False
        deck = effective_role_deck(variant, player_count)
        if len(deck) < player_count + 3:
            return False
        random.shuffle(deck)
        player_ids = [p.client_id for p in self._room.players if p.ws is not None]
        if len(player_ids) != player_count:
            return False
        self._room.role_by_client_id = {cid: deck[i] for i, cid in enumerate(player_ids)}
        self._room.center_roles = deck[player_count : player_count + 3]
        # Prepare night sequence metadata from the runtime scenario (counts etc).
        self._room.night_episode_id = str(ep.get("episodeId") or "ep1")
        # Track which variantPlayerCount we picked so host can build URLs under /pN/.
        vmap = ep.get("variantByPlayerCount") or {}
        numeric = [int(k) for k in vmap.keys() if str(k).isdigit() and isinstance(vmap.get(k), dict)]
        numeric.sort()
        picked = None
        for n in numeric:
            if n >= player_count:
                picked = n
                break
        picked = picked or (numeric[-1] if numeric else player_count)
        self._room.night_variant_player_count = int(picked)

        self._room.night_queue = self._build_night_queue_locked(episode=ep, variant=variant, player_count=player_count)
        self._room.night_index = 0
        return True

    async def handle_start_game(self, client_id: str) -> None:
        async with self._lock:
            if client_id != self._room.host_client_id:
                return
            scenario = self._scenarios.get(self._room.selected_scenario_id or "")
            if not scenario_can_start(scenario, self._room.connected_count()):
                return
            self._room.votes.clear()
            # Assign roles and start night sequencer.
            ok = await self._assign_roles_locked(scenario=scenario, player_count=self._room.connected_count())
            if not ok:
                return

            for cid, role_id in self._room.role_by_client_id.items():
                await self._send_to(cid, {"type": "role_assignment", "data": {"roleId": role_id}})

            await self._set_phase_locked(PHASE_NIGHT, None)
            await self._broadcast_night_step_locked()

    async def handle_submit_vote(self, client_id: str, target_seat: int) -> None:
        async with self._lock:
            if self._room.phase not in (PHASE_VOTE,):
                return
            connected_ids = {p.client_id for p in self._room.players if p.ws is not None}
            if client_id not in connected_ids:
                return
            self._room.votes[client_id] = int(target_seat)

            if len(self._room.votes) < len(connected_ids):
                await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})
                return
            await self._finalize_vote_locked(timeout=False)

    async def _finalize_vote_locked(self, *, timeout: bool) -> None:
        connected_ids = {p.client_id for p in self._room.players if p.ws is not None}
        counts: dict[int, int] = {}
        for cid in connected_ids:
            if cid not in self._room.votes:
                continue
            seat = self._room.votes[cid]
            counts[seat] = counts.get(seat, 0) + 1
        result = sorted(counts.items(), key=lambda x: (-x[1], x[0]))

        await self.broadcast({"type": "vote_result_public", "data": {"counts": counts, "sorted": result, "timeout": timeout}})
        await self._set_phase_locked(PHASE_RESULT, 12_000)

    async def handle_debug(self, client_id: str, action: str, data: dict[str, Any]) -> None:
        if not self._debug_enabled:
            return
        async with self._lock:
            if client_id != self._room.host_client_id:
                return

            if action == "unlock_scenario":
                sid = (data.get("scenarioId") or "").strip()
                if sid in self._scenarios:
                    self._room.selected_scenario_id = sid
            elif action == "set_phase":
                phase = (data.get("phase") or "").strip().upper()
                duration_sec = int(data.get("durationSec") or 30)
                if phase in {
                    PHASE_WAIT,
                    PHASE_NIGHT,
                    PHASE_DEBATE,
                    PHASE_VOTE,
                    PHASE_RESULT,
                    PHASE_REVEAL,
                    PHASE_ENDING,
                }:
                    self._room.phase = phase
                    self._room.phase_ends_at_ms = _now_ms() + max(1, duration_sec) * 1000
                    if phase != PHASE_VOTE:
                        self._room.votes.clear()
                    self._cancel_phase_task()
                    self._phase_task = asyncio.create_task(self._phase_timer(self._room.phase, self._room.phase_ends_at_ms))
            elif action == "end_game":
                self._room.phase = PHASE_ENDING
                self._room.phase_ends_at_ms = None
                winner = (data.get("winner") or "mixed").strip()
                await self.broadcast({"type": "ending_text", "data": {"winner": winner, "text": f"[DEBUG] winner={winner}"}})
            elif action == "force_start":
                self._room.votes.clear()
                await self._set_phase_locked(PHASE_NIGHT, 10_000)

            scenario = self._scenarios.get(self._room.selected_scenario_id or "")
            can_start = scenario_can_start(scenario, self._room.connected_count())
            await self.broadcast(
                {
                    "type": "scenario_state",
                    "data": {
                        "selectedScenarioId": self._room.selected_scenario_id,
                        "canStart": can_start,
                        "playerCount": self._room.connected_count(),
                    },
                }
            )
            await self.broadcast({"type": "phase_changed", "data": {"phase": self._room.phase, "phaseEndsAtMs": self._room.phase_ends_at_ms}})
            await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})


game = GameServer()
app = FastAPI()


@app.get("/api/scenarios")
def api_scenarios() -> JSONResponse:
    return JSONResponse(game.scenario_list())


@app.get("/api/scenarios/{scenario_id}")
def api_scenario(scenario_id: str) -> JSONResponse:
    s = game.scenario_get(scenario_id)
    if not s:
        return JSONResponse({"error": "not_found"}, status_code=404)
    return JSONResponse(s)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    client_id = ""
    try:
        while True:
            msg = await ws.receive_json()
            t = msg.get("type")
            data = msg.get("data") or {}

            if t == "join":
                client_id = str(data.get("clientId") or "")
                name = str(data.get("name") or "")
                await game.handle_join(ws, client_id, name)
            elif t == "scenario_select":
                await game.handle_scenario_select(client_id, str(data.get("scenarioId") or ""))
            elif t == "start_game":
                await game.handle_start_game(client_id)
            elif t == "submit_vote":
                await game.handle_submit_vote(client_id, int(data.get("targetSeat") or 0))
            elif t == "night_step_done":
                await game.handle_night_step_done(client_id, int(data.get("stepId") or 0))
            elif t == "debug":
                await game.handle_debug(client_id, str(data.get("action") or ""), dict(data.get("data") or {}))
            elif t == "leave":
                if client_id:
                    await game.handle_disconnect(client_id)
                    break
    except WebSocketDisconnect:
        if client_id:
            await game.handle_disconnect(client_id)
    except Exception:
        if client_id:
            await game.handle_disconnect(client_id)


if PUBLIC_DIR.exists():
    # Mount static last so /api and /ws win.
    app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
