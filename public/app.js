/* global speechSynthesis */

const qs = (sel) => document.querySelector(sel);

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
const connDot = qs("#connDot");
const phaseLabel = qs("#phaseLabel");
const scenarioLabel = qs("#scenarioLabel");
const timerEl = qs("#timer");
const hostEndBtn = qs("#hostEndBtn");

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

const nightOverlay = qs("#nightOverlay");
const nightTitle = qs("#nightTitle");
const nightRole = qs("#nightRole");
const nightHint = qs("#nightHint");
const nightActive = qs("#nightActive");
const nightPrivate = qs("#nightPrivate");
const nightAction = qs("#nightAction");

const roleOverlay = qs("#roleOverlay");
const roleTitle = qs("#roleTitle");
const roleName = qs("#roleName");
const roleDesc = qs("#roleDesc");
const roleProfile = qs("#roleProfile");
const roleAction = qs("#roleAction");
const eyesClosedBtn = qs("#eyesClosedBtn");

const url = new URL(window.location.href);
const debugClientId = url.searchParams.get("debugClientId") || "";
const debugName = url.searchParams.get("debugName") || "";

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

function getSavedName() {
  if (debugName) return debugName;
  return localStorage.getItem("playerName") || "";
}

function setSavedName(name) {
  localStorage.setItem("playerName", name);
}

const AVATARS = [
  "🐺", "🦊", "🐱", "🦁", "🐯", "🐶", "🐻", "🐨", "🐼", "🐹", 
  "🐰", "🦄", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤",
  "🦉", "🦇", "🦋", "🐌", "🐞", "👻", "👽", "🤖", "🎃", "💀",
  "🤡", "👹", "👺", "🧟", "🧞", "🧚", "🧜", "🧛", "🦸", "🦹"
];

const ROLE_DEFINITIONS = {
  // --- Basic ---
  werewolf: { icon: "🐺", name: "늑대인간", desc: "밤에 눈을 떠 동료를 확인합니다. 혼자라면 중앙 카드 1장을 확인합니다." },
  minion: { icon: "😈", name: "하수인", desc: "늑대인간이 누구인지 알지만, 늑대인간은 하수인을 모릅니다. 늑대인간을 도우세요." },
  mason: { icon: "👷", name: "석공", desc: "밤에 눈을 떠 다른 석공을 확인합니다." },
  seer: { icon: "🔮", name: "예언자", desc: "다른 사람의 카드 1장 또는 중앙 카드 2장을 확인합니다." },
  robber: { icon: "💰", name: "강도", desc: "다른 사람의 카드를 자신과 교환하고, 가져온 카드를 확인합니다." },
  troublemaker: { icon: "🤪", name: "문제아", desc: "다른 두 사람의 카드를 서로 바꿉니다 (자신은 확인 불가)." },
  drunk: { icon: "🍺", name: "취객", desc: "중앙 카드 1장과 자신의 카드를 바꿉니다 (바꾼 카드는 확인 불가)." },
  insomniac: { icon: "🥱", name: "불면증", desc: "밤이 끝날 때 자신의 카드를 다시 확인합니다." },
  villager: { icon: "🧑‍🌾", name: "마을주민", desc: "특별한 능력이 없습니다. 누구보다 열심히 추리하세요." },
  hunter: { icon: "🔫", name: "사냥꾼", desc: "투표로 죽게 되면, 자신이 지목한 대상을 길동무로 데려갑니다." },
  tanner: { icon: "🤡", name: "무두장이", desc: "투표로 죽는 것이 승리 조건입니다." },

  // --- Daybreak ---
  sentinel: { icon: "🛡️", name: "파수꾼", desc: "플레이어 한 명에게 방패 토큰을 줍니다. 방패를 받은 사람은 카드가 바뀌거나 확인되지 않습니다." },
  alpha_wolf: { icon: "👑", name: "알파 늑대", desc: "늑대인간 차례에 중앙에 있는 늑대 카드를 누군가와 교환합니다." },
  mystic_wolf: { icon: "🔮", name: "신비한 늑대", desc: "늑대인간 차례에 다른 사람의 카드를 확인합니다." },
  apprentice_seer: { icon: "🎓", name: "견습 예언자", desc: "중앙 카드 1장을 확인합니다." },
  paranormal_investigator: { icon: "🕵️", name: "초현상 수사관", desc: "다른 사람 1명의 카드를 봅니다. 늑대인간이라면 자신도 늑대인간이 됩니다." },
  witch: { icon: "🧙‍♀️", name: "마녀", desc: "중앙 카드 1장을 확인하고, 그 카드를 누군가의 카드와 바꿀 수 있습니다." },
  village_idiot: { icon: "🤪", name: "마을 바보", desc: "모든 카드를 왼쪽/오른쪽으로 한 칸씩 이동시킵니다." },
  revealer: { icon: "🌞", name: "폭로자", desc: "누군가의 카드를 확인합니다. 늑대인간이라면 카드를 공개 상태로 뒤집어 둡니다." },
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
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
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
  roleReady: false,
  lastNightStepId: 0,
  bgm: createBgmEngine(),
  narration: createNarrationEngine(),
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
  document.body.style.backgroundImage = g;
  document.body.style.animationDuration = phase === "NIGHT" ? "22s" : "18s";
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
  state.room = state.room || {};
  state.room.phase = phase;
  state.room.phaseEndsAtMs = endsAtMs ?? null;
  if (state.tickTimer) clearInterval(state.tickTimer);
  state.tickTimer = setInterval(renderTimer, 200);
  renderTimer();
  syncWakeLock().catch(() => {});
}

