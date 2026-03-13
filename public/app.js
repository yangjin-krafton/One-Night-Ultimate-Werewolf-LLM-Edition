/* ============================================================
   한밤의 늑대인간 LLM Edition — Static Narration Player
   서버 없이 동작하는 정적 나레이션 + 역할 레퍼런스 앱
   ============================================================ */

// ===== ROLE DATA =====
const ROLES = {
  werewolf:     { name: '늑대인간',     team: 'wolf',    emoji: '🐺', desc: '밤에 눈을 떠서 다른 늑대인간을 확인합니다. 혼자라면 센터 카드 1장을 볼 수 있습니다.' },
  seer:         { name: '점술사',       team: 'village', emoji: '🔮', desc: '밤에 다른 플레이어 1명의 카드를 보거나, 센터 카드 2장을 확인할 수 있습니다.' },
  robber:       { name: '강도',         team: 'village', emoji: '🗡️', desc: '밤에 다른 플레이어 1명과 카드를 교환하고, 새로 받은 카드를 확인합니다.' },
  troublemaker: { name: '말썽꾼',       team: 'village', emoji: '🃏', desc: '밤에 다른 두 플레이어의 카드를 서로 바꿉니다. 바꾼 카드는 확인하지 않습니다.' },
  drunk:        { name: '주정뱅이',     team: 'village', emoji: '🍺', desc: '밤에 센터 카드 1장과 자신의 카드를 교환합니다. 바꾼 카드는 확인하지 않습니다.' },
  insomniac:    { name: '불면증 환자',  team: 'village', emoji: '😵', desc: '밤의 마지막에 자신의 카드를 확인합니다. 누군가 바꿨다면 새 역할을 알 수 있습니다.' },
  minion:       { name: '하수인',       team: 'wolf',    emoji: '👹', desc: '밤에 늑대인간이 누구인지 확인합니다. 늑대인간은 하수인을 모릅니다.' },
  mason:        { name: '프리메이슨',   team: 'village', emoji: '🤝', desc: '밤에 다른 프리메이슨을 확인합니다. 서로의 존재가 마을 팀의 단서가 됩니다.' },
  villager:     { name: '마을 주민',    team: 'village', emoji: '🏠', desc: '특별한 능력이 없습니다. 토론과 추리로 늑대인간을 찾아내세요.' },
  witch:        { name: '마녀',         team: 'village', emoji: '🧙', desc: '밤에 센터 카드 1장을 확인하고, 원한다면 그 카드를 다른 플레이어 카드와 바꿀 수 있습니다.' },
};

