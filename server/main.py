from __future__ import annotations

import colorsys
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
SCENARIOS_TTS_DIR = ROOT / "scenarios_tts"
PUBLIC_DIR = ROOT / "public"


PHASE_WAIT = "WAIT"
PHASE_ROLE = "ROLE"
PHASE_NIGHT = "NIGHT"
PHASE_DEBATE = "DEBATE"
PHASE_VOTE = "VOTE"
PHASE_RESULT = "RESULT"
PHASE_REVEAL = "REVEAL"
PHASE_ENDING = "ENDING"

NIGHT_HOST_ACK_TIMEOUT_MS = 180_000
NIGHT_ACTION_WINDOW_MS = 1_000
LOBBY_DISCONNECT_EVICT_MS = 30_000


COLOR_PALETTE = [
    # Prefer distinct, high-contrast colors for up to ~15 players.
    "#E6194B",  # Red
    "#3CB44B",  # Green
    "#FFE119",  # Yellow
    "#4363D8",  # Blue
    "#F58231",  # Orange
    "#911EB4",  # Purple
    "#42D4F4",  # Cyan
    "#F032E6",  # Magenta
    "#BFEF45",  # Lime
    "#FABED4",  # Pink
    "#469990",  # Teal
    "#DCBEFF",  # Lavender
    "#FF6F61",  # Coral
    "#FFD700",  # Gold
    "#00FA9A",  # Medium Spring Green
]


def _now_ms() -> int:
    return int(time.time() * 1000)


def _safe_name(name: str) -> str:
    cleaned = (name or "").strip()
    return cleaned[:20] if cleaned else "Player"


def _name_key(name: str) -> str:
    return _safe_name(name).strip().lower()


def _generate_seat_color(seat_index: int) -> str:
    if seat_index <= 0:
        return "#888"
    if seat_index <= len(COLOR_PALETTE):
        return COLOR_PALETTE[seat_index - 1]

    # Fallback for unusually large rooms: generate a deterministic vivid color.
    # Use golden-angle spacing for hue distribution.
    hue = ((seat_index - 1) * 0.618033988749895) % 1.0
    lightness = 0.62
    saturation = 0.78
    r, g, b = colorsys.hls_to_rgb(hue, lightness, saturation)
    return f"#{int(r*255):02X}{int(g*255):02X}{int(b*255):02X}"


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