let wakeLockSentinel = null;

function shouldKeepScreenAwake(phase) {
  return ["ROLE", "NIGHT", "DEBATE", "VOTE", "RESULT", "REVEAL"].includes(String(phase || "").toUpperCase());
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  if (document.visibilityState !== "visible") return;
  if (wakeLockSentinel) return;
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
  } catch {
    wakeLockSentinel = null;
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLockSentinel) await wakeLockSentinel.release();
  } catch {
    // ignore
  } finally {
    wakeLockSentinel = null;
  }
}

async function syncWakeLock() {
  const phase = state.room?.phase || "WAIT";
  if (!shouldKeepScreenAwake(phase)) {
    await releaseWakeLock();
    return;
  }
  await requestWakeLock();
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

function render() {
  const room = state.room;
  if (!room) return;

  const phase = room.phase || "WAIT";
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
      startBtn.disabled = !(state.scenarioState?.canStart);
    } else {
      rerollBtn.classList.remove("hidden");
      scenarioBtn.classList.add("hidden");
      startBtn.classList.add("hidden");
    }
  } else {
    // In game, hide lobby buttons
    rerollBtn.classList.add("hidden");
    scenarioBtn.classList.add("hidden");
    startBtn.classList.add("hidden");
  }

  voteBtn.classList.toggle("hidden", phase !== "VOTE" || state.isSpectator);

  const players = room.players || [];
  gridEl.innerHTML = "";
  for (const p of players) {
    const card = document.createElement("div");
    card.className = "card";
    if (p.clientId === state.clientId) card.classList.add("card--me");
    if (p.isHost) card.classList.add("card--host");
    if (p.connected) card.classList.add("card--connected");
    
    applyPlayerPalette(card, p.color || "#888");

    // Check if voted
    if (state.room?.votes?.[p.clientId]) {
      card.setAttribute("data-voted", "true");
    }

    // Top: Seat Number + Badge
    const top = document.createElement("div");
    top.className = "card__top";

    const seat = document.createElement("div");
    seat.className = "seat";
    seat.textContent = String(p.seat);

    const badgeGroup = document.createElement("div");
    badgeGroup.className = "badgeGroup";

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = p.isHost ? "HOST" : p.connected ? "ON" : "OFF"; // Shorten badge text
    badgeGroup.appendChild(badge);

    if (p.clientId === state.clientId) {
      const meBadge = document.createElement("div");
      meBadge.className = "badge badge--me";
      meBadge.textContent = "ME";
      badgeGroup.appendChild(meBadge);
    }

    top.appendChild(seat);
    top.appendChild(badgeGroup);

    // Content: Avatar + Name
    const content = document.createElement("div");
    content.className = "card__content";

    const avatar = document.createElement("div");
    avatar.className = "card__avatar";
    avatar.textContent = p.avatar || "👤";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name + (p.clientId === state.clientId && state.myRoleId ? ` · ${getRoleDisplayName(state.myRoleId)}` : "");

    content.appendChild(avatar);
    content.appendChild(name);

    // Bottom Bar (Vote Indicator)
    const bar = document.createElement("div");
    bar.className = "card__bar";

    card.appendChild(top);
    card.appendChild(content);
    card.appendChild(bar);
    gridEl.appendChild(card);
  }

  renderInfoDeck();
  renderRoleOverlay();
  renderNightOverlay();
}