// ===== SCENARIO DATA (embedded) =====
const SCENARIOS = [
  {
    id: 'basic', title: '초보자용 기본', subtitle: '안개마을 이야기',
    playerCounts: [3,4,5,6,7,8,9,10],
    episodes: [
      { id: 'ep1', title: 'EP1: 안개마을의 첫 밤',
        variants: { '10': { deck: ['werewolf','seer','robber','villager','villager','villager','werewolf','troublemaker','drunk','insomniac','minion','mason','mason'], wakeOrder: ['werewolf','minion','mason','seer','robber','troublemaker','drunk','insomniac'] } }
      },
      { id: 'ep2', title: 'EP2: 안개 속 진술',
        variants: { '10': { deck: ['werewolf','seer','robber','villager','villager','villager','werewolf','troublemaker','drunk','insomniac','minion','mason','mason'], wakeOrder: ['werewolf','minion','mason','seer','robber','troublemaker','drunk','insomniac'] } }
      }
    ]
  },
  {
    id: 'flexible_story', title: '유연한 시나리오', subtitle: '3~8인용',
    playerCounts: [3,4,5,6,7,8],
    episodes: [
      { id: 'ep1', title: 'EP1: 가면 무도회',
        variants: {
          '3': { deck: ['werewolf','werewolf','seer','robber','troublemaker','drunk'], wakeOrder: ['werewolf','seer','robber','troublemaker','drunk'] },
          '4': { deck: ['werewolf','werewolf','seer','robber','troublemaker','drunk','insomniac'], wakeOrder: ['werewolf','seer','robber','troublemaker','drunk','insomniac'] },
          '5': { deck: ['werewolf','werewolf','minion','seer','robber','troublemaker','drunk','insomniac'], wakeOrder: ['werewolf','minion','seer','robber','troublemaker','drunk','insomniac'] },
          '6': { deck: ['werewolf','werewolf','seer','robber','troublemaker','drunk','insomniac','mason','mason'], wakeOrder: ['werewolf','mason','seer','robber','troublemaker','drunk','insomniac'] },
          '7': { deck: ['werewolf','werewolf','minion','seer','robber','troublemaker','drunk','insomniac','mason','mason'], wakeOrder: ['werewolf','minion','mason','seer','robber','troublemaker','drunk','insomniac'] },
          '8': { deck: ['werewolf','werewolf','minion','seer','robber','troublemaker','drunk','insomniac','mason','mason','witch'], wakeOrder: ['werewolf','minion','mason','seer','robber','troublemaker','drunk','insomniac','witch'] },
        }
      },
      { id: 'ep2', title: 'EP2: 혼돈의 아침',
        variants: {
          '3': { deck: ['werewolf','werewolf','seer','robber','troublemaker','drunk'], wakeOrder: ['werewolf','seer','robber','troublemaker','drunk'] },
          '4': { deck: ['werewolf','werewolf','seer','robber','troublemaker','drunk','insomniac'], wakeOrder: ['werewolf','seer','robber','troublemaker','drunk','insomniac'] },
          '5': { deck: ['werewolf','werewolf','minion','seer','robber','troublemaker','drunk','insomniac'], wakeOrder: ['werewolf','minion','seer','robber','troublemaker','drunk','insomniac'] },
          '6': { deck: ['werewolf','werewolf','seer','robber','troublemaker','drunk','insomniac','mason','mason'], wakeOrder: ['werewolf','mason','seer','robber','troublemaker','drunk','insomniac'] },
          '7': { deck: ['werewolf','werewolf','minion','seer','robber','troublemaker','drunk','insomniac','mason','mason'], wakeOrder: ['werewolf','minion','mason','seer','robber','troublemaker','drunk','insomniac'] },
          '8': { deck: ['werewolf','werewolf','minion','seer','robber','troublemaker','drunk','insomniac','mason','mason','witch'], wakeOrder: ['werewolf','minion','mason','seer','robber','troublemaker','drunk','insomniac','witch'] },
        }
      }
    ]
  },
  {
    id: 'four_player_story', title: '4인용: 불면의 밤', subtitle: '4인 전용',
    playerCounts: [4],
    episodes: [
      { id: 'ep1', title: 'EP1: 잠들지 못하는 밤',
        variants: { '4': { deck: ['werewolf','werewolf','seer','robber','troublemaker','drunk','insomniac'], wakeOrder: ['werewolf','seer','robber','troublemaker','drunk','insomniac'] } }
      },
      { id: 'ep2', title: 'EP2: 깊어지는 의심',
        variants: { '4': { deck: ['werewolf','werewolf','seer','robber','troublemaker','drunk','insomniac'], wakeOrder: ['werewolf','seer','robber','troublemaker','drunk','insomniac'] } }
      }
    ]
  }
];

// ===== STATE =====
const state = {
  screen: 'home',          // home | setup | join | lobby
  // setup
  scenarioIdx: null,
  episodeIdx: null,
  playerCount: null,
  // lobby
  roomCode: null,
  // playing
  playing: false,
  playlistIndex: 0,
  playlist: [],
  manifest: null,
};

// ===== ROOM CODE =====
const SCENARIO_CODES = { basic: 'B', flexible_story: 'F', four_player_story: 'P' };
const SCENARIO_DECODE = { B: 'basic', F: 'flexible_story', P: 'four_player_story' };

function encodeRoomCode(scenarioId, episodeId, playerCount) {
  const s = SCENARIO_CODES[scenarioId];
  const e = episodeId.replace('ep', '');
  const p = String(playerCount).padStart(2, '0');
  return `${s}${e}${p}`;
}