def load_scenario_tts(scenario: dict[str, Any] | None, player_count: int | None = None) -> dict[str, Any] | None:
    """
    Load the corresponding *.tts.json for a runtime scenario.

    Priority:
      1) Exact match by (scenarioId, playerCount) if player_count is provided and scenarios_tts exists
      2) scenario["ttsSource"] if present and readable
    """
    if not scenario:
        return None

    scenario_id = str(scenario.get("scenarioId") or "").strip()
    if player_count is not None and scenario_id and SCENARIOS_TTS_DIR.exists():
        try:
            wanted = int(player_count)
        except Exception:
            wanted = None
        if wanted is not None:
            for p in sorted(SCENARIOS_TTS_DIR.glob("*.tts.json")):
                try:
                    raw = json.loads(p.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if str(raw.get("scenarioId") or "").strip() != scenario_id:
                    continue
                try:
                    pc = int(raw.get("playerCount") or 0)
                except Exception:
                    pc = 0
                if pc == wanted:
                    return raw if isinstance(raw, dict) else None

    src = scenario.get("ttsSource")
    if isinstance(src, str) and src.strip():
        try:
            p = (ROOT / src.strip()).resolve()
            if ROOT not in p.parents:
                return None
            if not p.exists():
                return None
            raw = json.loads(p.read_text(encoding="utf-8"))
            return raw if isinstance(raw, dict) else None
        except Exception:
            return None

    return None


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


def select_role_deck_for_game(variant: dict[str, Any] | None, player_count: int) -> list[str]:
    """
    Build the actual deck used for the game (players + 3 center cards).

    Default behavior preserves legacy semantics (prefix-truncation) unless the scenario opts in:
      variant.roleDeckSelectionPolicy.mode == "random_pool"

    In random_pool mode, the full roleDeck is treated as an unordered pool and we sample `player_count + 3`
    cards, while enforcing optional fixed/minimum constraints under either:
      - variant.roleDeckSelectionPolicy.fixedCards: [roleId, ...] (cards that must be included; duplicates allowed)
      - variant.roleDeckSelectionPolicy.minCounts: { roleId: int }
      - variant.roleDeckSelectionPolicy.rules: [{ minPlayers?: int, maxPlayers?: int, minCounts: { roleId: int } }]
        (first matching rule wins; falls back to fixedCards/minCounts)
    """
    if not variant:
        return []

    need = max(0, int(player_count) + 3)
    if need <= 0:
        return []

    raw_policy = variant.get("roleDeckSelectionPolicy")
    policy = raw_policy if isinstance(raw_policy, dict) else {}
    mode = str(policy.get("mode") or "").strip() or "prefix"

    full_deck = list(variant.get("roleDeck") or [])
    if len(full_deck) < need:
        return []

    if mode != "random_pool":
        return full_deck[:need]

    def _parse_fixed_cards(raw: Any) -> list[str]:
        out: list[str] = []
        if not isinstance(raw, list):
            return out
        for x in raw:
            rid = str(x).strip()
            if rid:
                out.append(rid)
        return out

    def _parse_min_counts(raw: Any) -> dict[str, int]:
        out: dict[str, int] = {}
        if not isinstance(raw, dict):
            return out
        for role_id, count in raw.items():
            rid = str(role_id).strip()
            if not rid:
                continue
            try:
                c = int(count)
            except Exception:
                continue
            if c > 0:
                out[rid] = c
        return out

    chosen_fixed_cards: list[str] = []
    chosen_min_counts: dict[str, int] = {}
    rules = policy.get("rules") or []
    if isinstance(rules, list):
        for raw_rule in rules:
            if not isinstance(raw_rule, dict):
                continue
            try:
                min_p = int(raw_rule.get("minPlayers")) if raw_rule.get("minPlayers") is not None else None
            except Exception:
                min_p = None
            try:
                max_p = int(raw_rule.get("maxPlayers")) if raw_rule.get("maxPlayers") is not None else None
            except Exception:
                max_p = None
            if min_p is not None and int(player_count) < min_p:
                continue
            if max_p is not None and int(player_count) > max_p:
                continue
            chosen_fixed_cards = _parse_fixed_cards(raw_rule.get("fixedCards"))
            chosen_min_counts = _parse_min_counts(raw_rule.get("minCounts"))
            break

    if not chosen_fixed_cards:
        chosen_fixed_cards = _parse_fixed_cards(policy.get("fixedCards"))

    if not chosen_min_counts:
        chosen_min_counts = _parse_min_counts(policy.get("minCounts") or {})

    pool = list(full_deck)
    random.shuffle(pool)

    picked: list[str] = []
    for rid in chosen_fixed_cards:
        try:
            idx = pool.index(rid)
        except ValueError:
            return []
        picked.append(pool.pop(idx))

    # Apply minimum counts as TOTAL minimums (including any fixedCards already picked).
    already = {}
    for rid in picked:
        already[rid] = already.get(rid, 0) + 1

    for rid, c in chosen_min_counts.items():
        need_more = int(c) - int(already.get(rid, 0))
        if need_more <= 0:
            continue
        for _ in range(need_more):
            try:
                idx = pool.index(rid)
            except ValueError:
                return []
            picked.append(pool.pop(idx))

    remaining = need - len(picked)
    if remaining < 0:
        return []
    picked.extend(pool[:remaining])
    return picked


def scenario_can_start(scenario: dict[str, Any] | None, player_count: int) -> bool:
    return scenario_can_start_for_episode(scenario, player_count, episode_id=None)


def find_episode_by_id(scenario: dict[str, Any] | None, episode_id: str | None) -> dict[str, Any] | None:
    if not scenario or not episode_id:
        return None
    wanted = str(episode_id).strip()
    if not wanted:
        return None
    for ep in scenario.get("episodes") or []:
        if not isinstance(ep, dict):
            continue
        if str(ep.get("episodeId") or "").strip() == wanted:
            return ep
    return None


def first_episode_id(scenario: dict[str, Any] | None) -> str | None:
    if not scenario:
        return None
    eps = scenario.get("episodes") or []
    if not eps:
        return None
    ep0 = eps[0] or {}
    eid = str(ep0.get("episodeId") or "").strip()
    return eid or None


def next_episode_id(scenario: dict[str, Any] | None, current_episode_id: str | None) -> str | None:
    if not scenario:
        return None
    eps = [ep for ep in (scenario.get("episodes") or []) if isinstance(ep, dict)]
    if not eps:
        return None
    ids = [str(ep.get("episodeId") or "").strip() for ep in eps]
    ids = [x for x in ids if x]
    if not ids:
        return None
    if not current_episode_id:
        return ids[0]
    cur = str(current_episode_id).strip()
    try:
        i = ids.index(cur)
    except ValueError:
        return ids[0]
    return ids[i + 1] if i + 1 < len(ids) else None


def scenario_can_start_for_episode(
    scenario: dict[str, Any] | None, player_count: int, episode_id: str | None
) -> bool:
    if not scenario:
        return False
    episodes = scenario.get("episodes") or []
    if not episodes:
        return False
    ep = find_episode_by_id(scenario, episode_id) or (episodes[0] or {})
    v = select_variant_for_player_count(ep, player_count)
    return bool(v)


@dataclass
class Player:
    client_id: str
    name: str
    seat: int
    color: str
    avatar: str = ""  # New: Emoji avatar
    ws: WebSocket | None = None
    is_spectator: bool = False
    disconnected_at_ms: int | None = None


@dataclass
class RoomState:
    players: list[Player] = field(default_factory=list)
    host_client_id: str | None = None
    selected_scenario_id: str | None = None
    selected_episode_id: str | None = None
    phase: str = PHASE_WAIT
    phase_ends_at_ms: int | None = None
    votes: dict[str, int] = field(default_factory=dict)  # clientId -> targetSeat
    role_by_client_id: dict[str, str] = field(default_factory=dict)  # private: clientId -> roleId
    center_roles: list[str] = field(default_factory=list)  # private-ish: 3 cards
    night_deck: list[str] = field(default_factory=list)  # private-ish: selected deck used for this game

    # Night step sequencing (host drives with step_done ack; server has a timeout fallback).
    night_step_id: int = 0
    night_queue: list[dict[str, Any]] = field(default_factory=list)  # items: {kind, roleId?, sectionKey}
    night_index: int = 0
    night_step_ends_at_ms: int | None = None
    night_episode_id: str | None = None
    night_variant_player_count: int | None = None
    night_waiting_host_step_id: int | None = None
    night_waiting_actor_ids: set[str] = field(default_factory=set)
    night_done_actor_ids: set[str] = field(default_factory=set)
    night_waiting_role_id: str | None = None
    night_ready_ids: set[str] = field(default_factory=set)

    # If True, when an episode naturally completes and returns to WAIT, auto-advance to next episode (if any).
    advance_episode_on_return: bool = True

    def reseat(self) -> None:
        used_colors = {p.color for p in self.players if p.color}
        for idx, p in enumerate(self.players, start=1):
            p.seat = idx
            if not p.color:
                # Find an unused color
                available = [c for c in COLOR_PALETTE if c not in used_colors]
                if not available:
                    available = COLOR_PALETTE # Fallback
                p.color = random.choice(available)
                used_colors.add(p.color)

    def connected_count(self) -> int:
        return sum(1 for p in self.players if p.ws is not None)

    def connected_player_count(self) -> int:
        return sum(1 for p in self.players if p.ws is not None and not p.is_spectator)

    def snapshot(self) -> dict[str, Any]:
        # Never reveal vote targets in room snapshots. Clients only need to know "has voted" for UI.
        vote_status = {cid: True for cid in self.votes.keys()}
        return {
            "players": [
                {
                    "clientId": p.client_id,
                    "name": p.name,
                    "seat": p.seat,
                    "color": p.color,
                    "avatar": p.avatar,
                    "connected": p.ws is not None,
                    "isHost": p.client_id == self.host_client_id,
                    "isSpectator": bool(p.is_spectator),
                }
                for p in self.players
            ],
            "hostClientId": self.host_client_id,
            "selectedScenarioId": self.selected_scenario_id,
            "selectedEpisodeId": self.selected_episode_id,
            "phase": self.phase,
            "phaseEndsAtMs": self.phase_ends_at_ms,
            "votes": vote_status,
            # Public: role IDs used for this round (no assignments). Useful for in-game role reference UI.
            "nightDeck": list(self.night_deck or []),
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
        self._cleanup_task: asyncio.Task[None] | None = None

    def start_background_tasks(self) -> None:
        if self._cleanup_task and not self._cleanup_task.done():
            return
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(2.0)
                async with self._lock:
                    # Only auto-evict disconnected players in lobby; in-game we keep slots for reconnection.
                    if self._room.phase != PHASE_WAIT:
                        continue
                    now = _now_ms()
                    to_remove: list[str] = []
                    for p in self._room.players:
                        if p.ws is not None:
                            continue
                        if p.disconnected_at_ms is None:
                            continue
                        if now - int(p.disconnected_at_ms) >= LOBBY_DISCONNECT_EVICT_MS:
                            to_remove.append(p.client_id)
                    if not to_remove:
                        continue
                    for cid in to_remove:
                        await self._remove_player_locked(cid)

                    scenario = self._scenarios.get(self._room.selected_scenario_id or "")
                    can_start = scenario_can_start_for_episode(
                        scenario, self._room.connected_player_count(), self._room.selected_episode_id
                    )
                    await self.broadcast({"type": "host_changed", "data": {"hostClientId": self._room.host_client_id}})
                    await self.broadcast(
                        {
                            "type": "scenario_state",
                            "data": {
                                "selectedScenarioId": self._room.selected_scenario_id,
                                "selectedEpisodeId": self._room.selected_episode_id,
                                "canStart": can_start,
                                "playerCount": self._room.connected_player_count(),
                                "totalConnected": self._room.connected_count(),
                            },
                        }
                    )
                    await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})
            except asyncio.CancelledError:
                return
            except Exception:
                # Best-effort cleanup.
                continue

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

    async def _abort_game_locked(self, *, reason: str) -> None:
        # Host aborted / host left. Return to lobby safely without advancing episode.
        self._room.advance_episode_on_return = False
        self._room.votes.clear()
        self._room.role_by_client_id.clear()
        self._room.center_roles = []
        self._reset_night_locked()
        await self._set_phase_locked(PHASE_WAIT, None)

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
            if phase == PHASE_ROLE:
                await self._begin_night_locked(reason="role_timeout")
                return
            if phase == PHASE_DEBATE:
                await self._set_phase_locked(PHASE_VOTE, 30_000)
            elif phase == PHASE_VOTE:
                # Vote timeout: finalize with whatever votes are in.
                await self._finalize_vote_locked(timeout=True)
            elif phase == PHASE_RESULT:
                # After showing vote results, return to lobby immediately.
                await self._return_to_lobby_after_round_locked()
            elif phase == PHASE_REVEAL:
                # Legacy: keep REVEAL->WAIT for backward compatibility if forced.
                await self._return_to_lobby_after_round_locked()
            elif phase == PHASE_ENDING:
                # Legacy: ENDING->WAIT.
                await self._return_to_lobby_after_round_locked()

    async def _return_to_lobby_after_round_locked(self) -> None:
        """
        Return everyone to lobby after a completed round.
        Keep player seats stable; clear per-round state; optionally auto-advance episode.
        """
        self._room.votes.clear()
        self._room.role_by_client_id.clear()
        self._room.center_roles = []
        self._reset_night_locked()

        if self._room.advance_episode_on_return:
            scenario = self._scenarios.get(self._room.selected_scenario_id or "")
            prev = self._room.selected_episode_id
            nxt = next_episode_id(scenario, self._room.selected_episode_id)
            if nxt:
                self._room.selected_episode_id = nxt
                can_start = scenario_can_start_for_episode(
                    scenario, self._room.connected_player_count(), self._room.selected_episode_id
                )
                await self.broadcast(
                    {
                        "type": "scenario_state",
                        "data": {
                            "selectedScenarioId": self._room.selected_scenario_id,
                            "selectedEpisodeId": self._room.selected_episode_id,
                            "canStart": can_start,
                            "playerCount": self._room.connected_player_count(),
                            "totalConnected": self._room.connected_count(),
                        },
                    }
                )
                await self.broadcast(
                    {
                        "type": "lobby_notice",
                        "data": {
                            "kind": "episode_advanced",
                            "scenarioId": self._room.selected_scenario_id,
                            "fromEpisodeId": prev,
                            "toEpisodeId": nxt,
                        },
                    }
                )
            else:
                await self.broadcast(
                    {
                        "type": "lobby_notice",
                        "data": {
                            "kind": "scenario_ended",
                            "scenarioId": self._room.selected_scenario_id,
                            "episodeId": prev,
                            "title": (scenario or {}).get("title") or self._room.selected_scenario_id or "",
                        },
                    }
                )

        self._room.advance_episode_on_return = True
        await self._set_phase_locked(PHASE_WAIT, None)

    def _reset_night_locked(self) -> None:
        self._room.night_queue = []
        self._room.night_index = 0
        self._room.night_step_ends_at_ms = None
        self._room.night_episode_id = None
        self._room.night_variant_player_count = None
        self._room.night_deck = []
        self._room.night_waiting_host_step_id = None
        self._room.night_waiting_actor_ids.clear()
        self._room.night_done_actor_ids.clear()
        self._room.night_waiting_role_id = None
        self._room.night_ready_ids.clear()

    async def _begin_night_locked(self, *, reason: str) -> None:
        # Called from ROLE phase when everyone is ready (or timeout).
        if self._room.phase != PHASE_ROLE:
            return
        await self._set_phase_locked(PHASE_NIGHT, None)
        await self._broadcast_night_step_locked()

    def _active_players_locked(self) -> list[Player]:
        return [p for p in self._room.players if p.ws is not None and not p.is_spectator]

    def _seat_by_client_id_locked(self, client_id: str) -> int | None:
        for p in self._room.players:
            if p.client_id == client_id:
                return int(p.seat)
        return None

    def _client_id_by_seat_locked(self, seat: int) -> str | None:
        for p in self._room.players:
            if p.ws is None or p.is_spectator:
                continue
            if int(p.seat) == int(seat):
                return p.client_id
        return None

    def _role_action_required_locked(self, role_id: str, actor_ids: list[str]) -> bool:
        rid = (role_id or "").strip()
        if rid in {"seer", "robber", "troublemaker", "drunk"}:
            return True
        if rid == "werewolf":
            # Only lone wolf needs an action (optional center peek).
            return len(actor_ids) == 1
        return False

    async def _send_night_private_locked(self, *, step_id: int, role_id: str, actor_ids: list[str]) -> None:
        rid = (role_id or "").strip()
        if not rid or not actor_ids:
            return

        def _seats(ids: list[str]) -> list[int]:
            out: list[int] = []
            for cid in ids:
                seat = self._seat_by_client_id_locked(cid)
                if seat is not None:
                    out.append(int(seat))
            out.sort()
            return out

        if rid == "minion":
            wolf_ids = [cid for cid, r in self._room.role_by_client_id.items() if r == "werewolf"]
            payload = {"wolfSeats": _seats(wolf_ids)}
        elif rid == "mason":
            mason_ids = [cid for cid, r in self._room.role_by_client_id.items() if r == "mason"]
            payload = {"masonSeats": _seats([cid for cid in mason_ids if cid in actor_ids]) or _seats(mason_ids)}
        elif rid == "werewolf":
            wolf_ids = [cid for cid, r in self._room.role_by_client_id.items() if r == "werewolf"]
            payload = {"wolfSeats": _seats(wolf_ids), "lone": len(wolf_ids) == 1, "canPeekCenter": len(wolf_ids) == 1}
        elif rid == "insomniac":
            # Will also be sent as night_result on action-less step start.
            payload = {"currentRole": self._room.role_by_client_id.get(actor_ids[0], "")}
        else:
            return

        for cid in actor_ids:
            await self._send_to(cid, {"type": "night_private", "data": {"stepId": step_id, "roleId": rid, "payload": payload}})

    async def _maybe_advance_night_locked(self, *, reason: str) -> None:
        if self._room.phase != PHASE_NIGHT:
            return
        # Need host ack for this step, and all required actor actions.
        if self._room.night_waiting_host_step_id is not None:
            return
        if self._room.night_waiting_actor_ids and not self._room.night_waiting_actor_ids.issubset(self._room.night_done_actor_ids):
            return
        await self._advance_night_locked(reason=reason)

    def _build_night_queue_locked(self, *, episode: dict[str, Any], variant: dict[str, Any], player_count: int) -> list[dict[str, Any]]:
        """
        Build a list of step items to play on host during NIGHT.
        Each item: { kind: 'opening'|'role'|'outro', sectionKey: str, roleId?: str }
        """
        narr = (variant.get("narration") or {}) if isinstance(variant.get("narration"), dict) else {}

        opening_count = int(narr.get("openingClipCount") or 0)
        outro_count = int(narr.get("nightOutroClipCount") or 0)
        role_counts = narr.get("roleClipCounts") or {}

        deck = self._room.night_deck or effective_role_deck(variant, player_count)
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

    def _current_night_step_payload_locked(self) -> dict[str, Any] | None:
        if self._room.phase != PHASE_NIGHT:
            return None
        if not self._room.night_queue:
            return None
        if self._room.night_index >= len(self._room.night_queue):
            return None

        item = self._room.night_queue[self._room.night_index]
        kind = str(item.get("kind") or "")
        role_id = str(item.get("roleId") or "")

        active_seats: list[int] = []
        active_client_ids: list[str] = []
        waiting_actor_client_ids: list[str] = []
        requires_action = False
        if kind == "role" and role_id:
            actor_ids = [cid for cid, r in self._room.role_by_client_id.items() if r == role_id]
            active_client_ids = [str(x) for x in actor_ids]
            seats = [self._seat_by_client_id_locked(cid) for cid in actor_ids]
            active_seats = sorted([int(x) for x in seats if x is not None])
            requires_action = self._role_action_required_locked(role_id, actor_ids)
            waiting_actor_client_ids = sorted([str(x) for x in self._room.night_waiting_actor_ids])

        return {
            "type": "night_step",
            "data": {
                "stepId": self._room.night_step_id,
                "kind": item.get("kind"),
                "roleId": item.get("roleId"),
                "activeSeats": active_seats,
                "activeClientIds": active_client_ids,
                "waitingActorClientIds": waiting_actor_client_ids,
                "requiresAction": requires_action,
                "sectionKey": item.get("sectionKey"),
                "scenarioId": self._room.selected_scenario_id or "",
                "episodeId": self._room.night_episode_id,
                "variantPlayerCount": self._room.night_variant_player_count,
                "stepIndex": self._room.night_index + 1,
                "stepCount": len(self._room.night_queue),
                "stepEndsAtMs": self._room.night_step_ends_at_ms,
            },
        }

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
        # Fallback timeout if host doesn't ack (prevents deadlock).
        self._room.night_step_ends_at_ms = _now_ms() + NIGHT_HOST_ACK_TIMEOUT_MS
        self._room.night_waiting_host_step_id = step_id
        self._room.night_waiting_actor_ids.clear()
        self._room.night_done_actor_ids.clear()
        self._room.night_waiting_role_id = str(item.get("roleId") or "") if item.get("kind") == "role" else None

        scenario_id = self._room.selected_scenario_id or ""
        kind = str(item.get("kind") or "")
        role_id = str(item.get("roleId") or "")

        active_seats: list[int] = []
        actor_ids: list[str] = []
        active_client_ids: list[str] = []
        requires_action = False
        if kind == "role" and role_id:
            # Determine actors based on current roles (roles may have swapped earlier).
            actor_ids = [cid for cid, r in self._room.role_by_client_id.items() if r == role_id]
            active_client_ids = [str(x) for x in actor_ids]
            seats = [self._seat_by_client_id_locked(cid) for cid in actor_ids]
            active_seats = sorted([int(x) for x in seats if x is not None])
            requires_action = self._role_action_required_locked(role_id, actor_ids)
            if requires_action and actor_ids:
                # For now, accept only one actor for interactive roles.
                self._room.night_waiting_actor_ids.add(actor_ids[0])
            # Informational private hints.
            await self._send_night_private_locked(step_id=step_id, role_id=role_id, actor_ids=actor_ids)
            # Insomniac reveals current card at its wake step.
            if role_id == "insomniac" and actor_ids:
                await self._send_to(
                    actor_ids[0],
                    {
                        "type": "night_result",
                        "data": {
                            "stepId": step_id,
                            "roleId": "insomniac",
                            "result": {"currentRole": self._room.role_by_client_id.get(actor_ids[0], "")},
                        },
                    },
                )

        payload = {
            "type": "night_step",
            "data": {
                "stepId": step_id,
                "kind": item.get("kind"),
                "roleId": item.get("roleId"),
                "activeSeats": active_seats,
                "activeClientIds": active_client_ids,
                "waitingActorClientIds": sorted([str(x) for x in self._room.night_waiting_actor_ids]),
                "requiresAction": requires_action,
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
        try:
            if self._night_task is not None:
                self._night_task.cancel()
        except Exception:
            pass
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
            # Timeout: skip waiting for host/action and advance.
            self._room.night_waiting_host_step_id = None
            self._room.night_waiting_actor_ids.clear()
            self._room.night_done_actor_ids.clear()
            self._room.night_waiting_role_id = None
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
            # Host ack for the currently broadcast step.
            if self._room.night_waiting_host_step_id == int(step_id):
                self._room.night_waiting_host_step_id = None

            # From this point on, the host narration is done.
            # Do NOT advance immediately based on actor completion; use a fixed action window
            # so the night pacing stays consistent and doesn't reveal who acted.
            if self._room.night_waiting_actor_ids:
                self._room.night_step_ends_at_ms = _now_ms() + NIGHT_ACTION_WINDOW_MS
                try:
                    if self._night_task is not None:
                        self._night_task.cancel()
                except Exception:
                    pass
                self._night_task = asyncio.create_task(self._night_step_timer(step_id, self._room.night_step_ends_at_ms))
                return

            # No interactive action expected: advance immediately after narration finishes.
            self._room.night_step_ends_at_ms = None
            await self._advance_night_locked(reason="ack")

    async def handle_night_action(self, client_id: str, step_id: int, action: dict[str, Any]) -> None:
        async with self._lock:
            if self._room.phase != PHASE_NIGHT:
                return
            if int(step_id) != int(self._room.night_step_id):
                return
            if client_id not in self._room.night_waiting_actor_ids:
                return
            if client_id in self._room.night_done_actor_ids:
                return
            role_id = (self._room.night_waiting_role_id or "").strip()
            if not role_id:
                return

            # Apply action (best-effort; invalid actions are ignored).
            if role_id == "seer":
                mode = str(action.get("mode") or "")
                if mode == "player":
                    seat = int(action.get("seat") or 0)
                    tid = self._client_id_by_seat_locked(seat)
                    if tid:
                        await self._send_to(
                            client_id,
                            {
                                "type": "night_result",
                                "data": {"stepId": step_id, "roleId": "seer", "result": {"seat": seat, "role": self._room.role_by_client_id.get(tid, "")}},
                            },
                        )
                elif mode == "center":
                    idxs = action.get("indices") or []
                    try:
                        idxs = [int(x) for x in list(idxs)][:2]
                    except Exception:
                        idxs = []
                    idxs = [i for i in idxs if 0 <= i <= 2]
                    if len(idxs) == 2 and idxs[0] != idxs[1] and len(self._room.center_roles) >= 3:
                        res = [{"index": i, "role": self._room.center_roles[i]} for i in idxs]
                        await self._send_to(
                            client_id,
                            {"type": "night_result", "data": {"stepId": step_id, "roleId": "seer", "result": {"center": res}}},
                        )
            elif role_id == "robber":
                seat = int(action.get("seat") or 0)
                tid = self._client_id_by_seat_locked(seat)
                if tid and tid != client_id:
                    a = self._room.role_by_client_id.get(client_id)
                    b = self._room.role_by_client_id.get(tid)
                    if a is not None and b is not None:
                        self._room.role_by_client_id[client_id], self._room.role_by_client_id[tid] = b, a
                        await self._send_to(
                            client_id,
                            {"type": "night_result", "data": {"stepId": step_id, "roleId": "robber", "result": {"newRole": b, "targetSeat": seat}}},
                        )
            elif role_id == "troublemaker":
                seats = action.get("seats") or []
                try:
                    seats = [int(x) for x in list(seats)][:2]
                except Exception:
                    seats = []
                if len(seats) == 2 and seats[0] != seats[1]:
                    a_id = self._client_id_by_seat_locked(seats[0])
                    b_id = self._client_id_by_seat_locked(seats[1])
                    if a_id and b_id and a_id != b_id:
                        ra = self._room.role_by_client_id.get(a_id)
                        rb = self._room.role_by_client_id.get(b_id)
                        if ra is not None and rb is not None:
                            self._room.role_by_client_id[a_id], self._room.role_by_client_id[b_id] = rb, ra
                            await self._send_to(
                                client_id,
                                {
                                    "type": "night_result",
                                    "data": {"stepId": step_id, "roleId": "troublemaker", "result": {"swappedSeats": seats}},
                                },
                            )
            elif role_id == "drunk":
                idx = int(action.get("centerIndex") or -1)
                if 0 <= idx <= 2 and len(self._room.center_roles) >= 3:
                    cur = self._room.role_by_client_id.get(client_id)
                    if cur is not None:
                        self._room.role_by_client_id[client_id], self._room.center_roles[idx] = self._room.center_roles[idx], cur
                        await self._send_to(
                            client_id,
                            {"type": "night_result", "data": {"stepId": step_id, "roleId": "drunk", "result": {"swapped": True}}},
                        )
            elif role_id == "werewolf":
                # Lone wolf optional center peek.
                idx = int(action.get("centerIndex") or -1)
                wolf_ids = [cid for cid, r in self._room.role_by_client_id.items() if r == "werewolf"]
                if len(wolf_ids) == 1 and wolf_ids[0] == client_id and 0 <= idx <= 2 and len(self._room.center_roles) >= 3:
                    await self._send_to(
                        client_id,
                        {
                            "type": "night_result",
                            "data": {"stepId": step_id, "roleId": "werewolf", "result": {"centerIndex": idx, "role": self._room.center_roles[idx]}},
                        },
                    )

            self._room.night_done_actor_ids.add(client_id)
            # Intentionally do not advance the night here; host narration pacing drives progression.

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

    async def _broadcast_scenario_state_locked(self) -> None:
        scenario = self._scenarios.get(self._room.selected_scenario_id or "")
        player_count = self._room.connected_player_count()
        can_start = scenario_can_start_for_episode(scenario, player_count, self._room.selected_episode_id)
        await self.broadcast(
            {
                "type": "scenario_state",
                "data": {
                    "selectedScenarioId": self._room.selected_scenario_id,
                    "selectedEpisodeId": self._room.selected_episode_id,
                    "canStart": can_start,
                    "playerCount": player_count,
                    "totalConnected": self._room.connected_count(),
                },
            }
        )

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
                await self._mark_disconnected_locked(cid)

    async def _mark_disconnected_locked(self, client_id: str, *, ws: WebSocket | None = None) -> None:
        """
        Mark a player as temporarily disconnected while keeping their slot/state so they can resume.
        """
        for p in self._room.players:
            if p.client_id != client_id:
                continue
            if ws is not None and p.ws is not ws:
                return
            p.ws = None
            p.disconnected_at_ms = p.disconnected_at_ms or _now_ms()
            return

    async def _remove_player_locked(self, client_id: str) -> None:
        """
        Permanently remove a player from the room (explicit leave).
        """
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
        self._room.night_ready_ids.discard(client_id)
        self._room.night_done_actor_ids.discard(client_id)
        self._room.night_waiting_actor_ids.discard(client_id)
        self._room.role_by_client_id.pop(client_id, None)
        self._room.reseat()

    async def handle_join(self, ws: WebSocket, client_id: str, name: str, avatar: str) -> str:
        async with self._lock:
            client_id = (client_id or "").strip()
            if not client_id:
                raise ValueError("clientId is required")

            name = _safe_name(name)
            nkey = _name_key(name)
            avatar = (avatar or "").strip()
            want_spectator = bool(getattr(ws, "_one_night_spectator", False))

            match_by = "clientId"
            existing = next((p for p in self._room.players if p.client_id == client_id), None)
            if not existing:
                match_by = "name"
                existing = next((p for p in self._room.players if _name_key(p.name) == nkey), None)

            # Block brand-new joins during an active game.
            # Reconnects are allowed (match by clientId or name).
            if not existing and self._room.phase != PHASE_WAIT:
                try:
                    await ws.send_json(
                        {
                            "type": "join_denied",
                            "data": {
                                "reason": "game_in_progress",
                                "phase": self._room.phase,
                            },
                        }
                    )
                except Exception:
                    pass
                try:
                    await ws.close()
                except Exception:
                    pass
                return ""
            if existing:
                prior_ws = existing.ws
                existing.ws = ws
                existing.name = name
                existing.avatar = avatar
                existing.disconnected_at_ms = None
                assigned_client_id = existing.client_id
                if prior_ws is not None and prior_ws is not ws:
                    try:
                        await prior_ws.close()
                    except Exception:
                        pass
            else:
                seat = len(self._room.players) + 1
                # If game already started or room already has 10 active players, extra joins become spectators.
                is_spectator = bool(want_spectator) or (self._room.phase != PHASE_WAIT) or (self._room.connected_player_count() >= 10)
                self._room.players.append(
                    Player(
                        client_id=client_id,
                        name=name,
                        seat=seat,
                        color=_generate_seat_color(seat),
                        avatar=avatar,
                        ws=ws,
                        is_spectator=is_spectator,
                    )
                )
                if self._room.host_client_id is None:
                    self._room.host_client_id = client_id
                assigned_client_id = client_id

            self._room.reseat()

            scenario = self._scenarios.get(self._room.selected_scenario_id or "")
            can_start = scenario_can_start_for_episode(
                scenario, self._room.connected_player_count(), self._room.selected_episode_id
            )

            await ws.send_json(
                {
                    "type": "hello",
                    "serverTimeMs": _now_ms(),
                    "debugEnabled": self._debug_enabled,
                    "assignedClientId": assigned_client_id,
                    "assignedName": name,
                }
            )
            if existing and match_by == "name":
                await ws.send_json(
                    {
                        "type": "lobby_notice",
                        "data": {
                            "kind": "reconnected",
                            "name": name,
                            "replaced": bool(prior_ws is not None and prior_ws is not ws),
                        },
                    }
                )

            # Resume: send role and current night step to reconnected clients.
            if self._room.phase != PHASE_WAIT:
                role_id = self._room.role_by_client_id.get(assigned_client_id, "")
                await ws.send_json({"type": "role_assignment", "data": {"roleId": role_id}})
                # If we're mid-night, send the current step so the client can render the proper UI immediately.
                step_payload = self._current_night_step_payload_locked()
                if step_payload:
                    await ws.send_json(step_payload)
                    # Resend private hints that influence UI (e.g. lone wolf canPeekCenter).
                    step_id = int(self._room.night_step_id or 0)
                    role_on_step = str(step_payload.get("data", {}).get("roleId") or "")
                    if role_on_step:
                        actor_ids = [cid for cid, r in self._room.role_by_client_id.items() if r == role_on_step]
                        await self._send_night_private_locked(step_id=step_id, role_id=role_on_step, actor_ids=actor_ids)
            await ws.send_json({"type": "room_snapshot", "data": self._room.snapshot()})
            await self.broadcast({"type": "host_changed", "data": {"hostClientId": self._room.host_client_id}})
            await self.broadcast(
                {
                    "type": "scenario_state",
                    "data": {
                        "selectedScenarioId": self._room.selected_scenario_id,
                        "selectedEpisodeId": self._room.selected_episode_id,
                        "canStart": can_start,
                        "playerCount": self._room.connected_player_count(),
                        "totalConnected": self._room.connected_count(),
                    },
                }
            )
            await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})
            return assigned_client_id

    async def handle_disconnect(self, ws: WebSocket, client_id: str) -> None:
        async with self._lock:
            # Only disconnect if this websocket is still the current connection for that player.
            await self._mark_disconnected_locked(client_id, ws=ws)
            scenario = self._scenarios.get(self._room.selected_scenario_id or "")
            can_start = scenario_can_start_for_episode(
                scenario, self._room.connected_player_count(), self._room.selected_episode_id
            )
            await self.broadcast({"type": "host_changed", "data": {"hostClientId": self._room.host_client_id}})
            await self.broadcast(
                {
                    "type": "scenario_state",
                    "data": {
                        "selectedScenarioId": self._room.selected_scenario_id,
                        "selectedEpisodeId": self._room.selected_episode_id,
                        "canStart": can_start,
                        "playerCount": self._room.connected_player_count(),
                        "totalConnected": self._room.connected_count(),
                    },
                }
            )
            await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})

    async def handle_leave(self, ws: WebSocket, client_id: str) -> None:
        async with self._lock:
            # Treat as a real leave only if this websocket is the active one for the player.
            p = next((x for x in self._room.players if x.client_id == client_id), None)
            if not p or p.ws is not ws:
                return
            was_host = client_id == self._room.host_client_id
            was_in_game = self._room.phase != PHASE_WAIT
            if was_host and was_in_game:
                await self._abort_game_locked(reason="host_left")
            await self._remove_player_locked(client_id)
            scenario = self._scenarios.get(self._room.selected_scenario_id or "")
            can_start = scenario_can_start_for_episode(
                scenario, self._room.connected_player_count(), self._room.selected_episode_id
            )
            await self.broadcast({"type": "host_changed", "data": {"hostClientId": self._room.host_client_id}})
            await self.broadcast(
                {
                    "type": "scenario_state",
                    "data": {
                        "selectedScenarioId": self._room.selected_scenario_id,
                        "selectedEpisodeId": self._room.selected_episode_id,
                        "canStart": can_start,
                        "playerCount": self._room.connected_player_count(),
                        "totalConnected": self._room.connected_count(),
                    },
                }
            )
            await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})

    async def handle_scenario_select(self, client_id: str, scenario_id: str) -> None:
        async with self._lock:
            if client_id != self._room.host_client_id:
                return
            if self._room.phase != PHASE_WAIT:
                return
            scenario_id = (scenario_id or "").strip()
            if scenario_id not in self._scenarios:
                return
            self._room.selected_scenario_id = scenario_id
            self._room.selected_episode_id = first_episode_id(self._scenarios.get(scenario_id))

            scenario = self._scenarios.get(scenario_id)
            can_start = scenario_can_start_for_episode(
                scenario, self._room.connected_player_count(), self._room.selected_episode_id
            )
            await self.broadcast(
                {
                    "type": "scenario_state",
                    "data": {
                        "selectedScenarioId": self._room.selected_scenario_id,
                        "selectedEpisodeId": self._room.selected_episode_id,
                        "canStart": can_start,
                        "playerCount": self._room.connected_player_count(),
                        "totalConnected": self._room.connected_count(),
                    },
                }
            )
            await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})

    async def handle_episode_select(self, client_id: str, episode_id: str) -> None:
        async with self._lock:
            if client_id != self._room.host_client_id:
                return
            if self._room.phase != PHASE_WAIT:
                return
            scenario = self._scenarios.get(self._room.selected_scenario_id or "")
            if not scenario:
                return
            episode_id = (episode_id or "").strip()
            if not episode_id:
                return
            if not find_episode_by_id(scenario, episode_id):
                return
            self._room.selected_episode_id = episode_id
            can_start = scenario_can_start_for_episode(
                scenario, self._room.connected_player_count(), self._room.selected_episode_id
            )
            await self.broadcast(
                {
                    "type": "scenario_state",
                    "data": {
                        "selectedScenarioId": self._room.selected_scenario_id,
                        "selectedEpisodeId": self._room.selected_episode_id,
                        "canStart": can_start,
                        "playerCount": self._room.connected_player_count(),
                        "totalConnected": self._room.connected_count(),
                    },
                }
            )
            await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})

    async def _assign_roles_locked(self, *, scenario: dict[str, Any], player_count: int) -> bool:
        episodes = scenario.get("episodes") or []
        if not episodes:
            return False
        ep = find_episode_by_id(scenario, self._room.selected_episode_id) or (episodes[0] or {})
        variant = select_variant_for_player_count(ep, player_count)
        if not variant:
            return False
        deck = select_role_deck_for_game(variant, player_count)
        if len(deck) < player_count + 3:
            return False
        self._room.night_deck = list(deck)
        random.shuffle(deck)
        player_ids = [p.client_id for p in self._room.players if p.ws is not None and not p.is_spectator]
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
                await self._send_to(
                    client_id,
                    {
                        "type": "lobby_notice",
                        "data": {
                            "kind": "start_blocked",
                            "reason": "not_host",
                            "hostClientId": self._room.host_client_id,
                        },
                    },
                )
                return
            if self._room.phase != PHASE_WAIT:
                return
            scenario = self._scenarios.get(self._room.selected_scenario_id or "")
            if not scenario or not (self._room.selected_scenario_id or "").strip():
                await self._send_to(
                    client_id,
                    {"type": "lobby_notice", "data": {"kind": "start_blocked", "reason": "no_scenario"}},
                )
                return
            if not scenario_can_start_for_episode(
                scenario, self._room.connected_player_count(), self._room.selected_episode_id
            ):
                await self._send_to(
                    client_id,
                    {
                        "type": "lobby_notice",
                        "data": {
                            "kind": "start_blocked",
                            "reason": "cannot_start",
                            "scenarioId": self._room.selected_scenario_id,
                            "episodeId": self._room.selected_episode_id,
                            "playerCount": self._room.connected_player_count(),
                        },
                    },
                )
                return
            self._room.votes.clear()
            self._room.advance_episode_on_return = True
            # Assign roles and start night sequencer.
            ok = await self._assign_roles_locked(scenario=scenario, player_count=self._room.connected_player_count())
            if not ok:
                scenario_id = self._room.selected_scenario_id
                episode_id = self._room.selected_episode_id
                pc = self._room.connected_player_count()
                await self._send_to(
                    client_id,
                    {
                        "type": "lobby_notice",
                        "data": {
                            "kind": "start_blocked",
                            "reason": "assign_failed",
                            "scenarioId": scenario_id,
                            "episodeId": episode_id,
                            "playerCount": pc,
                        },
                    },
                )
                return
            self._room.night_ready_ids.clear()

            active_ids = {p.client_id for p in self._room.players if p.ws is not None and not p.is_spectator}
            for p in self._room.players:
                if p.ws is None:
                    continue
                if p.client_id in active_ids:
                    role_id = self._room.role_by_client_id.get(p.client_id, "")
                    await self._send_to(p.client_id, {"type": "role_assignment", "data": {"roleId": role_id}})
                else:
                    await self._send_to(p.client_id, {"type": "role_assignment", "data": {"roleId": ""}})

            # Give everyone time to read their role; night begins after all confirm (or timeout).
            await self._set_phase_locked(PHASE_ROLE, 90_000)

    async def handle_end_game(self, client_id: str) -> None:
        async with self._lock:
            if client_id != self._room.host_client_id:
                return
            if self._room.phase == PHASE_WAIT:
                # Still allow "end" to hard-reset in lobby.
                await self._abort_game_locked(reason="host_end_from_wait")
                return
            await self._abort_game_locked(reason="host_end")

    async def handle_night_ready(self, client_id: str) -> None:
        async with self._lock:
            if self._room.phase != PHASE_ROLE:
                return
            p = next((x for x in self._room.players if x.client_id == client_id and x.ws is not None), None)
            if not p or p.is_spectator:
                return
            self._room.night_ready_ids.add(client_id)

            active_ids = {x.client_id for x in self._active_players_locked()}
            if active_ids and self._room.night_ready_ids.issuperset(active_ids):
                await self._begin_night_locked(reason="all_ready")

    async def handle_submit_vote(self, client_id: str, target_seat: int) -> None:
        async with self._lock:
            if self._room.phase not in (PHASE_VOTE, PHASE_DEBATE):
                return
            connected_ids = {p.client_id for p in self._room.players if p.ws is not None and not p.is_spectator}
            if client_id not in connected_ids:
                return
            self._room.votes[client_id] = int(target_seat)

            if len(self._room.votes) < len(connected_ids):
                await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})
                return
            await self._finalize_vote_locked(timeout=False)

    async def handle_result_done(self, client_id: str) -> None:
        """
        Host can dismiss the RESULT screen early and return everyone to lobby.
        """
        async with self._lock:
            if client_id != self._room.host_client_id:
                return
            if self._room.phase != PHASE_RESULT:
                return
            await self._return_to_lobby_after_round_locked()

    async def handle_reroll(self, client_id: str) -> None:
        async with self._lock:
            # 1. Find player
            player = next((p for p in self._room.players if p.client_id == client_id), None)
            if not player:
                return
            
            # 2. Pick new random color
            current_color = player.color
            used_colors = {p.color for p in self._room.players if p.client_id != client_id}
            available = [c for c in COLOR_PALETTE if c not in used_colors and c != current_color]
            
            if not available:
                 # If all taken, just pick any other color than current
                available = [c for c in COLOR_PALETTE if c != current_color]

            if available:
                player.color = random.choice(available)
                await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})

    async def _finalize_vote_locked(self, *, timeout: bool) -> None:
        connected_ids = {p.client_id for p in self._room.players if p.ws is not None and not p.is_spectator}
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

            if action == "ui_preview":
                # Broadcast a client-side UI preview command for development.
                # data: { target: "all"|"seats"|"clients", seats?: [int], clientIds?: [str], includeHost?: bool, ui: { name: str, args?: list } }
                ui = data.get("ui") or {}
                ui_name = (ui.get("name") or "").strip()
                ui_args = ui.get("args") or []
                if not ui_name:
                    return

                include_host = bool(data.get("includeHost", True))
                target = (data.get("target") or "all").strip().lower()
                seats = [int(x) for x in (data.get("seats") or []) if str(x).isdigit()]
                client_ids = [(str(x) or "").strip() for x in (data.get("clientIds") or []) if (str(x) or "").strip()]

                targets: set[str] = set()
                if target == "seats" and seats:
                    seat_set = set(seats)
                    for p in self._room.players:
                        if p.seat in seat_set and p.ws is not None:
                            targets.add(p.client_id)
                elif target == "clients" and client_ids:
                    targets.update(client_ids)
                else:
                    # all
                    for p in self._room.players:
                        if p.ws is not None:
                            targets.add(p.client_id)

                if not include_host and self._room.host_client_id:
                    targets.discard(self._room.host_client_id)

                payload = {"type": "ui_preview", "data": {"ui": {"name": ui_name, "args": ui_args}}}
                for tid in targets:
                    await self._send_to(tid, payload)
                return

            if action == "unlock_scenario":
                sid = (data.get("scenarioId") or "").strip()
                if sid in self._scenarios:
                    self._room.selected_scenario_id = sid
                    self._room.selected_episode_id = first_episode_id(self._scenarios.get(sid))
            elif action == "set_phase":
                phase = (data.get("phase") or "").strip().upper()
                duration_sec = int(data.get("durationSec") or 30)
                if phase in {
                    PHASE_WAIT,
                    PHASE_ROLE,
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
            can_start = scenario_can_start_for_episode(
                scenario, self._room.connected_player_count(), self._room.selected_episode_id
            )
            await self.broadcast(
                {
                    "type": "scenario_state",
                    "data": {
                        "selectedScenarioId": self._room.selected_scenario_id,
                        "selectedEpisodeId": self._room.selected_episode_id,
                        "canStart": can_start,
                        "playerCount": self._room.connected_player_count(),
                        "totalConnected": self._room.connected_count(),
                    },
                }
            )
            await self.broadcast({"type": "phase_changed", "data": {"phase": self._room.phase, "phaseEndsAtMs": self._room.phase_ends_at_ms}})
            await self.broadcast({"type": "room_snapshot", "data": self._room.snapshot()})


game = GameServer()


app = FastAPI()


@app.on_event("startup")
async def _startup() -> None:
    game.start_background_tasks()


@app.get("/api/scenarios")
def api_scenarios() -> JSONResponse:
    return JSONResponse(game.scenario_list())


@app.get("/api/scenarios/{scenario_id}")
def api_scenario(scenario_id: str) -> JSONResponse:
    s = game.scenario_get(scenario_id)
    if not s:
        return JSONResponse({"error": "not_found"}, status_code=404)
    return JSONResponse(s)


@app.get("/api/scenarios/{scenario_id}/tts")
def api_scenario_tts(scenario_id: str, playerCount: int | None = None) -> JSONResponse:
    s = game.scenario_get(scenario_id)
    if not s:
        return JSONResponse({"error": "not_found"}, status_code=404)
    tts = load_scenario_tts(s, playerCount)
    if not tts:
        return JSONResponse({"error": "tts_not_found"}, status_code=404)
    return JSONResponse(tts)


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
                avatar = str(data.get("avatar") or "")
                setattr(ws, "_one_night_spectator", bool(data.get("spectator") or False))
                client_id = await game.handle_join(ws, client_id, name, avatar)
            elif t == "scenario_select":
                await game.handle_scenario_select(client_id, str(data.get("scenarioId") or ""))
            elif t == "episode_select":
                await game.handle_episode_select(client_id, str(data.get("episodeId") or ""))
            elif t == "start_game":
                await game.handle_start_game(client_id)
            elif t == "reroll":
                await game.handle_reroll(client_id)
            elif t == "submit_vote":
                await game.handle_submit_vote(client_id, int(data.get("targetSeat") or 0))
            elif t == "result_done":
                await game.handle_result_done(client_id)
            elif t == "night_step_done":
                await game.handle_night_step_done(client_id, int(data.get("stepId") or 0))
            elif t == "night_action":
                await game.handle_night_action(client_id, int(data.get("stepId") or 0), dict(data.get("action") or {}))
            elif t == "night_ready":
                await game.handle_night_ready(client_id)
            elif t == "end_game":
                await game.handle_end_game(client_id)
            elif t == "debug":
                await game.handle_debug(client_id, str(data.get("action") or ""), dict(data.get("data") or {}))
            elif t == "leave":
                if client_id:
                    await game.handle_leave(ws, client_id)
                    break
    except WebSocketDisconnect:
        if client_id:
            await game.handle_disconnect(ws, client_id)
    except Exception:
        if client_id:
            await game.handle_disconnect(ws, client_id)


if PUBLIC_DIR.exists():
    # Mount static last so /api and /ws win.
    app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