function renderInfoDeck() {
  const deckEl = qs("#infoDeck");
  const indicatorEl = qs("#deckIndicators");
  const sid = state.room?.selectedScenarioId;
  const connectedCount = (state.room?.players || []).filter((p) => p.connected).length || 0;
  
  // Re-render if scenario OR player count changes (to update role deck variant)
  const hasFull = !!state.scenarioById?.[sid]?.episodes;
  // While we only have list data (no episodes/roleDeck), don't churn the UI on every room update.
  const cacheKey = hasFull ? `${sid}:${connectedCount}:full` : `${sid}:list`;
  if (deckEl.dataset.cacheKey === cacheKey && sid) return;
  deckEl.dataset.cacheKey = cacheKey;

  deckEl.innerHTML = "";
  indicatorEl.innerHTML = "";

  if (!sid) {
    deckEl.innerHTML = `
      <div class="info-card">
        <div class="info-card__content">
          <div class="info-card__role-icon">⏳</div>
          <h3>대기 중...</h3>
          <p>호스트가 시나리오를 선택하고 있습니다.</p>
        </div>
      </div>`;
    return;
  }

  const scenario = state.scenarioById[sid];
  if (!scenario) return;
  if (!scenario.episodes) {
    // Render loading UI once per selected scenario, then wait for the detail fetch.
    if (deckEl.dataset.loadingFor !== sid) {
      deckEl.dataset.loadingFor = sid;
      deckEl.innerHTML = `
        <div class="info-card">
          <div class="info-card__content">
            <div class="info-card__role-icon">📥</div>
            <h3>역할 정보를 불러오는 중...</h3>
            <p>선택된 시나리오의 등장 역할/규칙 카드를 준비하고 있습니다.</p>
          </div>
        </div>`;
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
  // Get active roles for current player count (or default to max if waiting)
  // If waiting, maybe show max player variant or just first episode's default?
  // Let's iterate ALL unique roles in the scenario to be safe, or just current variant.
  // Using current variant is better for context.
  const selectedEpisodeId = state.room?.selectedEpisodeId || state.scenarioState?.selectedEpisodeId || "";
  const eps = Array.isArray(scenario.episodes) ? scenario.episodes : [];
  const ep = eps.find((e) => (e?.episodeId || "") === selectedEpisodeId) || eps[0];
  const fallbackCount =
    connectedCount > 0 ? connectedCount : Math.max(...(scenario.recommendedPlayerCounts || [5, 6, 7, 8, 9, 10]));
  const { variant } = selectVariantForPlayerCount(ep, fallbackCount); // Default to max recommended
  
  if (variant && variant.roleDeck) {
    const deck = effectiveRoleDeckForPlayerCount(variant, fallbackCount);
    const counts = {};
    for (const r of deck) counts[r] = (counts[r] || 0) + 1;
    const uniqueRoles = Object.keys(counts);

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
    const card = document.createElement("div");
    card.className = "info-card";
    card.innerHTML = `
      <div class="info-card__content">
        <span class="info-card__tag">${s.tag}</span>
        <div class="info-card__role-icon">${s.icon}</div>
        <h3>${escapeHtml(s.title)}</h3>
        <p>${s.text}</p>
      </div>
    `;
    deckEl.appendChild(card);

    const dot = document.createElement("div");
    dot.className = "indicator";
    if (idx === 0) dot.classList.add("active");
    indicatorEl.appendChild(dot);
  });

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
    return;
  }

  nightOverlay.classList.remove("hidden");
  // Default night mode: fullscreen profile card (consistent brightness), unless I'm actively acting.
  const kind = String(step.kind || "");
  const activeRole = String(step.roleId || "");
  const activeRoleName = activeRole ? getRoleDisplayName(activeRole) : "";
  const activeSeats = Array.isArray(step.activeSeats) ? step.activeSeats.map((n) => Number(n)) : [];
  const isActor = !!state.mySeat && activeSeats.includes(Number(state.mySeat)) && !state.isSpectator;
  nightOverlay.classList.toggle("nightOverlay--fullscreen", !isActor);
  nightOverlay.classList.toggle("nightOverlay--profileOnly", !isActor);
  nightOverlay.classList.toggle("nightOverlay--actorBg", isActor);

  const stepLabel = `${String(step.stepIndex || 0)}/${String(step.stepCount || 0)}`;
  nightTitle.textContent = `NIGHT · ${stepLabel}`;
  if (!isActor) {
    nightRole.textContent = state.isSpectator ? "관전 중" : "";
  } else {
    nightRole.textContent = state.isSpectator
      ? "관전 중"
      : state.myRoleId
          ? `내 역할: ${getRoleDisplayName(state.myRoleId)}`
          : "내 역할: (미정)";
  }

  // Reset containers
  nightActive.innerHTML = "";
  nightPrivate.classList.add("hidden");
  nightPrivate.innerHTML = "";
  nightAction.classList.add("hidden");
  nightAction.innerHTML = "";

  const players = (state.room?.players || []).filter((p) => p.connected && !p.isSpectator);
  const bySeat = new Map(players.map((p) => [Number(p.seat), p]));

  const buildLargeCard = (p, badgeText) => {
    const el = document.createElement("div");
    el.className = "profileCardLarge";
    applyPlayerPalette(el, p?.color || "#888");
    el.innerHTML = `
      <div class="profileCardLarge__badge">${escapeHtml(badgeText || "")}</div>
      <div class="profileCardLarge__seat">${escapeHtml(String(p?.seat ?? ""))}</div>
      <div class="profileCardLarge__avatar">${escapeHtml(p?.avatar || "👤")}</div>
      <div class="profileCardLarge__name">${escapeHtml(p?.name || "")}</div>
    `;
    return el;
  };

  const me = (state.room?.players || []).find((p) => p.clientId === state.clientId) || null;
  applyPlayerPalette(nightOverlay, me?.color || "#888");
  nightOverlay.style.setProperty("--panel-color", me?.color || "#888");
  const myCard = me ? buildLargeCard(me, "눈 감아요") : null;

  if (kind === "opening") {
    nightHint.textContent = "모두 눈을 감고 휴대폰을 내려놓으세요.";
    if (myCard) nightActive.appendChild(myCard);
    return;
  }
  if (kind === "outro") {
    nightHint.textContent = "밤이 끝났습니다. 모두 눈을 뜨세요.";
    if (myCard) nightActive.appendChild(myCard);
    return;
  }

  // ROLE steps
  if (kind !== "role") {
    nightHint.textContent = "밤 진행 중...";
    return;
  }

  // Default (non-actor): keep my profile card fullscreen until day.
  if (!isActor) {
    nightHint.textContent = `${activeRoleName || "누군가"} 차례입니다. 계속 눈을 감고 기다리세요.`;
    if (myCard) nightActive.appendChild(myCard);
    return;
  }

  // Actor device: show interaction UI (and keep brightness the same).
  nightHint.textContent = `${activeRoleName || "당신"} 차례입니다. 행동 후에는 다시 휴대폰을 내려놓고 눈을 감아주세요.`;

  if (myCard) {
    myCard.classList.add("profileCardLarge--actorBg");
    nightActive.appendChild(myCard);
  }

  // Private hint payloads (server-sent).
  const priv = state.nightPrivate?.payload || null;
  if (priv) {
    nightPrivate.classList.remove("hidden");
    // Keep text minimal; no secrets beyond what server intended.
    nightPrivate.innerHTML = `<div>${escapeHtml(JSON.stringify(priv))}</div>`;
  }

  const stepId = Number(step.stepId || 0);
  const roleId = activeRole;

  const setChoiceState = (next) => {
    state.nightUi = { ...(state.nightUi || {}), ...next };
    renderNightOverlay();
  };

  const renderPlayerChoices = ({ selectedSeats = [], max = 1 } = {}) => {
    const row = document.createElement("div");
    row.className = "nightAction__row";
    for (const p of players) {
      const b = document.createElement("button");
      b.className = "nightChoice nightChoiceCard";
      b.innerHTML = `
        <div class="nightChoiceCard__seat">${escapeHtml(String(p.seat || ""))}</div>
        <div class="nightChoiceCard__avatar">${escapeHtml(p?.avatar || "?‘¤")}</div>
        <div class="nightChoiceCard__name">${escapeHtml(p?.name || "")}</div>
      `;
      applyPlayerPalette(b, p.color || "#888");
      if (selectedSeats.includes(Number(p.seat))) b.classList.add("nightChoice--selected");
      b.addEventListener("click", () => {
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
    for (const idx of [0, 1, 2]) {
      const b = document.createElement("button");
      b.className = "nightChoice nightChoiceCard nightChoiceCard--center";
      b.innerHTML = `
        <div class="nightChoiceCard__seat">C${idx + 1}</div>
        <div class="nightChoiceCard__avatar">🂠</div>
        <div class="nightChoiceCard__name">중앙 카드 ${idx + 1}</div>
      `;
      applyPlayerPalette(b, me?.color || "#888");
      if (selected.includes(idx)) b.classList.add("nightChoice--selected");
      b.addEventListener("click", () => {
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

  const submitBtn = (label, onClick) => {
    const b = document.createElement("button");
    b.className = "btn btn--primary";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  };

  const ui = state.nightUi || {};
  nightAction.classList.remove("hidden");

  if (roleId === "seer") {
    const mode = ui.mode || "player";
    const top = document.createElement("div");
    top.className = "nightAction__row";
    const m1 = document.createElement("button");
    m1.className = "nightChoice" + (mode === "player" ? " nightChoice--selected" : "");
    m1.textContent = "플레이어 1명";
    m1.addEventListener("click", () => setChoiceState({ mode: "player", selectedSeats: [], selectedCenter: [] }));
    const m2 = document.createElement("button");
    m2.className = "nightChoice" + (mode === "center" ? " nightChoice--selected" : "");
    m2.textContent = "센터 2장";
    m2.addEventListener("click", () => setChoiceState({ mode: "center", selectedSeats: [], selectedCenter: [] }));
    top.appendChild(m1);
    top.appendChild(m2);
    nightAction.appendChild(top);

    if (mode === "player") {
      nightAction.appendChild(renderPlayerChoices({ selectedSeats: ui.selectedSeats || [], max: 1 }));
      nightAction.appendChild(
        submitBtn("확인", () => {
          const seat = (ui.selectedSeats || [])[0];
          if (!seat) return;
          send({ type: "night_action", data: { stepId, action: { mode: "player", seat } } });
        })
      );
    } else {
      nightAction.appendChild(renderCenterChoices({ selected: ui.selectedCenter || [], max: 2 }));
      nightAction.appendChild(
        submitBtn("확인", () => {
          const indices = ui.selectedCenter || [];
          if (!Array.isArray(indices) || indices.length !== 2) return;
          send({ type: "night_action", data: { stepId, action: { mode: "center", indices } } });
        })
      );
    }
  } else if (roleId === "robber") {
    nightAction.appendChild(renderPlayerChoices({ selectedSeats: ui.selectedSeats || [], max: 1 }));
    nightAction.appendChild(
      submitBtn("교환", () => {
        const seat = (ui.selectedSeats || [])[0];
        if (!seat) return;
        send({ type: "night_action", data: { stepId, action: { seat } } });
      })
    );
  } else if (roleId === "troublemaker") {
    nightAction.appendChild(renderPlayerChoices({ selectedSeats: ui.selectedSeats || [], max: 2 }));
    nightAction.appendChild(
      submitBtn("교환", () => {
        const seats = ui.selectedSeats || [];
        if (!Array.isArray(seats) || seats.length !== 2) return;
        send({ type: "night_action", data: { stepId, action: { seats } } });
      })
    );
  } else if (roleId === "drunk") {
    nightAction.appendChild(renderCenterChoices({ selected: ui.selectedCenter || [], max: 1 }));
    nightAction.appendChild(
      submitBtn("교환", () => {
        const centerIndex = (ui.selectedCenter || [])[0];
        if (centerIndex === undefined || centerIndex === null) return;
        send({ type: "night_action", data: { stepId, action: { centerIndex } } });
      })
    );
  } else if (roleId === "werewolf") {
    // Lone wolf optional peek.
    const canPeek = !!(state.nightPrivate?.payload && state.nightPrivate.payload.canPeekCenter);
    if (!canPeek) {
      nightAction.classList.add("hidden");
      nightAction.innerHTML = "";
    } else {
      nightAction.appendChild(renderCenterChoices({ selected: ui.selectedCenter || [], max: 1 }));
      nightAction.appendChild(
        submitBtn("센터 확인", () => {
          const centerIndex = (ui.selectedCenter || [])[0];
          if (centerIndex === undefined || centerIndex === null) return;
          send({ type: "night_action", data: { stepId, action: { centerIndex } } });
        })
      );
    }
  } else {
    nightAction.classList.add("hidden");
    nightAction.innerHTML = "";
  }

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
    return;
  }
  roleOverlay.classList.remove("hidden");
  roleOverlay.classList.toggle("nightOverlay--fullscreen", true);
  roleOverlay.classList.toggle("nightOverlay--profileOnly", !!state.roleReady);
  roleTitle.textContent = "ROLE · 역할 확인";

  if (state.isSpectator) {
    roleName.textContent = "관전 중";
    roleDesc.textContent = "이 라운드는 관전합니다. 휴대폰을 내려놓고 눈을 감아주세요. 모두 준비되면 밤이 시작됩니다.";
    roleAction.classList.add("hidden");
  } else {
    const rid = state.myRoleId || "";
    roleName.textContent = rid ? getRoleDisplayName(rid) : "(역할을 받는 중...)";
    const def = ROLE_DEFINITIONS[rid];
    roleDesc.textContent =
      (def?.desc || "자신의 역할을 확인하세요.") +
      " 준비되면 아래 버튼을 누르고, 휴대폰을 테이블에 내려놓은 채 눈을 감아주세요.";
    roleAction.classList.toggle("hidden", !!state.roleReady);
  }

  roleProfile.innerHTML = "";
  const me = (state.room?.players || []).find((p) => p.clientId === state.clientId) || null;
  if (me) {
    const card = document.createElement("div");
    card.className = "profileCardLarge";
    applyPlayerPalette(card, me.color || "#888");
    card.innerHTML = `
      <div class="profileCardLarge__badge">${state.roleReady ? "EYES CLOSED" : "READY?"}</div>
      <div class="profileCardLarge__seat">${escapeHtml(String(me.seat || ""))}</div>
      <div class="profileCardLarge__avatar">${escapeHtml(me.avatar || "👤")}</div>
      <div class="profileCardLarge__name">${escapeHtml(me.name || "")}</div>
    `;
    roleProfile.appendChild(card);
  }
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
  const url = buildVoiceUrl({ scenarioId, episodeId, playerCount: variantPlayerCount, sectionKey });
  const ok = await urlExists(url);
  if (ok) {
    await state.narration.playList([url]);
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
  const res = await fetch("/api/scenarios");
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
    const res = await fetch(`/api/scenarios/${encodeURIComponent(sid)}`);
    if (!res.ok) return null;
    const full = await res.json();
    state.scenarioById[sid] = full;
    const idx = (state.scenarios || []).findIndex((x) => x?.scenarioId === sid);
    if (idx >= 0) state.scenarios[idx] = full;
    return full;
  } catch {
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
    const res = await fetch(`/api/scenarios/${encodeURIComponent(sid)}/tts?playerCount=${encodeURIComponent(String(pc))}`);
    if (!res.ok) return null;
    const tts = await res.json();
    state.scenarioTtsByKey[key] = tts;
    return tts;
  } catch {
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
    b.className = "btn voteBtn";
    b.textContent = `${p.seat}`;
    b.style.backgroundImage = `linear-gradient(135deg, ${p.color} 0%, rgba(255,255,255,.12) 65%, rgba(255,255,255,.05) 100%)`;
    b.addEventListener("click", () => {
      send({ type: "submit_vote", data: { targetSeat: p.seat } });
      closeModal(voteModal);
    });
    voteGridEl.appendChild(b);
  }
}

function connect() {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${scheme}://${window.location.host}/ws`;
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
    } catch {
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
  if (msg.type === "hello") {
    state.debugEnabled = !!msg.debugEnabled;
    initDebugApi();
    return;
  }
  if (msg.type === "room_snapshot") {
    state.room = msg.data;
    showRoom();
    render();
    setPhase(state.room.phase || "WAIT", state.room.phaseEndsAtMs);
    return;
  }
  if (msg.type === "host_changed") {
    state.room = state.room || {};
    state.room.hostClientId = msg.data?.hostClientId || null;
    render();
    return;
  }
  if (msg.type === "scenario_state") {
    state.scenarioState = msg.data;
    render();
    return;
  }
  if (msg.type === "phase_changed") {
    setPhase(msg.data?.phase || "WAIT", msg.data?.phaseEndsAtMs ?? null);
    render();
    return;
  }
  if (msg.type === "role_assignment") {
    state.myRoleId = msg.data?.roleId || "";
    state.nightPrivate = null;
    state.nightResult = null;
    state.roleReady = false;
    render();
    return;
  }
  if (msg.type === "night_step") {
    state.nightStep = msg.data || null;
    state.nightPrivate = null;
    state.nightResult = null;
    state.nightUi = null;
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
    console.log("vote_result_public", msg.data);
    return;
  }
  if (msg.type === "ending_text") {
    console.log("ending_text", msg.data);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
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
  return `/assets/voices/${encodeURIComponent(scenarioId)}/${encodeURIComponent(episodeId)}/p${playerCount}/${sectionKey}/voice.wav`;
}

function buildEpisodeStartPlaylist(scenario, episode, playerCount) {
  const scenarioId = scenario?.scenarioId;
  const episodeId = episode?.episodeId;
  const sel = selectVariantForPlayerCount(episode, playerCount);
  const variant = sel.variant;
  const variantPlayerCount = sel.variantPlayerCount;
  if (!scenarioId || !episodeId || !variant || !variantPlayerCount) return [];
  const narration = variant?.narration || {};

  const urls = [];
  const openingCount = Array.isArray(narration.openingClips)
    ? narration.openingClips.length
    : Math.max(0, Number.parseInt(String(narration.openingClipCount || 0), 10) || 0);
  for (let i = 0; i < openingCount; i++) {
    urls.push(buildVoiceUrl({ scenarioId, episodeId, playerCount: variantPlayerCount, sectionKey: `opening/${pad3(i + 1)}` }));
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
          buildVoiceUrl({ scenarioId, episodeId, playerCount: variantPlayerCount, sectionKey: `role/${roleId}/${part}/${pad3(i + 1)}` })
        );
      }
    }
  }

  const outroCount = Array.isArray(narration.nightOutroClips)
    ? narration.nightOutroClips.length
    : Math.max(0, Number.parseInt(String(narration.nightOutroClipCount || 0), 10) || 0);
  for (let i = 0; i < outroCount; i++) {
    urls.push(buildVoiceUrl({ scenarioId, episodeId, playerCount: variantPlayerCount, sectionKey: `outro/${pad3(i + 1)}` }));
  }

  return urls;
}

async function urlExists(urlPath) {
  try {
    const res = await fetch(urlPath, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function playEpisodeStartNarration(scenarioId) {
  let scenario;
  try {
    const res = await fetch(`/api/scenarios/${encodeURIComponent(scenarioId)}`);
    scenario = await res.json();
  } catch {
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
    if (!("speechSynthesis" in window)) return resolve();
    const cleaned = String(text || "").replace(/\[[^\]]+\]|\{[^}]+\}/g, "").trim();
    if (!cleaned) return resolve();

    const u = new SpeechSynthesisUtterance(cleaned);
    u.lang = "ko-KR";
    u.rate = 1.05;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    if (interrupt) speechSynthesis.cancel();
    speechSynthesis.speak(u);
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

  async function start(bgmCfg) {
    const tracks = bgmCfg?.tracks || [];
    if (!tracks.length) return;
    const t = tracks[Math.floor(Math.random() * tracks.length)];
    if (!t?.src) return;

    await ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();

    current = {
      volume: typeof t.volume === "number" ? t.volume : 0.22,
      fadeInMs: typeof t.fadeInMs === "number" ? t.fadeInMs : 800,
      fadeOutMs: typeof t.fadeOutMs === "number" ? t.fadeOutMs : 1200,
    };

    audio.src = t.src;
    audio.load();
    await new Promise((r) => audio.addEventListener("loadedmetadata", r, { once: true }));

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

  return { ensureCtx, start, stop, set };
}

function createNarrationEngine() {
  const audio = new Audio();
  audio.preload = "auto";

  async function playOne(url) {
    return new Promise((resolve) => {
      const done = () => {
        audio.onended = null;
        audio.onerror = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.src = url;
      audio.load();
      audio.play().catch(done);
    });
  }

  async function playList(urls) {
    for (const u of urls) {
      // eslint-disable-next-line no-await-in-loop
      await playOne(u);
    }
  }

  async function stop() {
    try {
      audio.pause();
    } catch {
      // ignore
    }
  }

  return { playList, stop };
}

async function ensureAudioUnlocked() {
  try {
    await state.bgm.ensureCtx();
  } catch {
    // ignore
  }
}

async function init() {
  installViewportFix();
  showJoin();
  setConn(false);
  setBgGradient("WAIT");
  
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
    const name = (nameInput.value || "").trim() || "Player";
    state.name = name;
    setSavedName(name);

    const joinSection = qs("#join");
    const transitionLayer = qs("#transitionLayer");

    // 1. Start Darken (0.75s)
    if (transitionLayer) transitionLayer.classList.add("active");
    joinSection.classList.add("exiting-mode");

    // 2. Wait for full blackout (0.75s)
    await new Promise((r) => setTimeout(r, 750));

    // 3. Switch Scene (Behind the black overlay)
    send({ type: "join", data: { clientId: state.clientId, name, avatar: state.avatar } });
    
    roomEl.classList.remove("hidden");
    qs(".topbar").classList.remove("hidden");
    joinSection.classList.add("hidden");

    // 4. Start Brighten (0.75s)
    if (transitionLayer) transitionLayer.classList.remove("active");

    // 5. Final Cleanup
    await new Promise((r) => setTimeout(r, 750));
    joinSection.classList.remove("exiting-mode");
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinBtn.click();
  });

  scenarioBtn.addEventListener("click", async () => {
    await ensureAudioUnlocked();
    closeEpisodePicker();
    openModal(scenarioModal);
  });
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
    send({ type: "start_game", data: {} });
  });

  voteBtn.addEventListener("click", () => {
    renderVoteGrid();
    openModal(voteModal);
  });
  voteBackdrop.addEventListener("click", () => closeModal(voteModal));
  voteClose.addEventListener("click", () => closeModal(voteModal));

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

  eyesClosedBtn.addEventListener("click", () => {
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
      requiresAction: stepKind === "role",
      sectionKey,
      scenarioId,
      episodeId,
      variantPlayerCount: pc,
      stepIndex: 1,
      stepCount: 1,
      stepEndsAtMs: Date.now() + 60_000,
    };

    if (rid === "werewolf") {
      state.nightPrivate = { payload: { canPeekCenter: true } };
    }

    renderNightOverlay();
  };

  const previewRoleCheck = ({ eyesClosed = false } = {}) => {
    ensureJoined();
    state.roleReady = !!eyesClosed;
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
    setPhase: (phase, { durationSec = 30 } = {}) =>
      send({ type: "debug", data: { action: "set_phase", data: { phase, durationSec } } }),
    dumpState: () => state.room,
    setBgm: ({ on = true, volume = 0.22, fadeInMs = 800, fadeOutMs = 1200 } = {}) =>
      state.bgm.set(on, { volume, fadeInMs, fadeOutMs }),
    playClipUrl: async (url) => state.narration.playList([url]),
    ui: {
      roleCheck: (opts) => previewRoleCheck(opts),
      nightAction: (roleId = "seer", opts = {}) => previewNightStep({ ...(opts || {}), kind: "role", roleId, active: true }),
      nightWait: () => previewNightStep({ kind: "role", roleId: "seer", active: false }),
      nightOpening: () => previewNightStep({ kind: "opening", active: false }),
      nightOutro: () => previewNightStep({ kind: "outro", active: false }),
      clear: () => clearOverlays(),
    },
  };
  window.gameDebug = api;
  console.log("[debug] gameDebug enabled", api);
}

init().catch((e) => console.error(e));