function decodeRoomCode(code) {
  code = code.trim().toUpperCase();
  if (code.length < 3 || code.length > 4) return null;
  const s = SCENARIO_DECODE[code[0]];
  if (!s) return null;
  const e = `ep${code[1]}`;
  const p = parseInt(code.slice(2), 10);
  if (isNaN(p) || p < 3 || p > 10) return null;
  const scenario = SCENARIOS.find(sc => sc.id === s);
  if (!scenario) return null;
  if (!scenario.playerCounts.includes(p)) return null;
  const episode = scenario.episodes.find(ep => ep.id === e);
  if (!episode) return null;
  return { scenarioId: s, episodeId: e, playerCount: p };
}

// ===== VARIANT RESOLVER =====
function getVariant(scenario, episodeId, playerCount) {
  const episode = scenario.episodes.find(ep => ep.id === episodeId);
  if (!episode) return null;
  const v = episode.variants;
  if (v[String(playerCount)]) return v[String(playerCount)];
  // fallback: largest available
  const keys = Object.keys(v).map(Number).sort((a, b) => a - b);
  return v[String(keys[keys.length - 1])];
}

// ===== MANIFEST & AUDIO =====
const manifestCache = {};

async function loadManifest(scenarioId) {
  if (manifestCache[scenarioId]) return manifestCache[scenarioId];
  const resp = await fetch(`./assets/voices/${scenarioId}/_manifest.json`);
  const data = await resp.json();
  // Convert absolute URLs to relative (for subpath hosting like /games/one-night-werewolf/)
  data.clips.forEach(c => {
    if (c.url && c.url.startsWith('/')) {
      c.url = '.' + c.url;
    }
  });
  manifestCache[scenarioId] = data;
  return data;
}

