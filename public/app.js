/* global speechSynthesis */

const qs = (sel) => document.querySelector(sel);
const CardUI = window.CardUI || null;
const ButtonUI = window.ButtonUI || null;
const NightBoardUI = window.NightBoardUI || null;

const APP_BASE_PATH = (() => {
  try {
    return new URL(".", window.location.href).pathname;
  } catch (e) {
    return "/";
  }
})();

function toAppPath(path) {
  const raw = String(path || "");
  if (/^https?:\/\//i.test(raw) || /^wss?:\/\//i.test(raw)) return raw;
  const rel = raw.startsWith("/") ? raw.slice(1) : raw;
  return `${APP_BASE_PATH}${rel}`;
}

let viewportFixInstalled = false;
let viewportRaf = 0;

function updateAppViewportVars() {
  const vv = window.visualViewport;
  const height = Math.max(1, Math.floor(vv?.height || window.innerHeight || 0));
  const width = Math.max(1, Math.floor(vv?.width || window.innerWidth || 0));
  const top = Math.max(0, Math.floor(vv?.offsetTop || 0));
  const left = Math.max(0, Math.floor(vv?.offsetLeft || 0));
  document.documentElement.style.setProperty("--app-height", `${height}px`);
  document.documentElement.style.setProperty("--app-width", `${width}px`);
  document.documentElement.style.setProperty("--vv-top", `${top}px`);
  document.documentElement.style.setProperty("--vv-left", `${left}px`);
}

function scheduleAppViewportVars() {
  if (viewportRaf) return;
  viewportRaf = requestAnimationFrame(() => {
    viewportRaf = 0;
    updateAppViewportVars();
  });
}

function installViewportFix() {
  if (viewportFixInstalled) return;
  viewportFixInstalled = true;

  scheduleAppViewportVars();
  window.addEventListener("resize", scheduleAppViewportVars, { passive: true });
  window.addEventListener("orientationchange", scheduleAppViewportVars, { passive: true });
  window.addEventListener("focus", scheduleAppViewportVars, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleAppViewportVars, { passive: true });
    window.visualViewport.addEventListener("scroll", scheduleAppViewportVars, { passive: true });
  }
}

const joinEl = qs("#join");
const roomEl = qs("#room");
const gridEl = qs("#grid");
const joinBtn = qs("#joinBtn");
const nameInput = qs("#nameInput");
const avatarPreview = qs("#avatarPreview");
const avatarBtn = qs("#avatarBtn");
const rerollBtn = qs("#rerollBtn");
const scenarioBtn = qs("#scenarioBtn");
const startBtn = qs("#startBtn");
const voteBtn = qs("#voteBtn");
const leaveBtn = qs("#leaveBtn");
const waitForActionsBtn = qs("#waitForActionsBtn");
const connDot = qs("#connDot");
const phaseLabel = qs("#phaseLabel");
const scenarioLabel = qs("#scenarioLabel");
const timerEl = qs("#timer");
const hostEndBtn = qs("#hostEndBtn");
const roleStripEl = qs("#roleStrip");
const infoDeckEl = qs("#infoDeck");
const deckIndicatorsEl = qs("#deckIndicators");

const scenarioModal = qs("#scenarioModal");
const scenarioListEl = qs("#scenarioList");
const scenarioBackdrop = qs("#scenarioBackdrop");
const scenarioClose = qs("#scenarioClose");
const episodePickerEl = qs("#episodePicker");
const episodeBackBtn = qs("#episodeBack");
const episodeListEl = qs("#episodeList");
const episodePickerTitleEl = qs("#episodePickerTitle");

const voteModal = qs("#voteModal");
const voteGridEl = qs("#voteGrid");
const voteBackdrop = qs("#voteBackdrop");
const voteClose = qs("#voteClose");

const voteResultModal = qs("#voteResultModal");
const voteResultWinnersEl = qs("#voteResultWinners");
const voteResultGridEl = qs("#voteResultGrid");
const voteResultTitleEl = qs("#voteResultTitle");
const voteResultSubtitleEl = qs("#voteResultSubtitle");
const voteResultBackdrop = qs("#voteResultBackdrop");
const voteResultClose = qs("#voteResultClose");

const lobbyNoticeModal = qs("#lobbyNoticeModal");
const lobbyNoticeBackdrop = qs("#lobbyNoticeBackdrop");
const lobbyNoticeClose = qs("#lobbyNoticeClose");
const lobbyNoticeTitleEl = qs("#lobbyNoticeTitle");
const lobbyNoticeSubtitleEl = qs("#lobbyNoticeSubtitle");
const lobbyNoticeBodyEl = qs("#lobbyNoticeBody");

const nightOverlay = qs("#nightOverlay");
const nightTitle = qs("#nightTitle");
const nightRole = qs("#nightRole");
const nightHint = qs("#nightHint");
const nightBody = qs("#nightBody");
const nightActive = qs("#nightActive");
const nightPrivate = qs("#nightPrivate");
const nightAction = qs("#nightAction");

const roleOverlay = qs("#roleOverlay");
const roleTitle = qs("#roleTitle");
const roleName = qs("#roleName");
const roleDesc = qs("#roleDesc");
const roleProfile = qs("#roleProfile");
const roleAction = qs("#roleAction");
const roleActionText = qs("#roleActionText");
const eyesClosedBtn = qs("#eyesClosedBtn");

const url = new URL(window.location.href);
const debugClientId = url.searchParams.get("debugClientId") || "";
const debugName = url.searchParams.get("debugName") || "";
const keepAwakeAudioParam = url.searchParams.get("keepAwakeAudio") || "";
const keepAwakeVideoParam = url.searchParams.get("keepAwakeVideo") || "";
const CLIENT_INSTANCE_ID = (() => {
  try {
    return crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch (e) {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
})();
const CLIENT_ID_ANNOUNCE_KEY = "one-night:client_id_announce";
const CLIENT_ID_CHANNEL = "one-night:client_id_channel";
let _clientIdGuard = null;

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getClientId() {
  if (debugClientId) return debugClientId;
  const key = "clientId";
  let v = sessionStorage.getItem(key);
  if (!v) {
    v = uuid();
    sessionStorage.setItem(key, v);
  }
  return v;
}

function installClientIdCollisionGuard() {
  if (_clientIdGuard) return _clientIdGuard;

  const peers = new Map(); // instanceId -> clientId
  const listeners = new Set();
  let bc = null;
  const post = (payload) => {
    try {
      bc?.postMessage?.(payload);
    } catch (e) {
      // ignore
    }
    try {
      localStorage.setItem(CLIENT_ID_ANNOUNCE_KEY, JSON.stringify(payload));
    } catch (e) {
      // ignore
    }
  };

  const notify = (payload) => {
    for (const fn of listeners) {
      try {
        fn(payload);
      } catch (e) {
        // ignore
      }
    }
  };

  const handleIncoming = (payload) => {
    if (!payload || typeof payload !== "object") return;
    const kind = String(payload.kind || "ping");
    const to = String(payload.to || "");
    const instanceId = String(payload.instanceId || "");
    const clientId = String(payload.clientId || "");
    if (!instanceId || !clientId) return;
    if (to && to !== CLIENT_INSTANCE_ID) return;
    if (instanceId === CLIENT_INSTANCE_ID) return;
    peers.set(instanceId, clientId);
    notify({ instanceId, clientId, ts: Number(payload.ts || 0) });
    if (kind === "ping") {
      post({ kind: "pong", clientId: getClientId(), instanceId: CLIENT_INSTANCE_ID, to: instanceId, ts: Date.now() });
    }
  };

  try {
    if ("BroadcastChannel" in window) {
      bc = new BroadcastChannel(CLIENT_ID_CHANNEL);
      bc.addEventListener("message", (ev) => handleIncoming(ev?.data));
    }
  } catch (e) {
    bc = null;
  }

  const onStorage = (ev) => {
    if (ev.key !== CLIENT_ID_ANNOUNCE_KEY) return;
    if (!ev.newValue) return;
    try {
      handleIncoming(JSON.parse(ev.newValue));
    } catch (e) {
      // ignore
    }
  };
  window.addEventListener("storage", onStorage);

  const announce = (clientId) => {
    post({ kind: "ping", clientId: String(clientId || ""), instanceId: CLIENT_INSTANCE_ID, ts: Date.now() });
  };

  _clientIdGuard = {
    peers,
    announce,
    on: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  return _clientIdGuard;
}

async function ensureUniqueClientId() {
  if (debugClientId) return state.clientId;
  if (state.clientIdLocked) return state.clientId;
  if (state.room) return state.clientId;

  const guard = installClientIdCollisionGuard();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = state.clientId;
    guard.announce(current);
    // Give other tabs a brief window to reply (duplicate-tab copies sessionStorage).
    // eslint-disable-next-line no-await-in-loop
    await wait(140);

    const collisions = [];
    for (const [instanceId, clientId] of guard.peers.entries()) {
      if (clientId === current) collisions.push(instanceId);
    }
    if (!collisions.length) return current;

    const winner = [CLIENT_INSTANCE_ID, ...collisions].sort()[0];
    if (winner === CLIENT_INSTANCE_ID) return current;

    const next = uuid();
    sessionStorage.setItem("clientId", next);
    state.clientId = next;
    guard.announce(next);
  }

  return state.clientId;
}

function getSavedName() {
  if (debugName) return debugName;
  return localStorage.getItem("playerName") || "";
}

function setSavedName(name) {
  localStorage.setItem("playerName", name);
}

// AVATARS removed in favor of random generation from unicode ranges


const ROLE_DEFINITIONS = {
  // --- Basic ---
  werewolf: { icon: "🐺", name: "늑대인간", desc: "밤에 눈을 떠 동료를 확인합니다. 혼자라면 중앙 카드 1장을 확인합니다." },
  minion: { icon: "😈", name: "하수인", desc: "늑대인간이 누구인지 알지만, 늑대인간은 하수인을 모릅니다. 늑대인간을 도우세요." },
  mason: { icon: "👭🏻", name: "프리메이슨", desc: "밤에 눈을 떠 다른 프리메이슨을 확인합니다." },
  seer: { icon: "🔮", name: "예언자", desc: "다른 사람의 카드 1장 또는 중앙 카드 2장을 확인합니다." },
  robber: { icon: "💰", name: "강도", desc: "다른 사람의 카드를 자신과 교환하고, 가져온 카드를 확인합니다." },
  troublemaker: { icon: "🥳", name: "문제아", desc: "다른 두 사람의 카드를 서로 바꿉니다 (자신은 확인 불가)." },
  drunk: { icon: "🍺", name: "주정뱅이", desc: "중앙 카드 1장과 자신의 카드를 바꿉니다 (바꾼 카드는 확인 불가)." },
  insomniac: { icon: "🥱", name: "불면증", desc: "밤이 끝날 때 자신의 카드를 다시 확인합니다." },
  villager: { icon: "👶", name: "마을주민", desc: "특별한 능력이 없습니다. 누구보다 열심히 추리하세요." },
  hunter: { icon: "🤠", name: "사냥꾼", desc: "투표로 죽게 되면, 자신이 지목한 대상을 길동무로 데려갑니다." },
  tanner: { icon: "🤡", name: "무두장이", desc: "투표로 죽는 것이 승리 조건입니다." },

  // --- Daybreak ---
  sentinel: { icon: "🛡️", name: "파수꾼", desc: "플레이어 한 명에게 방패 토큰을 줍니다. 방패를 받은 사람은 카드가 바뀌거나 확인되지 않습니다." },
  alpha_wolf: { icon: "🦊", name: "알파 늑대", desc: "늑대인간 차례에 중앙에 있는 늑대 카드를 누군가와 교환합니다." },
  mystic_wolf: { icon: "🦝", name: "신비한 늑대", desc: "늑대인간 차례에 다른 사람의 카드를 확인합니다." },
  apprentice_seer: { icon: "🎓", name: "견습 예언자", desc: "중앙 카드 1장을 확인합니다." },
  paranormal_investigator: { icon: "🕵️", name: "초현상 수사관", desc: "다른 사람 1명의 카드를 봅니다. 늑대인간이라면 자신도 늑대인간이 됩니다." },
  witch: { icon: "🧙‍♀️", name: "마녀", desc: "중앙 카드 1장을 확인하고, 그 카드를 누군가의 카드와 바꿀 수 있습니다." },
  village_idiot: { icon: "🤪", name: "마을 바보", desc: "모든 카드를 왼쪽/오른쪽으로 한 칸씩 이동시킵니다." },
  revealer: { icon: "📸", name: "폭로자", desc: "누군가의 카드를 확인합니다. 늑대인간이라면 카드를 공개 상태로 뒤집어 둡니다." },
  curator: { icon: "🏺", name: "큐레이터", desc: "누군가의 카드 위에 유물 토큰을 올려 능력을 변질시킵니다." },
  bodyguard: { icon: "💪", name: "경호원", desc: "투표 결과 자신이 지목한 사람이 죽게 된다면, 대신 자신이 죽습니다." },
  dream_wolf: { icon: "💤", name: "꿈 늑대", desc: "늑대인간이지만 밤에 눈을 뜨지 않습니다 (다른 늑대들은 당신을 압니다)." },

  // --- Vampire ---
  vampire: { icon: "🧛", name: "뱀파이어", desc: "밤에 눈을 떠 뱀파이어끼리 확인합니다. 투표 시 가장 많이 지목된 사람이 1표라도 받으면 승리합니다." },
  count: { icon: "🏰", name: "백작", desc: "밤에 깨어나 '두려움' 토큰을 누군가에게 줍니다." },
  renfield: { icon: "🦇", name: "렌필드", desc: "뱀파이어가 누구인지 알지만, 뱀파이어는 당신을 모릅니다." },
  marksman: { icon: "🎯", name: "명사수", desc: "다른 사람의 카드를 확인하거나, 다른 두 사람의 카드를 서로 확인시킵니다." },
  pickpocket: { icon: "🤏", name: "소매치기", desc: "자신의 카드를 다른 사람과 바꿉니다 (확인 불가)." },
  gremlin: { icon: "👾", name: "그렘린", desc: "원하는 두 사람의 카드를 바꿉니다 (자신의 카드 포함 가능)." },
  assassin: { icon: "🗡️", name: "암살자", desc: "지목한 사람이 특정 역할(가장 많이 투표받은 사람 등)이라면 승리합니다." },

  // --- Bonus / Epic ---
  doppelganger: { icon: "🎭", name: "도플갱어", desc: "다른 사람의 카드를 보고 그 역할의 능력을 복사하여 사용합니다." },
  copycat: { icon: "🐱", name: "카피캣", desc: "중앙 카드를 보고 그 역할을 복사합니다." },
  thing: { icon: "🦠", name: "더 씽", desc: "이웃한 플레이어를 '감염'시킵니다." },
};

function getRandomAvatar() {
  const ranges = [
    [0x1F600, 0x1F64F], // Emoticons
    [0x1F300, 0x1F5FF], // Misc Symbols and Pictographs
    [0x1F680, 0x1F6FF], // Transport and Map
    [0x1F900, 0x1F9FF], // Supplemental Symbols and Pictographs
    [0x2600, 0x26FF],   // Misc Symbols
    [0x2700, 0x27BF]    // Dingbats
  ];
  const range = ranges[Math.floor(Math.random() * ranges.length)];
  const codePoint = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
  return String.fromCodePoint(codePoint);
}

function getRoleDisplayName(roleId) {
  if (!roleId) return "";
  const sid = state.room?.selectedScenarioId;
  const scenario = state.scenarioById[sid];
  const alias = scenario?.roleAliases?.[roleId];
  const def = ROLE_DEFINITIONS[roleId];
  return alias || (def ? def.name : roleId);
}

function getSavedAvatar() {
  return localStorage.getItem("playerAvatar") || getRandomAvatar();
}

function setSavedAvatar(avatar) {
  localStorage.setItem("playerAvatar", avatar);
}

const state = {
  clientId: getClientId(),
  name: getSavedName(),
  avatar: getSavedAvatar(),
  ws: null,
  connected: false,
  debugEnabled: false,
  room: null,
  scenarios: [],
  scenarioById: {},
  scenarioTtsByKey: {},
  scenarioState: null,
  tickTimer: null,
  lastNarrationKey: "",
  myRoleId: "",
  mySeat: 0,
  isSpectator: false,
  nightStep: null,
  nightPrivate: null,
  nightResult: null,
  nightUi: null,
  nightSubmittedStepId: null,
  lastNightAction: null,
  roleReady: false,
  lastNightStepId: 0,
  voteResultPublic: null,
  lobbyNotice: null,
  lastLobbyNoticeKey: "",
  bgm: createBgmEngine(),
  narration: createNarrationEngine(),
  keepAwakeAudio: createKeepAwakeAudioEngine(),
  keepAwakeAudioEnabled: localStorage.getItem("keepAwakeAudioEnabled") === "1",
  keepAwakeVideo: createKeepAwakeVideoEngine(),
  keepAwakeVideoEnabled: localStorage.getItem("keepAwakeVideoEnabled") === "1",
  ttsPrimed: false,
  debugRolePreview: false,
  debugNightPreview: false,
  debugSeedClientIds: [],
  nightOrbitCleanup: null,
  nightSeerBoard: null,
  nightRobberBoard: null,
  nightTroublemakerBoard: null,
  nightDrunkBoard: null,
  nightWerewolfBoard: null,
  seatMarks: {},
  voicePlayerCountOverride: {},
  debugRoleBySeat: {},
  debugRoleByCenter: {},
  nightPreview: { active: false },
  lastNightResultApplyKey: "",
  clientIdLocked: false,
};

const scenarioDetailInflight = new Set();
const scenarioTtsInflight = new Set();

const episodePickerState = {
  scenarioId: "",
};

nameInput.value = state.name;

function setBgGradient(phase) {
  const map = {
    WAIT: "var(--grad-wait)",
    ROLE: "var(--grad-night)",
    NIGHT: "var(--grad-night)",
    DEBATE: "var(--grad-debate)",
    VOTE: "var(--grad-vote)",
    RESULT: "var(--grad-result)",
    REVEAL: "var(--grad-reveal)",
    ENDING: "var(--grad-ending)",
  };
  const g = map[phase] || map.WAIT;
  const dur = phase === "NIGHT" ? "22s" : "18s";
  document.body.style.backgroundImage = g;
  document.body.style.animationDuration = dur;
  // iOS can sometimes flatten body background; mirror it on the fixed #app root.
  const appRoot = document.getElementById("app");
  if (appRoot) {
    appRoot.style.backgroundImage = g;
    appRoot.style.animationDuration = dur;
  }
}

function setConn(ok) {
  state.connected = ok;
  connDot.style.background = ok ? "rgba(34,197,94,.9)" : "rgba(255,255,255,.25)";
  connDot.style.boxShadow = ok
    ? "0 0 0 2px rgba(34,197,94,.16), 0 0 14px rgba(34,197,94,.28)"
    : "0 0 0 2px rgba(255,255,255,.08)";
}

function isHost() {
  return state.room?.hostClientId && state.room.hostClientId === state.clientId;
}

function setPhase(phase, endsAtMs) {
  phaseLabel.textContent = phase || "WAIT";
  setBgGradient(phase || "WAIT");
  document.body.dataset.phase = phase || "WAIT";
  state.room = state.room || {};
  state.room.phase = phase;
  state.room.phaseEndsAtMs = endsAtMs ?? null;
  if (state.tickTimer) clearInterval(state.tickTimer);
  state.tickTimer = setInterval(renderTimer, 200);
  renderTimer();
  syncWakeLock().catch(() => {});
  syncHostBgmForPhase(phase).catch(() => {});
}

let wakeLockSentinel = null;

function shouldKeepScreenAwake(phase) {
  const p = String(phase || "").toUpperCase();
  if (p === "WAIT") return !!state.room && isHost();
  return ["ROLE", "NIGHT", "DEBATE", "VOTE", "RESULT", "REVEAL"].includes(p);
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return false;
  if (document.visibilityState !== "visible") return false;
  if (wakeLockSentinel) return true;
  try {
    // Screen Wake Lock API (supported on Chromium/Android).
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener(
      "release",
      () => {
        wakeLockSentinel = null;
      },
      { once: true }
    );
    return true;
  } catch (e) {
    wakeLockSentinel = null;
    return false;
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLockSentinel) await wakeLockSentinel.release();
  } catch (e) {
    // ignore
  } finally {
    wakeLockSentinel = null;
  }
}

async function syncWakeLock() {
  const phase = state.room?.phase || "WAIT";
  if (!shouldKeepScreenAwake(phase)) {
    await releaseWakeLock();
    await state.keepAwakeAudio.stop();
    await state.keepAwakeVideo?.stop?.();
    return;
  }
  const ok = await requestWakeLock();
  if (ok) {
    await state.keepAwakeAudio.stop();
    await state.keepAwakeVideo?.stop?.();
    return;
  }
  // Wake Lock unsupported/failed: optionally fall back to silent video/audio "keep alive" tricks.
  if (state.keepAwakeVideoEnabled && state.keepAwakeVideo?.start) {
    const started = await state.keepAwakeVideo.start();
    if (started) {
      await state.keepAwakeAudio.stop();
      return;
    }
  }
  if (!state.keepAwakeAudioEnabled) return;
  await state.keepAwakeAudio.start();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    syncWakeLock().catch(() => {});
  } else {
    releaseWakeLock().catch(() => {});
  }
});
window.addEventListener("pagehide", () => releaseWakeLock().catch(() => {}));

function renderTimer() {
  const ends = state.room?.phaseEndsAtMs;
  if (!ends) {
    timerEl.textContent = "--:--";
    return;
  }
  const ms = Math.max(0, ends - Date.now());
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  timerEl.textContent = `${mm}:${ss}`;
}

function showJoin() {
  joinEl.classList.remove("hidden");
  roomEl.classList.add("hidden");
  qs(".topbar").classList.add("hidden");
}

function showRoom() {
  joinEl.classList.add("hidden");
  roomEl.classList.remove("hidden");
  qs(".topbar").classList.remove("hidden");
}

function openModal(el) {
  el.classList.remove("hidden");
}
function closeModal(el) {
  el.classList.add("hidden");
}

function closeVoteResult() {
  state.voteResultPublic = null;
  if (voteResultWinnersEl) voteResultWinnersEl.innerHTML = "";
  if (voteResultGridEl) voteResultGridEl.innerHTML = "";
  if (voteResultSubtitleEl) voteResultSubtitleEl.textContent = "";
  if (voteResultTitleEl) voteResultTitleEl.textContent = "투표 결과";
  if (voteResultModal) closeModal(voteResultModal);
  if ((state.room?.phase || "") === "RESULT" && isHost()) {
    send({ type: "result_done", data: {} });
  }
}

function closeLobbyNotice() {
  state.lobbyNotice = null;
  if (lobbyNoticeTitleEl) lobbyNoticeTitleEl.textContent = "";
  if (lobbyNoticeSubtitleEl) lobbyNoticeSubtitleEl.textContent = "";
  if (lobbyNoticeBodyEl) lobbyNoticeBodyEl.innerHTML = "";
  if (lobbyNoticeModal) closeModal(lobbyNoticeModal);
}

function renderLobbyNotice() {
  if (!lobbyNoticeModal || !lobbyNoticeBodyEl || !lobbyNoticeTitleEl || !lobbyNoticeSubtitleEl) return;
  const n = state.lobbyNotice;
  if (!n) return;

  const kind = String(n.kind || "");
  if (kind === "episode_advanced") {
    setTextHighlighted(lobbyNoticeTitleEl, "다음 에피소드로 이동");
    setTextHighlighted(
      lobbyNoticeSubtitleEl,
      `${String(n.scenarioId || "")} · ${String(n.fromEpisodeId || "")} → ${String(n.toEpisodeId || "")}`
    );
    lobbyNoticeBodyEl.innerHTML = `
      <div class="hint">로비로 돌아왔습니다. 다음 에피소드를 시작할 수 있어요.</div>
    `;
  } else if (kind === "scenario_ended") {
    setTextHighlighted(lobbyNoticeTitleEl, "시나리오 종료");
    setTextHighlighted(lobbyNoticeSubtitleEl, String(n.title || n.scenarioId || ""));
    lobbyNoticeBodyEl.innerHTML = `
      <div class="hint">모든 에피소드가 끝났습니다. 다른 시나리오를 선택해 주세요.</div>
    `;
  } else if (kind === "start_blocked") {
    const reason = String(n.reason || "");
    setTextHighlighted(lobbyNoticeTitleEl, "게임 시작 불가");

    const hostId = String(n.hostClientId || "");
    const hostPlayer = hostId ? (state.room?.players || []).find((p) => p.clientId === hostId) : null;
    setTextHighlighted(lobbyNoticeSubtitleEl, hostPlayer ? `현재 호스트: ${hostPlayer.seat}번 ${hostPlayer.name || ""}` : "");

    if (reason === "not_host") {
      lobbyNoticeBodyEl.innerHTML = `
        <div class="hint">이 기기(탭)는 호스트가 아니어서 시작할 수 없습니다.</div>
        <div class="hint">같은 PC에서 탭을 “복제/복사”로 열면 플레이어 ID가 겹쳐 2창을 띄워도 1명으로 잡힐 수 있어요.</div>
        <div class="hint">해결: 다른 창은 새 탭에서 주소를 직접 입력해 열거나(복제 X), 시크릿 창/다른 브라우저로 열어보세요.</div>
      `;
    } else if (reason === "no_scenario") {
      lobbyNoticeBodyEl.innerHTML = `<div class="hint">시나리오를 먼저 선택해야 게임을 시작할 수 있습니다.</div>`;
    } else if (reason === "cannot_start") {
      const pc = Number(n.playerCount || 0);
      lobbyNoticeBodyEl.innerHTML = `
        <div class="hint">현재 인원(${escapeHtml(String(pc))}명)으로 시작할 수 없는 설정입니다.</div>
        <div class="hint">인원을 맞추거나 다른 에피소드를 선택해 보세요.</div>
      `;
    } else if (reason === "assign_failed") {
      lobbyNoticeBodyEl.innerHTML = `<div class="hint">역할 배정에 실패했습니다. 잠시 후 다시 시도해 주세요.</div>`;
    } else {
      lobbyNoticeBodyEl.innerHTML = `<div class="hint">시작할 수 없습니다. (${escapeHtml(reason || "unknown")})</div>`;
    }
  } else if (kind === "reconnected") {
    const replaced = !!n.replaced;
    setTextHighlighted(lobbyNoticeTitleEl, "재접속됨");
    setTextHighlighted(lobbyNoticeSubtitleEl, String(n.name || ""));
    lobbyNoticeBodyEl.innerHTML = replaced
      ? `<div class="hint">같은 이름으로 다시 접속해서 기존 연결을 교체했습니다.</div>`
      : `<div class="hint">같은 이름으로 다시 접속했습니다.</div>`;
  } else {
    setTextHighlighted(lobbyNoticeTitleEl, "알림");
    setTextHighlighted(lobbyNoticeSubtitleEl, "");
    lobbyNoticeBodyEl.innerHTML = `<div class="hint">${escapeHtml(JSON.stringify(n))}</div>`;
  }

  openModal(lobbyNoticeModal);
}

