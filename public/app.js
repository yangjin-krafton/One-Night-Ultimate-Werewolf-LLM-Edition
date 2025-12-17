/* global speechSynthesis */

const qs = (sel) => document.querySelector(sel);
const joinEl = qs("#join");
const roomEl = qs("#room");
const gridEl = qs("#grid");
const joinBtn = qs("#joinBtn");
const nameInput = qs("#nameInput");
const scenarioBtn = qs("#scenarioBtn");
const startBtn = qs("#startBtn");
const voteBtn = qs("#voteBtn");
const connDot = qs("#connDot");
const phaseLabel = qs("#phaseLabel");
const scenarioLabel = qs("#scenarioLabel");
const timerEl = qs("#timer");

const scenarioModal = qs("#scenarioModal");
const scenarioListEl = qs("#scenarioList");
const scenarioBackdrop = qs("#scenarioBackdrop");
const scenarioClose = qs("#scenarioClose");

const voteModal = qs("#voteModal");
const voteGridEl = qs("#voteGrid");
const voteBackdrop = qs("#voteBackdrop");
const voteClose = qs("#voteClose");

const nightOverlay = qs("#nightOverlay");
const nightTitle = qs("#nightTitle");
const nightRole = qs("#nightRole");
const nightHint = qs("#nightHint");

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

const state = {
  clientId: getClientId(),
  name: getSavedName(),
  ws: null,
  connected: false,
  debugEnabled: false,
  room: null,
  scenarios: [],
  scenarioById: {},
  scenarioState: null,
  tickTimer: null,
  lastNarrationKey: "",
  myRoleId: "",
  nightStep: null,
  lastNightStepId: 0,
  bgm: createBgmEngine(),
  narration: createNarrationEngine(),
};

nameInput.value = state.name;

function setBgGradient(phase) {
  const map = {
    WAIT: "var(--grad-wait)",
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
}

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

  scenarioLabel.textContent = room.selectedScenarioId ? `· ${room.selectedScenarioId}` : "";
  scenarioBtn.disabled = !isHost();
  startBtn.disabled = !isHost() || !(state.scenarioState?.canStart);

  const phase = room.phase || "WAIT";
  voteBtn.classList.toggle("hidden", phase !== "VOTE");

  const players = room.players || [];
  gridEl.innerHTML = "";
  for (const p of players) {
    const card = document.createElement("div");
    card.className = "card";
    if (p.clientId === state.clientId) card.classList.add("card--me");
    if (p.isHost) card.classList.add("card--host");
    if (p.connected) card.classList.add("card--connected");

    const top = document.createElement("div");
    top.className = "card__top";

    const seat = document.createElement("div");
    seat.className = "seat";
    seat.textContent = String(p.seat);

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = p.isHost ? "HOST" : p.connected ? "ONLINE" : "OFFLINE";

    top.appendChild(seat);
    top.appendChild(badge);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name + (p.clientId === state.clientId && state.myRoleId ? ` · ${state.myRoleId}` : "");

    const bar = document.createElement("div");
    bar.className = "card__bar";
    bar.style.opacity = state.room?.votes?.[p.clientId] ? "0.9" : "0";

    card.style.boxShadow = `0 14px 26px rgba(0,0,0,.35), 0 0 0 4px ${p.color}14`;
    card.appendChild(top);
    card.appendChild(name);
    card.appendChild(bar);
    gridEl.appendChild(card);
  }

  renderNightOverlay();
}

function renderNightOverlay() {
  const phase = state.room?.phase || "WAIT";
  const step = state.nightStep;
  if (phase !== "NIGHT" || !step) {
    nightOverlay.classList.add("hidden");
    return;
  }

  nightOverlay.classList.remove("hidden");
  const roleId = state.myRoleId || "";
  const kind = step.kind || "";
  const activeRole = step.roleId || "";

  const stepLabel = `${String(step.stepIndex || 0)}/${String(step.stepCount || 0)}`;
  nightTitle.textContent = `NIGHT · ${stepLabel}`;

  nightRole.textContent = roleId ? `내 역할: ${roleId}` : "내 역할: (미정)";

  if (kind === "role") {
    if (roleId && roleId === activeRole) {
      nightHint.textContent = `${activeRole} 차례입니다. 눈을 뜨고 행동하세요.`;
    } else {
      nightHint.textContent = `${activeRole} 차례입니다. 눈을 감고 기다리세요.`;
    }
  } else if (kind === "opening") {
    nightHint.textContent = "모두 눈을 감고 밤을 시작합니다.";
  } else if (kind === "outro") {
    nightHint.textContent = "밤이 끝났습니다. 모두 눈을 뜨세요.";
  } else {
    nightHint.textContent = "밤 진행 중...";
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
    await new Promise((r) => setTimeout(r, 500));
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
    item.addEventListener("click", () => {
      send({ type: "scenario_select", data: { scenarioId: s.scenarioId } });
      closeModal(scenarioModal);
    });
    scenarioListEl.appendChild(item);
  }
}

function renderVoteGrid() {
  voteGridEl.innerHTML = "";
  const players = state.room?.players || [];
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
    render();
    return;
  }
  if (msg.type === "night_step") {
    state.nightStep = msg.data || null;
    render();
    if (isHost()) playNightStepAsHost(state.nightStep).catch(() => {});
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
    const clips = (((variant || {}).narration || {}).openingClips || []).map((c) => c.text).filter(Boolean);
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
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(String(text).replace(/\[[^\]]+\]|\{[^}]+\}/g, ""));
    u.lang = "ko-KR";
    u.rate = 1.05;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
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
  showJoin();
  setConn(false);
  setBgGradient("WAIT");
  await fetchScenarios();
  renderScenarioList();
  connect();

  joinBtn.addEventListener("click", async () => {
    const name = (nameInput.value || "").trim() || "Player";
    state.name = name;
    setSavedName(name);

    const joinSection = qs("#join");
    const landingEl = qs(".landing");
    const transitionLayer = qs("#transitionLayer");

    // 1. Start Animation: Moon expands & Text fades
    joinSection.classList.add("exiting-mode");
    landingEl.classList.add("exiting");
    
    // Optional: Darken background slightly before moon fills
    if (transitionLayer) {
      setTimeout(() => transitionLayer.classList.add("active"), 800);
    }

    // 2. Wait for moon to fill screen (1.5s)
    await new Promise((r) => setTimeout(r, 1500));

    // 3. Connect & Switch Room (Behind the overlay)
    send({ type: "join", data: { clientId: state.clientId, name } });
    
    // Manually show room elements without hiding joinSection yet
    roomEl.classList.remove("hidden");
    qs(".topbar").classList.remove("hidden");

    // 4. Fade out the overlay (Moon/Landing) to reveal Room
    joinSection.classList.add("fade-out");
    if (transitionLayer) transitionLayer.classList.remove("active");

    // 5. Cleanup after fade
    await new Promise((r) => setTimeout(r, 800));
    joinSection.classList.add("hidden");
    joinSection.classList.remove("exiting-mode", "fade-out");
    landingEl.classList.remove("exiting");
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinBtn.click();
  });

  scenarioBtn.addEventListener("click", async () => {
    await ensureAudioUnlocked();
    openModal(scenarioModal);
  });
  scenarioBackdrop.addEventListener("click", () => closeModal(scenarioModal));
  scenarioClose.addEventListener("click", () => closeModal(scenarioModal));

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
}

function initDebugApi() {
  if (!state.debugEnabled) return;
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
  };
  window.gameDebug = api;
  console.log("[debug] gameDebug enabled", api);
}

init().catch((e) => console.error(e));