function getManifestPlayerPrefix(manifest) {
  if (!manifest.clips.length) return null;
  const m = manifest.clips[0].clipId.match(/\/p(\d+)\//);
  return m ? m[1] : null;
}

function buildPlaylist(manifest, scenarioId, episodeId, playerCount, wakeOrder) {
  const pPrefix = getManifestPlayerPrefix(manifest);
  const base = `${scenarioId}/${episodeId}/p${pPrefix}`;

  const findClips = (pattern) =>
    manifest.clips.filter(c => c.clipId.startsWith(pattern)).sort((a, b) => a.clipId.localeCompare(b.clipId));

  const playlist = [];

  // Opening
  findClips(`${base}/opening/`).forEach(c => playlist.push({ ...c, phase: 'opening', roleId: null, label: '오프닝' }));

  // Roles in wake order
  for (const roleId of wakeOrder) {
    const roleInfo = ROLES[roleId];
    const label = roleInfo ? roleInfo.name : roleId;
    for (const step of ['before', 'during', 'after']) {
      findClips(`${base}/role/${roleId}/${step}/`).forEach(c =>
        playlist.push({ ...c, phase: step, roleId, label })
      );
    }
  }

  // Outro
  findClips(`${base}/outro/`).forEach(c => playlist.push({ ...c, phase: 'outro', roleId: null, label: '아웃트로' }));

  return playlist;
}

// Audio playback
const audioEl = document.getElementById('audioPlayer');
let stopRequested = false;

function stopPlayback() {
  stopRequested = true;
  audioEl.pause();
  audioEl.removeAttribute('src');
  state.playing = false;
  render();
}

async function startPlayback() {
  const { scenarioId, episodeId, playerCount } = resolveCurrentConfig();
  const scenario = SCENARIOS.find(s => s.id === scenarioId);
  const variant = getVariant(scenario, episodeId, playerCount);
  if (!variant) return;

  try {
    const manifest = await loadManifest(scenarioId);
    state.manifest = manifest;
    state.playlist = buildPlaylist(manifest, scenarioId, episodeId, playerCount, variant.wakeOrder);
  } catch (e) {
    showToast('오디오 매니페스트를 불러올 수 없습니다');
    return;
  }

  if (state.playlist.length === 0) {
    showToast('재생할 오디오 클립이 없습니다');
    return;
  }

  state.playing = true;
  state.playlistIndex = 0;
  stopRequested = false;
  render();

  for (let i = 0; i < state.playlist.length; i++) {
    if (stopRequested) break;
    state.playlistIndex = i;
    renderPlayingOverlay();

    const clip = state.playlist[i];
    await playClip(clip.url);
    if (stopRequested) break;

    // Small gap between clips
    await sleep(600);
  }

  if (!stopRequested) {
    showToast('밤이 끝났습니다. 토론을 시작하세요!');
  }
  state.playing = false;
  render();
}

function playClip(url) {
  return new Promise((resolve) => {
    audioEl.src = url;
    audioEl.onended = resolve;
    audioEl.onerror = () => {
      console.warn('Audio load failed:', url);
      resolve(); // skip failed clip
    };
    audioEl.play().catch(() => resolve());
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ===== HELPERS =====
function resolveCurrentConfig() {
  if (state.roomCode) {
    const decoded = decodeRoomCode(state.roomCode);
    return { scenarioId: decoded.scenarioId, episodeId: decoded.episodeId, playerCount: decoded.playerCount };
  }
  const sc = SCENARIOS[state.scenarioIdx];
  const ep = sc.episodes[state.episodeIdx];
  return { scenarioId: sc.id, episodeId: ep.id, playerCount: state.playerCount };
}

function countRoles(deck) {
  const counts = {};
  deck.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
  return counts;
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ===== RENDERING =====
function render() {
  const app = document.getElementById('app');
  if (state.playing) {
    app.innerHTML = renderLobbyHTML();
    app.insertAdjacentHTML('beforeend', renderPlayingOverlayHTML());
    return;
  }
  switch (state.screen) {
    case 'home':  app.innerHTML = renderHomeHTML(); break;
    case 'setup': app.innerHTML = renderSetupHTML(); break;
    case 'join':  app.innerHTML = renderJoinHTML(); break;
    case 'lobby': app.innerHTML = renderLobbyHTML(); break;
  }
}

// -- Home
function renderHomeHTML() {
  return `
    <div class="home">
      <div class="home__moon"></div>
      <h1 class="home__title">한밤의<br>늑대인간</h1>
      <p class="home__subtitle">LLM Edition — 나레이션 플레이어</p>
      <div class="home__actions">
        <button class="btn btn--primary btn--full" onclick="goSetup()">게임 만들기</button>
        <button class="btn btn--ghost btn--full" onclick="goJoin()">게임 참가</button>
      </div>
    </div>`;
}

// -- Setup
function renderSetupHTML() {
  const sc = state.scenarioIdx !== null ? SCENARIOS[state.scenarioIdx] : null;
  const ep = sc && state.episodeIdx !== null ? sc.episodes[state.episodeIdx] : null;
  const ready = sc && ep && state.playerCount;

  let step = 1;
  let stepLabel = '시나리오를 선택하세요';
  if (sc && state.episodeIdx === null) { step = 2; stepLabel = '에피소드를 선택하세요'; }
  if (sc && ep && !state.playerCount) { step = 3; stepLabel = '인원수를 선택하세요'; }
  if (ready) { step = 4; stepLabel = '게임 코드가 생성되었습니다'; }

  let code = '';
  if (ready) code = encodeRoomCode(sc.id, ep.id, state.playerCount);

  return `
    <div class="setup">
      <div class="setup__header">
        <button class="back-btn" onclick="goHome()">← 돌아가기</button>
        <h1 class="setup__title">게임 만들기</h1>
        <div class="setup__step-label">STEP ${step}: ${stepLabel}</div>
      </div>

      <div class="setup__section">
        <div class="setup__section-title">시나리오</div>
        <div class="card-list">
          ${SCENARIOS.map((s, i) => `
            <div class="card-option ${state.scenarioIdx === i ? 'selected' : ''}" onclick="selectScenario(${i})">
              <div class="card-option__title">${s.title}</div>
              <div class="card-option__desc">${s.subtitle} · ${s.playerCounts[0]}~${s.playerCounts[s.playerCounts.length-1]}인</div>
            </div>
          `).join('')}
        </div>
      </div>

      ${sc ? `
      <div class="setup__section">
        <div class="setup__section-title">에피소드</div>
        <div class="card-list">
          ${sc.episodes.map((e, i) => `
            <div class="card-option ${state.episodeIdx === i ? 'selected' : ''}" onclick="selectEpisode(${i})">
              <div class="card-option__title">${e.title}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      ${sc && ep !== null ? `
      <div class="setup__section">
        <div class="setup__section-title">인원수</div>
        <div class="pc-grid">
          ${sc.playerCounts.map(n => `
            <button class="pc-btn ${state.playerCount === n ? 'selected' : ''}" onclick="selectPlayerCount(${n})">${n}명</button>
          `).join('')}
        </div>
      </div>
      ` : ''}

      ${ready ? `
      <div class="setup__footer">
        <div class="room-code-display">
          <div class="room-code-display__label">방 코드</div>
          <div class="room-code-display__code">${code}</div>
          <div class="room-code-display__hint">참가자에게 이 코드를 알려주세요</div>
        </div>
        <button class="btn btn--primary btn--full" onclick="enterLobby('${code}')">로비 입장</button>
      </div>
      ` : ''}
    </div>`;
}

// -- Join
function renderJoinHTML() {
  return `
    <div class="join">
      <button class="back-btn" onclick="goHome()" style="position:absolute;top:20px;left:20px;">← 돌아가기</button>
      <h1 class="join__title">게임 참가</h1>
      <div class="join__input-group">
        <input class="join__input" id="codeInput" maxlength="4" placeholder="코드" autocomplete="off" autofocus>
        <div class="join__error" id="joinError"></div>
      </div>
      <button class="btn btn--primary btn--full" style="max-width:280px;" onclick="submitJoin()">입장</button>
    </div>`;
}

// -- Lobby
function renderLobbyHTML() {
  const config = resolveCurrentConfig();
  const scenario = SCENARIOS.find(s => s.id === config.scenarioId);
  const episode = scenario.episodes.find(e => e.id === config.episodeId);
  const variant = getVariant(scenario, config.episodeId, config.playerCount);
  const code = state.roomCode || encodeRoomCode(config.scenarioId, config.episodeId, config.playerCount);
  const roleCounts = countRoles(variant.deck);
  const centerCount = variant.deck.length - config.playerCount;

  // Sort: wolf team first, then village
  const uniqueRoles = Object.keys(roleCounts);
  uniqueRoles.sort((a, b) => {
    const ta = ROLES[a]?.team === 'wolf' ? 0 : 1;
    const tb = ROLES[b]?.team === 'wolf' ? 0 : 1;
    return ta - tb;
  });

  return `
    <div class="lobby">
      <div class="lobby__header">
        <div class="lobby__info">
          <div class="lobby__scenario-title">${scenario.title} · ${episode.title}</div>
          <div class="lobby__meta">${config.playerCount}명 플레이 · 센터 카드 ${centerCount}장</div>
        </div>
        <div class="lobby__code" onclick="copyCode('${code}')" title="탭하여 복사">${code}</div>
      </div>

      <div class="play-bar">
        <button class="play-btn" onclick="startPlayback()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          밤 행동 음성 재생
        </button>
      </div>

      <div class="center-info">카드 ${variant.deck.length}장 (플레이어 ${config.playerCount} + 센터 ${centerCount})</div>

      <div class="role-grid">
        ${uniqueRoles.map(roleId => {
          const role = ROLES[roleId] || { name: roleId, team: 'village', emoji: '❓', desc: '' };
          const count = roleCounts[roleId];
          const teamClass = role.team === 'wolf' ? 'role-card--wolf' : 'role-card--village';
          const teamLabel = role.team === 'wolf' ? '늑대 팀' : '마을 팀';
          return `
            <div class="role-card ${teamClass}">
              <div class="role-card__top">
                <span class="role-card__emoji">${role.emoji}</span>
                <span class="role-card__name">${role.name}</span>
                ${count > 1 ? `<span class="role-card__count">×${count}</span>` : ''}
              </div>
              <div class="role-card__team">${teamLabel}</div>
              <div class="role-card__desc">${role.desc}</div>
            </div>`;
        }).join('')}
      </div>

      <div class="lobby__footer">
        <button class="btn btn--ghost" style="flex:1" onclick="goHome()">나가기</button>
        <button class="btn btn--primary" style="flex:2" onclick="startPlayback()">▶ 음성 재생</button>
      </div>
    </div>`;
}

// -- Playing overlay
function renderPlayingOverlayHTML() {
  const clip = state.playlist[state.playlistIndex] || {};
  const total = state.playlist.length;
  const current = state.playlistIndex + 1;
  const pct = Math.round((current / total) * 100);

  return `
    <div class="playing-overlay">
      <div class="playing__moon"></div>
      <div class="playing__role">${clip.label || ''}</div>
      <div class="playing__text">${clip.roleId ? (ROLES[clip.roleId]?.name || clip.roleId) : (clip.phase === 'opening' ? '오프닝' : '아웃트로')}</div>
      <div class="playing__sub">${clip.phase === 'during' ? '눈을 뜨세요' : clip.phase === 'after' ? '눈을 감으세요' : ''}</div>
      <div class="playing__progress">
        <div class="progress-bar"><div class="progress-bar__fill" style="width:${pct}%"></div></div>
      </div>
      <div class="playing__count">${current} / ${total}</div>
      <button class="playing__stop" onclick="stopPlayback()">■ 정지</button>
    </div>`;
}

function renderPlayingOverlay() {
  const existing = document.querySelector('.playing-overlay');
  if (existing) {
    const clip = state.playlist[state.playlistIndex] || {};
    const total = state.playlist.length;
    const current = state.playlistIndex + 1;
    const pct = Math.round((current / total) * 100);

    const roleEl = existing.querySelector('.playing__role');
    const textEl = existing.querySelector('.playing__text');
    const subEl = existing.querySelector('.playing__sub');
    const fillEl = existing.querySelector('.progress-bar__fill');
    const countEl = existing.querySelector('.playing__count');

    if (roleEl) roleEl.textContent = clip.label || '';
    if (textEl) textEl.textContent = clip.roleId ? (ROLES[clip.roleId]?.name || clip.roleId) : (clip.phase === 'opening' ? '오프닝' : '아웃트로');
    if (subEl) subEl.textContent = clip.phase === 'during' ? '눈을 뜨세요' : clip.phase === 'after' ? '눈을 감으세요' : '';
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (countEl) countEl.textContent = `${current} / ${total}`;
  }
}

// ===== NAVIGATION =====
function goHome() {
  state.screen = 'home';
  state.scenarioIdx = null;
  state.episodeIdx = null;
  state.playerCount = null;
  state.roomCode = null;
  render();
}

function goSetup() {
  state.screen = 'setup';
  state.scenarioIdx = null;
  state.episodeIdx = null;
  state.playerCount = null;
  render();
}

function goJoin() {
  state.screen = 'join';
  render();
  setTimeout(() => {
    const input = document.getElementById('codeInput');
    if (input) input.focus();
  }, 100);
}

function selectScenario(idx) {
  state.scenarioIdx = idx;
  state.episodeIdx = null;
  state.playerCount = null;
  render();
}

function selectEpisode(idx) {
  state.episodeIdx = idx;
  state.playerCount = null;
  // Auto-select if only one player count
  const sc = SCENARIOS[state.scenarioIdx];
  if (sc.playerCounts.length === 1) {
    state.playerCount = sc.playerCounts[0];
  }
  render();
}

function selectPlayerCount(n) {
  state.playerCount = n;
  render();
}

function enterLobby(code) {
  state.roomCode = code;
  state.screen = 'lobby';
  render();
}

function submitJoin() {
  const input = document.getElementById('codeInput');
  const errorEl = document.getElementById('joinError');
  if (!input) return;
  const code = input.value.trim().toUpperCase();
  const decoded = decodeRoomCode(code);
  if (!decoded) {
    if (errorEl) errorEl.textContent = '유효하지 않은 코드입니다';
    return;
  }
  enterLobby(code);
}

function copyCode(code) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => showToast('코드 복사됨!'));
  } else {
    showToast(code);
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  render();

  // Enter key in join input
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state.screen === 'join') {
      submitJoin();
    }
  });
});