function renderVoteResult() {
  if (!voteResultModal || !voteResultWinnersEl || !voteResultGridEl) return;
  const data = state.voteResultPublic;
  if (!data) return;

  const players = (state.room?.players || []).filter((p) => p.connected && !p.isSpectator);
  const bySeat = new Map(players.map((p) => [Number(p.seat), p]));

  const countsRaw = data.counts || {};
  const counts = {};
  for (const [k, v] of Object.entries(countsRaw)) {
    const seat = Number.parseInt(String(k), 10);
    const c = Number.parseInt(String(v), 10);
    if (!Number.isFinite(seat) || !Number.isFinite(c)) continue;
    counts[seat] = c;
  }

  const items = Object.entries(counts).map(([seat, c]) => [Number(seat), Number(c)]);
  items.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const maxCount = items.length ? items[0][1] : 0;
  const winners = items.filter(([, c]) => c === maxCount && maxCount > 0).map(([seat]) => seat);

  if (voteResultTitleEl) voteResultTitleEl.textContent = "투표 결과";
  if (voteResultSubtitleEl) {
    if (!items.length) voteResultSubtitleEl.textContent = "투표 데이터가 없습니다.";
    else if (winners.length > 1) voteResultSubtitleEl.textContent = `동률: ${winners.map((s) => `#${s}`).join(", ")} (각 ${maxCount}표)`;
    else voteResultSubtitleEl.textContent = `최다 득표: #${winners[0]} (${maxCount}표)`;
  }

  const buildResultCard = ({ seat, count, isWinner }) => {
    const p = bySeat.get(Number(seat)) || null;
    const el = document.createElement("div");
    el.className = "voteResultCard" + (isWinner ? " voteResultCard--winner" : "");
    applyPlayerPalette(el, p?.color || "#888");
    el.innerHTML = `
      <div class="voteResultCard__count">${escapeHtml(String(count))}</div>
      <div class="voteResultCard__seat">${escapeHtml(String(seat))}</div>
      <div class="voteResultCard__avatar">${escapeHtml(p?.avatar || "👤")}</div>
      <div class="voteResultCard__name">${escapeHtml(p?.name || "")}</div>
    `;
    return el;
  };

  voteResultWinnersEl.innerHTML = "";
  if (winners.length) {
    for (const seat of winners) {
      const c = counts[seat] || 0;
      voteResultWinnersEl.appendChild(buildResultCard({ seat, count: c, isWinner: true }));
    }
  }

  voteResultGridEl.innerHTML = "";
  for (const p of players.sort((a, b) => Number(a.seat) - Number(b.seat))) {
    const seat = Number(p.seat);
    const c = counts[seat] || 0;
    voteResultGridEl.appendChild(buildResultCard({ seat, count: c, isWinner: winners.includes(seat) }));
  }

  openModal(voteResultModal);
}

function render() {
  const room = state.room;
  if (!room) return;

  const phase = room.phase || "WAIT";
  const phaseChanged = state.uiLastPhase !== phase;
  state.uiLastPhase = phase;
  const amHost = isHost();
  syncHostEndButton();
  const me = (room.players || []).find((p) => p.clientId === state.clientId) || null;
  state.mySeat = Number(me?.seat || 0);
  state.isSpectator = !!me?.isSpectator;

  if (room.selectedScenarioId) {
    const ep = room.selectedEpisodeId ? ` / ${room.selectedEpisodeId}` : "";
    scenarioLabel.textContent = `· ${room.selectedScenarioId}${ep}`;
  } else {
    scenarioLabel.textContent = "";
  }
  
  // Button Visibility Logic
  if (phase === "WAIT") {
    if (amHost) {
      rerollBtn.classList.add("hidden");
      scenarioBtn.classList.remove("hidden");
      startBtn.classList.remove("hidden");
      startBtn.disabled = false;
      if (waitForActionsBtn) {
        waitForActionsBtn.classList.remove("hidden");
        const sid = state.room?.selectedScenarioId || "";
        const enabled = !!sid;
        waitForActionsBtn.disabled = !enabled;
        waitForActionsBtn.setAttribute("aria-disabled", enabled ? "false" : "true");
        const on = !!state.room?.settings?.waitForActions;
        waitForActionsBtn.textContent = `액션 수행 기다림: ${on ? "ON" : "OFF"}`;
      }
    } else {
      rerollBtn.classList.remove("hidden");
      scenarioBtn.classList.add("hidden");
      startBtn.classList.add("hidden");
      if (waitForActionsBtn) waitForActionsBtn.classList.add("hidden");
    }
  } else {
    // In game, hide lobby buttons
    rerollBtn.classList.add("hidden");
    scenarioBtn.classList.add("hidden");
    startBtn.classList.add("hidden");
    if (waitForActionsBtn) waitForActionsBtn.classList.add("hidden");
  }

  if (leaveBtn) leaveBtn.classList.remove("hidden");

  const canVotePhase = phase === "DEBATE" || phase === "VOTE";
  voteBtn.classList.toggle("hidden", !canVotePhase || state.isSpectator);
  const iVoted = !!state.room?.votes?.[state.clientId];
  voteBtn.disabled = !canVotePhase || iVoted || state.isSpectator;
  voteBtn.textContent = iVoted ? "투표 완료" : "투표";

  const players = room.players || [];

  gridEl.innerHTML = "";
  for (const p of players) {
    const isMe = p.clientId === state.clientId;
    const roleLabel = isMe && state.myRoleId ? getRoleDisplayName(state.myRoleId) : "";
    const isVoted = !!state.room?.votes?.[p.clientId];
    const showKick = phase === "WAIT" && !state.isSpectator && !isMe;

    const card = CardUI?.createPlayerCard
      ? CardUI.createPlayerCard({
          player: p,
          isMe,
          isHost: !!p.isHost,
          isConnected: !!p.connected,
          isVoted,
          roleLabel,
          applyPalette: applyPlayerPalette,
          showKick,
          onKick: (player) => {
            if (phase !== "WAIT") return;
            const targetClientId = String(player?.clientId || "");
            if (!targetClientId || targetClientId === String(state.clientId || "")) return;
            send({ type: "kick", data: { targetClientId } });
          },
        })
      : (() => {
          const fallback = document.createElement("div");
          fallback.className = "card";
          return fallback;
        })();

    // Apply persistent public marks (shield / artifacts etc).
    const seatKey = String(p?.seat ?? "");
    const marks = state.seatMarks?.[seatKey] || [];
    if (CardUI?.setMarks) CardUI.setMarks(card, marks);

    gridEl.appendChild(card);

    // Keep lobby/grid motion subtle; avoid re-animating every websocket tick.
    if (phaseChanged && phase === "WAIT") CardUI?.motion?.enter?.(card, "playerGrid");
  }

  // Lobby-only: append "+ AI 추가" card as the last slot (debug-enabled only).
  if (phase === "WAIT" && !state.isSpectator && state.debugEnabled && CardUI?.createAddBotCard) {
    const addCard = CardUI.createAddBotCard({
      label: "+ AI 추가",
      onClick: async () => {
        try {
          await window.gameDebug?.ui?.addBot?.(1);
        } catch (e) {
          console.warn("addBot failed", e);
        }
      },
    });
    gridEl.appendChild(addCard);
    if (phaseChanged && phase === "WAIT") CardUI?.motion?.enter?.(addCard, "playerGrid");
  }

  renderInfoDeck();
  renderDebateRoleStrip();
  renderRoleOverlay();
  renderNightOverlay();
}

function renderDebateRoleStrip() {
  if (!roleStripEl || !infoDeckEl || !deckIndicatorsEl) return;
  // Unify UX: keep using the swipeable info deck in DEBATE/VOTE (no separate role strip).
  roleStripEl.classList.add("hidden");
  roleStripEl.innerHTML = "";
  roleStripEl.dataset.cacheKey = "";
  infoDeckEl.classList.remove("hidden");
  deckIndicatorsEl.classList.remove("hidden");
  return; /* legacy debate role strip disabled
  const phase = state.room?.phase || "WAIT";
  if (phase !== "DEBATE") {
    roleStripEl.classList.add("hidden");
    roleStripEl.innerHTML = "";
    infoDeckEl.classList.remove("hidden");
    deckIndicatorsEl.classList.remove("hidden");
    return;
  }

  // Debate UI: replace swiper with a horizontal role card strip.
  infoDeckEl.classList.add("hidden");
  deckIndicatorsEl.classList.add("hidden");
  roleStripEl.classList.remove("hidden");

  const sid = state.room?.selectedScenarioId;
  if (!sid) {
    roleStripEl.innerHTML = "";
    return;
  }

  const scenario = state.scenarioById?.[sid] || null;
  if (!scenario?.episodes) {
    roleStripEl.innerHTML = `<div class="hint">역할 카드 불러오는 중...</div>`;
    if (!scenarioDetailInflight.has(sid)) ensureScenarioDetailLoaded(sid).then(() => renderDebateRoleStrip());
    return;
  }

  const playersCount = (state.room?.players || []).filter((p) => p.connected && !p.isSpectator).length || 0;
  const episodeId = state.room?.selectedEpisodeId || scenario?.episodes?.[0]?.episodeId || "ep1";
  const ep = (scenario.episodes || []).find((e) => String(e?.episodeId || "") === String(episodeId)) || (scenario.episodes || [])[0] || null;
  const sel = selectVariantForPlayerCount(ep, playersCount);
  const variant = sel.variant;
  if (!variant) {
    roleStripEl.innerHTML = `<div class="hint">역할 카드 정보가 없습니다.</div>`;
    return;
  }

  const deck = effectiveRoleDeckForPlayerCount(variant, playersCount);
  const counts = {};
  for (const r of deck) counts[r] = (counts[r] || 0) + 1;

  const wolfTeam = new Set(["werewolf", "alpha_wolf", "mystic_wolf", "dream_wolf", "minion"]);
  const roles = Object.keys(counts);
  roles.sort((a, b) => {
    const aw = wolfTeam.has(a) ? 0 : 1;
    const bw = wolfTeam.has(b) ? 0 : 1;
    if (aw !== bw) return aw - bw;
    if (a === "tanner") return -1;
    if (b === "tanner") return 1;
    return a.localeCompare(b);
  });

  const cacheKey = `${sid}:${episodeId}:${playersCount}:${roles.join(",")}`;
  if (roleStripEl.dataset.cacheKey === cacheKey) return;
  roleStripEl.dataset.cacheKey = cacheKey;

  const scroller = document.createElement("div");
  scroller.className = "roleStrip__scroller";

  for (const roleId of roles) {
    const def = ROLE_DEFINITIONS[roleId] || { icon: "🃏", name: roleId, desc: "" };
    const displayName = getRoleDisplayName(roleId);
    const c = counts[roleId] || 0;

    const card = CardUI?.createRoleCard
      ? CardUI.createRoleCard({
          icon: escapeHtml(def.icon || "🃏"),
          name: escapeHtml(displayName),
          countText: `${escapeHtml(String(c))}장`,
        })
      : (() => {
          const node = document.createElement("div");
          node.className = "roleCard";
          return node;
        })();
    scroller.appendChild(card);
  }

  roleStripEl.innerHTML = "";
  roleStripEl.appendChild(scroller);
  CardUI?.motion?.staggerEnter?.(scroller.children, { preset: "stack", stagger: 0.04 });
  */
}

function renderInfoDeck() {
  const deckEl = qs("#infoDeck");
  const indicatorEl = qs("#deckIndicators");
  const sid = state.room?.selectedScenarioId;
  const connectedCount = (state.room?.players || []).filter((p) => p.connected && !p.isSpectator).length || 0;
  const phase = state.room?.phase || "WAIT";
  const nightDeck = Array.isArray(state.room?.nightDeck) ? state.room.nightDeck.map((x) => String(x || "")) : [];
  const nightDeckKey = nightDeck.length ? nightDeck.join(",") : "";
  const selectedEpisodeId = state.room?.selectedEpisodeId || state.scenarioState?.selectedEpisodeId || "";
  
  // Re-render if scenario OR player count changes (to update role deck variant)
  const hasFull = !!state.scenarioById?.[sid]?.episodes;
  // While we only have list data (no episodes/roleDeck), don't churn the UI on every room update.
  const cacheKey = hasFull ? `${sid}:${selectedEpisodeId}:${phase}:${connectedCount}:${nightDeckKey}:full` : `${sid}:${phase}:list`;
  if (deckEl.dataset.cacheKey === cacheKey && sid) return;
  deckEl.dataset.cacheKey = cacheKey;

  deckEl.innerHTML = "";
  indicatorEl.innerHTML = "";
  deckEl.dataset.motionAttached = "0";

  if (!sid) {
    const card = CardUI?.createInfoCard
      ? CardUI.createInfoCard({
          tag: "",
          icon: "⏳",
          title: "대기 중...",
          text: "호스트가 시나리오를 선택하고 있습니다.",
        })
      : null;
    if (card) deckEl.appendChild(card);
    return;
  }

  const scenario = state.scenarioById[sid];
  if (!scenario) return;
  if (!scenario.episodes) {
    // Render loading UI once per selected scenario, then wait for the detail fetch.
    if (deckEl.dataset.loadingFor !== sid) {
      deckEl.dataset.loadingFor = sid;
      const card = CardUI?.createInfoCard
        ? CardUI.createInfoCard({
            tag: "",
            icon: "📥",
            title: "역할 정보를 불러오는 중...",
            text: "선택된 시나리오의 등장 역할/규칙 카드를 준비하고 있습니다.",
          })
        : null;
      deckEl.innerHTML = "";
      if (card) deckEl.appendChild(card);
    }
    if (!scenarioDetailInflight.has(sid)) {
      ensureScenarioDetailLoaded(sid).then(() => renderInfoDeck());
    }
    return;
  }
  deckEl.dataset.loadingFor = "";

  const slides = [];

  // 1. Cover Slide
  slides.push({
    icon: "📖",
    title: scenario.title || sid,
    tag: "시나리오",
    text:
      (scenario.description || "이 시나리오에서 펼쳐지는 미스터리한 사건을 해결하세요.") +
      (() => {
        const eps = Array.isArray(scenario.episodes) ? scenario.episodes : [];
        const selectedEpisodeId = state.room?.selectedEpisodeId || state.scenarioState?.selectedEpisodeId || "";
        const ep = eps.find((e) => (e?.episodeId || "") === selectedEpisodeId) || eps[0];
        const epTitle = ep?.title || ep?.episodeId || "";
        return epTitle ? `<br><br><b>에피소드:</b> ${escapeHtml(epTitle)}` : "";
      })()
  });

  // 2. Dynamic Role Slides
  if (phase === "WAIT") {
    slides.push({
      icon: "🃏",
      title: "등장 역할(가이드)",
      tag: "Rule",
      text: "로비에서는 이 시나리오에서 <b>등장 가능한 역할(풀/덱)</b>을 모두 보여줍니다. 실제 배정은 게임 시작 시 인원수/룰에 따라 결정됩니다.",
    });
  }
  const eps = Array.isArray(scenario.episodes) ? scenario.episodes : [];
  const ep = eps.find((e) => (e?.episodeId || "") === selectedEpisodeId) || eps[0];
  const fallbackCount =
    connectedCount > 0 ? connectedCount : Math.max(...(scenario.recommendedPlayerCounts || [5, 6, 7, 8, 9, 10]));
  const { variant } = selectVariantForPlayerCount(ep, fallbackCount); // Default to max recommended
  
  const counts = {};
  const useNightDeck = nightDeck.length && phase !== "WAIT";
  if (useNightDeck) {
    for (const r of nightDeck) counts[r] = (counts[r] || 0) + 1;
  } else if (variant && Array.isArray(variant.roleDeck)) {
    // Lobby (WAIT) behavior: show "all roles that can appear" for this scenario's variant.
    // In random_pool mode, roleDeck is a pool (not a fixed truncation), so show the entire pool.
    // In prefix mode, roleDeck is typically ordered; still show full list as "appearing roles".
    const deck = phase === "WAIT" ? variant.roleDeck : effectiveRoleDeckForPlayerCount(variant, fallbackCount);
    for (const r of deck) counts[String(r || "")] = (counts[String(r || "")] || 0) + 1;
  }
  const uniqueRoles = Object.keys(counts);

  if (uniqueRoles.length) {
    const wolfTeam = new Set(["werewolf", "alpha_wolf", "mystic_wolf", "dream_wolf", "minion"]);
    uniqueRoles.sort((a, b) => {
      const aw = wolfTeam.has(a) ? 0 : 1;
      const bw = wolfTeam.has(b) ? 0 : 1;
      if (aw !== bw) return aw - bw;
      if (a === "tanner") return -1;
      if (b === "tanner") return 1;
      return a.localeCompare(b);
    });

    for (const roleId of uniqueRoles) {
      const def = ROLE_DEFINITIONS[roleId] || { icon: "❓", name: roleId, desc: "정보 없음" };
      const displayName = getRoleDisplayName(roleId);
      const countText = counts[roleId] > 1 ? ` · ${counts[roleId]}장` : "";
      
      slides.push({
        icon: def.icon,
        title: `${displayName}${countText}`,
        tag: wolfTeam.has(roleId) ? "Team 늑대" : roleId === "tanner" ? "독립" : "Team 마을",
        text: `<b>${def.name}</b><br>${def.desc}`
      });
    }
  } else {
    // Fallback if no variant found
     slides.push({
      icon: "🎭",
      title: "등장 역할",
      tag: "Rule",
      text: "플레이어 수에 따라 역할이 결정됩니다."
    });
  }

  // 3. Victory Condition
  slides.push({
    icon: "🏆",
    title: "승리 조건",
    tag: "Rule",
    text: "<b>마을주민:</b> 늑대인간을 찾아 투표로 처형하세요.<br><br><b>늑대인간:</b> 정체를 들키지 않고 살아남으세요."
  });

  // Render Slides
  slides.forEach((s, idx) => {
    const card = CardUI?.createInfoCard
      ? CardUI.createInfoCard({
          tag: s.tag,
          icon: s.icon,
          title: s.title,
          text: s.text,
        })
      : (() => {
          const node = document.createElement("div");
          node.className = "info-card";
          return node;
        })();
    deckEl.appendChild(card);

    const dot = document.createElement("div");
    dot.className = "indicator";
    if (idx === 0) dot.classList.add("active");
    indicatorEl.appendChild(dot);
  });

  CardUI?.motion?.staggerEnter?.(deckEl.querySelectorAll(".info-card__content"), { preset: "fadeUp", stagger: 0.05 });
  CardUI?.motion?.attachSwipeMotion?.(deckEl, { cardSelector: ".info-card", contentSelector: ".info-card__content" });

  // Update indicators on scroll
  deckEl.onscroll = () => {
    const idx = Math.round(deckEl.scrollLeft / deckEl.clientWidth);
    Array.from(indicatorEl.children).forEach((d, i) => {
      d.classList.toggle("active", i === idx);
    });
  };
}

	function renderNightOverlay() {
	  const phase = state.room?.phase || "WAIT";
	  const step = state.nightStep;
	  if (phase !== "NIGHT" || !step) {
    nightOverlay.classList.add("hidden");
    nightOverlay.style.removeProperty("--panel-color");
    nightOverlay.classList.remove("nightOverlay--actorBg");
    nightOverlay.classList.remove("nightOverlay--bgCard");
    nightOverlay.classList.remove("nightOverlay--noHeader");
    nightOverlay.classList.remove("nightOverlay--orbitBoard");
    nightAction.classList.remove("nightOverlay__action--centerRule");
    nightAction.classList.remove("nightOverlay__action--bottomBar");
    nightBody?.querySelectorAll?.(".nightCenterLayer")?.forEach?.((el) => el.remove());
    if (typeof state.nightOrbitCleanup === "function") state.nightOrbitCleanup();
    state.nightOrbitCleanup = null;
    state.nightSeerBoard = null;
    state.nightRobberBoard = null;
    state.nightTroublemakerBoard = null;
    state.nightDrunkBoard = null;
    state.nightWerewolfBoard = null;
    return;
  }

	  nightOverlay.classList.remove("hidden");
	  // Default night mode: fullscreen profile card (consistent brightness), unless I'm actively acting.
	  const kind = String(step.kind || "");
	  const activeRole = String(step.roleId || "");
	  const activeRoleName = activeRole ? getRoleDisplayName(activeRole) : "";
	  const sectionKey = String(step.sectionKey || "");
	  const isDuringStep = kind === "role" && sectionKey.includes("/during/");
	  const isAfterStep = kind === "role" && sectionKey.includes("/after/");
	  const activeSeats = Array.isArray(step.activeSeats) ? step.activeSeats.map((n) => Number(n)) : [];
	  const activeClientIds = Array.isArray(step.activeClientIds) ? step.activeClientIds.map((x) => String(x)) : [];
	  const isActor =
	    !state.isSpectator &&
	    ((!!state.mySeat && activeSeats.includes(Number(state.mySeat))) || activeClientIds.includes(String(state.clientId || "")));
	  const stepId = Number(step.stepId || 0);
	  const isPostActionStep =
	    isAfterStep &&
	    String(state.lastNightAction?.roleId || "") === String(activeRole || "") &&
	    Number(state.lastNightAction?.duringStepId || 0) > 0;
	  const hasSubmittedThisStep =
	    !state.debugNightPreview &&
	    (state.nightSubmittedStepId === stepId || (isPostActionStep && state.nightSubmittedStepId === Number(state.lastNightAction?.duringStepId || 0)));
	  // Show the actor board for the whole "during" step; after submit, keep the board visible but lock interactions.
	  const isActorUi = isActor && (isDuringStep || isPostActionStep);
	  const isActorInteractive = isActorUi && !hasSubmittedThisStep;
	  const useBgRuleCard = !!(isActorUi && kind === "role");
	  nightOverlay.classList.toggle("nightOverlay--fullscreen", !isActorUi);
	  nightOverlay.classList.toggle("nightOverlay--profileOnly", !isActorUi);
	  nightOverlay.classList.toggle("nightOverlay--actorBg", isActorUi && !useBgRuleCard);
	  nightOverlay.classList.toggle("nightOverlay--bgCard", !!useBgRuleCard);
	  nightOverlay.classList.toggle("nightOverlay--noHeader", !!useBgRuleCard);
	  nightOverlay.classList.toggle("nightOverlay--orbitBoard", false);
	  nightOverlay.classList.toggle("nightOverlay--submitted", hasSubmittedThisStep);

	  const roleId = activeRole;
	  const reuseKeyStepId = isPostActionStep ? Number(state.lastNightAction?.duringStepId || stepId) : stepId;

	  const updateSeerOrbitSelection = () => {
	    const board = state.nightSeerBoard;
	    if (!board || board.stepId !== reuseKeyStepId) return;
	    const ui = state.nightUi || {};
	    const selectedSeats = Array.isArray(ui.selectedSeats) ? ui.selectedSeats.map(Number) : [];
	    const selectedCenter = Array.isArray(ui.selectedCenter) ? ui.selectedCenter.map(Number) : [];

    for (const [seat, el] of board.bySeat.entries()) {
      el.classList.toggle("nightChoice--selected", selectedSeats.includes(seat));
    }
	    for (const [idx, el] of board.byCenter.entries()) {
	      el.classList.toggle("nightChoice--selected", selectedCenter.includes(idx));
	    }

    if (!isActorInteractive) return;
    const seat = selectedSeats[0];
    if (selectedSeats.length === 1 && seat) {
      const el = board.bySeat.get(Number(seat)) || null;
      pulseEl(el);
      pulseBgCard();
      submitNightAction("seer", { mode: "player", seat });
      return;
    }
    if (selectedCenter.length === 2 && selectedCenter[0] !== selectedCenter[1]) {
      const a = board.byCenter.get(Number(selectedCenter[0])) || null;
      const b = board.byCenter.get(Number(selectedCenter[1])) || null;
      pulseEl(a);
      pulseEl(b);
      pulseBgCard();
      submitNightAction("seer", { mode: "center", indices: selectedCenter });
    }
  };

	  const updateRobberOrbitSelection = () => {
	    const board = state.nightRobberBoard;
	    if (!board || board.stepId !== reuseKeyStepId) return;
	    const ui = state.nightUi || {};
	    const selectedSeats = Array.isArray(ui.selectedSeats) ? ui.selectedSeats.map(Number) : [];
	    for (const [seat, el] of board.bySeat.entries()) {
	      el.classList.toggle("nightChoice--selected", selectedSeats.includes(seat));
	    }

    if (!isActorInteractive) return;
    const seat = selectedSeats[0];
    if (selectedSeats.length === 1 && seat) {
      const el = board.bySeat.get(Number(seat)) || null;
      pulseEl(el);
      pulseBgCard();
      submitNightAction("robber", { seat });
    }
  };

	  const updateTroublemakerOrbitSelection = () => {
	    const board = state.nightTroublemakerBoard;
	    if (!board || board.stepId !== reuseKeyStepId) return;
	    const ui = state.nightUi || {};
	    const selectedSeats = Array.isArray(ui.selectedSeats) ? ui.selectedSeats.map(Number) : [];

    for (const [seat, el] of board.bySeat.entries()) {
      el.classList.toggle("nightChoice--selected", selectedSeats.includes(seat));
    }

    if (!isActorInteractive) return;
    if (selectedSeats.length === 2 && selectedSeats[0] !== selectedSeats[1]) {
      const aEl = board.bySeat.get(Number(selectedSeats[0])) || null;
      const bEl = board.bySeat.get(Number(selectedSeats[1])) || null;
      pulseEl(aEl);
      pulseEl(bEl);
      pulseBgCard();
      submitNightAction("troublemaker", { seats: selectedSeats });
    }
  };

	  const updateDrunkOrbitSelection = () => {
	    const board = state.nightDrunkBoard;
	    if (!board || board.stepId !== reuseKeyStepId) return;
	    const ui = state.nightUi || {};
	    const selectedCenter = Array.isArray(ui.selectedCenter) ? ui.selectedCenter.map(Number) : [];

    for (const [idx, el] of board.byCenter.entries()) {
      el.classList.toggle("nightChoice--selected", selectedCenter.includes(idx));
    }

    if (!isActorInteractive) return;
    const centerIndex = selectedCenter[0];
    if (selectedCenter.length === 1 && Number.isFinite(centerIndex)) {
      const el = board.byCenter.get(Number(centerIndex)) || null;
      pulseEl(el);
      pulseBgCard();
      submitNightAction("drunk", { centerIndex });
    }
  };

	  const updateWerewolfOrbitSelection = () => {
	    const board = state.nightWerewolfBoard;
	    if (!board || board.stepId !== reuseKeyStepId) return;
	    const ui = state.nightUi || {};
	    const selectedCenter = Array.isArray(ui.selectedCenter) ? ui.selectedCenter.map(Number) : [];

    for (const [idx, el] of board.byCenter.entries()) {
      el.classList.toggle("nightChoice--selected", selectedCenter.includes(idx));
    }
  };

  const stepLabel = `${String(step.stepIndex || 0)}/${String(step.stepCount || 0)}`;
  nightTitle.textContent = `NIGHT · ${stepLabel}`;
  if (!isActor) {
    setTextHighlighted(nightRole, state.isSpectator ? "관전 중" : "");
  } else {
    setTextHighlighted(
      nightRole,
      state.isSpectator
        ? "관전 중"
        : state.myRoleId
            ? `내 역할: ${getRoleDisplayName(state.myRoleId)}`
            : "내 역할: (미정)"
    );
  }

	  const canReuseSeerOrbit = !!(useBgRuleCard && roleId === "seer" && state.nightSeerBoard && state.nightSeerBoard.stepId === reuseKeyStepId);
	  const canReuseRobberOrbit = !!(useBgRuleCard && roleId === "robber" && state.nightRobberBoard && state.nightRobberBoard.stepId === reuseKeyStepId);
	  const canReuseTroublemakerOrbit =
	    !!(useBgRuleCard && roleId === "troublemaker" && state.nightTroublemakerBoard && state.nightTroublemakerBoard.stepId === reuseKeyStepId);
	  const canReuseDrunkOrbit = !!(useBgRuleCard && roleId === "drunk" && state.nightDrunkBoard && state.nightDrunkBoard.stepId === reuseKeyStepId);
	  const canReuseWerewolfOrbit =
	    !!(useBgRuleCard && roleId === "werewolf" && state.nightWerewolfBoard && state.nightWerewolfBoard.stepId === reuseKeyStepId);

  // Reset containers (avoid full rebuild for seer orbit board; selection updates should be minimal)
  nightActive.innerHTML = "";
  nightPrivate.classList.add("hidden");
  nightPrivate.innerHTML = "";
  nightAction.classList.remove("nightOverlay__action--centerRule");
  nightAction.classList.remove("nightOverlay__action--bottomBar");
  nightBody?.querySelectorAll?.(".nightCenterLayer")?.forEach?.((el) => el.remove());
  if (!canReuseSeerOrbit && !canReuseRobberOrbit && !canReuseTroublemakerOrbit && !canReuseDrunkOrbit && !canReuseWerewolfOrbit) {
    nightAction.classList.add("hidden");
    nightAction.innerHTML = "";
    if (typeof state.nightOrbitCleanup === "function") state.nightOrbitCleanup();
    state.nightOrbitCleanup = null;
    state.nightSeerBoard = null;
    state.nightRobberBoard = null;
    state.nightTroublemakerBoard = null;
    state.nightDrunkBoard = null;
    state.nightWerewolfBoard = null;
  } else {
    nightAction.classList.remove("hidden");
    nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);
    setTextHighlighted(
      nightHint,
      hasSubmittedThisStep
        ? `${activeRoleName || "당신"} 행동을 완료했습니다. 안내가 끝날 때까지 잠시 기다리세요.`
        : `${activeRoleName || "당신"} 차례입니다. 행동 후에는 다시 휴대폰을 내려놓고 눈을 감아주세요.`
    );
    if (canReuseSeerOrbit) updateSeerOrbitSelection();
    if (canReuseRobberOrbit) updateRobberOrbitSelection();
    if (canReuseTroublemakerOrbit) updateTroublemakerOrbitSelection();
    if (canReuseDrunkOrbit) updateDrunkOrbitSelection();
    if (canReuseWerewolfOrbit) updateWerewolfOrbitSelection();
    // Reuse-path returns early, so ensure "본인" tab is present on reused cards (including troublemaker).
    ensureNightMeTabs(nightOverlay);
    ensureSeatMarks(nightOverlay);
    if (canReuseSeerOrbit)
      applyNightResultOnce("seer", (result) => {
        const board = state.nightSeerBoard;
        if (!board) return;
        const r = result || {};
        if (r && typeof r === "object" && r.role && r.seat) {
          const el = board.bySeat?.get?.(Number(r.seat)) || null;
          flipRevealRole(el, String(r.role || ""));
        }
        const center = Array.isArray(r.center) ? r.center : [];
        center.forEach((x) => {
          const idx = Number(x?.index);
          const rid = String(x?.role || "");
          if (!Number.isFinite(idx) || !rid) return;
          const el = board.byCenter?.get?.(idx) || null;
          flipRevealRole(el, rid);
        });
      });
    if (canReuseRobberOrbit)
      applyNightResultOnce("robber", (result) => {
        const board = state.nightRobberBoard;
        if (!board) return;
        const r = result || {};
        const mySeat = Number(state.mySeat || 0);
        const mine = board.bySeat?.get?.(mySeat) || null;
        const targetSeat = Number(r.targetSeat || 0);
        const target = board.bySeat?.get?.(targetSeat) || null;
        const newRole = String(r.newRole || "");
        if (!mine || !newRole) return;
        const roleName = getRoleDisplayName(newRole);
        setBoardMessage(board, { text: `이제 당신의 신분은 ${roleName}로 교환됐습니다.`, highlights: [roleName] });
        if (target && target !== mine) {
          if (NightBoardUI?.swapEls) {
            NightBoardUI.swapEls(mine, target, {
              duration: 0.32,
              onComplete: () => flipRevealRole(mine, newRole),
            });
          } else {
            swapEls(mine, target);
            flipRevealRole(mine, newRole);
          }
        } else {
          flipRevealRole(mine, newRole);
        }
      });
    if (canReuseTroublemakerOrbit)
      applyNightResultOnce("troublemaker", (result) => {
        const board = state.nightTroublemakerBoard;
        if (!board) return;
        const r = result || {};
        const seats = Array.isArray(r.swappedSeats) ? r.swappedSeats.map(Number) : [];
        if (seats.length !== 2 || seats[0] === seats[1]) return;
        setBoardMessage(board, {
          text: `${seats[0]}번 ${seats[1]}번 신분 카드가 서로 교환됐었습니다.`,
          highlights: [`${seats[0]}번`, `${seats[1]}번`],
        });
        const aEl = board.bySeat?.get?.(seats[0]) || null;
        const bEl = board.bySeat?.get?.(seats[1]) || null;
        if (!aEl || !bEl) return;
        swapEls(aEl, bEl, { flip: true });
      });
    if (canReuseWerewolfOrbit)
      applyNightResultOnce("werewolf", (result) => {
        const board = state.nightWerewolfBoard;
        if (!board) return;
        const r = result || {};
        const idx = Number(r.centerIndex);
        const rid = String(r.role || "");
        if (!Number.isFinite(idx) || !rid) return;
        const el = board.byCenter?.get?.(idx) || null;
        flipRevealRole(el, rid);
      });
    return;
  }

  const players = (state.room?.players || []).filter((p) => p.connected && !p.isSpectator);
  const bySeat = new Map(players.map((p) => [Number(p.seat), p]));

  const buildLargeCard = (p, badgeText) => {
    if (CardUI?.createProfileCardLarge) {
      return CardUI.createProfileCardLarge({
        player: p,
        badgeText,
        applyPalette: applyPlayerPalette,
        isMe: String(p?.clientId || "") === String(state.clientId || ""),
      });
    }
    const node = document.createElement("div");
    node.className = "profileCardLarge";
    return node;
  };

  const me = (state.room?.players || []).find((p) => p.clientId === state.clientId) || null;
  applyPlayerPalette(nightOverlay, me?.color || "#888");
  nightOverlay.style.setProperty("--panel-color", me?.color || "#888");
  const myCard = me ? buildLargeCard(me, "눈 감아요") : null;

  if (kind === "opening") {
    setTextHighlighted(nightHint, "모두 눈을 감고 휴대폰을 내려놓으세요.");
    if (myCard) {
      nightActive.appendChild(myCard);
      CardUI?.motion?.enter?.(myCard, "profile");
    }
    return;
  }
  if (kind === "outro") {
    setTextHighlighted(nightHint, "밤이 끝났습니다. 모두 눈을 뜨세요.");
    if (myCard) {
      nightActive.appendChild(myCard);
      CardUI?.motion?.enter?.(myCard, "profile");
    }
    return;
  }

  // ROLE steps
  if (kind !== "role") {
    setTextHighlighted(nightHint, "밤 진행 중...");
    return;
  }

  // Default (non-actor): keep my profile card fullscreen until day.
  if (!isActorUi) {
    setTextHighlighted(nightHint, `${activeRoleName || "누군가"} 차례입니다. 계속 눈을 감고 기다리세요.`);
    if (myCard) {
      nightActive.appendChild(myCard);
      CardUI?.motion?.enter?.(myCard, "profile");
    }
    return;
  }

  // Actor device: show interaction UI (and keep brightness the same).
  // Reset logic may have hidden this; actor steps always use the action area (board or rule-only).
  nightAction.classList.remove("hidden");
  setTextHighlighted(
    nightHint,
    hasSubmittedThisStep
      ? `${activeRoleName || "당신"} 행동을 완료했습니다. 안내가 끝날 때까지 잠시 기다리세요.`
      : `${activeRoleName || "당신"} 차례입니다. 행동 후에는 다시 휴대폰을 내려놓고 눈을 감아주세요.`
  );

  if (useBgRuleCard) {
    const card = document.createElement("div");
    card.className = "profileCardLarge nightBgCard";
    applyPlayerPalette(card, me?.color || "#888");
    nightActive.appendChild(card);
    CardUI?.motion?.enter?.(card, "profile");
  } else if (myCard) {
    myCard.classList.add("profileCardLarge--actorBg");
    nightActive.appendChild(myCard);
    CardUI?.motion?.enter?.(myCard, "profile");
  }

  const createNightBoardScaffold = () => {
    const row = document.createElement("div");
    row.className = "nightBoard";
    row.innerHTML = `
      <div class="nightBoard__arena">
        <div class="nightBoard__center"></div>
        <div class="nightBoard__orbit"></div>
      </div>
    `;
    return {
      row,
      orbitArena: row.querySelector(".nightBoard__arena"),
      centerEl: row.querySelector(".nightBoard__center"),
      orbitEl: row.querySelector(".nightBoard__orbit"),
    };
  };

  const assignOrbitBases = (orbitCards) => {
    if (!Array.isArray(orbitCards) || !orbitCards.length) return;
    const n = Math.max(1, orbitCards.length);
    orbitCards.forEach((c, i) => {
      if (!c) return;
      c.dataset.orbitBase = String(i / n);
    });
  };

  // Werewolf: lone-wolf can peek a center card; otherwise show rule-only UI.
  if (useBgRuleCard && roleId === "werewolf") {
    let canPeek = !!(state.nightPrivate?.payload && state.nightPrivate.payload.canPeekCenter);
    if (state.debugNightPreview) {
      ensureDebugRoles();
      const playersNow = (state.room?.players || []).filter((p) => p.connected && !p.isSpectator);
      const seatsNow = new Set(playersNow.map((p) => Number(p.seat || 0)).filter(Boolean));
      const werewolfCount = Object.entries(state.debugRoleBySeat || {}).filter(
        ([seat, r]) => seatsNow.has(Number(seat)) && String(r) === "werewolf"
      ).length;
      if (!state.nightPrivate?.payload || typeof state.nightPrivate.payload.canPeekCenter !== "boolean") {
        canPeek = werewolfCount === 1;
      }
    }
    const def = ROLE_DEFINITIONS[activeRole] || null;
    const ruleText = def?.desc || "늑대인간의 차례입니다.";

    nightAction.classList.remove("hidden");
    nightAction.innerHTML = "";

	    if (!canPeek) {
	      nightAction.classList.add("nightOverlay__action--centerRule");
	      const panel = NightBoardUI?.createRuleOnlyPanel
	        ? NightBoardUI.createRuleOnlyPanel({ text: ruleText, escapeHtml })
	        : (() => {
	            const el = document.createElement("div");
	            el.className = "nightRuleOnly nightRuleOnly--center";
	            el.innerHTML = `<div class="nightRuleOnly__text">${escapeHtml(ruleText)}</div>`;
	            return el;
	          })();
	      nightAction.appendChild(panel);
	      return;
	    }

    nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);
    const { row, orbitArena, centerEl, orbitEl } = createNightBoardScaffold();

    // Center cards selectable (pick 1)
    const byCenter = new Map();
	    const messageEl = ensureActionMessageEl(row);
    const initialSelected = Array.isArray(state.nightUi?.selectedCenter) ? state.nightUi.selectedCenter.map(Number) : [];
    for (const idx of [0, 1, 2]) {
      const c = document.createElement("button");
      c.className = "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard";
      c.setAttribute("data-center-index", String(idx));
      c.innerHTML = `
        <div class="nightChoiceCard__seat">C${idx + 1}</div>
        <div class="nightChoiceCard__avatar">🂠</div>
        <div class="nightChoiceCard__name">중앙 카드</div>
      `;
      applyPlayerPalette(c, me?.color || "#888");
      if (initialSelected.includes(idx)) c.classList.add("nightChoice--selected");
      c.addEventListener("click", () => {
        selectBounce(c);
        pulseBgCard();
        const current = Array.isArray(state.nightUi?.selectedCenter) ? state.nightUi.selectedCenter.map(Number) : [];
        const next = current.includes(idx) ? [] : [idx];
        state.nightUi = { ...(state.nightUi || {}), selectedCenter: next, selectedSeats: [] };
        if (state.nightWerewolfBoard && state.nightWerewolfBoard.stepId === stepId) updateWerewolfOrbitSelection();
	        else for (const [k, el] of byCenter.entries()) el.classList.toggle("nightChoice--selected", next.includes(k));

		        // Auto-submit when a center card is selected.
		        if (next.length === 1) {
		          const idx2 = next[0];
		          const el2 = byCenter.get(Number(idx2)) || null;
		          if (el2) pulseEl(el2);
		          // Give immediate feedback (the actual role is revealed when night_result arrives).
		          flipEl(el2);
		          submitNightAction("werewolf", { centerIndex: idx2 });
		        }
		      });
      byCenter.set(idx, c);
      centerEl.appendChild(c);
    }

    // Orbit cards decorative; blocked.
    const orbitCards = [];
    const playersSorted = [...players].sort((a, b) => Number(a.seat) - Number(b.seat));
    playersSorted.forEach((p) => {
      const isMe = p.clientId === state.clientId;
      const b = document.createElement("button");
      b.className = "nightChoice nightChoiceCard nightBoard__orbitCard";
      b.setAttribute("data-seat", String(p.seat || ""));
      if (isMe) b.dataset.isMe = "1";
      b.innerHTML = `
        ${isMe ? `<div class="meTab meTab--night">본인</div>` : ""}
        <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
        <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "👤")}</div>
        <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
      `;
      applyPlayerPalette(b, p.color || "#888");
      if (isMe) {
        (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(b, false);
        NightBoardUI?.setBlockedBadge?.(b, true);
      }
      (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(b, false);
      NightBoardUI?.setBlockedBadge?.(b, true);
      orbitEl.appendChild(b);
      orbitCards.push(b);
    });
    assignOrbitBases(orbitCards);

	    if (messageEl) messageEl.textContent = "센터 카드 1장을 탭하면 즉시 확인합니다.";

	    nightAction.appendChild(row);
	    state.nightWerewolfBoard = { stepId, byCenter, messageEl, preview: { active: false }, ruleText };
	    updateWerewolfOrbitSelection();
    applyNightResultOnce("werewolf", (result) => {
      const r = result || {};
      const idx = Number(r.centerIndex);
      const rid = String(r.role || "");
      if (!Number.isFinite(idx) || !rid) return;
      const el = byCenter.get(idx) || null;
      flipRevealRole(el, rid);
    });
    state.nightOrbitCleanup = startOrbit(orbitArena, orbitCards, { speed: 0.035 });
    return;
  }

  // Private hint payloads (server-sent).
  const priv = state.nightPrivate?.payload || null;
  if (priv) {
    nightPrivate.classList.remove("hidden");
    // Keep text minimal; no secrets beyond what server intended.
    nightPrivate.innerHTML = `<div>${escapeHtml(JSON.stringify(priv))}</div>`;
  }

	  const setChoiceState = (next) => {
	    state.nightUi = { ...(state.nightUi || {}), ...next };

    // No explicit confirm button: once the selection satisfies the role condition, perform the action immediately.
    const alreadySubmitted = state.nightSubmittedStepId === stepId && !state.debugNightPreview;
    if (isActorUi && !alreadySubmitted) {
      const selSeats = Array.isArray(state.nightUi?.selectedSeats) ? state.nightUi.selectedSeats.map(Number) : [];
      const selCenter = Array.isArray(state.nightUi?.selectedCenter) ? state.nightUi.selectedCenter.map(Number) : [];

	  if (roleId === "seer") {
        const seat = selSeats[0];
        if (selSeats.length === 1 && seat) {
          submitNightAction("seer", { mode: "player", seat });
          return;
        }
        if (selCenter.length === 2 && selCenter[0] !== selCenter[1]) {
          // Mirror the old UX: flip the selected center cards immediately.
          for (const idx of selCenter) {
            const el = nightAction.querySelector(`.nightChoiceCard[data-center-index="${CSS.escape(String(idx))}"]`);
            flipEl(el);
          }
          submitNightAction("seer", { mode: "center", indices: selCenter });
          return;
        }
      } else if (roleId === "robber") {
        const seat = selSeats[0];
        if (selSeats.length === 1 && seat) {
          submitNightAction("robber", { seat });
          return;
        }
      } else if (roleId === "troublemaker") {
        if (selSeats.length === 2 && selSeats[0] !== selSeats[1]) {
          submitNightAction("troublemaker", { seats: selSeats });
          return;
        }
      } else if (roleId === "drunk") {
        const centerIndex = selCenter[0];
        if (selCenter.length === 1 && Number.isFinite(centerIndex)) {
          submitNightAction("drunk", { centerIndex });
          return;
        }
      } else if (roleId === "apprentice_seer") {
        const centerIndex = selCenter[0];
        if (selCenter.length === 1 && Number.isFinite(centerIndex)) {
          submitNightAction("apprentice_seer", { centerIndex });
          return;
        }
      } else if (roleId === "mystic_wolf") {
        const seat = selSeats[0];
        if (selSeats.length === 1 && seat) {
          submitNightAction("mystic_wolf", { seat });
          return;
        }
      } else if (roleId === "revealer") {
        const seat = selSeats[0];
        if (selSeats.length === 1 && seat) {
          submitNightAction("revealer", { seat });
          return;
        }
	      } else if (roleId === "sentinel") {
	        const seat = selSeats[0];
	        if (selSeats.length === 1 && seat) {
	          submitNightAction("sentinel", { seat });
	          return;
	        }
	      } else if (roleId === "pickpocket") {
	        const seat = selSeats[0];
	        if (selSeats.length === 1 && seat) {
	          submitNightAction("pickpocket", { seat });
	          return;
	        }
	      } else if (roleId === "bodyguard") {
	        const seat = selSeats[0];
	        if (selSeats.length === 1 && seat) {
	          submitNightAction("bodyguard", { seat });
	          return;
	        }
	      } else if (roleId === "curator") {
	        const seat = selSeats[0];
	        if (selSeats.length === 1 && seat) {
	          submitNightAction("curator", { seat });
	          return;
	        }
	      } else if (roleId === "alpha_wolf") {
	        const seat = selSeats[0];
	        if (selSeats.length === 1 && seat) {
	          submitNightAction("alpha_wolf", { seat });
	          return;
	        }
	      } else if (roleId === "gremlin") {
	        if (selSeats.length === 2 && selSeats[0] !== selSeats[1]) {
	          submitNightAction("gremlin", { seats: selSeats });
	          return;
	        }
	      } else if (roleId === "marksman") {
	        if (selSeats.length === 2 && selSeats[0] !== selSeats[1]) {
	          submitNightAction("marksman", { seats: selSeats });
	          return;
	        }
	      } else if (roleId === "village_idiot") {
	        const dir = String(state.nightUi?.dir || "");
	        if (dir === "left" || dir === "right") {
	          submitNightAction("village_idiot", { dir });
          return;
        }
      } else if (roleId === "werewolf") {
        // Lone wolf optional peek (centerIndex).
        const centerIndex = selCenter[0];
        if (selCenter.length === 1 && Number.isFinite(centerIndex)) {
          const el = nightAction.querySelector(`.nightChoiceCard[data-center-index="${CSS.escape(String(centerIndex))}"]`);
          flipEl(el);
          submitNightAction("werewolf", { centerIndex });
          return;
        }
      }
    }

    renderNightOverlay();
  };

  function pulseEl(el) {
    if (!el) return;
    CardUI?.motion?.emphasis?.(el, "pulse");
  }

  function selectBounce(el) {
    if (!el) return;
    if (window.gsap) {
      const gsap = window.gsap;
      gsap.killTweensOf(el);
      gsap.fromTo(
        el,
        { y: 0 },
        { y: -6, duration: 0.11, ease: "power2.out", yoyo: true, repeat: 1, overwrite: "auto" }
      );
      return;
    }
    el.animate([{ transform: "translateY(0)" }, { transform: "translateY(-6px)" }, { transform: "translateY(0)" }], {
      duration: 220,
      easing: "ease-out",
    });
  }

  function pulseBgCard() {
    const bg = nightActive.querySelector(".nightBgCard");
    if (!bg) return;
    if (window.gsap) {
      const gsap = window.gsap;
      gsap.killTweensOf(bg);
      gsap.set(bg, { "--bg-pulse": 0 });
      gsap.timeline({ defaults: { overwrite: "auto" } })
        .to(bg, { "--bg-pulse": 1, duration: 0.12, ease: "power2.out" }, 0)
        .to(bg, { "--bg-pulse": 0, duration: 0.55, ease: "power3.out" }, 0.12);
      return;
    }
    bg.animate([{ opacity: 1 }, { opacity: 0.98 }, { opacity: 1 }], { duration: 280, easing: "ease-out" });
  }

  function flipEl(el) {
    if (!el) return;
    CardUI?.motion?.flip?.(el, { duration: 0.4 });
  }

  function ensureDebugRoles() {
    if (!state.debugNightPreview) return;
    const roleIds = Object.keys(ROLE_DEFINITIONS || {});
    if (!roleIds.length) return;

    const pick = () => roleIds[Math.floor(Math.random() * roleIds.length)];
    const playersNow = (state.room?.players || []).filter((p) => p.connected && !p.isSpectator);

    // Seats
    for (const p of playersNow) {
      const seat = Number(p.seat || 0);
      if (!seat) continue;
      if (!state.debugRoleBySeat[seat]) state.debugRoleBySeat[seat] = pick();
    }
    // Center 3
    for (const idx of [0, 1, 2]) {
      if (!state.debugRoleByCenter[idx]) state.debugRoleByCenter[idx] = pick();
    }
    // Make sure at least one werewolf exists for preview.
    const anyWolf =
      Object.values(state.debugRoleBySeat).some((r) => NightBoardUI?.isWolfTeam?.(r)) ||
      Object.values(state.debugRoleByCenter).some((r) => NightBoardUI?.isWolfTeam?.(r));
    if (!anyWolf) {
      state.debugRoleByCenter[0] = "werewolf";
    }
  }

  const buildRevealedRoleHtml = (roleId) => {
    const def = ROLE_DEFINITIONS?.[roleId] || null;
    const title = escapeHtml(getRoleDisplayName(roleId || ""));
    return `
      <div class="nightChoiceReveal">
        <div class="nightChoiceReveal__title">${title}</div>
      </div>
    `;
  };

	  function flipRevealRole(el, roleId) {
	    if (!el) return;
	    ensureDebugRoles();
	    const rid = String(roleId || "");
	    if (!rid) return;

	    if (NightBoardUI?.flipRevealRole) {
	      NightBoardUI.flipRevealRole(el, {
	        roleId: rid,
	        isWerewolf: !!NightBoardUI?.isWolfTeam?.(rid),
	        getRoleDisplayName,
	        escapeHtml,
	      });
	      return;
	    }

	    // Fallback: if NightBoardUI isn't loaded, still show role name on the flipped card.
	    el.classList.add("nightChoiceCard--revealed");
	    el.classList.remove("nightChoice--blocked");
	    el.innerHTML = buildRevealedRoleHtml(rid);
	  }

  function flipRevertRole(el) {
    if (!el) return;
    if (NightBoardUI?.flipRevertRole) NightBoardUI.flipRevertRole(el);
  }

	  function applyNightResultOnce(expectedRoleId, applyFn) {
	    const nr = state.nightResult || null;
	    if (!nr || !nr.result) return false;
	    const resultStepId = isPostActionStep ? Number(state.lastNightAction?.duringStepId || 0) : Number(stepId || 0);
	    if (Number(nr.stepId || 0) !== Number(resultStepId || 0)) return false;
	    if (String(nr.roleId || "") !== String(expectedRoleId || "")) return false;
	    let key = "";
	    try {
	      key = `${Number(resultStepId || 0)}:${String(expectedRoleId || "")}:${JSON.stringify(nr.result)}`;
	    } catch (e) {
	      key = `${Number(resultStepId || 0)}:${String(expectedRoleId || "")}:*`;
	    }
	    if (state.lastNightResultApplyKey === key) return false;
	    state.lastNightResultApplyKey = key;
    try {
      applyFn(nr.result);
    } catch (e) {
      console.warn("[night_result] apply failed", e);
    }
    return true;
  }

  function clearBlockedBadges(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    rootEl.querySelectorAll(".nightChoice--blocked").forEach((el) => el.classList.remove("nightChoice--blocked"));
  }

  function setButtonLabelWithDict(btn, text, { force = false, lock = false } = {}) {
    if (!btn) return;
    const s = String(text ?? "");
    if (window.TextHighlight?.pickDictionaryHighlights && window.ButtonUI?.setHighlightedLabel) {
      const highlights = window.TextHighlight.pickDictionaryHighlights(s, { defaultClassName: "btn__hl" });
      if (highlights.length) {
        window.ButtonUI.setHighlightedLabel(btn, s, highlights, { force, lock });
        return;
      }
    }
    (window.ButtonUI?.setLabel || ((b, x) => (b.textContent = String(x ?? ""))))(btn, s, { force, lock });
  }

  function ensureActionMessageEl(afterEl) {
    if (!afterEl || !afterEl.parentNode) return null;
    const el = document.createElement("div");
    el.className = "nightActionMsg";
    afterEl.insertAdjacentElement("afterend", el);
    return el;
  }

  function setBoardMessage(board, msg) {
    if (!board) return;
    const payload =
      msg && typeof msg === "object"
        ? { text: String(msg.text || ""), highlights: Array.isArray(msg.highlights) ? msg.highlights : [] }
        : { text: String(msg || ""), highlights: [] };
    board.lockedLabel = payload.text;

    if (board.messageEl) {
      board.messageEl.textContent = payload.text;
    }

    if (board.confirmBtn) {
      if (payload.highlights.length) {
        (window.ButtonUI?.lockHighlightedLabel || window.ButtonUI?.setHighlightedLabel)?.(board.confirmBtn, payload.text, payload.highlights, {
          lock: true,
          force: true,
        });
      } else {
        (window.ButtonUI?.lockLabel || window.ButtonUI?.setLabel)?.(board.confirmBtn, payload.text, { lock: true, force: true });
        if (!window.ButtonUI?.lockLabel && !window.ButtonUI?.setLabel) board.confirmBtn.textContent = payload.text;
      }
      board.confirmBtn.disabled = true;
      board.confirmBtn.setAttribute("aria-disabled", "true");
    }
  }

		  function submitNightAction(roleIdForAction, action) {
	    const rid = String(roleIdForAction || "");
	    const a = action || {};
	    if (!rid) return;

	    state.nightSubmittedStepId = stepId;
	    state.lastNightAction = { roleId: rid, duringStepId: stepId };
	    renderNightOverlay();

    if (!state.debugNightPreview) {
      send({ type: "night_action", data: { stepId, action: a } });
      return;
    }

    ensureDebugRoles();
    const mySeatNum = Number(state.mySeat || 0);

    const asInt = (x, fallback = 0) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : fallback;
    };

    let result = null;
    if (rid === "seer") {
      const mode = String(a.mode || "");
      if (mode === "player") {
        const seat = asInt(a.seat, 0);
        const role = String(state.debugRoleBySeat?.[seat] || "villager");
        if (seat) result = { seat, role };
      } else if (mode === "center") {
        const indices = Array.isArray(a.indices) ? a.indices.map((x) => asInt(x, -1)).filter((i) => i >= 0 && i <= 2) : [];
        if (indices.length === 2 && indices[0] !== indices[1]) {
          result = {
            center: indices.map((i) => ({ index: i, role: String(state.debugRoleByCenter?.[i] || "villager") })),
          };
        }
      }
    } else if (rid === "robber") {
      const seat = asInt(a.seat, 0);
      if (seat && seat !== mySeatNum) {
        const myRole = state.debugRoleBySeat?.[mySeatNum];
        const targetRole = state.debugRoleBySeat?.[seat];
        if (myRole != null && targetRole != null) {
          state.debugRoleBySeat[mySeatNum] = targetRole;
          state.debugRoleBySeat[seat] = myRole;
        }
        result = { newRole: String(targetRole || "villager"), targetSeat: seat };
      }
    } else if (rid === "troublemaker") {
      const seats = Array.isArray(a.seats) ? a.seats.map((x) => asInt(x, 0)).filter(Boolean) : [];
      if (seats.length === 2 && seats[0] !== seats[1]) {
        const ra = state.debugRoleBySeat?.[seats[0]];
        const rb = state.debugRoleBySeat?.[seats[1]];
        if (ra != null && rb != null) {
          state.debugRoleBySeat[seats[0]] = rb;
          state.debugRoleBySeat[seats[1]] = ra;
        }
        result = { swappedSeats: seats };
      }
    } else if (rid === "drunk") {
      const idx = asInt(a.centerIndex, -1);
      if (idx >= 0 && idx <= 2 && mySeatNum) {
        const myRole = state.debugRoleBySeat?.[mySeatNum];
        const centerRole = state.debugRoleByCenter?.[idx];
        if (myRole != null && centerRole != null) {
          state.debugRoleBySeat[mySeatNum] = centerRole;
          state.debugRoleByCenter[idx] = myRole;
        }
        result = { swapped: true };
      }
    } else if (rid === "werewolf") {
      const idx = asInt(a.centerIndex, -1);
      if (idx >= 0 && idx <= 2) {
        result = { centerIndex: idx, role: String(state.debugRoleByCenter?.[idx] || "villager") };
      }
    } else if (rid === "sentinel") {
      const seat = asInt(a.seat, 0);
      if (seat) result = { seat };
    } else if (rid === "bodyguard") {
      const seat = asInt(a.seat, 0);
      if (seat) result = { seat };
    } else if (rid === "apprentice_seer") {
      const idx = asInt(a.centerIndex, -1);
      if (idx >= 0 && idx <= 2) {
        result = { centerIndex: idx, role: String(state.debugRoleByCenter?.[idx] || "villager") };
      }
    } else if (rid === "mystic_wolf") {
      const seat = asInt(a.seat, 0);
      if (seat && seat !== mySeatNum) result = { seat, role: String(state.debugRoleBySeat?.[seat] || "villager") };
    } else if (rid === "revealer") {
      const seat = asInt(a.seat, 0);
      if (seat && seat !== mySeatNum) {
        const role = String(state.debugRoleBySeat?.[seat] || "villager");
        const wolfTeam = new Set(["werewolf", "minion", "alpha_wolf", "mystic_wolf"]);
        if (wolfTeam.has(role) || role === "tanner") result = { seat, blocked: true };
        else result = { seat, role };
      }
    } else if (rid === "curator") {
      const seat = asInt(a.seat, 0);
      const artifact = String(state.nightPrivate?.payload?.artifact || "artifact");
      if (seat) result = { seat, artifact };
    } else if (rid === "pickpocket") {
      const seat = asInt(a.seat, 0);
      if (seat && seat !== mySeatNum) {
        const myRole = state.debugRoleBySeat?.[mySeatNum];
        const targetRole = state.debugRoleBySeat?.[seat];
        if (myRole != null && targetRole != null) {
          state.debugRoleBySeat[mySeatNum] = targetRole;
          state.debugRoleBySeat[seat] = myRole;
        }
        result = { targetSeat: seat, swapped: true };
      }
    } else if (rid === "gremlin") {
      const seats = Array.isArray(a.seats) ? a.seats.map((x) => asInt(x, 0)).filter(Boolean) : [];
      if (seats.length === 2 && seats[0] !== seats[1]) {
        const ra = state.debugRoleBySeat?.[seats[0]];
        const rb = state.debugRoleBySeat?.[seats[1]];
        if (ra != null && rb != null) {
          state.debugRoleBySeat[seats[0]] = rb;
          state.debugRoleBySeat[seats[1]] = ra;
        }
        result = { swappedSeats: seats };
      }
    } else if (rid === "marksman") {
      const seats = Array.isArray(a.seats)
        ? a.seats.map((x) => asInt(x, 0)).filter(Boolean)
        : a.seat
            ? [asInt(a.seat, 0)].filter(Boolean)
            : [];
      const uniq = [];
      for (const s of seats) if (!uniq.includes(s)) uniq.push(s);
      const picked = uniq.slice(0, 2);
      if (picked.length) {
        const roles = {};
        for (const s of picked) roles[String(s)] = String(state.debugRoleBySeat?.[s] || "villager");
        result = { seats: picked, roles };
      }
    } else if (rid === "alpha_wolf") {
      const seat = asInt(a.seat, 0);
      if (seat && seat !== mySeatNum) {
        let idx = [0, 1, 2].find((i) => String(state.debugRoleByCenter?.[i] || "") === "werewolf");
        if (idx == null) {
          idx = 0;
          state.debugRoleByCenter[0] = "werewolf";
        }
        const centerRole = state.debugRoleByCenter?.[idx];
        const targetRole = state.debugRoleBySeat?.[seat];
        if (centerRole != null && targetRole != null) {
          state.debugRoleBySeat[seat] = centerRole;
          state.debugRoleByCenter[idx] = targetRole;
        }
        result = { targetSeat: seat, centerIndex: idx };
      }
	    } else if (rid === "village_idiot") {
	      const dir = String(a.dir || "left") === "right" ? "right" : "left";
	      const playersNow = (state.room?.players || []).filter((p) => p.connected && !p.isSpectator);
	      const seats = playersNow.map((p) => Number(p.seat || 0)).filter(Boolean).sort((a, b) => a - b);
	      if (seats.length >= 2) {
	        const roles = seats.map((s) => state.debugRoleBySeat?.[s] || "villager");
	        const rotated = dir === "left" ? roles.slice(1).concat(roles.slice(0, 1)) : roles.slice(-1).concat(roles.slice(0, -1));
	        seats.forEach((s, i) => (state.debugRoleBySeat[s] = rotated[i]));
	        result = { dir };
	      }
	    } else if (rid === "insomniac") {
	      result = { currentRole: String(state.debugRoleBySeat?.[mySeatNum] || "villager") };
	    } else if (rid === "witch") {
	      const stage = String(a.stage || "");
	      if (stage === "pass") {
	        const idx = asInt(state.nightUi?.witchPeekCenterIndex, -1);
	        result = { stage: "pass", centerIndex: idx };
	      } else if (stage === "swap") {
	        const seat = asInt(a.seat, 0);
	        const idx = asInt(state.nightUi?.witchPeekCenterIndex, -1);
	        if (seat && idx >= 0 && idx <= 2) {
	          const targetRole = state.debugRoleBySeat?.[seat];
	          const centerRole = state.debugRoleByCenter?.[idx];
	          if (targetRole != null && centerRole != null) {
	            state.debugRoleBySeat[seat] = centerRole;
	            state.debugRoleByCenter[idx] = targetRole;
	          }
	          result = { stage: "swap", centerIndex: idx, targetSeat: seat };
	        }
	      }
	    }

	    if (!result) return;
	    state.lastNightResultApplyKey = "";
	    state.nightResult = { stepId, roleId: rid, result };
	    renderNightOverlay();
	  }

	  function sendNightActionPartial(roleIdForAction, action) {
	    const rid = String(roleIdForAction || "");
	    const a = action || {};
	    if (!rid) return;

	    if (!state.debugNightPreview) {
	      send({ type: "night_action", data: { stepId, action: a } });
	      return;
	    }

	    // Debug preview: apply results locally without marking the step as submitted.
	    ensureDebugRoles();
	    const mySeatNum = Number(state.mySeat || 0);
	    const asInt = (x, fallback = 0) => {
	      const n = Number(x);
	      return Number.isFinite(n) ? n : fallback;
	    };

	    let result = null;
	    if (rid === "witch") {
	      const stage = String(a.stage || "");
	      if (stage === "peek") {
	        const idx = asInt(a.centerIndex, -1);
	        if (idx >= 0 && idx <= 2) result = { stage: "peek", centerIndex: idx, role: String(state.debugRoleByCenter?.[idx] || "villager") };
	      } else if (stage === "pass") {
	        result = { stage: "pass", centerIndex: asInt(state.nightUi?.witchPeekCenterIndex, -1) };
	      } else if (stage === "swap") {
	        const seat = asInt(a.seat, 0);
	        const idx = asInt(state.nightUi?.witchPeekCenterIndex, -1);
	        if (seat && idx >= 0 && idx <= 2) {
	          const tid = String(seat);
	          const targetRole = state.debugRoleBySeat?.[seat];
	          const centerRole = state.debugRoleByCenter?.[idx];
	          if (targetRole != null && centerRole != null) {
	            state.debugRoleBySeat[seat] = centerRole;
	            state.debugRoleByCenter[idx] = targetRole;
	          }
	          result = { stage: "swap", centerIndex: idx, targetSeat: seat, mySeat: mySeatNum };
	        }
	      }
	    }

	    if (!result) return;
	    state.lastNightResultApplyKey = "";
	    state.nightResult = { stepId, roleId: rid, result };
	    renderNightOverlay();
	  }

  function swapEls(a, b, opts = {}) {
    if (!a || !b || a === b) return;
    if (NightBoardUI?.swapEls) return NightBoardUI.swapEls(a, b, { duration: 0.32, ...(opts || {}) });

    // Fallback (no animation): keep behavior consistent in case NightBoardUI is unavailable.
    const aNext = a.nextSibling;
    const bNext = b.nextSibling;
    const pa = a.parentNode;
    const pb = b.parentNode;
    if (!pa || !pb) return;
    pa.insertBefore(b, aNext);
    pb.insertBefore(a, bNext);
    if (typeof opts?.onComplete === "function") opts.onComplete();
  }

  function startOrbit(arenaEl, itemEls, { speed = 0.035 } = {}) {
    return NightBoardUI?.startTrackMotion ? NightBoardUI.startTrackMotion(arenaEl, itemEls, { speed }) : () => {};
  }

  const renderPlayerChoices = ({ selectedSeats = [], max = 1 } = {}) => {
    const row = document.createElement("div");
    row.className = "nightAction__row";
    row.classList.toggle("nightAction__row--dense", players.length >= 11);
    for (const p of players) {
      const isMe = p.clientId === state.clientId;
      const b = CardUI?.createNightPlayerCard
        ? CardUI.createNightPlayerCard({ player: p, isMe, applyPalette: applyPlayerPalette })
        : (() => {
            const el = document.createElement("button");
            el.className = "nightChoice nightChoiceCard";
            el.setAttribute("data-seat", String(p.seat || ""));
            if (isMe) el.dataset.isMe = "1";
            el.innerHTML = `
              ${isMe ? `<div class="meTab meTab--night">본인</div>` : ""}
              <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
              <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "?‘¤")}</div>
              <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
            `;
            applyPlayerPalette(el, p.color || "#888");
            return el;
          })();
      if (selectedSeats.includes(Number(p.seat))) b.classList.add("nightChoice--selected");
      b.addEventListener("click", () => {
        pulseEl(b);
        const seat = Number(p.seat);
        let nextSel = [...selectedSeats];
        if (nextSel.includes(seat)) nextSel = nextSel.filter((x) => x !== seat);
        else if (max === 1) nextSel = [seat];
        else if (nextSel.length < max) nextSel.push(seat);
        else nextSel = [nextSel[1], seat];
        setChoiceState({ selectedSeats: nextSel });
      });
      row.appendChild(b);
    }
    return row;
  };

  const renderCenterChoices = ({ selected = [], max = 1 } = {}) => {
    const row = document.createElement("div");
    row.className = "nightAction__row";
    row.classList.toggle("nightAction__row--dense", players.length >= 11);
    for (const idx of [0, 1, 2]) {
      const b = document.createElement("button");
      b.className = "nightChoice nightChoiceCard nightChoiceCard--center";
      b.setAttribute("data-center-index", String(idx));
      b.innerHTML = `
        <div class="nightChoiceCard__seat">C${idx + 1}</div>
        <div class="nightChoiceCard__avatar">🂠</div>
        <div class="nightChoiceCard__name">중앙 카드 ${idx + 1}</div>
      `;
      applyPlayerPalette(b, me?.color || "#888");
      if (selected.includes(idx)) b.classList.add("nightChoice--selected");
      b.addEventListener("click", () => {
        flipEl(b);
        let next = [...selected];
        if (next.includes(idx)) next = next.filter((x) => x !== idx);
        else if (max === 1) next = [idx];
        else if (next.length < max) next.push(idx);
        else next = [next[1], idx];
        setChoiceState({ selectedCenter: next });
      });
      row.appendChild(b);
    }
    return row;
  };

  function submitBtn(label, onClick) {
    const b = document.createElement("button");
    b.className = "btn btn--cta";
    setButtonLabelWithDict(b, label, { force: true });
    b.addEventListener("click", onClick);
    return b;
  }

  const ui = state.nightUi || {};
  nightAction.classList.remove("hidden");

  if (roleId === "seer") {
    const useOrbitBoard = !!useBgRuleCard;
    const seerRuleText = (() => {
      const def = ROLE_DEFINITIONS[activeRole] || null;
      return def?.desc || "카드를 선택하세요.";
    })();
    const selectedSeats = Array.isArray(ui.selectedSeats) ? ui.selectedSeats : [];
    const selectedCenter = Array.isArray(ui.selectedCenter) ? ui.selectedCenter : [];

    const row = document.createElement("div");
    row.className = useOrbitBoard ? "nightBoard" : "nightAction__row nightAction__row--board";
    if (!useOrbitBoard) row.classList.toggle("nightAction__row--dense", players.length >= 11);

    const mkCardTilt = (seed) => {
      const n = Number(seed) || 0;
      const a = ((n * 1103515245 + 12345) >>> 0) % 9; // 0..8
      return (a - 4) * 0.35; // -1.4..+1.4 deg
    };

  const mkCenterCard = (idx) => {
      const b = document.createElement("button");
      b.className = useOrbitBoard ? "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard" : "nightChoice nightChoiceCard nightChoiceCard--center";
      b.setAttribute("data-center-index", String(idx));
      b.style.setProperty("--tilt-deg", `${mkCardTilt(idx + 100)}deg`);
      b.innerHTML = `
        <div class="nightChoiceCard__seat">C${idx + 1}</div>
        <div class="nightChoiceCard__avatar">🂠</div>
        <div class="nightChoiceCard__name">중앙 카드</div>
      `;
	      applyPlayerPalette(b, me?.color || "#888");
	      if (selectedCenter.includes(idx)) b.classList.add("nightChoice--selected");
	      b.addEventListener("click", () => {
	        selectBounce(b);
	        pulseBgCard();
	        let next = [...(Array.isArray(state.nightUi?.selectedCenter) ? state.nightUi.selectedCenter : selectedCenter)];
	        if (next.includes(idx)) next = next.filter((x) => x !== idx);
        else if (next.length < 2) next.push(idx);
        else next = [next[1], idx];
        state.nightUi = { ...(state.nightUi || {}), selectedCenter: next, selectedSeats: [] };
        if (state.nightSeerBoard && state.nightSeerBoard.stepId === stepId) updateSeerOrbitSelection();
        else setChoiceState({ selectedCenter: next, selectedSeats: [] });
      });
      return b;
    };

    const mkPlayerCard = (p) => {
      const isMe = p.clientId === state.clientId;
      const b = document.createElement("button");
      b.className = useOrbitBoard ? "nightChoice nightChoiceCard nightBoard__orbitCard" : "nightChoice nightChoiceCard";
      b.setAttribute("data-seat", String(p.seat || ""));
      if (isMe) b.dataset.isMe = "1";
      b.style.setProperty("--tilt-deg", `${mkCardTilt(p.seat)}deg`);
      b.innerHTML = `
        <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
        <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "👤")}</div>
        <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
      `;
      applyPlayerPalette(b, p.color || "#888");
      if (isMe) {
        (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(b, false);
        NightBoardUI?.setBlockedBadge?.(b, true);
      }
      if (selectedSeats.includes(Number(p.seat))) b.classList.add("nightChoice--selected");
      b.addEventListener("click", () => {
        if (isMe) return; // Seer: cannot target self.
        selectBounce(b);
        pulseBgCard();
        const seat = Number(p.seat);
        const current = Array.isArray(state.nightUi?.selectedSeats) ? state.nightUi.selectedSeats : selectedSeats;
        const nextSel = current.includes(seat) ? [] : [seat];
        state.nightUi = { ...(state.nightUi || {}), selectedSeats: nextSel, selectedCenter: [] };
        if (state.nightSeerBoard && state.nightSeerBoard.stepId === stepId) updateSeerOrbitSelection();
        else setChoiceState({ selectedSeats: nextSel, selectedCenter: [] });
      });
      return b;
    };

    let orbitArena = null;
    if (useOrbitBoard) {
      row.innerHTML = `
        <div class="nightBoard__arena">
          <div class="nightBoard__center"></div>
          <div class="nightBoard__orbit"></div>
        </div>
      `;
      orbitArena = row.querySelector(".nightBoard__arena");
      const centerEl = row.querySelector(".nightBoard__center");
      const orbitEl = row.querySelector(".nightBoard__orbit");

      // Center stack (3 cards)
      const byCenter = new Map();
      for (const idx of [0, 1, 2]) {
        const c = mkCenterCard(idx);
        byCenter.set(idx, c);
        centerEl.appendChild(c);
      }

      // Orbiting player cards (include me)
      const orbitCards = [];
      const bySeat = new Map();
      const orbitPlayers = [...players];
      orbitPlayers.forEach((p) => {
        const c = mkPlayerCard(p);
        orbitEl.appendChild(c);
        orbitCards.push(c);
        bySeat.set(Number(p.seat), c);
      });
      // Evenly spaced along track (0..1).
      orbitCards.forEach((c, i) => {
        c.dataset.orbitBase = String(i / Math.max(1, orbitCards.length));
      });

      CardUI?.motion?.staggerEnter?.(centerEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.04 });
      CardUI?.motion?.staggerEnter?.(orbitEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.01 });
      state.nightOrbitCleanup = startOrbit(orbitArena, orbitCards, { speed: 0.035 });
      nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);

	      const messageEl = ensureActionMessageEl(row);
	      if (messageEl) messageEl.textContent = "플레이어 1명 또는 중앙 2장을 탭하면 즉시 확인합니다.";

	      nightAction.appendChild(row);
      state.nightSeerBoard = { stepId, bySeat, byCenter, messageEl, preview: { active: false }, ruleText: seerRuleText };
	      ensureDebugRoles();
	      updateSeerOrbitSelection();
      applyNightResultOnce("seer", (result) => {
        const r = result || {};
        if (r && typeof r === "object" && r.role && r.seat) {
          const el = bySeat.get(Number(r.seat)) || null;
          flipRevealRole(el, String(r.role || ""));
        }
        const center = Array.isArray(r.center) ? r.center : [];
        center.forEach((x) => {
          const idx = Number(x?.index);
          const rid = String(x?.role || "");
          if (!Number.isFinite(idx) || !rid) return;
          const el = byCenter.get(idx) || null;
          flipRevealRole(el, rid);
        });
      });
      // Don't fall through to the generic confirm button below.
      ensureNightMeTabs(nightOverlay);
      ensureSeatMarks(nightOverlay);
      return;
    } else {
      // Flat board mode (grid)
      for (const idx of [0, 1, 2]) row.appendChild(mkCenterCard(idx));
      for (const p of players) row.appendChild(mkPlayerCard(p));
      CardUI?.motion?.staggerEnter?.(row.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.025 });
    }

    nightAction.appendChild(row);
    const messageEl = ensureActionMessageEl(row);
    if (messageEl) messageEl.textContent = "플레이어 1명 또는 중앙 2장을 선택하면 즉시 확인합니다.";
  } else if (roleId === "robber") {
    const useOrbitBoard = !!useBgRuleCard;
    if (useOrbitBoard) {
      ensureDebugRoles();
      nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);
      nightAction.classList.remove("hidden");

      const def = ROLE_DEFINITIONS[activeRole] || null;
      const ruleText = def?.desc || "카드를 선택하세요.";

      const { row, orbitArena, centerEl, orbitEl } = createNightBoardScaffold();

      // Center stack (3 cards) - decorative in robber (still interactive for flip preview).
      const byCenter = new Map();
      for (const idx of [0, 1, 2]) {
        const c = document.createElement("button");
        c.className = "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard";
        c.setAttribute("data-center-index", String(idx));
        c.innerHTML = `
          <div class="nightChoiceCard__seat">C${idx + 1}</div>
          <div class="nightChoiceCard__avatar">🂠</div>
          <div class="nightChoiceCard__name">중앙 카드</div>
        `;
        applyPlayerPalette(c, me?.color || "#888");
        // Robber: center cards are not interactable (no flip on click).
        (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(c, false);
        NightBoardUI?.setBlockedBadge?.(c, true);
        byCenter.set(idx, c);
        centerEl.appendChild(c);
      }

      // Orbiting player cards (select 1 to swap).
      const bySeat = new Map();
      const playerBySeat = new Map();
      const orbitCards = [];
      const playersSorted = [...players].sort((a, b) => Number(a.seat) - Number(b.seat));
      playersSorted.forEach((p) => {
        const isMe = p.clientId === state.clientId;
        const b = document.createElement("button");
        b.className = "nightChoice nightChoiceCard nightBoard__orbitCard";
        b.setAttribute("data-seat", String(p.seat || ""));
        if (isMe) b.dataset.isMe = "1";
        b.innerHTML = `
          ${isMe ? `<div class="meTab meTab--night">본인</div>` : ""}
          ${isMe ? `<div class="meTab meTab--night">본인</div>` : ""}
          ${isMe ? `<div class="meTab meTab--night">본인</div>` : ""}
          <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
          <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "👤")}</div>
          <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
        `;
        applyPlayerPalette(b, p.color || "#888");
        if (isMe) {
          (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(b, false);
          NightBoardUI?.setBlockedBadge?.(b, true);
        }
        b.addEventListener("click", () => {
          if (isMe) return; // Robber: cannot target self.
          selectBounce(b);
          pulseBgCard();
          const seat = Number(p.seat);
          state.nightUi = { ...(state.nightUi || {}), selectedSeats: [seat], selectedCenter: [] };
          updateRobberOrbitSelection();
        });
        orbitEl.appendChild(b);
        orbitCards.push(b);
        bySeat.set(Number(p.seat), b);
        playerBySeat.set(Number(p.seat), p);
      });
      assignOrbitBases(orbitCards);

      const messageEl = ensureActionMessageEl(row);
      if (messageEl) messageEl.textContent = "대상을 탭하면 즉시 교환합니다.";

      nightAction.appendChild(row);
      CardUI?.motion?.staggerEnter?.(centerEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.04 });
      CardUI?.motion?.staggerEnter?.(orbitEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.01 });
      state.nightOrbitCleanup = startOrbit(orbitArena, orbitCards, { speed: 0.035 });
      state.nightRobberBoard = { stepId, bySeat, byCenter, messageEl, preview: { active: false }, ruleText };
      updateRobberOrbitSelection();
      applyNightResultOnce("robber", (result) => {
        const r = result || {};
        const mySeat = Number(state.mySeat || 0);
        const mine = bySeat.get(mySeat) || null;
        const targetSeat = Number(r.targetSeat || 0);
        const target = bySeat.get(targetSeat) || null;
        const newRole = String(r.newRole || "");
        if (!mine || !newRole) return;
        const roleName = getRoleDisplayName(newRole);
        setBoardMessage(state.nightRobberBoard, { text: `이제 당신의 신분은 ${roleName}로 교환됐습니다.`, highlights: [roleName] });
        if (target && target !== mine) {
          if (NightBoardUI?.swapEls) {
            NightBoardUI.swapEls(mine, target, {
              duration: 0.32,
              onComplete: () => flipRevealRole(mine, newRole),
            });
          } else {
            swapEls(mine, target);
            flipRevealRole(mine, newRole);
          }
        } else {
          flipRevealRole(mine, newRole);
        }
      });
      return;
    }

    nightAction.appendChild(renderPlayerChoices({ selectedSeats: ui.selectedSeats || [], max: 1 }));
  } else if (roleId === "troublemaker") {
    const useOrbitBoard = !!useBgRuleCard;
    if (useOrbitBoard) {
      nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);
      nightAction.classList.remove("hidden");

      const def = ROLE_DEFINITIONS[activeRole] || null;
      const ruleText = def?.desc || "카드를 선택하세요.";

      const selectedSeats = Array.isArray(state.nightUi?.selectedSeats) ? state.nightUi.selectedSeats.map(Number) : [];

      const { row, orbitArena, centerEl, orbitEl } = createNightBoardScaffold();

      // Center stack (3 cards) - decorative (disabled).
      for (const idx of [0, 1, 2]) {
        const c = document.createElement("button");
        c.className = "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard";
        c.setAttribute("data-center-index", String(idx));
        c.innerHTML = `
          <div class="nightChoiceCard__seat">C${idx + 1}</div>
          <div class="nightChoiceCard__avatar">🂠</div>
          <div class="nightChoiceCard__name">중앙 카드</div>
        `;
        applyPlayerPalette(c, me?.color || "#888");
        (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(c, false);
        NightBoardUI?.setBlockedBadge?.(c, true);
        centerEl.appendChild(c);
      }

      const bySeat = new Map();
      const playerBySeat = new Map();
      const orbitCards = [];
      const playersSorted = [...players].sort((a, b) => Number(a.seat) - Number(b.seat));
      playersSorted.forEach((p) => {
        const isMe = p.clientId === state.clientId;
        const b = document.createElement("button");
        b.className = "nightChoice nightChoiceCard nightBoard__orbitCard";
        b.setAttribute("data-seat", String(p.seat || ""));
        if (isMe) b.dataset.isMe = "1";
        b.innerHTML = `
          <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
          <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "👤")}</div>
          <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
        `;
        applyPlayerPalette(b, p.color || "#888");
        if (isMe) {
          (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(b, false);
          NightBoardUI?.setBlockedBadge?.(b, true);
        }
        if (selectedSeats.includes(Number(p.seat))) b.classList.add("nightChoice--selected");

        b.addEventListener("click", () => {
          if (isMe) return; // Troublemaker: pick two other players.
          selectBounce(b);
          pulseBgCard();
          const seat = Number(p.seat);
          const current = Array.isArray(state.nightUi?.selectedSeats) ? state.nightUi.selectedSeats.map(Number) : [];
          let next = [...current];
          if (next.includes(seat)) next = next.filter((x) => x !== seat);
          else if (next.length < 2) next.push(seat);
          else next = [next[1], seat];
          state.nightUi = { ...(state.nightUi || {}), selectedSeats: next, selectedCenter: [] };
          updateTroublemakerOrbitSelection();
        });

        orbitEl.appendChild(b);
        orbitCards.push(b);
        bySeat.set(Number(p.seat), b);
        playerBySeat.set(Number(p.seat), p);
      });
      assignOrbitBases(orbitCards);

      const messageEl = ensureActionMessageEl(row);
      if (messageEl) messageEl.textContent = "플레이어 2명을 선택하면 즉시 교환합니다.";

      nightAction.appendChild(row);
      CardUI?.motion?.staggerEnter?.(centerEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.04 });
      CardUI?.motion?.staggerEnter?.(orbitEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.01 });
      state.nightOrbitCleanup = startOrbit(orbitArena, orbitCards, { speed: 0.035 });
      state.nightTroublemakerBoard = { stepId, bySeat, messageEl, preview: { active: false }, ruleText };
      updateTroublemakerOrbitSelection();
      applyNightResultOnce("troublemaker", (result) => {
        const r = result || {};
        const seats = Array.isArray(r.swappedSeats) ? r.swappedSeats.map(Number) : [];
        if (seats.length !== 2 || seats[0] === seats[1]) return;
        const aEl = bySeat.get(seats[0]) || null;
        const bEl = bySeat.get(seats[1]) || null;
        if (!aEl || !bEl) return;
        setBoardMessage(state.nightTroublemakerBoard, {
          text: `${seats[0]}번 ${seats[1]}번 신분 카드가 서로 교환됐었습니다.`,
          highlights: [`${seats[0]}번`, `${seats[1]}번`],
        });
        swapEls(aEl, bEl, { flip: true });
      });
      ensureNightMeTabs(nightOverlay);
      ensureSeatMarks(nightOverlay);
      return;
    }

    nightAction.appendChild(renderPlayerChoices({ selectedSeats: ui.selectedSeats || [], max: 2 }));
  } else if (roleId === "drunk") {
    const useOrbitBoard = !!useBgRuleCard;
    if (useOrbitBoard) {
      ensureDebugRoles();
      nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);
      nightAction.classList.remove("hidden");

      const def = ROLE_DEFINITIONS[activeRole] || null;
      const ruleText = def?.desc || "중앙 카드 1장을 선택하세요.";

      const selectedCenter = Array.isArray(state.nightUi?.selectedCenter) ? state.nightUi.selectedCenter.map(Number) : [];

      const { row, orbitArena, centerEl, orbitEl } = createNightBoardScaffold();

      // Center stack (3 cards) - selectable (pick 1)
      const byCenter = new Map();
      for (const idx of [0, 1, 2]) {
        const c = document.createElement("button");
        c.className = "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard";
        c.setAttribute("data-center-index", String(idx));
        c.innerHTML = `
          <div class="nightChoiceCard__seat">C${idx + 1}</div>
          <div class="nightChoiceCard__avatar">🂠</div>
          <div class="nightChoiceCard__name">중앙 카드</div>
        `;
        applyPlayerPalette(c, me?.color || "#888");
        if (selectedCenter.includes(idx)) c.classList.add("nightChoice--selected");
        c.addEventListener("click", () => {
          selectBounce(c);
          pulseBgCard();
          const current = Array.isArray(state.nightUi?.selectedCenter) ? state.nightUi.selectedCenter.map(Number) : [];
          const next = current.includes(idx) ? [] : [idx];
          state.nightUi = { ...(state.nightUi || {}), selectedCenter: next, selectedSeats: [] };
          updateDrunkOrbitSelection();
        });
        byCenter.set(idx, c);
        centerEl.appendChild(c);
      }

      // Orbiting player cards (including me) - decorative only
      const orbitCards = [];
      const bySeat = new Map();
      const playersSorted = [...players].sort((a, b) => Number(a.seat) - Number(b.seat));
      playersSorted.forEach((p) => {
        const b = document.createElement("button");
        b.className = "nightChoice nightChoiceCard nightBoard__orbitCard";
        b.setAttribute("data-seat", String(p.seat || ""));
        b.innerHTML = `
          <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
          <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "👤")}</div>
          <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
        `;
        applyPlayerPalette(b, p.color || "#888");
        if (p.clientId === state.clientId) b.dataset.isMe = "1";
        // Drunk: you may not choose players; only center. Show blocked badge on orbit cards.
        (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(b, false);
        NightBoardUI?.setBlockedBadge?.(b, true);
        orbitEl.appendChild(b);
        orbitCards.push(b);
        bySeat.set(Number(p.seat), b);
      });
      assignOrbitBases(orbitCards);

      const messageEl = ensureActionMessageEl(row);
      if (messageEl) messageEl.textContent = "중앙 카드 1장을 선택하면 즉시 교환합니다. (카드는 확인하지 않습니다)";

      nightAction.appendChild(row);
      CardUI?.motion?.staggerEnter?.(centerEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.04 });
      CardUI?.motion?.staggerEnter?.(orbitEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.01 });
      state.nightOrbitCleanup = startOrbit(orbitArena, orbitCards, { speed: 0.035 });
      state.nightDrunkBoard = { stepId, byCenter, messageEl, preview: { active: false }, ruleText };
      updateDrunkOrbitSelection();
      return;
    }

    nightAction.appendChild(renderCenterChoices({ selected: ui.selectedCenter || [], max: 1 }));
  } else if (roleId === "insomniac") {
    const useOrbitBoard = !!useBgRuleCard;
    const def = ROLE_DEFINITIONS[activeRole] || null;
    const ruleText = def?.desc || "내 현재 역할을 확인합니다.";

    if (useOrbitBoard) {
      ensureDebugRoles();
      nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);
      nightAction.classList.remove("hidden");

      const { row, orbitArena, centerEl, orbitEl } = createNightBoardScaffold();

      // Center stack (3 cards) - keep them present but not selectable.
      for (const idx of [0, 1, 2]) {
        const c = document.createElement("button");
        c.className = "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard";
        c.setAttribute("data-center-index", String(idx));
        c.innerHTML = `
          <div class="nightChoiceCard__seat">C${idx + 1}</div>
          <div class="nightChoiceCard__avatar">🂠</div>
          <div class="nightChoiceCard__name">중앙 카드</div>
        `;
        applyPlayerPalette(c, me?.color || "#888");
        (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(c, false);
        NightBoardUI?.setBlockedBadge?.(c, true);
        centerEl.appendChild(c);
      }

      const orbitCards = [];
      let myOrbitEl = null;
      const playersSorted = [...players].sort((a, b) => Number(a.seat) - Number(b.seat));
      playersSorted.forEach((p) => {
        const isMe = p.clientId === state.clientId;
        const b = document.createElement("button");
        b.className = "nightChoice nightChoiceCard nightBoard__orbitCard";
        b.setAttribute("data-seat", String(p.seat || ""));
        if (isMe) b.dataset.isMe = "1";
        b.innerHTML = `
          ${isMe ? `<div class="meTab meTab--night">본인</div>` : ""}
          <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
          <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "👤")}</div>
          <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
        `;
        applyPlayerPalette(b, p.color || "#888");
        if (isMe) {
          myOrbitEl = b;
        } else {
          (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(b, false);
          NightBoardUI?.setBlockedBadge?.(b, true);
        }
        orbitEl.appendChild(b);
        orbitCards.push(b);
      });
      assignOrbitBases(orbitCards);

      const messageEl = ensureActionMessageEl(row);
      if (messageEl) messageEl.textContent = "본인 카드를 탭하면 즉시 확인합니다.";

      if (myOrbitEl) {
        myOrbitEl.addEventListener("click", () => {
          if (state.nightSubmittedStepId === stepId) return;
          selectBounce(myOrbitEl);
          pulseBgCard();
          submitNightAction("insomniac", {});
        });
      }

      const board = { messageEl };
      applyNightResultOnce("insomniac", (result) => {
        const rid = String(result?.currentRole || "");
        if (!rid || !myOrbitEl) return;
        flipRevealRole(myOrbitEl, rid);
        const roleName = getRoleDisplayName(rid);
        setBoardMessage(board, { text: `현재 당신의 신분은 ${roleName}입니다.`, highlights: [roleName] });
      });

      nightAction.appendChild(row);
      if (myOrbitEl) CardUI?.motion?.enter?.(myOrbitEl, "card");
      CardUI?.motion?.staggerEnter?.(centerEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.04 });
      CardUI?.motion?.staggerEnter?.(orbitEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.01 });
      state.nightOrbitCleanup = startOrbit(orbitArena, orbitCards, { speed: 0.035 });
      state.nightInsomniacBoard = { stepId, myOrbitEl, messageEl, ruleText };
      return;
    }

    // Fallback (non-orbit): single-card tap-to-reveal.
    nightAction.classList.remove("hidden");
    nightAction.classList.add("nightOverlay__action--bottomBar");
    const card = document.createElement("button");
    card.className = "nightChoice nightChoiceCard nightChoiceCard--center";
    card.dataset.isMe = "1";
    card.innerHTML = `
      <div class="meTab meTab--night">본인</div>
      <div class="nightChoiceCard__seat">${escapeHtml(String(state.mySeat || ""))}</div>
      <div class="nightChoiceCard__avatar">${escapeHtml(me?.avatar || "👤")}</div>
      <div class="nightChoiceCard__name">${escapeHtml(me?.name || "")}</div>
    `;
    applyPlayerPalette(card, me?.color || "#888");
    const messageEl = ensureActionMessageEl(card);
    if (messageEl) messageEl.textContent = "카드를 탭하면 즉시 확인합니다.";
    card.addEventListener("click", () => {
      if (state.nightSubmittedStepId === stepId) return;
      selectBounce(card);
      pulseBgCard();
      flipEl(card);
      submitNightAction("insomniac", {});
    });
    const board = { messageEl };
    applyNightResultOnce("insomniac", (result) => {
      const rid = String(result?.currentRole || "");
      if (!rid) return;
      flipRevealRole(card, rid);
      const roleName = getRoleDisplayName(rid);
      setBoardMessage(board, { text: `현재 당신의 신분은 ${roleName}입니다.`, highlights: [roleName] });
    });
    nightAction.appendChild(card);
  } else if (roleId === "witch") {
    const useOrbitBoard = !!useBgRuleCard;
    if (useOrbitBoard) {
      ensureDebugRoles();
      nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);
      nightAction.classList.remove("hidden");

      const def = ROLE_DEFINITIONS[activeRole] || null;
      const ruleText = def?.desc || "센터 카드 1장을 보고, 원하면 그 카드를 누군가의 카드와 교환합니다.";

      const peekedCenterIndexRaw = Number(state.nightUi?.witchPeekCenterIndex);
      const peekedCenterIndex = Number.isFinite(peekedCenterIndexRaw) ? peekedCenterIndexRaw : null;
      const selectedSeats = Array.isArray(state.nightUi?.selectedSeats) ? state.nightUi.selectedSeats.map(Number) : [];

      const { row, orbitArena, centerEl, orbitEl } = createNightBoardScaffold();

      const byCenter = new Map();
      const bySeat = new Map();

      const board = { messageEl: null };
      const messageEl = ensureActionMessageEl(row);
      board.messageEl = messageEl;
      if (messageEl) {
        messageEl.textContent =
          peekedCenterIndex == null
            ? "먼저 센터 카드 1장을 탭해 확인하세요."
            : "이제 교환할 플레이어를 선택하거나, '그대로'를 탭해 교환하지 않을 수 있습니다.";
      }

      const updateWitchSelection = () => {
        const peekIdxRaw = Number(state.nightUi?.witchPeekCenterIndex);
        const peekIdx = Number.isFinite(peekIdxRaw) ? peekIdxRaw : null;
        const selSeats = Array.isArray(state.nightUi?.selectedSeats) ? state.nightUi.selectedSeats.map(Number) : [];
        for (const [idx, el] of byCenter.entries()) {
          el.classList.toggle("nightChoice--selected", peekIdx === idx);
          const disable = peekIdx != null && peekIdx !== idx;
          el.disabled = !!disable || state.nightSubmittedStepId === stepId;
          el.setAttribute("aria-disabled", el.disabled ? "true" : "false");
        }
        for (const [seat, el] of bySeat.entries()) {
          el.classList.toggle("nightChoice--selected", selSeats.includes(seat));
        }
        if (passCard) {
          const canPass = peekIdx != null;
          passCard.disabled = !canPass || state.nightSubmittedStepId === stepId;
          passCard.setAttribute("aria-disabled", passCard.disabled ? "true" : "false");
          passCard.classList.toggle("nightChoice--selected", false);
        }
      };

      // Center stack (3 cards) - peek exactly one
      for (const idx of [0, 1, 2]) {
        const c = document.createElement("button");
        c.className = "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard";
        c.setAttribute("data-center-index", String(idx));
        c.innerHTML = `
          <div class="nightChoiceCard__seat">C${idx + 1}</div>
          <div class="nightChoiceCard__avatar">🂠</div>
          <div class="nightChoiceCard__name">중앙 카드</div>
        `;
        applyPlayerPalette(c, me?.color || "#888");
        c.addEventListener("click", () => {
          if (state.nightSubmittedStepId === stepId) return;
          const currentPeekRaw = Number(state.nightUi?.witchPeekCenterIndex);
          const currentPeek = Number.isFinite(currentPeekRaw) ? currentPeekRaw : null;
          if (currentPeek != null && currentPeek !== idx) {
            setBoardMessage(board, "이미 센터 카드 1장을 확인했습니다. 이제 교환 또는 '그대로'를 선택하세요.");
            return;
          }
          selectBounce(c);
          pulseBgCard();
          flipEl(c);
          setChoiceState({ selectedCenter: [idx], selectedSeats: [], witchPeekCenterIndex: idx });
          sendNightActionPartial("witch", { stage: "peek", centerIndex: idx });
          updateWitchSelection();
        });
        byCenter.set(idx, c);
        centerEl.appendChild(c);
      }

      // "Pass" card: do not swap
      const passCard = document.createElement("button");
      passCard.className = "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard";
      passCard.innerHTML = `
        <div class="nightChoiceCard__seat">PASS</div>
        <div class="nightChoiceCard__avatar">⏭️</div>
        <div class="nightChoiceCard__name">그대로</div>
      `;
      applyPlayerPalette(passCard, me?.color || "#888");
      passCard.addEventListener("click", () => {
        if (state.nightSubmittedStepId === stepId) return;
        const peekIdxRaw = Number(state.nightUi?.witchPeekCenterIndex);
        const peekIdx = Number.isFinite(peekIdxRaw) ? peekIdxRaw : null;
        if (peekIdx == null) {
          setBoardMessage(board, "먼저 센터 카드 1장을 확인하세요.");
          return;
        }
        selectBounce(passCard);
        pulseBgCard();
        submitNightAction("witch", { stage: "pass" });
      });
      centerEl.appendChild(passCard);

      // Orbiting player cards - pick one to swap with the peeked center card
      const orbitCards = [];
      const playersSorted = [...players].sort((a, b) => Number(a.seat) - Number(b.seat));
      playersSorted.forEach((p) => {
        const isMe = p.clientId === state.clientId;
        const b = document.createElement("button");
        b.className = "nightChoice nightChoiceCard nightBoard__orbitCard";
        b.setAttribute("data-seat", String(p.seat || ""));
        if (isMe) b.dataset.isMe = "1";
        b.innerHTML = `
          ${isMe ? `<div class="meTab meTab--night">본인</div>` : ""}
          <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
          <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "👤")}</div>
          <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
        `;
        applyPlayerPalette(b, p.color || "#888");
        const seat = Number(p.seat || 0);
        if (selectedSeats.includes(seat)) b.classList.add("nightChoice--selected");
        b.addEventListener("click", () => {
          if (state.nightSubmittedStepId === stepId) return;
          const peekIdxRaw = Number(state.nightUi?.witchPeekCenterIndex);
          const peekIdx = Number.isFinite(peekIdxRaw) ? peekIdxRaw : null;
          if (peekIdx == null) {
            setBoardMessage(board, "먼저 센터 카드 1장을 확인하세요.");
            return;
          }
          selectBounce(b);
          pulseBgCard();
          setChoiceState({ selectedSeats: [seat], selectedCenter: [peekIdx] });
          submitNightAction("witch", { stage: "swap", seat });
        });
        orbitEl.appendChild(b);
        orbitCards.push(b);
        bySeat.set(seat, b);
      });
      assignOrbitBases(orbitCards);

      applyNightResultOnce("witch", (result) => {
        const stage = String(result?.stage || "");
        if (stage === "peek") {
          const idx = Number(result?.centerIndex);
          const rid = String(result?.role || "");
          if (Number.isFinite(idx) && rid) {
            const el = byCenter.get(idx) || null;
            flipRevealRole(el, rid);
            setChoiceState({ witchPeekCenterIndex: idx, selectedCenter: [idx], selectedSeats: [] });
            const roleName = getRoleDisplayName(rid);
            setBoardMessage(board, { text: `C${idx + 1} 카드 신분은 ${roleName}입니다.`, highlights: [`C${idx + 1}`, roleName] });
          }
        } else if (stage === "swap") {
          const idx = Number(result?.centerIndex);
          const seat = Number(result?.targetSeat);
          if (Number.isFinite(idx) && seat) {
            setBoardMessage(board, { text: `C${idx + 1} 카드와 ${seat}번 카드가 교환되었습니다.`, highlights: [`C${idx + 1}`, `${seat}번`] });
          }
        } else if (stage === "pass") {
          setBoardMessage(board, "카드를 교환하지 않았습니다.");
        }
      });

      updateWitchSelection();
      nightAction.appendChild(row);
      CardUI?.motion?.staggerEnter?.(centerEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.04 });
      CardUI?.motion?.staggerEnter?.(orbitEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.01 });
      state.nightOrbitCleanup = startOrbit(orbitArena, orbitCards, { speed: 0.035 });
      state.nightWitchBoard = { stepId, byCenter, bySeat, passCard, messageEl, preview: { active: false }, ruleText };
      return;
    }

    // Fallback (non-orbit): center peek + player pick.
    const peekIdxRaw = Number(state.nightUi?.witchPeekCenterIndex);
    const peekIdx = Number.isFinite(peekIdxRaw) ? peekIdxRaw : null;
    const selectedSeats2 = Array.isArray(state.nightUi?.selectedSeats) ? state.nightUi.selectedSeats.map(Number) : [];
    const row = document.createElement("div");
    row.className = "nightAction__row";
    const msgEl = ensureActionMessageEl(row);
    if (msgEl) msgEl.textContent = peekIdx == null ? "센터 카드 1장을 먼저 확인하세요." : "교환할 플레이어를 선택하거나 그대로를 선택하세요.";

    const passBtn = document.createElement("button");
    passBtn.className = "nightChoice nightChoiceCard";
    passBtn.innerHTML = `
      <div class="nightChoiceCard__seat">PASS</div>
      <div class="nightChoiceCard__avatar">⏭️</div>
      <div class="nightChoiceCard__name">그대로</div>
    `;
    applyPlayerPalette(passBtn, me?.color || "#888");
    passBtn.disabled = peekIdx == null || state.nightSubmittedStepId === stepId;
    passBtn.addEventListener("click", () => {
      if (state.nightSubmittedStepId === stepId) return;
      const idx = Number(state.nightUi?.witchPeekCenterIndex);
      if (!Number.isFinite(idx)) return;
      submitNightAction("witch", { stage: "pass" });
    });

    const peekRow = renderCenterChoices({ selected: peekIdx != null ? [peekIdx] : [], max: 1 });
    peekRow.querySelectorAll(".nightChoiceCard[data-center-index]").forEach((btn) => {
      const idx = Number(btn.getAttribute("data-center-index"));
      btn.addEventListener("click", () => {
        if (state.nightSubmittedStepId === stepId) return;
        const currentPeekRaw2 = Number(state.nightUi?.witchPeekCenterIndex);
        const currentPeek2 = Number.isFinite(currentPeekRaw2) ? currentPeekRaw2 : null;
        if (currentPeek2 != null && currentPeek2 !== idx) return;
        flipEl(btn);
        setChoiceState({ witchPeekCenterIndex: idx, selectedCenter: [idx], selectedSeats: [] });
        sendNightActionPartial("witch", { stage: "peek", centerIndex: idx });
      });
    });

    const playerRow = renderPlayerChoices({ selectedSeats: selectedSeats2, max: 1 });
    playerRow.querySelectorAll(".nightChoiceCard[data-seat]").forEach((btn) => {
      const seat = Number(btn.getAttribute("data-seat"));
      btn.addEventListener("click", () => {
        if (state.nightSubmittedStepId === stepId) return;
        const idx = Number(state.nightUi?.witchPeekCenterIndex);
        if (!Number.isFinite(idx)) return;
        submitNightAction("witch", { stage: "swap", seat });
      });
    });

    applyNightResultOnce("witch", (result) => {
      const stage = String(result?.stage || "");
      if (stage === "peek") {
        const idx = Number(result?.centerIndex);
        const rid = String(result?.role || "");
        if (Number.isFinite(idx) && rid) {
          setChoiceState({ witchPeekCenterIndex: idx });
        }
      }
    });

    row.appendChild(passBtn);
    nightAction.appendChild(peekRow);
    nightAction.appendChild(playerRow);
    nightAction.appendChild(row);
  } else if (roleId === "apprentice_seer") {
    const useOrbitBoard = !!useBgRuleCard;
    if (useOrbitBoard) {
      ensureDebugRoles();
      nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);
      nightAction.classList.remove("hidden");

      const def = ROLE_DEFINITIONS[activeRole] || null;
      const ruleText = def?.desc || "중앙 카드 1장을 확인합니다.";
      const selectedCenter = Array.isArray(state.nightUi?.selectedCenter) ? state.nightUi.selectedCenter.map(Number) : [];

      const { row, orbitArena, centerEl, orbitEl } = createNightBoardScaffold();

      const byCenter = new Map();
      for (const idx of [0, 1, 2]) {
        const c = document.createElement("button");
        c.className = "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard";
        c.setAttribute("data-center-index", String(idx));
        c.innerHTML = `
          <div class="nightChoiceCard__seat">C${idx + 1}</div>
          <div class="nightChoiceCard__avatar">🂠</div>
          <div class="nightChoiceCard__name">중앙 카드</div>
        `;
        applyPlayerPalette(c, me?.color || "#888");
        if (selectedCenter.includes(idx)) c.classList.add("nightChoice--selected");
        c.addEventListener("click", () => {
          selectBounce(c);
          pulseBgCard();
          const current = Array.isArray(state.nightUi?.selectedCenter) ? state.nightUi.selectedCenter.map(Number) : [];
          const next = current.includes(idx) ? [] : [idx];
          setChoiceState({ selectedCenter: next, selectedSeats: [] });
        });
        byCenter.set(idx, c);
        centerEl.appendChild(c);
      }

      const orbitCards = [];
      const playersSorted = [...players].sort((a, b) => Number(a.seat) - Number(b.seat));
      playersSorted.forEach((p) => {
        const isMe = p.clientId === state.clientId;
        const b = document.createElement("button");
        b.className = "nightChoice nightChoiceCard nightBoard__orbitCard";
        b.setAttribute("data-seat", String(p.seat || ""));
        if (isMe) b.dataset.isMe = "1";
        b.innerHTML = `
          ${isMe ? `<div class="meTab meTab--night">본인</div>` : ""}
          <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
          <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "🙂")}</div>
          <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
        `;
        applyPlayerPalette(b, p.color || "#888");
        (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(b, false);
        NightBoardUI?.setBlockedBadge?.(b, true);
        orbitEl.appendChild(b);
        orbitCards.push(b);
      });
      assignOrbitBases(orbitCards);

      const messageEl = ensureActionMessageEl(row);
      if (messageEl) messageEl.textContent = "중앙 카드 1장을 탭하면 즉시 확인합니다.";

      const board = { messageEl };
      applyNightResultOnce("apprentice_seer", (result) => {
        const r = result || {};
        const idx = Number(r.centerIndex);
        const rid = String(r.role || "");
        const el = byCenter.get(idx) || null;
        if (el && rid) flipRevealRole(el, rid);
        const roleName = getRoleDisplayName(rid);
        setBoardMessage(board, { text: `C${idx + 1} 카드 신분은 ${roleName}입니다.`, highlights: [`C${idx + 1}`, roleName] });
      });

      nightAction.appendChild(row);
      CardUI?.motion?.staggerEnter?.(centerEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.04 });
      CardUI?.motion?.staggerEnter?.(orbitEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.01 });
      state.nightOrbitCleanup = startOrbit(orbitArena, orbitCards, { speed: 0.035 });
      ensureNightMeTabs(nightOverlay);
      ensureSeatMarks(nightOverlay);
      return;
    }
  } else if (roleId === "mystic_wolf") {
    const useOrbitBoard = !!useBgRuleCard;
    if (useOrbitBoard) {
      ensureDebugRoles();
      nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);
      nightAction.classList.remove("hidden");

      const def = ROLE_DEFINITIONS[activeRole] || null;
      const ruleText = def?.desc || "플레이어 1명의 카드를 확인합니다.";
      const selectedSeats = Array.isArray(state.nightUi?.selectedSeats) ? state.nightUi.selectedSeats.map(Number) : [];

      const { row, orbitArena, centerEl, orbitEl } = createNightBoardScaffold();

      for (const idx of [0, 1, 2]) {
        const c = document.createElement("button");
        c.className = "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard";
        c.setAttribute("data-center-index", String(idx));
        c.innerHTML = `
          <div class="nightChoiceCard__seat">C${idx + 1}</div>
          <div class="nightChoiceCard__avatar">🂠</div>
          <div class="nightChoiceCard__name">중앙 카드</div>
        `;
        applyPlayerPalette(c, me?.color || "#888");
        (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(c, false);
        NightBoardUI?.setBlockedBadge?.(c, true);
        centerEl.appendChild(c);
      }

      const bySeat = new Map();
      const orbitCards = [];
      const playersSorted = [...players].sort((a, b) => Number(a.seat) - Number(b.seat));
      playersSorted.forEach((p) => {
        const isMe = p.clientId === state.clientId;
        const b = document.createElement("button");
        b.className = "nightChoice nightChoiceCard nightBoard__orbitCard";
        b.setAttribute("data-seat", String(p.seat || ""));
        if (isMe) b.dataset.isMe = "1";
        b.innerHTML = `
          ${isMe ? `<div class="meTab meTab--night">본인</div>` : ""}
          <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
          <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "🙂")}</div>
          <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
        `;
        applyPlayerPalette(b, p.color || "#888");
        if (isMe) {
          (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(b, false);
          NightBoardUI?.setBlockedBadge?.(b, true);
        } else if (selectedSeats.includes(Number(p.seat))) {
          b.classList.add("nightChoice--selected");
        }
        b.addEventListener("click", () => {
          if (isMe) return;
          selectBounce(b);
          pulseBgCard();
          const seat = Number(p.seat);
          let next = [...selectedSeats];
          if (next.includes(seat)) next = next.filter((x) => x !== seat);
          else next = [seat];
          setChoiceState({ selectedSeats: next, selectedCenter: [] });
        });
        orbitEl.appendChild(b);
        orbitCards.push(b);
        bySeat.set(Number(p.seat), b);
      });
      assignOrbitBases(orbitCards);

      const messageEl = ensureActionMessageEl(row);
      if (messageEl) messageEl.textContent = "대상을 탭하면 즉시 확인합니다.";

      const board = { messageEl };
      applyNightResultOnce("mystic_wolf", (result) => {
        const r = result || {};
        const seat = Number(r.seat || 0);
        const rid = String(r.role || "");
        const el = bySeat.get(seat) || null;
        if (el && rid) flipRevealRole(el, rid);
        const roleName = getRoleDisplayName(rid);
        setBoardMessage(board, { text: `${seat}번 신분은 ${roleName}입니다.`, highlights: [`${seat}번`, roleName] });
      });

      nightAction.appendChild(row);
      CardUI?.motion?.staggerEnter?.(centerEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.04 });
      CardUI?.motion?.staggerEnter?.(orbitEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.01 });
      state.nightOrbitCleanup = startOrbit(orbitArena, orbitCards, { speed: 0.035 });
      ensureNightMeTabs(nightOverlay);
      ensureSeatMarks(nightOverlay);
      return;
    }
  } else if (roleId === "revealer") {
    const useOrbitBoard = !!useBgRuleCard;
    if (useOrbitBoard) {
      ensureDebugRoles();
      nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);
      nightAction.classList.remove("hidden");

      const def = ROLE_DEFINITIONS[activeRole] || null;
      const ruleText = def?.desc || "플레이어 1명의 카드를 공개합니다(조건부).";
      const selectedSeats = Array.isArray(state.nightUi?.selectedSeats) ? state.nightUi.selectedSeats.map(Number) : [];

      const { row, orbitArena, centerEl, orbitEl } = createNightBoardScaffold();

      for (const idx of [0, 1, 2]) {
        const c = document.createElement("button");
        c.className = "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard";
        c.setAttribute("data-center-index", String(idx));
        c.innerHTML = `
          <div class="nightChoiceCard__seat">C${idx + 1}</div>
          <div class="nightChoiceCard__avatar">🂠</div>
          <div class="nightChoiceCard__name">중앙 카드</div>
        `;
        applyPlayerPalette(c, me?.color || "#888");
        (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(c, false);
        NightBoardUI?.setBlockedBadge?.(c, true);
        centerEl.appendChild(c);
      }

      const bySeat = new Map();
      const orbitCards = [];
      const playersSorted = [...players].sort((a, b) => Number(a.seat) - Number(b.seat));
      playersSorted.forEach((p) => {
        const isMe = p.clientId === state.clientId;
        const b = document.createElement("button");
        b.className = "nightChoice nightChoiceCard nightBoard__orbitCard";
        b.setAttribute("data-seat", String(p.seat || ""));
        if (isMe) b.dataset.isMe = "1";
        b.innerHTML = `
          ${isMe ? `<div class="meTab meTab--night">본인</div>` : ""}
          <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
          <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "🙂")}</div>
          <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
        `;
        applyPlayerPalette(b, p.color || "#888");
        if (isMe) {
          (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(b, false);
          NightBoardUI?.setBlockedBadge?.(b, true);
        } else if (selectedSeats.includes(Number(p.seat))) {
          b.classList.add("nightChoice--selected");
        }
        b.addEventListener("click", () => {
          if (isMe) return;
          selectBounce(b);
          pulseBgCard();
          const seat = Number(p.seat);
          let next = [...selectedSeats];
          if (next.includes(seat)) next = next.filter((x) => x !== seat);
          else next = [seat];
          setChoiceState({ selectedSeats: next, selectedCenter: [] });
        });
        orbitEl.appendChild(b);
        orbitCards.push(b);
        bySeat.set(Number(p.seat), b);
      });
      assignOrbitBases(orbitCards);

      const messageEl = ensureActionMessageEl(row);
      if (messageEl) messageEl.textContent = "대상을 탭하면 즉시 공개합니다.";

      const board = { messageEl };
      applyNightResultOnce("revealer", (result) => {
        const r = result || {};
        const seat = Number(r.seat || 0);
        const rid = String(r.role || "");
        const blocked = !!r.blocked;
        const el = bySeat.get(seat) || null;
        if (!blocked && el && rid) flipRevealRole(el, rid);
        if (blocked) {
          setBoardMessage(board, { text: `${seat}번 신분은 공개할 수 없습니다.`, highlights: [`${seat}번`] });
        } else {
          const roleName = getRoleDisplayName(rid);
          setBoardMessage(board, { text: `${seat}번 신분은 ${roleName}입니다.`, highlights: [`${seat}번`, roleName] });
        }
      });

      nightAction.appendChild(row);
      CardUI?.motion?.staggerEnter?.(centerEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.04 });
      CardUI?.motion?.staggerEnter?.(orbitEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.01 });
      state.nightOrbitCleanup = startOrbit(orbitArena, orbitCards, { speed: 0.035 });
      ensureNightMeTabs(nightOverlay);
      ensureSeatMarks(nightOverlay);
      return;
    }
  } else if (
    roleId === "sentinel" ||
    roleId === "bodyguard" ||
    roleId === "curator" ||
    roleId === "alpha_wolf" ||
    roleId === "pickpocket" ||
    roleId === "gremlin" ||
    roleId === "marksman"
  ) {
    const useOrbitBoard = !!useBgRuleCard;
    if (useOrbitBoard) {
      ensureDebugRoles();
      nightOverlay.classList.toggle("nightOverlay--orbitBoard", true);
      nightAction.classList.remove("hidden");

      const def = ROLE_DEFINITIONS[activeRole] || null;
      let ruleText = def?.desc || "플레이어를 선택하세요.";
      if (roleId === "curator") {
        const artifact = String(state.nightPrivate?.payload?.artifact || "");
        if (artifact) ruleText = `${ruleText} (아이템: ${artifact})`;
      }

      const max = roleId === "gremlin" || roleId === "marksman" ? 2 : 1;
      const allowSelf = roleId === "sentinel" || roleId === "bodyguard" || roleId === "curator" || roleId === "gremlin";
      const selectedSeats = Array.isArray(state.nightUi?.selectedSeats) ? state.nightUi.selectedSeats.map(Number) : [];

      const { row, orbitArena, centerEl, orbitEl } = createNightBoardScaffold();

      const alphaCenterIdx = roleId === "alpha_wolf" ? state.nightPrivate?.payload?.centerWerewolfIndex : null;
      const byCenter = new Map();
      for (const idx of [0, 1, 2]) {
        const c = document.createElement("button");
        c.className = "nightChoice nightChoiceCard nightChoiceCard--center nightBoard__centerCard";
        c.setAttribute("data-center-index", String(idx));
        const isAlphaWolfCenter = Number(alphaCenterIdx) === idx;
        c.innerHTML = `
          <div class="nightChoiceCard__seat">C${idx + 1}</div>
          <div class="nightChoiceCard__avatar">${isAlphaWolfCenter ? "🐺" : "🂠"}</div>
          <div class="nightChoiceCard__name">${isAlphaWolfCenter ? "늑대 카드" : "중앙 카드"}</div>
        `;
        applyPlayerPalette(c, me?.color || "#888");
        (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(c, false);
        NightBoardUI?.setBlockedBadge?.(c, true);
        centerEl.appendChild(c);
        byCenter.set(idx, c);
      }

      const bySeat = new Map();
      const orbitCards = [];
      const playersSorted = [...players].sort((a, b) => Number(a.seat) - Number(b.seat));
      playersSorted.forEach((p) => {
        const isMe = p.clientId === state.clientId;
        const b = document.createElement("button");
        b.className = "nightChoice nightChoiceCard nightBoard__orbitCard";
        b.setAttribute("data-seat", String(p.seat || ""));
        if (isMe) b.dataset.isMe = "1";
        b.innerHTML = `
          ${isMe ? `<div class="meTab meTab--night">본인</div>` : ""}
          <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
          <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "🙂")}</div>
          <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
        `;
        applyPlayerPalette(b, p.color || "#888");

        const seatNum = Number(p.seat || 0);
        const selectable = allowSelf ? true : !isMe;
        if (!selectable) {
          (CardUI?.setInteractive || NightBoardUI?.setInteractive)?.(b, false);
          NightBoardUI?.setBlockedBadge?.(b, true);
        } else if (selectedSeats.includes(seatNum)) {
          b.classList.add("nightChoice--selected");
        }

	        b.addEventListener("click", () => {
	          if (!selectable) return;
	          selectBounce(b);
	          pulseBgCard();
	          let next = [...selectedSeats];
	          if (roleId === "marksman" && next.includes(seatNum) && next.length === 1) {
	            submitNightAction("marksman", { seats: [seatNum] });
	            return;
	          }
	          if (next.includes(seatNum)) next = next.filter((x) => x !== seatNum);
	          else if (max === 1) next = [seatNum];
	          else if (next.length < max) next.push(seatNum);
	          else next = [next[1], seatNum];
	          setChoiceState({ selectedSeats: next, selectedCenter: [] });
	        });

        orbitEl.appendChild(b);
        orbitCards.push(b);
        bySeat.set(seatNum, b);
      });
      assignOrbitBases(orbitCards);

      const messageEl = ensureActionMessageEl(row);
      if (messageEl) messageEl.textContent = max === 2 ? "대상을 선택하면 즉시 수행합니다. (2명 선택 역할은 2명 선택 시 실행)" : "대상을 탭하면 즉시 수행합니다.";

      const board = { messageEl };
      applyNightResultOnce("sentinel", (result) => {
        const seat = Number(result?.seat || 0);
        setBoardMessage(board, { text: `${seat}번에게 방패를 주었습니다.`, highlights: [`${seat}번`] });
      });
      applyNightResultOnce("bodyguard", (result) => {
        const seat = Number(result?.seat || 0);
        setBoardMessage(board, { text: `${seat}번을 보호합니다.`, highlights: [`${seat}번`] });
      });
      applyNightResultOnce("curator", (result) => {
        const seat = Number(result?.seat || 0);
        const artifact = String(result?.artifact || "");
        setBoardMessage(board, { text: `${seat}번에게 ${artifact}을(를) 주었습니다.`, highlights: [`${seat}번`, artifact] });
      });
      applyNightResultOnce("pickpocket", (result) => {
        const seat = Number(result?.targetSeat || 0);
        const mySeat = Number(state.mySeat || 0);
        const mine = bySeat.get(mySeat) || null;
        const target = bySeat.get(seat) || null;
        if (mine && target) swapEls(mine, target, { flip: true });
        setBoardMessage(board, { text: `${seat}번과 신분 카드를 교환했습니다. (확인 불가)`, highlights: [`${seat}번`] });
      });
      applyNightResultOnce("gremlin", (result) => {
        const seats = Array.isArray(result?.swappedSeats) ? result.swappedSeats.map(Number) : [];
        if (seats.length !== 2 || seats[0] === seats[1]) return;
        const aEl = bySeat.get(seats[0]) || null;
        const bEl = bySeat.get(seats[1]) || null;
        if (aEl && bEl) swapEls(aEl, bEl, { flip: true });
        setBoardMessage(board, { text: `${seats[0]}번과 ${seats[1]}번 신분 카드가 서로 교환됐었습니다.`, highlights: [`${seats[0]}번`, `${seats[1]}번`] });
      });
      applyNightResultOnce("marksman", (result) => {
        const seats = Array.isArray(result?.seats) ? result.seats.map(Number) : [];
        const roles = result?.roles || {};
        for (const s of seats) {
          const rid = String(roles?.[String(s)] || "");
          const el = bySeat.get(Number(s)) || null;
          if (el && rid) flipRevealRole(el, rid);
        }
        if (seats.length === 1) {
          const rid = String(roles?.[String(seats[0])] || "");
          const roleName = getRoleDisplayName(rid);
          setBoardMessage(board, { text: `${seats[0]}번 신분은 ${roleName}입니다.`, highlights: [`${seats[0]}번`, roleName] });
        } else if (seats.length === 2) {
          const ra = getRoleDisplayName(String(roles?.[String(seats[0])] || ""));
          const rb = getRoleDisplayName(String(roles?.[String(seats[1])] || ""));
          setBoardMessage(board, {
            text: `${seats[0]}번(${ra}), ${seats[1]}번(${rb}) 신분을 확인했습니다.`,
            highlights: [`${seats[0]}번`, ra, `${seats[1]}번`, rb],
          });
        }
      });
      applyNightResultOnce("alpha_wolf", (result) => {
        const seat = Number(result?.targetSeat || 0);
        const idx = Number(result?.centerIndex);
        const target = bySeat.get(seat) || null;
        const center = byCenter.get(idx) || null;
        if (target && center) swapEls(target, center, { flip: true });
        setBoardMessage(board, { text: `중앙 C${idx + 1} 카드가 ${seat}번과 교환됐었습니다.`, highlights: [`C${idx + 1}`, `${seat}번`] });
      });

      nightAction.appendChild(row);
      CardUI?.motion?.staggerEnter?.(centerEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.04 });
      CardUI?.motion?.staggerEnter?.(orbitEl.querySelectorAll(".nightChoiceCard"), { preset: "stack", stagger: 0.01 });
      state.nightOrbitCleanup = startOrbit(orbitArena, orbitCards, { speed: 0.035 });
      ensureNightMeTabs(nightOverlay);
      ensureSeatMarks(nightOverlay);
      return;
    }
  } else if (roleId === "village_idiot") {
    const def = ROLE_DEFINITIONS[activeRole] || null;
    const ruleText = def?.desc || "방향을 선택하세요.";
    const selectedDir = String(state.nightUi?.dir || "");
    nightAction.classList.remove("hidden");
    nightAction.classList.add("nightOverlay__action--bottomBar");
    nightAction.innerHTML = "";

    const row = document.createElement("div");
    row.className = "nightAction__row";

    const mk = (dir, label, icon) => {
      const b = document.createElement("button");
      b.className = "nightChoice nightChoiceCard nightChoiceCard--center";
      b.innerHTML = `
        <div class="nightChoiceCard__seat">${escapeHtml(label)}</div>
        <div class="nightChoiceCard__avatar">${escapeHtml(icon)}</div>
        <div class="nightChoiceCard__name">회전</div>
      `;
      b.classList.toggle("nightChoice--selected", selectedDir === dir);
      b.addEventListener("click", () => {
        selectBounce(b);
        pulseBgCard();
        setChoiceState({ dir, selectedSeats: [], selectedCenter: [] });
      });
      return b;
    };

    row.appendChild(mk("left", "왼쪽", "⬅️"));
    row.appendChild(mk("right", "오른쪽", "➡️"));

    const messageEl = ensureActionMessageEl(row);
    if (messageEl) messageEl.textContent = "방향을 선택하면 즉시 회전합니다.";

    const board = { messageEl };
    applyNightResultOnce("village_idiot", (result) => {
      const dir = String(result?.dir || "");
      const label = dir === "right" ? "오른쪽" : "왼쪽";
      setBoardMessage(board, { text: `${label}으로 회전했습니다.`, highlights: [label] });
    });

    nightAction.appendChild(row);
    return;
  } else if (roleId === "minion") {
    const def = ROLE_DEFINITIONS[activeRole] || null;
    const ruleText = def?.desc || "미니언의 차례입니다.";

    nightAction.classList.remove("hidden");
    nightAction.classList.add("nightOverlay__action--centerRule");
    const panel = NightBoardUI?.createRuleOnlyPanel
      ? NightBoardUI.createRuleOnlyPanel({ text: ruleText, escapeHtml })
      : (() => {
          const el = document.createElement("div");
          el.className = "nightRuleOnly nightRuleOnly--center";
          el.innerHTML = `<div class="nightRuleOnly__text">${escapeHtml(ruleText)}</div>`;
          return el;
        })();
    nightAction.appendChild(panel);
  } else if (roleId === "werewolf") {
    // Lone wolf optional peek.
    const canPeek = !!(state.nightPrivate?.payload && state.nightPrivate.payload.canPeekCenter);
    if (!canPeek) {
      nightAction.classList.add("hidden");
      nightAction.innerHTML = "";
    } else {
      nightAction.appendChild(renderCenterChoices({ selected: ui.selectedCenter || [], max: 1 }));
    }
  } else {
    // Default: NightBoard-based rule-only UI for roles that don't require card interaction (or not implemented yet).
    const def = ROLE_DEFINITIONS[activeRole] || null;
    const ruleText = def?.desc || `${activeRoleName || "역할"}의 차례입니다.`;
    nightAction.classList.remove("hidden");
    nightAction.innerHTML = "";
    nightAction.classList.add("nightOverlay__action--centerRule");
    const panel = NightBoardUI?.createRuleOnlyPanel
      ? NightBoardUI.createRuleOnlyPanel({ text: ruleText, escapeHtml })
      : (() => {
          const el = document.createElement("div");
          el.className = "nightRuleOnly nightRuleOnly--center";
          el.innerHTML = `<div class="nightRuleOnly__text">${escapeHtml(ruleText)}</div>`;
          return el;
        })();
    nightAction.appendChild(panel);
  }

  // Ensure "본인" tab is present on my player cards in night UI (even if templates differ by role).
  ensureNightMeTabs(nightOverlay);
  ensureSeatMarks(nightOverlay);

  // Show last private result (actor-only)
  if (state.nightResult?.result) {
    nightPrivate.classList.remove("hidden");
    nightPrivate.innerHTML = `<div>${escapeHtml(JSON.stringify(state.nightResult.result))}</div>`;
  }
}

function renderRoleOverlay() {
  const phase = state.room?.phase || "WAIT";
  if (phase !== "ROLE") {
    roleOverlay.classList.add("hidden");
    roleOverlay.classList.remove("nightOverlay--bgCard");
    roleOverlay.classList.remove("nightOverlay--noHeader");
    return;
  }
  roleOverlay.classList.remove("hidden");
  roleOverlay.classList.toggle("nightOverlay--fullscreen", true);
  roleOverlay.classList.toggle("nightOverlay--profileOnly", !!state.roleReady);
  roleOverlay.classList.toggle("nightOverlay--bgCard", true);
  // UX: after pressing "eyes closed", hide the role-check UI and show a large profile card instead.
  const showRuleCard = !state.isSpectator && !state.roleReady;
  roleOverlay.classList.toggle("nightOverlay--noHeader", showRuleCard);
  roleTitle.textContent = "ROLE · 역할 확인";

  if (state.isSpectator) {
    setTextHighlighted(roleName, "관전 중");
    setTextHighlighted(roleDesc, "이 라운드는 관전합니다. 휴대폰을 내려놓고 눈을 감아주세요. 모두 준비되면 밤이 시작됩니다.");
    roleAction.classList.add("hidden");
  } else {
    const rid = state.myRoleId || "";
    setTextHighlighted(roleName, rid ? getRoleDisplayName(rid) : "(역할을 받는 중...)");
    const def = ROLE_DEFINITIONS[rid];
    setTextHighlighted(
      roleDesc,
      (def?.desc || "자신의 역할을 확인하세요.") + " 준비되면 아래 버튼을 누르고, 휴대폰을 테이블에 내려놓은 채 눈을 감아주세요."
    );

    // After confirming "eyes closed", hide the bottom instruction panel so only the big profile card remains.
    roleAction.classList.toggle("hidden", !!state.roleReady);
    if (roleActionText) {
      roleActionText.textContent = "";
    }

    if (!state.roleReady) {
      eyesClosedBtn.textContent = "휴대폰 화면을 다른 사람이 보이게\n내려놓고,\n눈을 감아요";
      if (state.debugRolePreview) {
        eyesClosedBtn.disabled = true;
        eyesClosedBtn.setAttribute("aria-disabled", "true");
        eyesClosedBtn.classList.add("btn--attn");
      } else {
        eyesClosedBtn.disabled = false;
        eyesClosedBtn.removeAttribute("aria-disabled");
        eyesClosedBtn.classList.remove("btn--attn");
      }
    } else {
      // Button is hidden, but keep state consistent.
      eyesClosedBtn.disabled = true;
      eyesClosedBtn.setAttribute("aria-disabled", "true");
      eyesClosedBtn.textContent = "눈 감았어요";
      eyesClosedBtn.classList.remove("btn--attn");
    }
  }

  roleProfile.innerHTML = "";
  const me = (state.room?.players || []).find((p) => p.clientId === state.clientId) || null;
  if (!me) return;

  // Background card contents:
  // - In role-ready (eyesClosed) view, show role/rules info instead of player identity.
  // - Otherwise, keep player identity card.
  if (showRuleCard) {
    const rid = state.myRoleId || "";
    const def = ROLE_DEFINITIONS[rid] || null;
    const card = document.createElement("div");
    card.className = "profileCardLarge roleRuleCard";
    applyPlayerPalette(card, me.color || "#888");

    const title = rid ? escapeHtml(getRoleDisplayName(rid)) : "(역할을 받는 중...)";
    const icon = escapeHtml(def?.icon || "🃏");
    const desc = escapeHtml(def?.desc || "잠시만 기다려주세요.");
    card.innerHTML = `
      <div class="roleRuleCard__icon">${icon}</div>
      <div class="roleRuleCard__title">${title}</div>
      <div class="roleRuleCard__desc">${desc}</div>
    `;
    roleProfile.appendChild(card);
    CardUI?.motion?.enter?.(card, "profile");
    return;
  }

  const card = CardUI?.createProfileCardLarge
    ? CardUI.createProfileCardLarge({
        player: me,
        badgeText: state.roleReady ? "눈 감았어요" : "READY?",
        applyPalette: applyPlayerPalette,
      })
    : document.createElement("div");
  card.classList.add("profileCardLarge");
  roleProfile.appendChild(card);
  CardUI?.motion?.enter?.(card, "profile");
}

async function playNightStepAsHost(step) {
  const stepId = Number(step?.stepId || 0);
  if (!stepId) return;
  if (state.lastNightStepId === stepId) return;
  state.lastNightStepId = stepId;

  const scenarioId = step?.scenarioId;
  const episodeId = step?.episodeId;
  const variantPlayerCount = step?.variantPlayerCount;
  const sectionKey = step?.sectionKey;
  if (!scenarioId || !episodeId || !variantPlayerCount || !sectionKey) {
    send({ type: "night_step_done", data: { stepId } });
    return;
  }

  await ensureAudioUnlocked();
  const resolved = await resolveVoiceUrlWithFallback({
    scenarioId,
    episodeId,
    requestedPlayerCount: variantPlayerCount,
    sectionKey,
  });
  if (resolved.url) {
    await state.narration.playList([resolved.url]);
  } else {
    const t = await getNarrationTextForSection({ scenarioId, episodeId, variantPlayerCount, sectionKey });
    if (t) {
      await speakWithBrowserTts(t, { interrupt: true });
    } else {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  send({ type: "night_step_done", data: { stepId } });
}

async function fetchScenarios() {
  const res = await fetch(toAppPath("api/scenarios"));
  const list = await res.json();
  state.scenarios = list;
  state.scenarioById = {};
  for (const s of list) state.scenarioById[s.scenarioId] = s;
}

async function ensureScenarioDetailLoaded(scenarioId) {
  const sid = String(scenarioId || "").trim();
  if (!sid) return null;
  const cached = state.scenarioById?.[sid];
  if (cached?.episodes) return cached;
  if (scenarioDetailInflight.has(sid)) return null;

  scenarioDetailInflight.add(sid);
  try {
    const res = await fetch(toAppPath(`api/scenarios/${encodeURIComponent(sid)}`));
    if (!res.ok) return null;
    const full = await res.json();
    state.scenarioById[sid] = full;
    const idx = (state.scenarios || []).findIndex((x) => x?.scenarioId === sid);
    if (idx >= 0) state.scenarios[idx] = full;
    return full;
  } catch (e) {
    return null;
  } finally {
    scenarioDetailInflight.delete(sid);
  }
}

async function ensureScenarioTtsLoaded(scenarioId, playerCount) {
  const sid = String(scenarioId || "").trim();
  const pc = Number.parseInt(String(playerCount || ""), 10);
  if (!sid || !Number.isFinite(pc)) return null;
  const key = `${sid}:p${pc}`;
  const cached = state.scenarioTtsByKey?.[key];
  if (cached) return cached;
  if (scenarioTtsInflight.has(key)) return null;

  scenarioTtsInflight.add(key);
  try {
    const res = await fetch(
      toAppPath(`api/scenarios/${encodeURIComponent(sid)}/tts?playerCount=${encodeURIComponent(String(pc))}`)
    );
    if (!res.ok) return null;
    const tts = await res.json();
    state.scenarioTtsByKey[key] = tts;
    return tts;
  } catch (e) {
    return null;
  } finally {
    scenarioTtsInflight.delete(key);
  }
}

function renderScenarioList() {
  scenarioListEl.innerHTML = "";
  for (const s of state.scenarios) {
    const item = document.createElement("div");
    item.className = "scenarioItem";
    item.innerHTML = `
      <div class="scenarioItem__title">${escapeHtml(s.title || s.scenarioId)}</div>
      <div class="scenarioItem__meta">
        ${(s.recommendedPlayerCounts || []).map((n) => `<span class="pill">${n}인</span>`).join("")}
        ${(s.tags || []).slice(0, 4).map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join("")}
      </div>
    `;
    item.addEventListener("click", async () => {
      const scenarioId = s.scenarioId;
      const full = (await ensureScenarioDetailLoaded(scenarioId)) || state.scenarioById?.[scenarioId] || s;
      const episodes = Array.isArray(full?.episodes) ? full.episodes : [];
      if (episodes.length <= 1) {
        send({ type: "scenario_select", data: { scenarioId } });
        closeModal(scenarioModal);
        return;
      }
      openEpisodePicker({ scenarioId, scenario: full });
    });
    scenarioListEl.appendChild(item);
  }
}

function openEpisodePicker({ scenarioId, scenario }) {
  episodePickerState.scenarioId = String(scenarioId || "").trim();
  scenarioListEl.classList.add("hidden");
  episodePickerEl.classList.remove("hidden");

  const title = scenario?.title || scenarioId;
  episodePickerTitleEl.textContent = `에피소드 선택 · ${title}`;

  const selectedEpisodeId = state.room?.selectedEpisodeId || state.scenarioState?.selectedEpisodeId || "";
  episodeListEl.innerHTML = "";
  const episodes = Array.isArray(scenario?.episodes) ? scenario.episodes : [];
  for (const ep of episodes) {
    const episodeId = String(ep?.episodeId || "").trim();
    if (!episodeId) continue;
    const item = document.createElement("div");
    item.className = "episodeItem";
    if (episodeId === selectedEpisodeId) item.classList.add("episodeItem--selected");
    item.innerHTML = `
      <div class="episodeItem__title">${escapeHtml(ep?.title || episodeId)}</div>
      <div class="episodeItem__meta">${escapeHtml(episodeId)}</div>
    `;
    item.addEventListener("click", () => {
      send({ type: "scenario_select", data: { scenarioId: episodePickerState.scenarioId } });
      send({ type: "episode_select", data: { episodeId } });
      closeModal(scenarioModal);
    });
    episodeListEl.appendChild(item);
  }
}

function closeEpisodePicker() {
  episodePickerState.scenarioId = "";
  episodePickerEl.classList.add("hidden");
  scenarioListEl.classList.remove("hidden");
  episodeListEl.innerHTML = "";
}

function renderVoteGrid() {
  voteGridEl.innerHTML = "";
  const players = (state.room?.players || []).filter((p) => p.connected && !p.isSpectator);
  for (const p of players) {
    const b = document.createElement("button");
    b.className = "voteChoiceCard";
    applyPlayerPalette(b, p.color || "#888");
    b.innerHTML = `
      <div class="voteChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
      <div class="voteChoiceCard__avatar">${escapeHtml(p.avatar || "👤")}</div>
      <div class="voteChoiceCard__name">${escapeHtml(p.name || "")}</div>
    `;
    b.addEventListener("click", () => {
      send({ type: "submit_vote", data: { targetSeat: p.seat } });
      closeModal(voteModal);
    });
    voteGridEl.appendChild(b);
  }
}

function connect() {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${scheme}://${window.location.host}${toAppPath("ws")}`;
  const ws = new WebSocket(wsUrl);
  state.ws = ws;

  ws.addEventListener("open", () => {
    setConn(true);
    // Auto-join removed to show Landing Page every time
    // send({ type: "join", data: { clientId: state.clientId, name: state.name || "Player" } });
  });
  ws.addEventListener("close", () => {
    setConn(false);
    setTimeout(() => connect(), 800);
  });
  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (e) {
      return;
    }
    handleMsg(msg);
  });
}

function send(obj) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ws.send(JSON.stringify(obj));
}

function handleMsg(msg) {
  if (msg.type === "join_denied") {
    const reason = String(msg.data?.reason || "");
    if (reason === "game_in_progress") {
      window.alert("게임이 진행 중입니다. 다음 판부터 참가할 수 있어요.");
    } else {
      window.alert("입장이 거부되었습니다.");
    }
    showJoin();
    return;
  }
  if (msg.type === "kicked") {
    const bySeat = msg.data?.bySeat;
    const byName = msg.data?.byName;
    try {
      window.alert(`추방되었습니다.${bySeat ? `\\n(추방자: ${bySeat}번${byName ? ` ${byName}` : ""})` : ""}`);
    } catch (e) {
      // ignore
    }
    // Reset local room UI/state back to the first screen.
    state.room = null;
    state.seatMarks = {};
    state.scenarioState = null;
    state.myRoleId = "";
    state.mySeat = 0;
    state.nightStep = null;
    state.nightPrivate = null;
    state.nightResult = null;
    state.nightUi = null;
    state.roleReady = false;
    state.lastNarrationKey = "";
    state.lastNightStepId = null;
    closeVoteResult();
    closeLobbyNotice();
    try {
      state.narration?.stop?.();
    } catch (e) {
      // ignore
    }
    try {
      state.bgm?.stop?.();
    } catch (e) {
      // ignore
    }
    showJoin();
    return;
  }
  if (msg.type === "hello") {
    state.debugEnabled = !!msg.debugEnabled;
    const assigned = String(msg.assignedClientId || "");
    if (assigned && assigned !== state.clientId) {
      try {
        sessionStorage.setItem("clientId", assigned);
      } catch (e) {
        // ignore
      }
      state.clientId = assigned;
    }
    const assignedName = String(msg.assignedName || "");
    if (assignedName) {
      state.name = assignedName;
      setSavedName(assignedName);
      if (nameInput) nameInput.value = assignedName;
    }
    initDebugApi();
    return;
  }
  if (msg.type === "ui_preview") {
    if (!state.debugEnabled) return;
    const ui = msg.data?.ui || null;
    if (state.applyUiPreview && ui) {
      try {
        state.applyUiPreview(ui);
      } catch (e) {
        console.warn("[debug] ui_preview failed", e);
      }
    }
    return;
  }
  if (msg.type === "room_snapshot") {
    state.room = msg.data;
    state.seatMarks = msg.data?.seatMarks || {};
    showRoom();
    render();
    setPhase(state.room.phase || "WAIT", state.room.phaseEndsAtMs);
    if ((state.room.phase || "") === "WAIT" && state.lobbyNotice) renderLobbyNotice();
    return;
  }
  if (msg.type === "seat_marks") {
    state.seatMarks = msg.data?.seatMarks || {};
    render();
    return;
  }
  if (msg.type === "host_changed") {
    state.room = state.room || {};
    state.room.hostClientId = msg.data?.hostClientId || null;
    syncHostBgmForPhase(state.room?.phase || "WAIT").catch(() => {});
    render();
    return;
  }
  if (msg.type === "scenario_state") {
    state.scenarioState = msg.data;
    render();
    return;
  }
  if (msg.type === "phase_changed") {
    // Keep local room state in sync even if a room_snapshot is delayed/dropped.
    if (state.room) {
      state.room.phase = msg.data?.phase || state.room.phase || "WAIT";
      state.room.phaseEndsAtMs = msg.data?.phaseEndsAtMs ?? state.room.phaseEndsAtMs ?? null;
    }
    setPhase(msg.data?.phase || "WAIT", msg.data?.phaseEndsAtMs ?? null);
    if ((msg.data?.phase || "") !== "RESULT") closeVoteResult();
    if ((msg.data?.phase || "") !== "WAIT") closeLobbyNotice();
    render();
    return;
  }
  if (msg.type === "role_assignment") {
    state.myRoleId = msg.data?.roleId || "";
    state.nightPrivate = null;
    state.nightResult = null;
    state.lastNightResultApplyKey = "";
    state.roleReady = false;
    state.nightSubmittedStepId = null;
    state.lastNightAction = null;
    render();
    return;
  }
  if (msg.type === "night_step") {
    const prevStep = state.nightStep || null;
    const nextStep = msg.data || null;
    const nextStepId = nextStep?.stepId ?? null;
    const nextRoleId = nextStep?.roleId ?? null;

    const prevRoleId = prevStep?.roleId ?? null;
    const prevSectionKey = String(prevStep?.sectionKey || "");
    const nextSectionKey = String(nextStep?.sectionKey || "");
    const duringToAfterSameRole =
      prevStep &&
      String(prevStep.kind || "") === "role" &&
      prevSectionKey.includes("/during/") &&
      String(nextStep?.kind || "") === "role" &&
      nextSectionKey.includes("/after/") &&
      String(prevRoleId || "") === String(nextRoleId || "");

    state.nightStep = nextStep;
    // Avoid race where night_private arrives before night_step for the same step (we must not wipe it).
    if (
      !state.nightPrivate ||
      state.nightPrivate.stepId !== nextStepId ||
      state.nightPrivate.roleId !== nextRoleId
    ) {
      state.nightPrivate = null;
    }

    // Preserve the actor's view/results when transitioning from /during/ -> /after/ of the same role.
    // This lets the actor see revealed/swapped results until the close-eyes narration finishes.
    const keepPostActionView =
      duringToAfterSameRole &&
      String(state.lastNightAction?.roleId || "") === String(nextRoleId || "") &&
      Number(state.lastNightAction?.duringStepId || 0) === Number(prevStep?.stepId || 0) &&
      Number(state.nightSubmittedStepId || 0) === Number(prevStep?.stepId || 0);

    if (!keepPostActionView) {
      state.nightResult = null;
      state.lastNightResultApplyKey = "";
      state.nightUi = null;
      state.nightSubmittedStepId = null;
    }
    render();
    if (isHost()) playNightStepAsHost(state.nightStep).catch(() => {});
    return;
  }
  if (msg.type === "night_private") {
    state.nightPrivate = msg.data || null;
    render();
    return;
  }
  if (msg.type === "night_result") {
    state.nightResult = msg.data || null;
    render();
    return;
  }
  if (msg.type === "vote_result_public") {
    state.voteResultPublic = msg.data || null;
    renderVoteResult();
    return;
  }
  if (msg.type === "lobby_notice") {
    const data = msg.data || null;
    if (!data) return;
    const key = JSON.stringify(data);
    if (state.lastLobbyNoticeKey === key) return;
    state.lastLobbyNoticeKey = key;
    state.lobbyNotice = data;
    // Only show this once we are back in lobby.
    if ((state.room?.phase || "") === "WAIT") renderLobbyNotice();
    return;
  }
  if (msg.type === "ending_text") {
    console.log("ending_text", msg.data);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function setTextHighlighted(el, text, { categories = null, defaultClassName = "hl" } = {}) {
  if (!el) return;
  const s = String(text ?? "");
  if (window.TextHighlight?.applyHighlightedText && window.TextHighlight?.pickDictionaryHighlights) {
    const highlights = window.TextHighlight.pickDictionaryHighlights(s, { categories, defaultClassName });
    window.TextHighlight.applyHighlightedText(el, s, highlights, { defaultClassName });
    return;
  }
  el.textContent = s;
}

function ensureNightMeTabs(rootEl) {
  if (!rootEl || !rootEl.querySelectorAll) return;
  rootEl.querySelectorAll('.nightChoiceCard[data-is-me="1"]').forEach((card) => {
    if (card.querySelector(".meTab")) return;
    const tab = document.createElement("div");
    tab.className = "meTab meTab--night";
    tab.textContent = "본인";
    card.insertBefore(tab, card.firstChild);
  });
}

function ensureSeatMarks(rootEl) {
  if (!rootEl || !rootEl.querySelectorAll) return;
  if (!window.CardUI?.setMarks) return;
  rootEl.querySelectorAll("[data-seat]").forEach((el) => {
    const seat = String(el.getAttribute("data-seat") || "");
    if (!seat) return;
    const marks = state.seatMarks?.[seat] || [];
    window.CardUI.setMarks(el, marks);
  });
}

function clamp01(x) {
  return Math.max(0, Math.min(1, Number(x) || 0));
}

function parseHexColor(hex) {
  const s = String(hex || "").trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl({ r, g, b }) {
  const rr = (r || 0) / 255;
  const gg = (g || 0) / 255;
  const bb = (b || 0) / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rr:
      h = (gg - bb) / d + (gg < bb ? 6 : 0);
      break;
    case gg:
      h = (bb - rr) / d + 2;
      break;
    default:
      h = (rr - gg) / d + 4;
      break;
  }
  h /= 6;
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  const hh = ((Number(h) || 0) % 1 + 1) % 1;
  const ss = clamp01(s);
  const ll = clamp01(l);
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v };
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const hue2rgb = (pp, qq, tt) => {
    let t = tt;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return pp + (qq - pp) * 6 * t;
    if (t < 1 / 2) return qq;
    if (t < 2 / 3) return pp + (qq - pp) * (2 / 3 - t) * 6;
    return pp;
  };
  const r = hue2rgb(p, q, hh + 1 / 3);
  const g = hue2rgb(p, q, hh);
  const b = hue2rgb(p, q, hh - 1 / 3);
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHex({ r, g, b }) {
  const to2 = (n) => String(Math.max(0, Math.min(255, n | 0)).toString(16)).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}

function rgba({ r, g, b }, a) {
  const rr = Math.max(0, Math.min(255, r | 0));
  const gg = Math.max(0, Math.min(255, g | 0));
  const bb = Math.max(0, Math.min(255, b | 0));
  const aa = Math.max(0, Math.min(1, Number(a) || 0));
  return `rgba(${rr},${gg},${bb},${aa})`;
}

function derivePlayerPalette(baseHex) {
  const baseRgb = parseHexColor(baseHex) || { r: 136, g: 136, b: 136 };
  const { h, s, l } = rgbToHsl(baseRgb);

  const c1 = rgbToHex(baseRgb);
  const c2 = rgbToHex(hslToRgb({ h: h + 0.11, s: clamp01(Math.max(s, 0.55)), l: clamp01(l + 0.06) }));
  const c3 = rgbToHex(hslToRgb({ h: h + 0.52, s: clamp01(Math.max(s, 0.55)), l: clamp01(l - 0.02) }));

  const rgb2 = parseHexColor(c2) || baseRgb;
  const rgb3 = parseHexColor(c3) || baseRgb;

  return {
    c1,
    c2,
    c3,
    g1: rgba(baseRgb, 0.28),
    g2: rgba(rgb2, 0.18),
    g3: rgba(rgb3, 0.16),
  };
}

function applyPlayerPalette(el, baseHex) {
  if (!el) return;
  const p = derivePlayerPalette(baseHex);
  el.style.setProperty("--p-color", p.c1);
  el.style.setProperty("--p-color-2", p.c2);
  el.style.setProperty("--p-color-3", p.c3);
  el.style.setProperty("--p-grad-1", p.g1);
  el.style.setProperty("--p-grad-2", p.g2);
  el.style.setProperty("--p-grad-3", p.g3);

  // Back-compat variables used elsewhere in CSS.
  el.style.setProperty("--player-color", p.c1);
  el.style.setProperty("--player-color-2", p.c2);
  el.style.setProperty("--player-color-3", p.c3);
}

function syncHostEndButton() {
  const visible = !!state.room && isHost();
  hostEndBtn.classList.toggle("hidden", !visible);
}

function maybeAutoNarrate() {
  // Deprecated: NIGHT is driven by server night_step events.
}

function pad3(n) {
  return String(n).padStart(3, "0");
}

function parseNumericVariantKeys(variantByPlayerCount) {
  const items = [];
  for (const k of Object.keys(variantByPlayerCount || {})) {
    if (!/^\d+$/.test(String(k))) continue;
    const n = Number.parseInt(String(k), 10);
    if (!Number.isFinite(n)) continue;
    items.push({ key: String(k), n });
  }
  items.sort((a, b) => a.n - b.n);
  return items;
}

function selectVariantForPlayerCount(episode, playerCount) {
  const variantByPlayerCount = episode?.variantByPlayerCount || {};
  const keys = parseNumericVariantKeys(variantByPlayerCount);
  if (!keys.length) return { variant: null, variantPlayerCount: null };
  for (const it of keys) {
    if (it.n >= playerCount) return { variant: variantByPlayerCount[it.key] || null, variantPlayerCount: it.n };
  }
  const last = keys[keys.length - 1];
  return { variant: variantByPlayerCount[last.key] || null, variantPlayerCount: last.n };
}

function effectiveRoleDeckForPlayerCount(variant, playerCount) {
  const deck = variant?.roleDeck || [];
  const need = Math.max(0, Number(playerCount) + 3);
  if (!need || !Array.isArray(deck)) return [];
  return deck.slice(0, Math.min(deck.length, need));
}

function buildVoiceUrl({ scenarioId, episodeId, playerCount, sectionKey }) {
  return toAppPath(
    `assets/voices/${encodeURIComponent(scenarioId)}/${encodeURIComponent(episodeId)}/p${playerCount}/${sectionKey}/voice.wav`
  );
}

function _voiceOverrideKey({ scenarioId, episodeId }) {
  return `${String(scenarioId || "")}:${String(episodeId || "")}`;
}

async function resolveVoiceUrlWithFallback({ scenarioId, episodeId, requestedPlayerCount, sectionKey }) {
  const sid = String(scenarioId || "").trim();
  const eid = String(episodeId || "").trim();
  const pc = Number.parseInt(String(requestedPlayerCount || ""), 10);
  const sk = String(sectionKey || "").trim();
  if (!sid || !eid || !Number.isFinite(pc) || !sk) return { url: "", playerCount: null };

  // Project convention: we generate WAVs only for the "max playerCount variant" and reuse them for smaller games.
  // So prefer /pMax/ first, then fall back to the requested playerCount if needed.
  state.voicePlayerCountOverride = state.voicePlayerCountOverride || {};
  const key = _voiceOverrideKey({ scenarioId: sid, episodeId: eid });
  const overridden = Number.parseInt(String(state.voicePlayerCountOverride[key] || ""), 10);

  const resolveMaxVariantPc = async () => {
    const scenario = (await ensureScenarioDetailLoaded(sid)) || state.scenarioById?.[sid] || null;
    const eps = Array.isArray(scenario?.episodes) ? scenario.episodes : [];
    const ep = eps.find((e) => String(e?.episodeId || "") === eid) || eps[0] || null;
    const variants = ep?.variantByPlayerCount || {};
    const keys = parseNumericVariantKeys(variants);
    return keys.length ? keys[keys.length - 1].n : null;
  };

  const maxPc = Number.isFinite(overridden) && overridden > 0 ? overridden : await resolveMaxVariantPc();
  if (Number.isFinite(maxPc) && maxPc > 0) {
    const url = buildVoiceUrl({ scenarioId: sid, episodeId: eid, playerCount: maxPc, sectionKey: sk });
    if (await urlExists(url)) {
      state.voicePlayerCountOverride[key] = maxPc;
      return { url, playerCount: maxPc };
    }
  }

  const fallback = buildVoiceUrl({ scenarioId: sid, episodeId: eid, playerCount: pc, sectionKey: sk });
  if (await urlExists(fallback)) return { url: fallback, playerCount: pc };

  return { url: "", playerCount: null };
}

function buildEpisodeStartPlaylist(scenario, episode, playerCount) {
  const scenarioId = scenario?.scenarioId;
  const episodeId = episode?.episodeId;
  const sel = selectVariantForPlayerCount(episode, playerCount);
  const variant = sel.variant;
  const variantPlayerCount = sel.variantPlayerCount;
  if (!scenarioId || !episodeId || !variant || !variantPlayerCount) return [];
  const narration = variant?.narration || {};
  const maxVariantPlayerCount = (() => {
    const keys = parseNumericVariantKeys(episode?.variantByPlayerCount || {});
    return keys.length ? keys[keys.length - 1].n : null;
  })();
  const voicePlayerCount = Number.isFinite(maxVariantPlayerCount) && maxVariantPlayerCount > 0 ? maxVariantPlayerCount : variantPlayerCount;

  const urls = [];
  const openingCount = Array.isArray(narration.openingClips)
    ? narration.openingClips.length
    : Math.max(0, Number.parseInt(String(narration.openingClipCount || 0), 10) || 0);
  for (let i = 0; i < openingCount; i++) {
    urls.push(buildVoiceUrl({ scenarioId, episodeId, playerCount: voicePlayerCount, sectionKey: `opening/${pad3(i + 1)}` }));
  }

  const roleDeck = effectiveRoleDeckForPlayerCount(variant, playerCount);
  const rolesInDeck = new Set(roleDeck);
  const roleWakeOrder = (variant.roleWakeOrder || []).filter((r) => (rolesInDeck.size ? rolesInDeck.has(r) : true));
  const roleClips = narration.roleClips || {};
  const roleClipCounts = narration.roleClipCounts || {};
  for (const roleId of roleWakeOrder) {
    const r = roleClips[roleId] || {};
    const rc = roleClipCounts[roleId] || {};
    for (const part of ["before", "during", "after"]) {
      const partCount = Array.isArray(r[part])
        ? r[part].length
        : Math.max(0, Number.parseInt(String(rc[part] || 0), 10) || 0);
      for (let i = 0; i < partCount; i++) {
        urls.push(
          buildVoiceUrl({ scenarioId, episodeId, playerCount: voicePlayerCount, sectionKey: `role/${roleId}/${part}/${pad3(i + 1)}` })
        );
      }
    }
  }

  const outroCount = Array.isArray(narration.nightOutroClips)
    ? narration.nightOutroClips.length
    : Math.max(0, Number.parseInt(String(narration.nightOutroClipCount || 0), 10) || 0);
  for (let i = 0; i < outroCount; i++) {
    urls.push(buildVoiceUrl({ scenarioId, episodeId, playerCount: voicePlayerCount, sectionKey: `outro/${pad3(i + 1)}` }));
  }

  return urls;
}

async function urlExists(urlPath) {
  try {
    const res = await fetch(urlPath, { method: "HEAD" });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function playEpisodeStartNarration(scenarioId) {
  let scenario;
  try {
    const res = await fetch(toAppPath(`api/scenarios/${encodeURIComponent(scenarioId)}`));
    scenario = await res.json();
  } catch (e) {
    return;
  }

  const playersCount = (state.room?.players || []).filter((p) => p.connected).length || 0;
  const ep = (scenario.episodes || [])[0] || null;
  const episodeId = ep?.episodeId || "ep1";
  const narrationKey = `${scenarioId}:${episodeId}:p${playersCount}:${state.room?.phaseEndsAtMs || ""}`;
  if (state.lastNarrationKey === narrationKey) return;
  state.lastNarrationKey = narrationKey;

  await ensureAudioUnlocked();

  const sel = selectVariantForPlayerCount(ep, playersCount);
  const variant = sel.variant;
  const bgmCfg = variant?.narration?.bgm || ep?.bgm || scenario?.bgm || null;

  const playlist = buildEpisodeStartPlaylist(scenario, ep, playersCount);
  const canUseWav = playlist.length ? await urlExists(playlist[0]) : false;
  if (!canUseWav) {
    let clips = (((variant || {}).narration || {}).openingClips || []).map((c) => c.text).filter(Boolean);
    if (!clips.length) {
      const tts = await ensureScenarioTtsLoaded(scenarioId, sel.variantPlayerCount || playersCount);
      const epTts = tts?.episodes?.[episodeId] || null;
      const t = String(epTts?.openingClips || "").trim();
      if (t) clips = [t];
    }
    if (!clips.length) return;
    await state.bgm.start(bgmCfg);
    try {
      for (const t of clips) await speak(t);
    } finally {
      await state.bgm.stop();
    }
    return;
  }

  await state.bgm.start(bgmCfg);
  try {
    await state.narration.playList(playlist);
  } finally {
    await state.bgm.stop();
  }
}

function speak(text) {
  return speakWithBrowserTts(text, { interrupt: true });
}

function speakWithBrowserTts(text, { interrupt = true } = {}) {
  return new Promise((resolve) => {
    (async () => {
      if (!("speechSynthesis" in window)) return resolve();
      const cleaned = String(text || "").replace(/\[[^\]]+\]|\{[^}]+\}/g, "").trim();
      if (!cleaned) return resolve();

      const waitForVoices = async (timeoutMs = 800) => {
        try {
          if (typeof speechSynthesis.getVoices !== "function") return;
          const existing = speechSynthesis.getVoices();
          if (existing && existing.length) return;
          await new Promise((r) => {
            let done = false;
            const t = setTimeout(() => {
              if (done) return;
              done = true;
              speechSynthesis.onvoiceschanged = null;
              r();
            }, timeoutMs);
            speechSynthesis.onvoiceschanged = () => {
              if (done) return;
              done = true;
              clearTimeout(t);
              speechSynthesis.onvoiceschanged = null;
              r();
            };
            // Trigger load.
            speechSynthesis.getVoices();
          });
        } catch (e) {
          // ignore
        }
      };

      await waitForVoices();

      const u = new SpeechSynthesisUtterance(cleaned);
      // iOS can fail silently when forcing a lang/voice that isn't available.
      // Prefer an installed Korean voice if present; otherwise fall back to default voice.
      try {
        const voices = speechSynthesis.getVoices ? speechSynthesis.getVoices() : [];
        const koVoice =
          (voices || []).find((v) => String(v.lang || "").toLowerCase().startsWith("ko")) ||
          (voices || []).find((v) => /korean/i.test(String(v.name || "")));
        if (koVoice) {
          u.voice = koVoice;
          u.lang = koVoice.lang || "ko-KR";
        } else {
          u.lang = "ko-KR";
        }
      } catch (e) {
        u.lang = "ko-KR";
      }
      u.rate = 1.05;
      u.onend = () => resolve();
      u.onerror = (e) => {
        console.warn("[tts] speechSynthesis error", e);
        resolve();
      };

      try {
        if (interrupt) speechSynthesis.cancel();
        speechSynthesis.speak(u);
        // iOS sometimes queues but doesn't start; retry once.
        setTimeout(() => {
          try {
            if (!speechSynthesis.speaking && !speechSynthesis.pending) {
              speechSynthesis.speak(u);
            }
          } catch {
            // ignore
          }
        }, 120);
      } catch (e) {
        console.warn("[tts] speechSynthesis speak() threw", e);
        resolve();
      }
    })().catch((e) => {
      console.warn("[tts] failed", e);
      resolve();
    });
  });
}

async function getNarrationTextForSection({ scenarioId, episodeId, variantPlayerCount, sectionKey }) {
  const sid = String(scenarioId || "").trim();
  const eid = String(episodeId || "").trim();
  const vpc = Number.parseInt(String(variantPlayerCount || ""), 10);
  const sk = String(sectionKey || "").trim();
  if (!sid || !eid || !Number.isFinite(vpc) || !sk) return "";

  const scenario = (await ensureScenarioDetailLoaded(sid)) || state.scenarioById?.[sid] || null;
  const episodes = Array.isArray(scenario?.episodes) ? scenario.episodes : [];
  const episode = episodes.find((e) => String(e?.episodeId || "").trim() === eid) || episodes[0] || null;
  const variantByPlayerCount = episode?.variantByPlayerCount || {};
  const variant = variantByPlayerCount[String(vpc)] || variantByPlayerCount[vpc] || null;
  const narration = variant?.narration || {};

  const idxFromPad3 = (s) => {
    const n = Number.parseInt(String(s || ""), 10);
    if (!Number.isFinite(n) || n <= 0) return -1;
    return n - 1;
  };

  const parts = sk.split("/").filter(Boolean);
  if (!parts.length) return "";

  const pickClipText = (val, idx = -1) => {
    if (!val) return "";
    if (typeof val === "string") return val;
    if (Array.isArray(val)) {
      const clip = val[idx] ?? val[0];
      if (typeof clip === "string") return clip;
      if (clip && typeof clip === "object") return String(clip.text || "");
      return "";
    }
    if (typeof val === "object") return String(val.text || "");
    return "";
  };

  const kind = parts[0];
  const idx = parts.length >= 2 ? idxFromPad3(parts[parts.length - 1]) : -1;

  if (kind === "opening" && parts.length >= 2) {
    const fromScenario = pickClipText(narration.openingClips, idx);
    if (fromScenario) return fromScenario;

    const tts = await ensureScenarioTtsLoaded(sid, vpc);
    const epTts = tts?.episodes?.[eid] || null;
    return pickClipText(epTts?.openingClips, idx);
  }

  if (kind === "outro" && parts.length >= 2) {
    const fromScenario = pickClipText(narration.nightOutroClips, idx);
    if (fromScenario) return fromScenario;

    const tts = await ensureScenarioTtsLoaded(sid, vpc);
    const epTts = tts?.episodes?.[eid] || null;
    return pickClipText(epTts?.nightOutroClips, idx);
  }

  if (kind === "role" && parts.length >= 4) {
    const roleId = String(parts[1] || "").trim();
    const part = String(parts[2] || "").trim();

    const roleClips = narration.roleClips || {};
    const fromScenario = pickClipText(roleClips?.[roleId]?.[part], idx);
    if (fromScenario) return fromScenario;

    const tts = await ensureScenarioTtsLoaded(sid, vpc);
    const epTts = tts?.episodes?.[eid] || null;
    const roleVal = epTts?.roleClips?.[roleId];
    if (roleVal && typeof roleVal === "object" && !Array.isArray(roleVal)) {
      const partVal = roleVal?.[part] || roleVal?.during || roleVal?.before || roleVal?.after;
      const fromTtsParts = pickClipText(partVal, idx);
      if (fromTtsParts) return fromTtsParts;
    }

    // If we generate "after" steps (close-eyes) but the TTS JSON only provides a single string per role,
    // avoid repeating the same long instruction twice.
    if (part === "after") {
      const closeMap = {
        werewolf: "늑대인간은 이제 눈을 감으세요.",
        mystic_wolf: "신비한 늑대는 이제 눈을 감으세요.",
        minion: "하수인은 이제 눈을 감으세요.",
        mason: "프리메이슨은 이제 눈을 감으세요.",
        apprentice_seer: "견습 점술사는 이제 눈을 감으세요.",
        seer: "점술사는 이제 눈을 감으세요.",
        robber: "강도는 이제 눈을 감으세요.",
        troublemaker: "말썽꾼은 이제 눈을 감으세요.",
        drunk: "주정뱅이는 이제 눈을 감으세요.",
        revealer: "계시자는 이제 눈을 감으세요.",
        insomniac: "불면증 환자는 이제 눈을 감으세요.",
      };
      return closeMap[roleId] || "이제 눈을 감으세요.";
    }

    return pickClipText(roleVal, idx);
  }

  return "";
}

function createBgmEngine() {
  const audio = new Audio();
  audio.loop = true;
  audio.crossOrigin = "anonymous";

  let ctx = null;
  let src = null;
  let gain = null;
  let current = null;
  let currentSrc = "";

  async function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    src = ctx.createMediaElementSource(audio);
    gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(ctx.destination);
  }

  function fadeTo(value, ms) {
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(value, now + ms / 1000);
  }

  function isRunning() {
    return !!current && !!currentSrc && !audio.paused;
  }

  async function loadMetadata({ timeoutMs = 5000 } = {}) {
    return new Promise((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        audio.removeEventListener("loadedmetadata", onMeta);
        audio.removeEventListener("error", onErr);
        clearTimeout(t);
      };
      const onMeta = () => {
        cleanup();
        resolve(true);
      };
      const onErr = () => {
        cleanup();
        reject(new Error("bgm_load_failed"));
      };
      const t = setTimeout(() => {
        cleanup();
        reject(new Error("bgm_load_timeout"));
      }, timeoutMs);
      audio.addEventListener("loadedmetadata", onMeta, { once: true });
      audio.addEventListener("error", onErr, { once: true });
    });
  }

  async function start(bgmCfg) {
    const tracks = bgmCfg?.tracks || [];
    if (!tracks.length) return;
    const t = tracks[Math.floor(Math.random() * tracks.length)];
    if (!t?.src) return;

    await ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();

    const next = {
      volume: typeof t.volume === "number" ? t.volume : 0.22,
      fadeInMs: typeof t.fadeInMs === "number" ? t.fadeInMs : 800,
      fadeOutMs: typeof t.fadeOutMs === "number" ? t.fadeOutMs : 1200,
    };

    // If already running on the same track, just ensure target volume.
    if (isRunning() && currentSrc === String(t.src)) {
      current = next;
      fadeTo(current.volume, current.fadeInMs);
      return;
    }

    current = next;
    currentSrc = String(t.src);

    audio.src = currentSrc;
    audio.load();
    try {
      await loadMetadata();
    } catch (e) {
      // File missing/blocked: fail silently (no BGM).
      current = null;
      currentSrc = "";
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch (_) {
        // ignore
      }
      return;
    }

    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (dur > 30) {
      const safety = 8;
      audio.currentTime = Math.random() * Math.max(0, dur - safety);
    } else {
      audio.currentTime = 0;
    }

    await audio.play().catch(() => {});
    fadeTo(current.volume, current.fadeInMs);
  }

  async function stop() {
    if (!ctx || !gain || !current) return;
    fadeTo(0, current.fadeOutMs);
    await new Promise((r) => setTimeout(r, current.fadeOutMs + 30));
    audio.pause();
    current = null;
    currentSrc = "";
  }

  async function set(on, opts = {}) {
    await ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    if (on) {
      current = { volume: opts.volume ?? 0.22, fadeInMs: opts.fadeInMs ?? 800, fadeOutMs: opts.fadeOutMs ?? 1200 };
      fadeTo(current.volume, current.fadeInMs);
    } else {
      current = current || { volume: 0.22, fadeInMs: 0, fadeOutMs: opts.fadeOutMs ?? 1200 };
      await stop();
    }
  }

  return { ensureCtx, start, stop, set, isRunning };
}

function createNarrationEngine() {
  const audio = new Audio();
  audio.preload = "auto";

  let ctx = null;
  let gain = null;
  let currentSource = null;
  let abortCtrl = null;

  async function ensureCtx() {
    if (ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    gain = ctx.createGain();
    gain.gain.value = 1.0;
    gain.connect(ctx.destination);
  }

  async function ensureRunning() {
    await ensureCtx();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn("[narration] AudioContext resume failed", e);
        return false;
      }
    }
    if (ctx.state !== "running") return false;
    return true;
  }

  async function stop() {
    try {
      abortCtrl?.abort?.();
    } catch (e) {
      // ignore
    }
    abortCtrl = null;

    try {
      if (currentSource) currentSource.stop(0);
    } catch (e) {
      // ignore
    }
    try {
      currentSource?.disconnect?.();
    } catch (e) {
      // ignore
    }
    currentSource = null;

    try {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    } catch (e) {
      // ignore
    }
  }

  async function playOneWithWebAudio(url) {
    const ok = await ensureRunning();
    if (!ok || !ctx || !gain) throw new Error("audio_ctx_unavailable");

    abortCtrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const res = await fetch(url, abortCtrl ? { signal: abortCtrl.signal, cache: "no-store" } : { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
    const buf = await res.arrayBuffer();

    const audioBuf = await new Promise((resolve, reject) => {
      try {
        // Safari requires callbacks sometimes; handle both promise/callback styles.
        const p = ctx.decodeAudioData(buf, resolve, reject);
        if (p && typeof p.then === "function") p.then(resolve, reject);
      } catch (e) {
        reject(e);
      }
    });

    return new Promise((resolve) => {
      const src = ctx.createBufferSource();
      currentSource = src;
      src.buffer = audioBuf;
      src.connect(gain);
      src.onended = () => {
        if (currentSource === src) currentSource = null;
        resolve();
      };
      try {
        src.start(0);
      } catch (e) {
        if (currentSource === src) currentSource = null;
        resolve();
      }
    });
  }

  async function playOneWithHtmlAudio(url) {
    return new Promise((resolve) => {
      const done = () => {
        audio.onended = null;
        audio.onerror = null;
        audio.onloadedmetadata = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.src = url;
      audio.load();
      audio
        .play()
        .catch((e) => {
          console.warn("[narration] HTMLAudio play() blocked/failed", e);
          done();
        });
    });
  }

  async function playOne(url) {
    await stop();
    try {
      await playOneWithWebAudio(url);
      return;
    } catch (e) {
      console.warn("[narration] WebAudio failed, falling back to HTMLAudio", e);
    }
    await playOneWithHtmlAudio(url);
  }

  async function playList(urls) {
    for (const u of urls) {
      // eslint-disable-next-line no-await-in-loop
      await playOne(u);
    }
  }

  return { ensureCtx, playList, stop };
}

function createKeepAwakeAudioEngine() {
  let ctx = null;
  let osc = null;
  let gain = null;
  let running = false;

  async function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    gain = ctx.createGain();
    gain.gain.value = 0.00001;
    gain.connect(ctx.destination);
  }

  async function start() {
    if (running) return;
    await ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 440;
    osc.connect(gain);
    try {
      osc.start();
      running = true;
    } catch (e) {
      running = false;
    }
  }

  async function stop() {
    if (!running) return;
    try {
      osc?.stop?.();
    } catch (e) {
      // ignore
    }
    try {
      osc?.disconnect?.();
    } catch (e) {
      // ignore
    }
    osc = null;
    running = false;
  }

  return { ensureCtx, start, stop, isRunning: () => running };
}

function createKeepAwakeVideoEngine() {
  let video = null;
  let canvas = null;
  let stream = null;
  let timer = null;
  let running = false;
  let tick = 0;

  function ensureEl() {
    if (video) return;

    video = document.createElement("video");
    video.muted = true;
    video.volume = 0;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.setAttribute("aria-hidden", "true");
    video.disablePictureInPicture = true;

    video.style.position = "fixed";
    video.style.left = "0";
    video.style.top = "0";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    video.style.zIndex = "-1";

    document.body.appendChild(video);

    // Use a tiny canvas stream so we don't need any actual video assets.
    canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const ctx2d = canvas.getContext("2d");
    if (ctx2d) {
      ctx2d.fillStyle = "#000";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (typeof canvas.captureStream === "function") {
      try {
        stream = canvas.captureStream(1);
        video.srcObject = stream;
      } catch (e) {
        stream = null;
      }
    }

    // Some browsers may stop "playing" if frames never change; nudge a frame occasionally.
    timer = window.setInterval(() => {
      if (!ctx2d) return;
      tick += 1;
      ctx2d.fillStyle = tick % 2 ? "#000" : "#010101";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    }, 1000);
  }

  async function start() {
    if (running) return true;
    ensureEl();
    if (!video) return false;
    try {
      await video.play();
      running = true;
      return true;
    } catch (e) {
      running = false;
      return false;
    }
  }

  async function stop() {
    running = false;
    try {
      video?.pause?.();
    } catch (e) {
      // ignore
    }
  }

  return { start, stop, isRunning: () => running };
}

async function ensureAudioUnlocked() {
  try {
    await state.bgm.ensureCtx();
    await state.narration.ensureCtx?.();
    await state.keepAwakeAudio.ensureCtx();
  } catch (e) {
    // ignore
  }
  // Prime iOS speech synthesis inside a user gesture; otherwise later calls may be silent/blocked.
  try {
    if ("speechSynthesis" in window) {
      if (typeof speechSynthesis.getVoices === "function") speechSynthesis.getVoices();
      if (!state.ttsPrimed) {
        state.ttsPrimed = true;
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0; // try to stay inaudible
        u.rate = 1.2;
        u.onend = () => {};
        u.onerror = () => {};
        try {
          speechSynthesis.cancel();
          speechSynthesis.speak(u);
          // Ensure we don't leave a long-running utterance around.
          setTimeout(() => {
            try {
              speechSynthesis.cancel();
            } catch {
              // ignore
            }
          }, 200);
        } catch (e) {
          // ignore
        }
      }
    }
  } catch (e) {
    // ignore
  }
  // Try to acquire wake lock / fallbacks while we are inside a user gesture.
  syncWakeLock().catch(() => {});
}

const HOST_BGM_DEFAULT = {
  tracks: [
    // Put your 1-hour BGM file here: public/assets/bgm.mp3  (served as /assets/bgm.mp3)
    { src: toAppPath("assets/bgm.mp3"), volume: 0.18, fadeInMs: 900, fadeOutMs: 4500 },
  ],
};

async function startHostBgm() {
  if (!isHost()) return;
  await ensureAudioUnlocked();
  await state.bgm.start(HOST_BGM_DEFAULT);
}

async function stopHostBgm() {
  if (!state.bgm?.isRunning?.()) return;
  await state.bgm.stop();
}

async function syncHostBgmForPhase(phase) {
  const p = String(phase || "WAIT").toUpperCase();
  if (!isHost()) {
    await stopHostBgm();
    return;
  }
  // Start at game start and keep under host narration (ROLE/NIGHT), then fade out when debate begins.
  if (p === "ROLE" || p === "NIGHT") {
    await startHostBgm();
    return;
  }
  if (p === "DEBATE" || p === "VOTE" || p === "RESULT" || p === "REVEAL" || p === "ENDING" || p === "WAIT") {
    await stopHostBgm();
  }
}

async function init() {
  installViewportFix();
  ButtonUI?.installGlobalButtonFeedback?.();
  CardUI?.motion?.installGlobalTapFeedback?.();
  showJoin();
  setConn(false);
  setBgGradient("WAIT");
  installClientIdCollisionGuard();
  await ensureUniqueClientId();
  if (keepAwakeAudioParam) {
    const on = !["0", "false", "off", "no"].includes(String(keepAwakeAudioParam || "").toLowerCase());
    state.keepAwakeAudioEnabled = on;
    try {
      localStorage.setItem("keepAwakeAudioEnabled", on ? "1" : "0");
    } catch (e) {
      // ignore
    }
  }
  if (keepAwakeVideoParam) {
    const on = !["0", "false", "off", "no"].includes(String(keepAwakeVideoParam || "").toLowerCase());
    state.keepAwakeVideoEnabled = on;
    try {
      localStorage.setItem("keepAwakeVideoEnabled", on ? "1" : "0");
    } catch (e) {
      // ignore
    }
  }
  
  // Avatar Init
  avatarPreview.textContent = state.avatar;
  avatarBtn.addEventListener("click", () => {
    state.avatar = getRandomAvatar();
    setSavedAvatar(state.avatar);
    avatarPreview.textContent = state.avatar;
    
    // Animation
    avatarPreview.style.transform = "scale(0.8) rotate(15deg)";
    setTimeout(() => {
      avatarPreview.style.transform = "scale(1) rotate(0deg)";
    }, 150);
  });

  await fetchScenarios();
  renderScenarioList();
  connect();

  joinBtn.addEventListener("click", async () => {
    await ensureUniqueClientId();
    await ensureAudioUnlocked();
    state.clientIdLocked = true;
    let name = (nameInput.value || "").trim();
    if (!name) name = `Player-${state.clientId.slice(0, 4)}`;
    state.name = name;
    setSavedName(name);

    const joinSection = qs("#join");

    // Switch scene immediately (no full-screen dim transition).
    send({ type: "join", data: { clientId: state.clientId, name, avatar: state.avatar } });
    
    roomEl.classList.remove("hidden");
    qs(".topbar").classList.remove("hidden");
    joinSection.classList.add("hidden");
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinBtn.click();
  });

  scenarioBtn.addEventListener("click", async () => {
    await ensureAudioUnlocked();
    closeEpisodePicker();
    openModal(scenarioModal);
  });

  if (waitForActionsBtn) {
    waitForActionsBtn.addEventListener("click", () => {
      if (!isHost()) return;
      if ((state.room?.phase || "WAIT") !== "WAIT") return;
      const current = !!state.room?.settings?.waitForActions;
      send({ type: "room_settings", data: { waitForActions: !current } });
    });
  }
  episodeBackBtn.addEventListener("click", () => closeEpisodePicker());
  scenarioBackdrop.addEventListener("click", () => {
    closeEpisodePicker();
    closeModal(scenarioModal);
  });
  scenarioClose.addEventListener("click", () => {
    closeEpisodePicker();
    closeModal(scenarioModal);
  });

  rerollBtn.addEventListener("click", () => {
    send({ type: "reroll" });
  });

  startBtn.addEventListener("click", async () => {
    await ensureAudioUnlocked();
    // Host-only: start looping BGM immediately on user gesture, keep it through host narration,
    // and fade out when debate starts (handled by syncHostBgmForPhase()).
    await startHostBgm();
    send({ type: "start_game", data: {} });
  });

  voteBtn.addEventListener("click", () => {
    renderVoteGrid();
    openModal(voteModal);
  });
  voteBackdrop.addEventListener("click", () => closeModal(voteModal));
  voteClose.addEventListener("click", () => closeModal(voteModal));

  if (voteResultBackdrop) voteResultBackdrop.addEventListener("click", () => closeVoteResult());
  if (voteResultClose) voteResultClose.addEventListener("click", () => closeVoteResult());
  if (voteResultModal) {
    voteResultModal.addEventListener("click", (e) => {
      if (voteResultModal.classList.contains("hidden")) return;
      const target = e?.target || null;
      if (voteResultClose && (target === voteResultClose || voteResultClose.contains(target))) return;
      closeVoteResult();
    });
  }

  if (lobbyNoticeBackdrop) lobbyNoticeBackdrop.addEventListener("click", () => closeLobbyNotice());
  if (lobbyNoticeClose) lobbyNoticeClose.addEventListener("click", () => closeLobbyNotice());

  hostEndBtn.addEventListener("click", () => {
    if (!isHost()) return;
    const phase = state.room?.phase || "WAIT";
    const ok = window.confirm(
      phase === "WAIT"
        ? "정말 게임 상태를 초기화할까요? (로비로 유지)"
        : "정말 게임을 종료하고 로비로 돌아갈까요?"
    );
    if (!ok) return;
    send({ type: "end_game", data: {} });
  });

  if (leaveBtn) {
    leaveBtn.addEventListener("click", () => {
      if (!state.room) return;
      const phase = state.room?.phase || "WAIT";
      const ok = window.confirm(phase === "WAIT" ? "로비에서 나갈까요?" : "게임에서 나갈까요? (나가면 관전/진행이 중단됩니다)");
      if (!ok) return;
      try {
        send({ type: "leave", data: {} });
      } catch (e) {
        // ignore
      }
      try {
        state.ws?.close?.();
      } catch (e) {
        // ignore
      }
      state.room = null;
      state.myRoleId = "";
      state.mySeat = 0;
      state.isSpectator = false;
      state.nightStep = null;
      state.nightPrivate = null;
      state.nightResult = null;
      state.nightUi = null;
      state.roleReady = false;
      showJoin();
    });
  }

  eyesClosedBtn.addEventListener("click", () => {
    if (state.debugRolePreview) return;
    if (state.isSpectator) return;
    if (state.roleReady) return;
    state.roleReady = true;
    renderRoleOverlay();
    send({ type: "night_ready", data: {} });
  });
}

function initDebugApi() {
  if (!state.debugEnabled) return;
  const ensureJoined = () => {
    if (!state.room) throw new Error("Join a room first (click Join).");
  };

  const makeBotId = () => `debug-bot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const makeBotName = (idx) => `Bot-${String(idx).padStart(2, "0")}-${Math.random().toString(16).slice(2, 5)}`;
  const makeWsUrl = () => {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${window.location.host}${toAppPath("ws")}`;
  };

  const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class DebugBotClient {
    constructor({ name, avatar, clientId }) {
      this.name = String(name || "Bot");
      this.avatar = String(avatar || "\u{1F916}");
      this.clientId = String(clientId || makeBotId());
      this.ws = null;
      this.room = null;
      this.roleId = "";
      this.seat = 0;
      this.nightPrivate = null;
      this.debugVoteAnswer = null;
      this.lastNightStepId = 0;
      this.votedKey = "";
      this.readyKey = "";
      this.closed = false;
      this._connect();
    }

    _connect() {
      const ws = new WebSocket(makeWsUrl());
      this.ws = ws;
      ws.addEventListener("open", () => {
        if (this.closed) return;
        this.send({ type: "join", data: { clientId: this.clientId, name: this.name, avatar: this.avatar } });
      });
      ws.addEventListener("message", (ev) => {
        if (this.closed) return;
        let msg = null;
        try {
          msg = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        this._handle(msg);
      });
      ws.addEventListener("close", () => {
        // Do not auto-reconnect; bots are explicit dev tools.
      });
    }

    send(obj) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.send(JSON.stringify(obj));
      } catch (e) {
        // ignore
      }
    }

    close({ sendLeave = true } = {}) {
      this.closed = true;
      try {
        if (sendLeave) this.send({ type: "leave", data: {} });
      } catch (e) {
        // ignore
      }
      try {
        this.ws?.close?.();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }

    _updateSeatFromRoom(room) {
      const players = room?.players || [];
      const me = players.find((p) => String(p.clientId || "") === String(this.clientId || "")) || null;
      this.seat = Number(me?.seat || 0) || 0;
      return this.seat;
    }

    async _maybeReady(room) {
      const phase = String(room?.phase || "WAIT");
      if (phase !== "ROLE") return;
      const key = `${phase}:${room?.phaseEndsAtMs ?? ""}`;
      if (this.readyKey === key) return;
      this.readyKey = key;
      await sleep(350 + Math.random() * 900);
      if (this.closed) return;
      this.send({ type: "night_ready", data: {} });
    }

    async _maybeVote(room) {
      const phase = String(room?.phase || "WAIT");
      // Server accepts votes in DEBATE and VOTE. For bot testing, vote immediately when day starts.
      if (phase !== "DEBATE" && phase !== "VOTE") return;
      const voters = room?.votes || {};
      if (voters && voters[this.clientId]) return;
      const key = `${phase}:${room?.phaseEndsAtMs ?? ""}`;
      if (this.votedKey === key) return;
      this.votedKey = key;

      const players = (room?.players || []).filter((p) => p.connected && !p.isSpectator);
      if (!players.length) return;
      const seats = players.map((p) => Number(p.seat || 0)).filter(Boolean);

      const wolfSeats = Array.isArray(this.debugVoteAnswer?.wolfSeats) ? this.debugVoteAnswer.wolfSeats.map(Number).filter(Boolean) : [];
      const useCorrect = wolfSeats.length > 0 && Math.random() < 0.5;
      const targetSeat = useCorrect ? (pickRandom(wolfSeats) || 0) : (pickRandom(seats) || 0);

      // Vote quickly so host can iterate faster.
      await sleep(80 + Math.random() * 200);
      if (this.closed) return;
      if (!targetSeat) return;
      this.send({ type: "submit_vote", data: { targetSeat } });
    }

    async _maybeNightAction(step, room) {
      const stepId = Number(step?.stepId || 0);
      if (!stepId || stepId === this.lastNightStepId) return;
      this.lastNightStepId = stepId;

      const kind = String(step?.kind || "");
      if (kind !== "role") return;

      const rid = String(step?.roleId || "");
      if (!rid) return;

      const isActive =
        Array.isArray(step?.activeClientIds) && step.activeClientIds.map(String).includes(String(this.clientId || ""));
      if (!isActive) return;

      const players = (room?.players || []).filter((p) => p.connected && !p.isSpectator);
      const mySeat = this._updateSeatFromRoom(room);
      const otherSeats = players.map((p) => Number(p.seat || 0)).filter((s) => s && s !== mySeat);
      const pickOtherSeat = () => pickRandom(otherSeats) || 0;

      const wait = 450 + Math.random() * 1100;
      await sleep(wait);
      if (this.closed) return;

      if (rid === "seer") {
        const mode = Math.random() < 0.5 ? "player" : "center";
        if (mode === "player" && otherSeats.length) {
          const seat = pickOtherSeat();
          if (seat) this.send({ type: "night_action", data: { stepId, action: { mode: "player", seat } } });
          return;
        }
        // center mode
        const idxs = [0, 1, 2];
        const a = pickRandom(idxs);
        const b = pickRandom(idxs.filter((x) => x !== a));
        this.send({ type: "night_action", data: { stepId, action: { mode: "center", indices: [a, b] } } });
        return;
      }

      if (rid === "robber") {
        const seat = pickOtherSeat();
        if (seat) this.send({ type: "night_action", data: { stepId, action: { seat } } });
        return;
      }

      if (rid === "troublemaker") {
        if (otherSeats.length < 2) return;
        const a = pickOtherSeat();
        const b = pickRandom(otherSeats.filter((x) => x !== a)) || 0;
        if (a && b) this.send({ type: "night_action", data: { stepId, action: { seats: [a, b] } } });
        return;
      }

      if (rid === "drunk") {
        const idx = pickRandom([0, 1, 2]);
        this.send({ type: "night_action", data: { stepId, action: { centerIndex: idx } } });
        return;
      }

      if (rid === "werewolf") {
        const canPeek = !!(this.nightPrivate?.payload && this.nightPrivate.payload.canPeekCenter);
        if (!canPeek) return;
        const idx = pickRandom([0, 1, 2]);
        this.send({ type: "night_action", data: { stepId, action: { centerIndex: idx } } });
      }
    }

    _handle(msg) {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "hello") {
        const assigned = String(msg.assignedClientId || "");
        if (assigned && assigned !== this.clientId) this.clientId = assigned;
        const assignedName = String(msg.assignedName || "");
        if (assignedName) this.name = assignedName;
        return;
      }
      if (msg.type === "join_denied") {
        // Don't spam; just stop this bot.
        this.close({ sendLeave: false });
        return;
      }
      if (msg.type === "room_snapshot") {
        this.room = msg.data || null;
        this._updateSeatFromRoom(this.room);
        this._maybeReady(this.room).catch(() => {});
        this._maybeVote(this.room).catch(() => {});
        return;
      }
      if (msg.type === "role_assignment") {
        this.roleId = String(msg.data?.roleId || "");
        return;
      }
      if (msg.type === "night_private") {
        this.nightPrivate = msg.data || null;
        return;
      }
      if (msg.type === "debug_vote_answer") {
        this.debugVoteAnswer = msg.data || null;
        return;
      }
      if (msg.type === "night_step") {
        const step = msg.data || null;
        this._maybeNightAction(step, this.room).catch(() => {});
        return;
      }
      // ignore others
    }
  }

  const botManager = {
    bots: [],
    async add(count = 1) {
      ensureJoined();
      const n = Math.max(1, Math.min(20, Number(count) || 1));
      for (let i = 0; i < n; i += 1) {
        const idx = this.bots.length + 1;
        const bot = new DebugBotClient({ name: makeBotName(idx), avatar: getRandomAvatar(), clientId: makeBotId() });
        this.bots.push(bot);
        await sleep(80);
      }
      return this.bots.length;
    },
    removeAll() {
      const bots = [...this.bots];
      this.bots = [];
      bots.forEach((b) => b.close({ sendLeave: true }));
    },
  };

  const clearSeedPlayers = () => {
    ensureJoined();
    // Legacy: remove local-only fake players.
    const seeded = new Set(state.debugSeedClientIds || []);
    if (seeded.size) {
      state.room.players = (state.room.players || []).filter((p) => !seeded.has(p.clientId));
      state.debugSeedClientIds = [];
    }
    // New: remove real websocket bots.
    botManager.removeAll();
    render();
  };

  const seedPlayers = (countOrOpts = 5) => {
    ensureJoined();
    const opts = typeof countOrOpts === "number" ? { count: countOrOpts } : (countOrOpts || {});
    const count = Math.max(0, Math.min(12, Number(opts.count ?? 5)));

    const mode = String(opts.mode || "bot"); // bot | fake
    clearSeedPlayers();

    if (mode !== "fake") {
      // Create real bots so starting a real game behaves like actual multi-device play.
      const current = (state.room?.players || []).filter((p) => p.connected && !p.isSpectator).length || 0;
      const need = Math.max(0, count - current);
      botManager.add(need).catch(() => {});
      return;
    }

    const existing = state.room.players || [];
    const debugAvatars =
      typeof AVATARS !== "undefined" && Array.isArray(AVATARS) && AVATARS.length
        ? AVATARS
        : ["🧙", "🧛", "🧟", "🕵️", "🧑‍🌾", "🧑‍⚕️", "🧑‍🍳", "🧑‍🚀", "🧑‍🎤", "🧑‍🏫"];
    const usedSeats = new Set(existing.map((p) => Number(p.seat || 0)).filter(Boolean));
    const nextSeat = () => {
      for (let s = 1; s <= 30; s += 1) {
        if (!usedSeats.has(s)) {
          usedSeats.add(s);
          return s;
        }
      }
      return usedSeats.size + 1;
    };

    const seededIds = [];
    const randomColor = () => {
      const h = Math.floor(Math.random() * 360);
      return `hsl(${h} 85% 65%)`;
    };
    const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    for (let i = 0; i < count; i += 1) {
      const seat = nextSeat();
      const clientId = `debug-seed-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`;
      seededIds.push(clientId);
      const avatar = pickRandom(debugAvatars) || "👤";
      existing.push({
        clientId,
        name: `P${seat}`,
        seat,
        avatar,
        color: randomColor(), // random per user
        connected: true,
        isHost: false,
        isSpectator: false,
      });
    }

    state.room.players = existing;
    state.debugSeedClientIds = seededIds;
    render();
  };

	  const addBot = (countOrOpts = 1) => {
	    if (!state.room) return;
	    const opts = typeof countOrOpts === "number" ? { count: countOrOpts } : (countOrOpts || {});
	    const count = Math.max(1, Math.min(20, Number(opts.count ?? 1)));
	    return botManager.add(count);
	  };
	  const removeBot = () => {
	    if (!state.room) return;
	    botManager.removeAll();
	  };
  const ensureMySeat = () => {
    ensureJoined();
    const me = (state.room?.players || []).find((p) => p.clientId === state.clientId) || null;
    const seat = Number(me?.seat || state.mySeat || 0);
    if (!seat) throw new Error("No seat assigned yet; wait for room_snapshot.");
    state.mySeat = seat;
    return seat;
  };

  const previewNightStep = ({ kind = "role", roleId = "seer", active = true } = {}) => {
    ensureJoined();
    const mySeat = ensureMySeat();
    state.debugNightPreview = true;
    const scenarioId = state.room?.selectedScenarioId || state.scenarioState?.selectedScenarioId || state.scenarios?.[0]?.scenarioId || "";
    const episodeId = state.room?.selectedEpisodeId || state.scenarioState?.selectedEpisodeId || "ep1";
    const pc =
      Number(state.scenarioState?.playerCount) ||
      (state.room?.players || []).filter((p) => p.connected && !p.isSpectator).length ||
      5;

    state.room.phase = "NIGHT";
    state.room.phaseEndsAtMs = Date.now() + 60_000;
    setPhase("NIGHT", state.room.phaseEndsAtMs);

    state.nightUi = null;
    state.nightResult = null;
    state.nightPrivate = null;

    const stepKind = String(kind || "role");
    const rid = stepKind === "role" ? String(roleId || "") : "";
    const sectionKey =
      stepKind === "opening"
        ? "opening/001"
        : stepKind === "outro"
          ? "outro/001"
          : `role/${rid || "seer"}/during/001`;

    state.nightStep = {
      stepId: Math.floor(Date.now() / 1000),
      kind: stepKind,
      roleId: rid,
      activeSeats: active ? [mySeat] : [],
      activeClientIds: active ? [state.clientId] : [],
      requiresAction: stepKind === "role",
      sectionKey,
      scenarioId,
      episodeId,
      variantPlayerCount: pc,
      stepIndex: 1,
      stepCount: 1,
      stepEndsAtMs: Date.now() + 60_000,
    };

    if (rid) state.myRoleId = rid;

    if (rid === "werewolf") {
      // Only "lone wolf" can peek center; simulate based on debug roles.
      const roleIds = Object.keys(ROLE_DEFINITIONS || {});
      const pick = () => roleIds[Math.floor(Math.random() * roleIds.length)] || "villager";
      const playersNow = (state.room?.players || []).filter((p) => p.connected && !p.isSpectator);
      const seatsNow = new Set(playersNow.map((p) => Number(p.seat || 0)).filter(Boolean));
      for (const p of playersNow) {
        const seat = Number(p.seat || 0);
        if (!seat) continue;
        if (!state.debugRoleBySeat[seat]) state.debugRoleBySeat[seat] = pick();
      }
      state.debugRoleBySeat[mySeat] = "werewolf";
      const werewolfCount = Object.entries(state.debugRoleBySeat || {}).filter(
        ([seat, r]) => seatsNow.has(Number(seat)) && String(r) === "werewolf"
      ).length;
      state.nightPrivate = { payload: { canPeekCenter: werewolfCount === 1 } };
    }

    renderNightOverlay();
  };

  const previewRoleCheck = (arg = {}) => {
    ensureJoined();
    state.debugRolePreview = true;
    const opts = typeof arg === "string" ? { roleId: arg } : (arg || {});
    const eyesClosed = !!opts.eyesClosed;
    const roleId = String(opts.roleId || "");

    if (roleId) {
      state.myRoleId = roleId;
    }
    state.roleReady = eyesClosed;
    state.room.phase = "ROLE";
    state.room.phaseEndsAtMs = Date.now() + 90_000;
    setPhase("ROLE", state.room.phaseEndsAtMs);
    renderRoleOverlay();
  };

  const clearOverlays = () => {
    ensureJoined();
    state.nightStep = null;
    state.nightPrivate = null;
    state.nightResult = null;
    state.nightUi = null;
    state.roleReady = false;
    state.debugRolePreview = false;
    state.debugNightPreview = false;
    renderRoleOverlay();
    renderNightOverlay();
  };

  const api = {
    listScenarios: () => state.scenarios,
    selectScenario: (scenarioId) => send({ type: "scenario_select", data: { scenarioId } }),
    unlockScenario: (scenarioId) => send({ type: "debug", data: { action: "unlock_scenario", data: { scenarioId } } }),
    startGame: () => send({ type: "start_game", data: {} }),
    forceStart: () => send({ type: "debug", data: { action: "force_start", data: {} } }),
    endGame: ({ winner = "mixed" } = {}) => send({ type: "debug", data: { action: "end_game", data: { winner } } }),
    forceRole: (roleId, { clientId = "" } = {}) => {
      ensureJoined();
      const rid = String(roleId || "").trim();
      const cid = String(clientId || "").trim() || String(state.clientId || "");
      if (!rid) return;
      send({ type: "debug", data: { action: "force_role", data: { clientId: cid, roleId: rid } } });
    },
    clearForcedRole: ({ clientId = "" } = {}) => {
      ensureJoined();
      const cid = String(clientId || "").trim() || String(state.clientId || "");
      if (!cid) return;
      send({ type: "debug", data: { action: "clear_forced_role", data: { clientId: cid } } });
    },
    setPhase: (phase, { durationSec = 30 } = {}) =>
      send({ type: "debug", data: { action: "set_phase", data: { phase, durationSec } } }),
    dumpState: () => state.room,
    setBgm: ({ on = true, volume = 0.22, fadeInMs = 800, fadeOutMs = 1200 } = {}) =>
      state.bgm.set(on, { volume, fadeInMs, fadeOutMs }),
    playClipUrl: async (url) => state.narration.playList([url]),
    ui: {
      roleCheck: (arg) => previewRoleCheck(arg),
      nightAction: (roleId = "seer", opts = {}) => previewNightStep({ ...(opts || {}), kind: "role", roleId, active: true }),
      nightWait: () => previewNightStep({ kind: "role", roleId: "seer", active: false }),
      nightOpening: () => previewNightStep({ kind: "opening", active: false }),
      nightOutro: () => previewNightStep({ kind: "outro", active: false }),
      seedPlayers: (countOrOpts) => seedPlayers(countOrOpts),
      clearSeedPlayers: () => clearSeedPlayers(),
      addBot: (countOrOpts) => addBot(countOrOpts),
      removeBot: () => removeBot(),
      clear: () => clearOverlays(),
      // Apply a preview to other clients (debug only, host only).
      applyTo: ({ target = "all", seats = [], clientIds = [], includeHost = true } = {}, name = "", ...args) => {
        ensureJoined();
        send({
          type: "debug",
          data: {
            action: "ui_preview",
            data: { target, seats, clientIds, includeHost, ui: { name, args } },
          },
        });
      },
    },
  };
  window.gameDebug = api;
  console.log("[debug] gameDebug enabled", api);

  state.applyUiPreview = ({ name = "", args = [] } = {}) => {
    const n = String(name || "");
    const a = Array.isArray(args) ? args : [];
    if (n === "roleCheck") return previewRoleCheck(a[0] ?? {});
    if (n === "nightAction") return previewNightStep({ kind: "role", roleId: a[0] ?? "seer", active: true });
    if (n === "nightWait") return previewNightStep({ kind: "role", roleId: a[0] ?? "seer", active: false });
    if (n === "nightOpening") return previewNightStep({ kind: "opening", active: false });
    if (n === "nightOutro") return previewNightStep({ kind: "outro", active: false });
    if (n === "clear") return clearOverlays();
    if (n === "seedPlayers") return seedPlayers(a[0] ?? 5);
    if (n === "clearSeedPlayers") return clearSeedPlayers();
  };
}

init().catch((e) => console.error(e));
