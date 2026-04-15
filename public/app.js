/* ============================================================
   한밤의 늑대인간 LLM Edition — Static Narration Player
   서버 없이 동작하는 정적 나레이션 + 역할 레퍼런스 앱
   ============================================================ */

// ===== IMAGE CONFIG =====
const IMG_STYLE = 'taisho_roman';

function imgPath(category, itemId) {
  return `assets/images_web/${IMG_STYLE}/${category}/${itemId}.webp`;
}
function roleIconSrc(roleId) { return imgPath('roles', roleId); }
function scenarioBgSrc(scenarioId) { return imgPath('scenarios', scenarioId); }
function episodeBgSrc(scenarioId, epId) { return imgPath('episodes', `${scenarioId}_${epId}`); }
function uiImgSrc(uiId) { return imgPath('ui', uiId); }

// 역할 아이콘 <img> 태그. onerror시 이모지로 폴백.
// 이미지 로드 실패 시 이모지 폴백 (글로벌 핸들러)
document.addEventListener('error', function(e) {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (!img.classList.contains('role-icon') && !img.classList.contains('role-tile__icon')) return;
  const roleId = img.dataset.role;
  const emoji = roleId && ROLES[roleId] ? ROLES[roleId].emoji : '';
  if (emoji) {
    const span = document.createElement('span');
    span.className = 'role-card__emoji';
    span.textContent = emoji;
    img.replaceWith(span);
  } else {
    img.style.display = 'none';
  }
}, true);

function roleIcon(roleId) {
  return `<img class="role-icon" data-role="${roleId}" src="${roleIconSrc(roleId)}" alt="" loading="lazy">`;
}
function roleIconLg(roleId, cls) {
  return `<img class="${cls || 'role-icon role-icon--lg'}" data-role="${roleId}" src="${roleIconSrc(roleId)}" alt="" loading="lazy">`;
}

// ===== PARALLAX SCROLL (Apple-style) =====
// #app 스크롤에 따라 .wiz__bg가 약간 천천히 따라 이동
(function initParallax() {
  let raf = 0;
  const SPEED = 0.3; // 배경이 스크롤의 30% 속도로 따라감
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const app = document.getElementById('app');
      const bg = document.querySelector('.wiz__bg');
      if (!app || !bg) return;
      const y = app.scrollTop * SPEED;
      bg.style.transform = `translate3d(0, ${-y}px, 0)`;
    });
  }
  // #app이 스크롤 컨테이너
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
})();

// ===== ROLE DATA =====
// Teams: village, wolf, tanner
const TEAM_META = {
  village: { label: '마을 팀',     css: 'role-card--village' },
  wolf:    { label: '늑대 팀',     css: 'role-card--wolf' },
  tanner:  { label: '독립 (무두장이)', css: 'role-card--tanner' },
};

const ROLES = {
  // ── 기본판 ──
  doppelganger:            { name: '도플갱어',       team: 'village', emoji: '🪞', desc: '다른 플레이어 1명의 카드를 보고 그 역할을 복제합니다. 복제한 역할의 팀에 속하며, 역할에 따라 즉시 행동하거나 해당 순서에 다시 행동합니다.', expansion: 'base' },
  werewolf:                { name: '늑대인간',       team: 'wolf',    emoji: '🐺', desc: '밤에 눈을 떠서 다른 늑대인간을 확인합니다. 혼자라면 센터 카드 1장을 볼 수 있습니다. 하수인이나 종자 행동 시에는 계속 눈을 감은 채 엄지를 올려 자신을 알립니다.', expansion: 'base' },
  minion:                  { name: '하수인',         team: 'wolf',    emoji: '👹', desc: '밤에 눈을 떠서 엄지를 올린 늑대인간을 확인합니다. 늑대인간은 하수인을 모릅니다.', expansion: 'base' },
  mason:                   { name: '프리메이슨',     team: 'village', emoji: '🤝', desc: '밤에 다른 프리메이슨을 확인합니다. 서로의 존재가 마을 팀의 단서가 됩니다.', expansion: 'base' },
  seer:                    { name: '예언자',         team: 'village', emoji: '🔮', desc: '밤에 다른 플레이어 1명의 카드를 보거나, 센터 카드 2장을 확인할 수 있습니다.', expansion: 'base' },
  robber:                  { name: '강도',           team: 'village', emoji: '🗡️', desc: '밤에 다른 플레이어 1명과 카드를 교환하고, 새로 받은 카드를 확인합니다.', expansion: 'base' },
  troublemaker:            { name: '말썽쟁이',       team: 'village', emoji: '🃏', desc: '밤에 다른 두 플레이어의 카드를 서로 바꿉니다. 바꾼 카드는 확인하지 않습니다.', expansion: 'base' },
  drunk:                   { name: '주정뱅이',       team: 'village', emoji: '🍺', desc: '밤에 센터 카드 1장과 자신의 카드를 교환합니다. 바꾼 카드는 확인하지 않습니다.', expansion: 'base' },
  insomniac:               { name: '불면증환자',     team: 'village', emoji: '😵', desc: '밤의 마지막에 자신의 카드를 확인합니다. 누군가 바꿨다면 새 역할을 알 수 있습니다.', expansion: 'base' },
  hunter:                  { name: '사냥꾼',         team: 'village', emoji: '🏹', desc: '밤 행동이 없습니다. 자신이 죽으면, 자신이 투표한 사람도 함께 죽습니다.', expansion: 'base' },
  tanner:                  { name: '무두장이',       team: 'tanner',  emoji: '💀', desc: '자신이 죽는 것이 목표인 독립 역할입니다. 투표로 죽으면 혼자 승리합니다.', expansion: 'base' },
  villager:                { name: '마을 주민',      team: 'village', emoji: '🏠', desc: '특별한 능력이 없습니다. 토론과 추리로 늑대인간을 찾아내세요.', expansion: 'base' },

  // ── 데이브레이크 확장 ──
  alpha_wolf:              { name: '태초의 늑대인간', team: 'wolf',   emoji: '🐺‍', desc: '늑대인간처럼 동료를 확인합니다. 추가로 전용 뒷면 늑대인간 카드 1장을 비늑대 플레이어 카드와 교환해 새 늑대인간을 만듭니다. 이 카드는 태초의 늑대인간 밤 행동에서만 사용합니다.', expansion: 'daybreak' },
  mystic_wolf:             { name: '신비한 늑대인간', team: 'wolf',   emoji: '🔮🐺', desc: '늑대인간처럼 동료를 확인한 뒤, 다른 플레이어 1명의 카드를 몰래 볼 수 있습니다.', expansion: 'daybreak' },
  dream_wolf:              { name: '잠자는 늑대인간', team: 'wolf',   emoji: '💤🐺', desc: '늑대 팀이지만 밤에 눈을 뜨지 않습니다. 다른 늑대는 잠자는 늑대인간의 존재를 확인할 수 있습니다.', expansion: 'daybreak' },
  apprentice_seer:         { name: '견습 예언자',    team: 'village', emoji: '🔮✨', desc: '밤에 센터 카드 1장만 확인할 수 있습니다. 예언자의 약화 버전입니다.', expansion: 'daybreak' },
  paranormal_investigator: { name: '심령 수사관',    team: 'village', emoji: '🕵️', desc: '플레이어 카드를 최대 2장까지 차례로 확인합니다. 늑대인간이나 무두장이를 보면 즉시 그 팀에 합류하고 확인을 멈춥니다.', expansion: 'daybreak' },
  witch:                   { name: '마녀',           team: 'village', emoji: '🧙', desc: '밤에 센터 카드 1장을 확인합니다. 원한다면 그 카드를 다른 플레이어 카드와 바꿔야 합니다.', expansion: 'daybreak' },
  village_idiot:           { name: '동네 얼간이',    team: 'village', emoji: '🤪', desc: '자신을 제외한 모든 플레이어의 카드를 왼쪽 또는 오른쪽으로 한 칸씩 이동시킬 수 있습니다.', expansion: 'daybreak' },
  revealer:                { name: '계시자',         team: 'village', emoji: '👁️', desc: '플레이어 1명의 카드를 뒤집어 공개합니다. 늑대인간이나 무두장이면 다시 덮습니다.', expansion: 'daybreak' },

  // ── 데이브레이크 보너스팩 1 ──
  aura_seer:               { name: '영기 예언자',    team: 'village', emoji: '✨🔮', desc: '밤 동안 카드를 이동하거나 확인한 플레이어가 누구인지 감지합니다.', expansion: 'daybreak_bonus1' },
  prince:                  { name: '왕자',           team: 'village', emoji: '👑', desc: '투표로 죽지 않습니다. 최다 득표를 받아도 생존하며, 다음 득표자가 대신 죽습니다.', expansion: 'daybreak_bonus1' },
  cursed:                  { name: '저주받은 자',    team: 'village', emoji: '🌑', desc: '예언자나 견습 예언자가 이 카드를 보면 늑대인간으로 변합니다.', expansion: 'daybreak_bonus1' },

  // ── 보너스팩 2 ──
  apprentice_tanner:       { name: '견습 무두장이',  team: 'tanner',  emoji: '💀✨', desc: '무두장이가 죽으면 함께 승리합니다. 무두장이가 없으면 마을 팀으로 행동합니다.', expansion: 'bonus2' },
  thing:                   { name: '어떤것',         team: 'village', emoji: '👆', desc: '밤에 터치를 받는 쪽은 계속 눈을 감고 있고, 어떤것은 눈을 떠서 바로 옆 사람 한 명의 어깨를 톡 쳐서 자신의 존재를 알립니다.', expansion: 'bonus2' },
  squire:                  { name: '종자',           team: 'wolf',    emoji: '🛡️🐺', desc: '늑대인간이 누구인지 확인할 수 있는 늑대 팀 보조 역할입니다. 하수인과 비슷하지만 별도로 행동합니다.', expansion: 'bonus2' },
  beholder:                { name: '주시자',         team: 'village', emoji: '👀', desc: '예언자가 누구인지 확인합니다. 예언자의 정체를 아는 마을 보조 역할입니다.', expansion: 'bonus2' },

};

// ===== ROLE DESC HIGHLIGHTS =====
const DESC_HIGHLIGHTS = {
  // 기본판
  doppelganger: [
    { t: '역할을 복제', c: '#a78bfa' },
    { t: '복제한 역할의 팀에 속하며', c: '#fb7185' },
  ],
  werewolf: [
    { t: '다른 늑대인간을 확인', c: '#fb7185' },
    { t: '혼자라면', c: '#a78bfa' },
    { t: '센터 카드 1장을 볼 수 있습니다', c: '#60a5fa' },
    { t: '엄지를 올려 자신을 알립니다', c: '#fbbf24' },
  ],
  minion: [
    { t: '엄지를 올린 늑대인간을 확인', c: '#fbbf24' },
    { t: '하수인을 모릅니다', c: '#94a3b8' },
  ],
  mason: [
    { t: '다른 프리메이슨을 확인', c: '#2dd4bf' },
    { t: '마을 팀의 단서', c: '#34d399' },
  ],
  seer: [
    { t: '플레이어 1명의 카드를 보거나', c: '#22d3ee' },
    { t: '센터 카드 2장을 확인', c: '#60a5fa' },
  ],
  robber: [
    { t: '카드를 교환', c: '#fbbf24' },
    { t: '새로 받은 카드를 확인', c: '#22d3ee' },
  ],
  troublemaker: [
    { t: '카드를 서로 바꿉니다', c: '#fbbf24' },
    { t: '확인하지 않습니다', c: '#94a3b8' },
  ],
  drunk: [
    { t: '센터 카드 1장과 자신의 카드를 교환', c: '#fbbf24' },
    { t: '확인하지 않습니다', c: '#94a3b8' },
  ],
  insomniac: [
    { t: '밤의 마지막에', c: '#a78bfa' },
    { t: '자신의 카드를 확인', c: '#22d3ee' },
    { t: '새 역할을 알 수 있습니다', c: '#34d399' },
  ],
  hunter: [
    { t: '밤 행동이 없습니다', c: '#94a3b8' },
    { t: '자신이 투표한 사람도 함께 죽습니다', c: '#fb7185' },
  ],
  tanner: [
    { t: '자신이 죽는 것이 목표', c: '#c88030' },
    { t: '혼자 승리', c: '#fbbf24' },
  ],
  villager: [
    { t: '특별한 능력이 없습니다', c: '#94a3b8' },
    { t: '토론과 추리', c: '#60a5fa' },
    { t: '늑대인간을 찾아내세요', c: '#fb7185' },
  ],
  // 데이브레이크
  alpha_wolf: [
    { t: '동료를 확인', c: '#fb7185' },
    { t: '전용 뒷면 늑대인간 카드 1장', c: '#60a5fa' },
    { t: '새 늑대인간을 만들 수 있습니다', c: '#fbbf24' },
  ],
  mystic_wolf: [
    { t: '동료를 확인', c: '#fb7185' },
    { t: '1명의 카드를 몰래 볼 수 있습니다', c: '#22d3ee' },
  ],
  dream_wolf: [
    { t: '눈을 뜨지 않습니다', c: '#a78bfa' },
    { t: '존재를 확인할 수 있습니다', c: '#fb7185' },
  ],
  apprentice_seer: [
    { t: '센터 카드 1장만 확인', c: '#22d3ee' },
  ],
  paranormal_investigator: [
    { t: '최대 2장까지 차례로 확인', c: '#22d3ee' },
    { t: '늑대인간이나 무두장이를 보면', c: '#fb7185' },
    { t: '그 팀에 합류', c: '#fbbf24' },
  ],
  witch: [
    { t: '센터 카드 1장을 확인', c: '#22d3ee' },
    { t: '다른 플레이어 카드와 바꿔야 합니다', c: '#fbbf24' },
  ],
  village_idiot: [
    { t: '왼쪽 또는 오른쪽으로 한 칸씩 이동', c: '#fbbf24' },
  ],
  revealer: [
    { t: '카드를 뒤집어 공개', c: '#fb7185' },
    { t: '늑대인간이나 무두장이면 다시 덮습니다', c: '#94a3b8' },
  ],
  // 보너스팩 1
  aura_seer: [
    { t: '이동하거나 확인한 플레이어', c: '#22d3ee' },
    { t: '감지합니다', c: '#a78bfa' },
  ],
  prince: [
    { t: '투표로 죽지 않습니다', c: '#34d399' },
    { t: '다음 득표자가 대신 죽습니다', c: '#fb7185' },
  ],
  cursed: [
    { t: '늑대인간으로 변합니다', c: '#fb7185' },
  ],
  // 보너스팩 2
  apprentice_tanner: [
    { t: '무두장이가 죽으면 함께 승리', c: '#c88030' },
    { t: '마을 팀으로 행동', c: '#60a5fa' },
  ],
  thing: [
    { t: '어깨를 톡 쳐서', c: '#fbbf24' },
    { t: '존재를 알립니다', c: '#22d3ee' },
  ],
  squire: [
    { t: '늑대인간이 누구인지 확인', c: '#fb7185' },
    { t: '늑대 팀 보조', c: '#fbbf24' },
  ],
  beholder: [
    { t: '예언자가 누구인지 확인', c: '#22d3ee' },
  ],
};

function highlightDesc(roleId, desc) {
  const rules = DESC_HIGHLIGHTS[roleId];
  if (!rules || !rules.length) return desc;
  // Sort by length desc to avoid partial matches
  const sorted = [...rules].sort((a, b) => b.t.length - a.t.length);
  let result = desc;
  for (const { t, c } of sorted) {
    result = result.replace(t, `<span style="color:${c}">${t}</span>`);
  }
  return result;
}

// ===== EXPANSION DEFINITIONS =====
const EXPANSIONS = [
  { id: 'base',            name: '기본판',           desc: '필수 포함', required: true },
  { id: 'daybreak',        name: '데이브레이크',     desc: '늑대 변종, 마녀, 계시자 등' },
  { id: 'daybreak_bonus1', name: '보너스팩 1',       desc: '영기 예언자, 왕자, 저주받은 자' },
  { id: 'bonus2',          name: '보너스팩 2',       desc: '종자, 주시자, 견습 무두장이 등' },
];

function loadExpansions() {
  try {
    const saved = JSON.parse(localStorage.getItem('onw_expansions'));
    if (saved && typeof saved === 'object') return saved;
  } catch {}
  // Default: base + daybreak
  return { base: true, daybreak: true, daybreak_bonus1: false, bonus2: false };
}

function saveExpansions(exps) {
  try { localStorage.setItem('onw_expansions', JSON.stringify(exps)); } catch {}
}

function toggleExpansion(expId, skipRender) {
  const exp = EXPANSIONS.find(e => e.id === expId);
  if (exp && exp.required) return;
  state.expansions[expId] = !state.expansions[expId];
  saveExpansions(state.expansions);
  if (!skipRender) render();
}

function getActiveRoleIds() {
  return ROLE_IDS.filter(r => state.expansions[ROLES[r].expansion]);
}

// ===== ROLE ENCODING & RANDOM DECK =====
const ROLE_IDS = [
  // 기본판 (12)
  'doppelganger','werewolf','minion','mason','seer','robber','troublemaker',
  'drunk','insomniac','hunter','tanner','villager',
  // 데이브레이크 (8)
  'alpha_wolf','mystic_wolf','dream_wolf',
  'apprentice_seer','paranormal_investigator','witch','village_idiot',
  'revealer',
  // 보너스팩1 (3)
  'aura_seer','prince','cursed',
  // 보너스팩2 (4)
  'apprentice_tanner','thing','squire','beholder',
];

// 밤 단계
const NIGHT_ORDER = [
  'doppelganger',
  'werewolf','alpha_wolf','mystic_wolf','dream_wolf',
  'minion','mason',
  'seer','apprentice_seer','paranormal_investigator',
  'robber','witch','troublemaker',
  'village_idiot','drunk',
  'aura_seer','thing','beholder','squire',
  // 마지막
  'insomniac','revealer',
];

function encodeDeck(deck) {
  // Each role can appear 0-3 times → 2 bits each. 27 roles × 2 = 54 bits → base62(~10 chars)
  const counts = ROLE_IDS.map(r => deck.filter(d => d === r).length);
  let val = 0n;
  for (let i = 0; i < counts.length; i++) val = val * 4n + BigInt(counts[i]);
  let code = '';
  let v = val;
  if (v === 0n) return '0'.padStart(11, '0');
  while (v > 0n) { code = _B62[Number(v % 62n)] + code; v = v / 62n; }
  return code.padStart(11, '0');
}

function decodeDeck(code) {
  let val = 0n;
  try { for (const ch of code) { const idx = _B62.indexOf(ch); if (idx < 0) return []; val = val * 62n + BigInt(idx); } } catch { return []; }
  const counts = [];
  for (let i = ROLE_IDS.length - 1; i >= 0; i--) {
    counts[i] = Number(val % 4n);
    val = val / 4n;
  }
  const deck = [];
  ROLE_IDS.forEach((r, i) => { for (let j = 0; j < counts[i]; j++) deck.push(r); });
  return deck;
}

function deriveWakeOrder(deck) {
  const present = new Set(deck);
  return NIGHT_ORDER.filter(r => present.has(r));
}

function generateRandomDeck(playerCount, scenarioId) {
  const need = playerCount + 3;
  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const exps = state.expansions;
  const allowed = id => exps[ROLES[id]?.expansion];

  // Wolf team budget by player count
  const maxWolf = playerCount <= 4 ? 2 : playerCount <= 6 ? 3 : playerCount <= 8 ? 3 : 4;

  // Build pools dynamically based on active expansions
  // 3~4인: minion/squire 제외 (소인원에서 늑대 보조가 너무 강함)
  const wolfUnits = [
    ['werewolf'],
    ['werewolf'],
    ['alpha_wolf'],
    ['mystic_wolf'],
    ['dream_wolf'],
    ...(playerCount >= 5 ? [['minion']] : []),
    ...(playerCount >= 5 ? [['squire']] : []),
  ].filter(u => u.every(allowed));

  // 핵심 마을 역할 (반드시 우선 투입)
  const coreVillageUnits = [
    ['seer'],
    ['robber'],
    ['troublemaker'],
  ].filter(u => u.every(allowed));

  // 일반 마을 역할
  const villageUnits = [
    ['drunk'],
    ['insomniac'],
    ...(playerCount >= 5 ? [['mason', 'mason']] : []), // 5인 이상만 mason 쌍 허용
    ['hunter'],
    ['doppelganger'],
    // 데이브레이크
    ['witch'],
    ['apprentice_seer'],
    ['paranormal_investigator'],
    ['village_idiot'],
    ['revealer'],
    // 보너스팩1
    ['aura_seer'],
    ['prince'],
    ['cursed'],
    // 보너스팩2
    ['thing'],
    ['beholder'],
  ].filter(u => u.every(allowed));

  // Tanner / independent pool — apprentice_tanner는 tanner와 함께만 투입
  const specialUnits = [
    ['tanner'],
  ].filter(u => u.every(allowed));
  const hasTannerExpansion = allowed('apprentice_tanner');

  // === Budget calculation ===
  const wolfBudget = maxWolf;

  const deck = [];
  let wolfCount = 0;

  // 1) Guarantee at least 1 werewolf
  deck.push('werewolf'); wolfCount++;

  // 2) Guarantee core village roles (seer + 1~2 action roles for info balance)
  // seer는 반드시, robber/troublemaker는 인원에 따라
  for (const unit of coreVillageUnits) {
    if (deck.length + unit.length > need) continue;
    deck.push(...unit);
  }

  // 3) Fill wolf cards
  for (const unit of shuffle([...wolfUnits])) {
    if (deck.length + unit.length > need) continue;
    const uw = unit.filter(r => ROLES[r]?.team === 'wolf').length;
    if (wolfCount + uw > wolfBudget) continue;
    if (unit.length === 1 && unit[0] === 'werewolf') {
      const wwCount = deck.filter(r => r === 'werewolf').length;
      if (wwCount >= 2) continue; // max 2 werewolf cards
      if (wwCount >= 1 && wolfCount + 1 <= wolfBudget && deck.length + 1 <= need) {
        deck.push(...unit); wolfCount += uw;
      }
      continue;
    }
    deck.push(...unit); wolfCount += uw;
  }

  // 4) Maybe add tanner (30% chance, 5인 이상)
  if (playerCount >= 5 && deck.length < need && specialUnits.length > 0 && Math.random() < 0.3) {
    deck.push('tanner');
    // apprentice_tanner는 tanner가 들어갔을 때만 50% 확률로 추가
    if (hasTannerExpansion && deck.length < need && Math.random() < 0.5) {
      deck.push('apprentice_tanner');
    }
  }

  // 5) Fill remaining with village cards (skip already-added core roles)
  const added = new Set(deck);
  for (const unit of shuffle([...villageUnits])) {
    if (deck.length >= need) break;
    // 이미 추가된 단일 역할은 건너뛰기
    if (unit.length === 1 && added.has(unit[0])) continue;
    if (deck.length + unit.length > need) continue;
    deck.push(...unit);
    unit.forEach(r => added.add(r));
  }

  // 6) Pad with villager if needed
  while (deck.length < need) deck.push('villager');

  return deck;
}

// ===== SCENARIO DATA (loaded from _index.json) =====
let SCENARIOS = [];

// 시나리오별 줄거리/분위기 요약 (UI 표시용)
const SCENARIO_SYNOPSIS = {
  beginner_dark_fantasy: {
    genre: '다크 판타지',
    synopsis: '은빛 봉인이 깨진 밤, 마을 광장에 모인 이들 중 누군가는 달빛 아래 본성을 드러낸다. 첫 밤을 안내하는 초보자용 시나리오.',
  },
  dark_citadel: {
    genre: '다크 판타지',
    synopsis: '까마귀골 변두리 마을. 새벽 순찰이 우물가에서 서기 라일의 시체를 발견했다. 목이 꺾인 채, 손톱 밑에 검은 흙이 끼어 있었다. 누가 마지막으로 라일을 봤는가.',
  },
  floodgate_nameplates: {
    genre: '식민지 괴담',
    synopsis: '폭우가 쏟아지는 밤, 수문 관리소의 이름패가 하나씩 물에 떠내려간다. 이름이 지워지기 전에, 배신자를 가려내야 한다.',
  },
  rust_orbit: {
    genre: 'SF 호러',
    synopsis: '녹슨 궤도 정거장에서 동면 포드가 일제히 열린다. 깨어난 승무원들 사이에 이질적인 존재가 섞여 있다. 산소가 다 떨어지기 전에 진실을 밝혀야 한다.',
  },
  salgol_ward: {
    genre: '병원 호러',
    synopsis: '살골 폐쇄병동, 야간 근무 중 환자 명부가 바뀌어 있다. 대체된 환자는 누구인가. 복도 끝 비상등만이 유일한 빛이다.',
  },
  school_broadcast_prayer: {
    genre: '학교 호러',
    synopsis: '자정의 교내 방송실. 마이크에서 기도문이 흘러나오고, 책상에는 주술 문양이 새겨져 있다. 방송이 끝나기 전에, 문 앞의 원수를 찾아라.',
  },
};

async function loadScenarioIndex() {
  try {
    const resp = await fetch('./assets/scenarios/_index.json');
    if (!resp.ok) throw new Error(`scenario index not found: ${resp.status}`);
    const index = await resp.json();
    SCENARIOS = index.map(entry => ({
      id: entry.id,
      title: entry.title,
      subtitle: entry.subtitle,
      playerCounts: entry.playerCounts,
      episodes: entry.episodes.map(ep => ({ id: ep.id, title: ep.title, variants: {} })),
    }));
  } catch (e) {
    console.error('[loadScenarioIndex]', e);
    SCENARIOS = [];
  }
}

// ===== STATE =====
const state = {
  screen: 'home',          // home | setup | join | lobby | changelog
  // setup
  scenarioIdx: null,
  episodeIdx: null,
  playerCount: null,
  expansions: loadExpansions(),
  // lobby
  roomCode: null,
  deck: null,
  // playing
  playing: false,
  paused: false,
  playlistIndex: 0,
  playlist: [],
  manifest: null,
  actionDelay: (() => { try { return parseInt(localStorage.getItem('onw_action_delay')) || 0; } catch { return 0; } })(),
  // tabs & wiki
  activeTab: 'ingame',     // ingame | codex | rulebook
  wikiPage: null,
  wikiCache: {},
  wikiIndex: null,
};

// ===== ROOM CODE =====
// v3: scenario(4 bits) + episode(2 bits) + deck(27 roles × 2 bits = 54 bits) = 60 bits → base62(~11 chars)
// Player count derived from deck.length - 3.
const _B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const _DECK_BITS = BigInt(ROLE_IDS.length * 2); // 54

function encodeRoomCode(scenarioId, episodeId, playerCount, deck) {
  const sIdx = BigInt(Math.max(0, SCENARIOS.findIndex(s => s.id === scenarioId)));
  const epNum = Math.max(1, parseInt(String(episodeId || 'ep1').replace('ep', ''), 10) || 1);
  const epBits = BigInt(Math.min(3, epNum - 1));
  const counts = ROLE_IDS.map(r => deck.filter(d => d === r).length);
  let deckVal = 0n;
  for (let i = 0; i < counts.length; i++) deckVal = deckVal * 4n + BigInt(counts[i]);
  const val = (sIdx << (_DECK_BITS + 2n)) | (epBits << _DECK_BITS) | deckVal;
  let code = '';
  let v = val;
  if (v === 0n) return '0'.padStart(11, '0');
  while (v > 0n) { code = _B62[Number(v % 62n)] + code; v = v / 62n; }
  return code.padStart(11, '0');
}

function decodeRoomCode(code) {
  code = code.trim();
  if (code.length < 6 || code.length > 12) return null;
  let val = 0n;
  for (const ch of code) {
    const idx = _B62.indexOf(ch);
    if (idx < 0) return null;
    val = val * 62n + BigInt(idx);
  }
  const deckMask = (1n << _DECK_BITS) - 1n;
  const deckVal = val & deckMask;
  const sIdx = Number((val >> (_DECK_BITS + 2n)) & 0xFn);
  const epBits = Number((val >> _DECK_BITS) & 0x3n);
  const episodeId = `ep${epBits + 1}`;

  const scenario = SCENARIOS[sIdx];
  if (!scenario) return null;

  let dv = deckVal;
  const counts = [];
  for (let i = ROLE_IDS.length - 1; i >= 0; i--) {
    counts[i] = Number(dv % 4n);
    dv = dv / 4n;
  }
  const deck = [];
  ROLE_IDS.forEach((r, i) => { for (let j = 0; j < counts[i]; j++) deck.push(r); });

  if (deck.length < 6 || deck.length > 23) return null;
  const playerCount = deck.length - 3;
  if (!scenario.playerCounts.includes(playerCount)) return null;
  const episode = scenario.episodes.find(ep => ep.id === episodeId);
  if (!episode) return null;

  return { scenarioId: scenario.id, episodeId, playerCount, deck };
}

// ===== VARIANT RESOLVER =====
function getVariant(scenario, episodeId, playerCount) {
  const episode = scenario.episodes.find(ep => ep.id === episodeId);
  if (!episode) return null;
  const v = episode.variants || {};
  let variant = v[String(playerCount)];
  if (!variant) {
    // fallback: smallest key >= playerCount, else largest key
    const keys = Object.keys(v).map(Number).filter(k => !isNaN(k)).sort((a, b) => a - b);
    if (keys.length > 0) {
      const fit = keys.find(k => k >= playerCount);
      variant = v[String(fit != null ? fit : keys[keys.length - 1])];
    }
  }
  if (!variant) {
    // No pre-defined variants — generate random deck on the fly
    const deck = generateRandomDeck(playerCount, scenario.id);
    return { deck, wakeOrder: deriveWakeOrder(deck) };
  }
  // Trim deck to playerCount + 3 (pool-style variants may have more cards than needed)
  const need = playerCount + 3;
  if (variant.deck.length > need) {
    return { ...variant, deck: variant.deck.slice(0, need) };
  }
  return variant;
}

// ===== MANIFEST & AUDIO =====
const manifestCache = {};
const ttsScenarioCache = {};

async function loadManifest(scenarioId) {
  if (manifestCache[scenarioId]) return manifestCache[scenarioId];
  const resp = await fetch(`./assets/voices/${scenarioId}/_manifest.json`);
  if (!resp.ok) throw new Error(`manifest not found: ${scenarioId}`);
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

async function loadTtsScenario(scenarioId) {
  if (ttsScenarioCache[scenarioId]) return ttsScenarioCache[scenarioId];
  const resp = await fetch(`./assets/scenarios_tts/${scenarioId}.tts.json`);
  if (!resp.ok) throw new Error(`tts scenario not found: ${scenarioId}`);
  const data = await resp.json();
  ttsScenarioCache[scenarioId] = data;
  return data;
}

function coerceClipItems(raw, defaultSpeakerId) {
  const list = raw == null ? [] : (Array.isArray(raw) ? raw : [raw]);
  return list
    .map((item) => (typeof item === 'string' ? { speakerId: defaultSpeakerId, text: item } : item))
    .filter((item) => item && typeof item.text === 'string' && item.text.trim());
}

function buildPlaylistFromTts(ttsScenario, scenarioId, episodeId, wakeOrder) {
  const episodes = ttsScenario && ttsScenario.episodes;
  const episode = Array.isArray(episodes)
    ? episodes.find((ep) => ep && (ep.episodeId === episodeId || ep.id === episodeId))
    : episodes && episodes[episodeId];
  if (!episode) return [];

  const playerKey = ttsScenario.playerCount ? `p${ttsScenario.playerCount}` : 'pall';
  const playlist = [];
  const pushClips = (basePath, raw, phase, roleId, label, defaultSpeakerId) => {
    const items = coerceClipItems(raw, defaultSpeakerId);
    items.forEach((clip, idx) => {
      playlist.push({
        clipId: `${basePath}/${String(idx + 1).padStart(3, '0')}`,
        speakerId: clip.speakerId || defaultSpeakerId || 'Narrator',
        text: clip.text,
        url: clip.url || null,
        backend: clip.backend || 'browser_tts',
        phase,
        roleId,
        label,
      });
    });
  };

  pushClips(`${scenarioId}/${episodeId}/${playerKey}/opening`, episode.openingClips, 'opening', null, '오프닝', 'Narrator');

  const roleClips = episode.roleClips || {};
  for (const roleId of wakeOrder) {
    const roleInfo = ROLES[roleId];
    const label = roleInfo ? roleInfo.name : roleId;
    const roleData = roleClips[roleId];
    if (!roleData) continue;

    if (typeof roleData === 'string' || Array.isArray(roleData)) {
      pushClips(`${scenarioId}/${episodeId}/${playerKey}/role/${roleId}/during`, roleData, 'during', roleId, label, roleId);
      continue;
    }

    const hasSteps = ['before', 'during', 'after'].some((step) => roleData[step] != null);
    if (hasSteps) {
      ['before', 'during', 'after'].forEach((step) => {
        pushClips(`${scenarioId}/${episodeId}/${playerKey}/role/${roleId}/${step}`, roleData[step], step, roleId, label, roleId);
      });
      continue;
    }

    pushClips(`${scenarioId}/${episodeId}/${playerKey}/role/${roleId}/during`, roleData, 'during', roleId, label, roleId);
  }

  pushClips(`${scenarioId}/${episodeId}/${playerKey}/outro`, episode.nightOutroClips, 'outro', null, '아웃트로', 'Narrator');

  return playlist;
}

function isSpeechClip(clip) {
  return !!clip && !clip.url && typeof clip.text === 'string' && !!clip.text.trim();
}

function stripEmotionTags(text) {
  return String(text || '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\{[^}]+\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cancelSpeechPlayback() {
  state._speechUtterance = null;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function getManifestPlayerPrefix(manifest) {
  if (!manifest.clips.length) return null;
  const m = manifest.clips[0].clipId.match(/\/p(\w+)\//);
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

// ===== BGM =====
const bgmEl = document.getElementById('bgmPlayer');
const BGM_DEFAULT_VOLUME = 0.25;
bgmEl.volume = (() => { try { return parseFloat(localStorage.getItem('onw_bgm_vol')) || BGM_DEFAULT_VOLUME; } catch { return BGM_DEFAULT_VOLUME; } })();

function setBgmVolume(v) {
  bgmEl.volume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('onw_bgm_vol', String(bgmEl.volume)); } catch {}
}

function startBgm() {
  if (state._bgmFadeTimer) { clearInterval(state._bgmFadeTimer); state._bgmFadeTimer = null; }
  bgmEl.muted = false;
  bgmEl.currentTime = 0;
  bgmEl.play().catch(() => {});
}

function stopBgm() {
  if (state._bgmFadeTimer) { clearInterval(state._bgmFadeTimer); state._bgmFadeTimer = null; }
  bgmEl.pause();
  bgmEl.currentTime = 0;
  // Restore saved volume so next play starts at user-set level
  const saved = (() => { try { return parseFloat(localStorage.getItem('onw_bgm_vol')) || BGM_DEFAULT_VOLUME; } catch { return BGM_DEFAULT_VOLUME; } })();
  bgmEl.volume = saved;
}

function fadeOutBgm(duration = 3000) {
  const step = 50; // ms per tick
  const steps = duration / step;
  const volDec = bgmEl.volume / steps;
  state._bgmFadeTimer = setInterval(() => {
    bgmEl.volume = Math.max(0, bgmEl.volume - volDec);
    if (bgmEl.volume <= 0) {
      clearInterval(state._bgmFadeTimer);
      state._bgmFadeTimer = null;
      bgmEl.pause();
      bgmEl.currentTime = 0;
      // Restore saved volume for next play
      const saved = (() => { try { return parseFloat(localStorage.getItem('onw_bgm_vol')) || BGM_DEFAULT_VOLUME; } catch { return BGM_DEFAULT_VOLUME; } })();
      bgmEl.volume = saved;
    }
  }, step);
}

// ===== WAKE LOCK (prevent screen off during playback) =====
let wakeLockSentinel = null;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
  } catch {}
}

function releaseWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => {});
    wakeLockSentinel = null;
  }
}

// Re-acquire wake lock when returning to foreground (browser releases it on tab hide)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.playing) {
    requestWakeLock();
  }
});

// ===== GAME SESSION PERSISTENCE (restore after mobile tab kill) =====
const GAME_SESSION_KEY = 'onw_game_session';
const GAME_SESSION_MAX_AGE = 2 * 60 * 60 * 1000; // 2 hours

function saveGameSession() {
  if (!state.playing || !state.roomCode) return;
  try {
    localStorage.setItem(GAME_SESSION_KEY, JSON.stringify({
      roomCode: state.roomCode,
      playlistIndex: state.playlistIndex,
      timestamp: Date.now(),
    }));
  } catch {}
}

function clearGameSession() {
  try { localStorage.removeItem(GAME_SESSION_KEY); } catch {}
}

function loadGameSession() {
  try {
    const raw = localStorage.getItem(GAME_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() - session.timestamp > GAME_SESSION_MAX_AGE) {
      clearGameSession();
      return null;
    }
    return session;
  } catch { return null; }
}

async function restoreGameSession(session) {
  const decoded = decodeRoomCode(session.roomCode);
  if (!decoded) { clearGameSession(); return false; }

  state.roomCode = session.roomCode;
  state.screen = 'lobby';

  const { scenarioId, episodeId, playerCount, deck } = decoded;
  const wakeOrder = deriveWakeOrder(deck);

  let playlist = [];
  let manifest = null;
  try {
    manifest = await loadManifest(scenarioId);
    playlist = buildPlaylist(manifest, scenarioId, episodeId, playerCount, wakeOrder);
  } catch {
    try {
      const ttsScenario = await loadTtsScenario(scenarioId);
      playlist = buildPlaylistFromTts(ttsScenario, scenarioId, episodeId, wakeOrder);
    } catch { clearGameSession(); return false; }
  }

  if (playlist.length === 0) { clearGameSession(); return false; }

  const idx = Math.min(session.playlistIndex, playlist.length - 1);
  state.manifest = manifest;
  state.playlist = playlist;
  state.playing = true;
  state.paused = true; // paused state — user must tap to resume (mobile autoplay restriction)
  state.playlistIndex = idx;

  try { history.replaceState(null, '', '?room=' + encodeURIComponent(session.roomCode)); } catch {}
  startBgm();
  bgmEl.pause(); // BGM also paused until user resumes
  render();
  showToast('게임이 복원되었습니다. 재생 버튼을 눌러 이어서 진행하세요.');
  return true;
}

// Save session when page is being hidden (screen lock, tab switch, app switch)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.playing) {
    saveGameSession();
  }
});

// ===== AUDIO PLAYBACK (mobile-safe, event-driven) =====
const audioEl = document.getElementById('audioPlayer');
let audioCtx = null;

// ===== RADIO (WALKIE-TALKIE) EFFECT for rust_orbit scenario =====
// Design: 30% of role clips randomly get radio effect.
// Within each affected clip, effect starts strong → fades to clean by clip end.
const radioFx = {
  active: false,          // true when rust_orbit scenario is playing
  intensity: 0,           // current intensity (0=clean, 1=full radio) — driven per-clip
  clipHasRadio: false,    // whether the CURRENT clip was selected for radio effect
  mediaSource: null,      // MediaElementAudioSourceNode (created once per audioEl)
  chain: null,            // { highpass, lowpass, midBoost, distortion, compressor, gain }
  staticNoise: null,      // { source, gain }
  _onTimeUpdate: null,    // bound timeupdate handler ref for cleanup
};
const RADIO_CLIP_CHANCE = 0.3; // 30% of role clips get radio effect

function makeDistortionCurve(amount) {
  const n = 44100, curve = new Float32Array(n);
  if (amount <= 0) {
    for (let i = 0; i < n; i++) curve[i] = i * 2 / n - 1;
    return curve;
  }
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = i * 2 / n - 1;
    curve[i] = (3 + k) * Math.atan(Math.sinh(x * 0.25) * 5) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function ensureMediaSource() {
  if (!radioFx.mediaSource) {
    radioFx.mediaSource = audioCtx.createMediaElementSource(audioEl);
  }
  return radioFx.mediaSource;
}

function buildRadioChain() {
  const highpass = audioCtx.createBiquadFilter();
  highpass.type = 'highpass'; highpass.frequency.value = 20; highpass.Q.value = 0.5;
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = 20000; lowpass.Q.value = 0.5;
  const midBoost = audioCtx.createBiquadFilter();
  midBoost.type = 'peaking'; midBoost.frequency.value = 1500; midBoost.Q.value = 2; midBoost.gain.value = 0;
  const distortion = audioCtx.createWaveShaper();
  distortion.curve = makeDistortionCurve(0);
  distortion.oversample = '4x';
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = 0; compressor.ratio.value = 1; compressor.knee.value = 10;
  const gain = audioCtx.createGain();
  gain.gain.value = 1.0;

  highpass.connect(lowpass);
  lowpass.connect(midBoost);
  midBoost.connect(distortion);
  distortion.connect(compressor);
  compressor.connect(gain);
  gain.connect(audioCtx.destination);
  return { highpass, lowpass, midBoost, distortion, compressor, gain };
}

function rfxLerp(clean, radio, t) { return clean + (radio - clean) * t; }

function rfxRamp(param, target, rampTime) {
  param.setValueAtTime(param.value, audioCtx.currentTime);
  param.linearRampToValueAtTime(target, rampTime);
}

// Set all chain params to match intensity (0=clean passthrough, 1=full radio)
function updateRadioIntensity(intensity) {
  radioFx.intensity = Math.max(0, Math.min(1, intensity));
  const t = radioFx.intensity;
  const c = radioFx.chain;
  if (!c) return;
  const rt = audioCtx.currentTime + 0.05;
  rfxRamp(c.highpass.frequency, rfxLerp(20, 300, t), rt);
  rfxRamp(c.lowpass.frequency, rfxLerp(20000, 3500, t), rt);
  rfxRamp(c.midBoost.gain, rfxLerp(0, 8, t), rt);
  c.distortion.curve = makeDistortionCurve(Math.round(rfxLerp(0, 150, t)));
  rfxRamp(c.compressor.ratio, rfxLerp(1, 12, t), rt);
  rfxRamp(c.compressor.threshold, rfxLerp(0, -30, t), rt);
  rfxRamp(c.gain.gain, rfxLerp(1.0, 0.6, t), rt);
  if (radioFx.staticNoise) {
    rfxRamp(radioFx.staticNoise.gain.gain, 0.015 * t, rt);
  }
}

// timeupdate handler: fade intensity from 1→0 within current clip
function radioTimeUpdate() {
  if (!radioFx.clipHasRadio || !audioEl.duration || audioEl.paused) return;
  const progress = audioEl.currentTime / audioEl.duration; // 0→1
  // Quadratic ease-out: strong at start, fades faster toward end
  const t = Math.max(0, 1 - progress * progress);
  updateRadioIntensity(t);
}

function attachRadioTimeUpdate() {
  detachRadioTimeUpdate();
  radioFx._onTimeUpdate = radioTimeUpdate;
  audioEl.addEventListener('timeupdate', radioFx._onTimeUpdate);
}

function detachRadioTimeUpdate() {
  if (radioFx._onTimeUpdate) {
    audioEl.removeEventListener('timeupdate', radioFx._onTimeUpdate);
    radioFx._onTimeUpdate = null;
  }
}

function startStaticNoise(volume) {
  const bufLen = 2 * audioCtx.sampleRate;
  const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = 3000; filter.Q.value = 0.5;
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  src.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
  src.start(0);
  return { source: src, gain };
}

function stopStaticNoise() {
  if (radioFx.staticNoise) {
    try { radioFx.staticNoise.source.stop(); } catch (_) {}
    try { radioFx.staticNoise.gain.disconnect(); } catch (_) {}
    radioFx.staticNoise = null;
  }
}

function enableRadioEffect() {
  if (radioFx.active) return;
  const src = ensureMediaSource();
  src.disconnect();
  radioFx.chain = buildRadioChain();
  src.connect(radioFx.chain.highpass);
  // Start chain in clean state — individual clips will activate it
  updateRadioIntensity(0);
  radioFx.staticNoise = startStaticNoise(0);
  radioFx.clipHasRadio = false;
  radioFx.active = true;
}

function disableRadioEffect() {
  if (!radioFx.active) return;
  detachRadioTimeUpdate();
  stopStaticNoise();
  if (radioFx.chain) {
    Object.values(radioFx.chain).forEach(n => { try { n.disconnect(); } catch (_) {} });
    radioFx.chain = null;
  }
  if (radioFx.mediaSource) {
    try { radioFx.mediaSource.disconnect(); } catch (_) {}
    radioFx.mediaSource.connect(audioCtx.destination);
  }
  radioFx.intensity = 0;
  radioFx.clipHasRadio = false;
  radioFx.active = false;
}

function ensureDirectRouting() {
  if (radioFx.mediaSource && !radioFx.active) {
    try { radioFx.mediaSource.disconnect(); } catch (_) {}
    radioFx.mediaSource.connect(audioCtx.destination);
  }
}

// Squelch burst + roger beep — only called for radio-selected clips
function playSquelchIn() {
  if (!radioFx.active || !audioCtx || !radioFx.clipHasRadio) return Promise.resolve();
  return new Promise(resolve => {
    const now = audioCtx.currentTime;
    const bufLen = Math.floor(audioCtx.sampleRate * 0.12);
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
    const nSrc = audioCtx.createBufferSource(); nSrc.buffer = buf;
    const nFilt = audioCtx.createBiquadFilter(); nFilt.type = 'bandpass'; nFilt.frequency.value = 2500; nFilt.Q.value = 1;
    const nGain = audioCtx.createGain(); nGain.gain.value = 0.25;
    nSrc.connect(nFilt); nFilt.connect(nGain); nGain.connect(audioCtx.destination);
    nSrc.start(now);
    const osc = audioCtx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 1800;
    const bGain = audioCtx.createGain();
    bGain.gain.setValueAtTime(0, now + 0.10);
    bGain.gain.linearRampToValueAtTime(0.2, now + 0.105);
    bGain.gain.setValueAtTime(0.2, now + 0.16);
    bGain.gain.linearRampToValueAtTime(0, now + 0.17);
    osc.connect(bGain); bGain.connect(audioCtx.destination);
    osc.start(now + 0.10); osc.stop(now + 0.18);
    setTimeout(resolve, 200);
  });
}

// Squelch out — only for radio-selected clips, uses low intensity since clip faded
function playSquelchOut() {
  if (!radioFx.active || !audioCtx || !radioFx.clipHasRadio) return Promise.resolve();
  return new Promise(resolve => {
    const now = audioCtx.currentTime;
    const vol = 0.3; // subtle — clip already faded to clean
    const osc = audioCtx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 1800;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.2 * vol, now + 0.005);
    g.gain.setValueAtTime(0.2 * vol, now + 0.06);
    g.gain.linearRampToValueAtTime(0, now + 0.07);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.08);
    const bufLen = Math.floor(audioCtx.sampleRate * 0.08);
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) * 0.5;
    const nSrc = audioCtx.createBufferSource(); nSrc.buffer = buf;
    const nGain = audioCtx.createGain(); nGain.gain.value = 0.15 * vol;
    nSrc.connect(nGain); nGain.connect(audioCtx.destination);
    nSrc.start(now + 0.07);
    setTimeout(resolve, 160);
  });
}

// Unlock audio on iOS/Android — must be called directly from user tap
function unlockAudio() {
  // WebAudio unlock
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  // HTMLAudio unlock: play a tiny silent buffer
  audioEl.muted = true;
  audioEl.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqSAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqSAAAAAAAAAAAAAAAAAAAA';
  const p = audioEl.play();
  if (p) p.then(() => { audioEl.pause(); audioEl.muted = false; }).catch(() => { audioEl.muted = false; });
  // Unlock BGM too
  bgmEl.muted = true;
  const bp = bgmEl.play();
  if (bp) bp.then(() => { if (!state.playing) bgmEl.pause(); bgmEl.muted = false; }).catch(() => { bgmEl.muted = false; });
}

function stopPlayback() {
  state.playing = false;
  state.paused = false;
  if (state._delayTimer) { clearTimeout(state._delayTimer); state._delayTimer = null; }
  cancelSpeechPlayback();
  audioEl.pause();
  disableRadioEffect();
  stopBgm();
  releaseWakeLock();
  audioEl.removeAttribute('src');
  audioEl.onended = null;
  audioEl.onerror = null;
  clearGameSession();
  render();
}

function togglePause() {
  if (!state.playing) return;
  const curClip = state.playlist[state.playlistIndex];
  if (state.paused) {
    // Resume
    state.paused = false;
    // Cold resume after session restore — no active audio/speech, need to set up handlers and start clip
    const isColdResume = !state._pausedDelay && !state._speechUtterance && !audioEl.src;
    if (isColdResume) {
      unlockAudio();
      requestWakeLock();
      // Re-enable radio effect if needed (scenario info from session)
      const cfg = resolveCurrentConfig();
      if (cfg.scenarioId === 'rust_orbit') { ensureMediaSource(); enableRadioEffect(); }
      else { disableRadioEffect(); ensureDirectRouting(); }
      audioEl.onended = async () => { if (radioFx.clipHasRadio) await playSquelchOut(); playNext(); };
      audioEl.onerror = () => { console.warn('Audio error, fallback to speech:', state.playlist[state.playlistIndex]?.url); fallbackToSpeech(state.playlist[state.playlistIndex]); };
      playClip(curClip);
    } else if (state._pausedDelay) {
      // Was paused during a delay timer — restart remaining delay
      state._delayTimer = setTimeout(() => {
        state._delayTimer = null;
        state._pausedDelay = null;
        playClip(state.playlist[state.playlistIndex]);
      }, state._pausedDelay.remaining);
      state._pausedDelay = null;
    } else {
      if (isSpeechClip(curClip)) {
        if (state._speechUtterance) window.speechSynthesis.resume();
        else playClip(curClip);
      } else {
        audioEl.play().catch(() => {});
      }
    }
    bgmEl.play().catch(() => {});
  } else {
    // Pause
    state.paused = true;
    bgmEl.pause();
    if (state._delayTimer) {
      // Pause during delay — save remaining time
      const elapsed = Date.now() - (state._delayStart || Date.now());
      const total = state.actionDelay * 1000;
      clearTimeout(state._delayTimer);
      state._delayTimer = null;
      state._pausedDelay = { remaining: Math.max(0, total - elapsed) };
    } else {
      if (isSpeechClip(curClip) && window.speechSynthesis) window.speechSynthesis.pause();
      else audioEl.pause();
    }
  }
  renderPlayingOverlay();
}

function playNext() {
  state.playlistIndex++;
  if (state.playlistIndex >= state.playlist.length) {
    state.playing = false;
    disableRadioEffect();
    fadeOutBgm(3000);
    releaseWakeLock();
    clearGameSession();
    render();
    showToast('밤이 끝났습니다. 토론을 시작하세요!');
    return;
  }
  saveGameSession();

  const prevClip = state.playlist[state.playlistIndex - 1];
  const nextClip = state.playlist[state.playlistIndex];
  // Insert delay when transitioning between different roles (not opening/outro)
  const roleChanged = prevClip && nextClip && prevClip.roleId && nextClip.roleId && prevClip.roleId !== nextClip.roleId;
  if (roleChanged && state.actionDelay > 0) {
    renderPlayingOverlay();
    state._delayStart = Date.now();
    state._delayTimer = setTimeout(() => {
      state._delayTimer = null;
      state._delayStart = null;
      playClip(nextClip);
    }, state.actionDelay * 1000);
    return;
  }

  playClip(nextClip);
}

async function playClip(clip) {
  renderPlayingOverlay();
  cancelSpeechPlayback();
  audioEl.pause();
  detachRadioTimeUpdate();

  // Decide if this clip gets radio effect
  const isNarration = clip.phase === 'opening' || clip.phase === 'outro';
  if (radioFx.active) {
    if (!isNarration && !isSpeechClip(clip) && Math.random() < RADIO_CLIP_CHANCE) {
      // 30% chance — this role clip gets radio treatment
      radioFx.clipHasRadio = true;
      updateRadioIntensity(1); // start strong
      attachRadioTimeUpdate(); // fade during playback
    } else {
      // No radio for this clip — clean passthrough
      radioFx.clipHasRadio = false;
      updateRadioIntensity(0);
    }
  }

  if (isSpeechClip(clip)) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      showToast('브라우저 음성 읽기를 지원하지 않습니다');
      playNext();
      return;
    }
    // TTS bypasses Web Audio — ensure static noise is silent
    if (radioFx.active && radioFx.staticNoise) {
      rfxRamp(radioFx.staticNoise.gain.gain, 0, audioCtx.currentTime + 0.03);
    }
    const utter = new SpeechSynthesisUtterance(stripEmotionTags(clip.text));
    utter.lang = 'ko-KR';
    utter.rate = 1;
    utter.pitch = 1;
    utter.onend = () => {
      if (state._speechUtterance !== utter) return;
      state._speechUtterance = null;
      playNext();
    };
    utter.onerror = () => {
      if (state._speechUtterance !== utter) return;
      state._speechUtterance = null;
      playNext();
    };
    state._speechUtterance = utter;
    window.speechSynthesis.speak(utter);
    return;
  }

  if (radioFx.clipHasRadio) await playSquelchIn();
  audioEl.src = clip.url;
  audioEl.load();
  audioEl.play().catch((err) => {
    console.warn('play() rejected:', clip.url, err);
    fallbackToSpeech(clip);
  });
}

function fallbackToSpeech(clip) {
  if (clip && clip.text && clip.text.trim() && window.speechSynthesis && window.SpeechSynthesisUtterance) {
    cancelSpeechPlayback();
    audioEl.pause();
    audioEl.removeAttribute('src');
    detachRadioTimeUpdate();
    // Falling back to TTS — mute radio chain since TTS bypasses Web Audio
    if (radioFx.active) {
      radioFx.clipHasRadio = false;
      updateRadioIntensity(0);
    }
    const utter = new SpeechSynthesisUtterance(stripEmotionTags(clip.text));
    utter.lang = 'ko-KR';
    utter.rate = 1;
    utter.pitch = 1;
    utter.onend = () => {
      if (state._speechUtterance !== utter) return;
      state._speechUtterance = null;
      playNext();
    };
    utter.onerror = () => {
      if (state._speechUtterance !== utter) return;
      state._speechUtterance = null;
      playNext();
    };
    state._speechUtterance = utter;
    window.speechSynthesis.speak(utter);
    return;
  }
  playNext();
}

function skipToNext() {
  if (!state.playing) return;
  state.paused = false;
  state._pausedDelay = null;
  if (state._delayTimer) { clearTimeout(state._delayTimer); state._delayTimer = null; }
  cancelSpeechPlayback();
  audioEl.pause();
  // Jump to the next role's first clip (skip remaining clips of current role)
  const curClip = state.playlist[state.playlistIndex];
  let target = state.playlistIndex + 1;
  if (curClip && curClip.roleId) {
    while (target < state.playlist.length && state.playlist[target].roleId === curClip.roleId) target++;
  }
  if (target >= state.playlist.length) {
    state.playing = false;
    clearGameSession();
    render();
    showToast('밤이 끝났습니다. 토론을 시작하세요!');
    return;
  }
  state.playlistIndex = target;
  saveGameSession();
  playClip(state.playlist[target]);
}

function skipToPrev() {
  if (!state.playing) return;
  state.paused = false;
  state._pausedDelay = null;
  if (state._delayTimer) { clearTimeout(state._delayTimer); state._delayTimer = null; }
  cancelSpeechPlayback();
  audioEl.pause();
  // Jump to the start of current role, or previous role if already at start
  const curClip = state.playlist[state.playlistIndex];
  let target = state.playlistIndex;
  // Find start of current role group
  if (curClip && curClip.roleId) {
    while (target > 0 && state.playlist[target - 1].roleId === curClip.roleId) target--;
  }
  // If already at start of this role, go to previous role's start
  if (target === state.playlistIndex && target > 0) {
    target--;
    const prevClip = state.playlist[target];
    if (prevClip && prevClip.roleId) {
      while (target > 0 && state.playlist[target - 1].roleId === prevClip.roleId) target--;
    }
  }
  state.playlistIndex = target;
  saveGameSession();
  playClip(state.playlist[target]);
}

async function startPlayback() {
  // MUST unlock in the same synchronous call stack as user tap
  unlockAudio();

  const config = resolveCurrentConfig();
  const { scenarioId, episodeId, playerCount } = config;
  const variant = resolveVariant(config);
  if (!variant) return;

  try {
    const manifest = await loadManifest(scenarioId);
    state.manifest = manifest;
    state.playlist = buildPlaylist(manifest, scenarioId, episodeId, playerCount, variant.wakeOrder);
  } catch (e) {
    try {
      const ttsScenario = await loadTtsScenario(scenarioId);
      state.manifest = null;
      state.playlist = buildPlaylistFromTts(ttsScenario, scenarioId, episodeId, variant.wakeOrder);
      showToast('오디오가 없어 브라우저 음성 읽기로 재생합니다');
    } catch (ttsErr) {
      showToast('오디오와 텍스트 시나리오를 불러올 수 없습니다');
      return;
    }
  }

  if (state.playlist.length === 0) {
    showToast('재생할 오디오 클립이 없습니다');
    return;
  }

  state.playing = true;
  state.playlistIndex = 0;
  saveGameSession();
  startBgm();
  requestWakeLock();

  // Setup radio effect for rust_orbit scenario
  if (scenarioId === 'rust_orbit') {
    ensureMediaSource();
    enableRadioEffect();
  } else {
    disableRadioEffect();
    ensureDirectRouting();
  }

  render();

  // Event-driven chain: ended → playNext (no async gaps that break mobile)
  audioEl.onended = async () => {
    if (radioFx.clipHasRadio) await playSquelchOut();
    playNext();
  };
  audioEl.onerror = () => {
    console.warn('Audio error, fallback to speech:', state.playlist[state.playlistIndex]?.url);
    fallbackToSpeech(state.playlist[state.playlistIndex]);
  };

  // Start first clip
  playClip(state.playlist[0]);
}

// ===== HELPERS =====
function resolveCurrentConfig() {
  if (state.roomCode) {
    const decoded = decodeRoomCode(state.roomCode);
    if (!decoded) return { scenarioId: null, episodeId: null, playerCount: null, deck: null };
    return { scenarioId: decoded.scenarioId, episodeId: decoded.episodeId, playerCount: decoded.playerCount, deck: decoded.deck };
  }
  const sc = SCENARIOS[state.scenarioIdx];
  const ep = sc.episodes[state.episodeIdx];
  return { scenarioId: sc.id, episodeId: ep.id, playerCount: state.playerCount, deck: state.deck };
}

function resolveVariant(config) {
  if (config.deck) {
    return { deck: config.deck, wakeOrder: deriveWakeOrder(config.deck) };
  }
  const scenario = SCENARIOS.find(s => s.id === config.scenarioId);
  return getVariant(scenario, config.episodeId, config.playerCount);
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

  let content = '';
  switch (state.activeTab) {
    case 'codex':
      content = renderCodexHTML();
      break;
    case 'rulebook':
      content = renderRulebookHTML();
      break;
    default:
      switch (state.screen) {
        case 'home':      content = renderHomeHTML(); break;
        case 'setup':     content = renderSetupHTML(); break;
        case 'join':      content = renderJoinHTML(); break;
        case 'lobby':     content = renderLobbyHTML(); break;
        case 'changelog': content = renderChangelogHTML(); break;
      }
      break;
  }

  app.innerHTML = content + renderTabBarHTML();
}

// -- Home
function renderHomeHTML() {
  return `
    <div class="home">
      <div class="home__bg">
        <img class="home__bg-img" src="${uiImgSrc('bg_m_home')}" alt="" loading="lazy">
        <div class="home__bg-fade"></div>
      </div>
      <div class="home__content">
        <img class="home__logo" src="${uiImgSrc('logo_title')}" alt="한밤의 늑대인간" loading="lazy" onerror="this.style.display='none'">
        <h1 class="home__title">한밤의<br>늑대인간</h1>
        <p class="home__subtitle">LLM Edition — 나레이션 플레이어</p>
        <button class="home__changelog-btn" onclick="goChangelog()">
          <span class="home__changelog-ver">v${window.APP_VERSION || '1.6.0'}</span>
          <span class="home__changelog-label">업데이트 로그 →</span>
        </button>
        <div class="home__actions">
          <button class="btn btn--primary btn--full" onclick="goSetup()">게임 만들기</button>
          <button class="btn btn--ghost btn--full" onclick="goJoin()">게임 참가</button>
        </div>
      </div>
    </div>`;
}

// -- Changelog
const CHANGELOG = [
  { ver: '1.7.0', date: '2026-04-11', items: [
    '하단 탭 네비게이션 추가 (인게임 / 도감 / 롤북)',
    '역할 도감 — 전체 27개 역할을 확장팩별로 브라우징',
    '롤북 — 게임 규칙 및 역할별 Q&A 위키 페이지 (나무위키 기준)',
  ]},
  { ver: '1.6.0', date: '2026-04-07', items: [
    '밤 행동 간격 설정을 로컬에 저장 (재접속 시 유지)',
    'TTS 재생 중 이전/다음 역할 건너뛰기 버튼 추가',
  ]},
  { ver: '1.5.0', date: '2026-04-07', items: [
    '홈 화면에 업데이트 로그 페이지 추가',
    '최근 참가한 방 코드 5개를 로컬에 저장 및 참가 화면에 표시',
  ]},
  { ver: '1.6.0', date: '2026-04-07', items: [
    '역할 설명 카드에 중요 키워드 컬러 하이라이트 적용',
    '밤 행동 간격 지연 옵션 추가 (없음/3초/5초/10초/15초/20초)',
  ]},
  { ver: '1.3.0', date: '2026-04-07', items: [
    '랜덤 덱 생성 — 매 게임마다 다른 역할 조합',
    '방 코드에 덱 인코딩 (8자리) — 같은 코드로 같은 덱 공유',
    '로비에서 역할 다시 뽑기 버튼 추가',
  ]},
  { ver: '1.2.0', date: '2026-04-07', items: [
    '역할 카드를 밤 기상 순서대로 정렬',
    '역할 카드에 기상 순서 번호 배지 표시',
  ]},
  { ver: '1.1.0', date: '2026-04-06', items: [
    '모바일 오디오 재생 안정화 (iOS/Android)',
    '시나리오별 인원수 variant 자동 선택',
    'GitHub Pages 배포 워크플로우 추가',
  ]},
  { ver: '1.0.0', date: '2026-04-05', items: [
    '첫 공개 — 나레이션 플레이어 기본 기능',
    'TTS 음성 재생 (GPT-SoVITS)',
    '3~10인 시나리오 3종 (기본/유연/4인전용)',
  ]},
];

function renderChangelogHTML() {
  return `
    <div class="changelog">
      <div class="changelog__header">
        <button class="back-btn" onclick="goHome()">← 돌아가기</button>
        <h1 class="changelog__title">업데이트 로그</h1>
      </div>
      <div class="changelog__list">
        ${CHANGELOG.map((entry, i) => `
          <div class="changelog__entry ${i === 0 ? 'changelog__entry--latest' : ''}">
            <div class="changelog__ver-row">
              <span class="changelog__ver">v${entry.ver}</span>
              ${i === 0 ? '<span class="changelog__badge">NEW</span>' : ''}
              <span class="changelog__date">${entry.date}</span>
            </div>
            <ul class="changelog__items">
              ${entry.items.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function goChangelog() {
  state.screen = 'changelog';
  render();
}

// -- Setup (풀스크린 위저드)
function renderSetupHTML() {
  const sc = state.scenarioIdx !== null ? SCENARIOS[state.scenarioIdx] : null;
  const ep = sc && state.episodeIdx !== null ? sc.episodes[state.episodeIdx] : null;
  const ready = sc && ep && state.playerCount;

  // 현재 단계
  let step = 1; // 시나리오
  if (sc && state.episodeIdx === null) step = 2; // 에피소드
  if (sc && ep && !state.playerCount) step = 3; // 설정
  if (ready) step = 4; // 준비 완료

  let code = '';
  let codeDisplay = '';
  if (ready) {
    code = encodeRoomCode(sc.id, ep.id, state.playerCount, state.deck);
    codeDisplay = code.match(/.{1,5}/g).join('-');
  }

  const info = sc ? (SCENARIO_SYNOPSIS[sc.id] || {}) : {};

  // 배경 이미지 결정: 에피소드 > 시나리오 > 기본
  let bgImage = '';
  if (ep) bgImage = episodeBgSrc(sc.id, ep.id);
  else if (sc) bgImage = scenarioBgSrc(sc.id);
  const setupBgSrc = bgImage || uiImgSrc('bg_m_setup');

  // ── STEP 1: 시나리오 선택 ──
  if (step === 1) {
    return `
    <div class="wiz wiz--setup">
      <div class="wiz__bg wiz__bg--banner" style="background-image:url('${setupBgSrc}')"></div>
      <div class="wiz__bg-overlay wiz__bg-overlay--banner"></div>
      <button class="wiz__back" onclick="goHome()">← 나가기</button>
      <div class="wiz__panel wiz__panel--scenarios">
        <div class="wiz__step-tag">STEP 1</div>
        <h2 class="wiz__step-title">시나리오를 선택하세요</h2>
        <div class="wiz__scenario-list">
          ${SCENARIOS.map((s, i) => {
            const si = SCENARIO_SYNOPSIS[s.id] || {};
            return `
            <button class="wiz-sc ${state.scenarioIdx === i ? 'wiz-sc--active' : ''}"
              onclick="selectScenario(${i})"
              onmouseenter="document.querySelector('.wiz__bg').style.backgroundImage='url(${scenarioBgSrc(s.id)})'">
              <img class="wiz-sc__thumb" src="${scenarioBgSrc(s.id)}" alt="" loading="lazy">
              <div class="wiz-sc__info">
                <span class="wiz-sc__genre">${si.genre || ''}</span>
                <div class="wiz-sc__title">${s.title}</div>
                <div class="wiz-sc__meta">${s.playerCounts[0]}~${s.playerCounts[s.playerCounts.length-1]}인</div>
              </div>
            </button>`;
          }).join('')}
        </div>
      </div>
    </div>`;
  }

  // ── STEP 2: 에피소드 선택 ──
  if (step === 2) {
    return `
    <div class="wiz wiz--setup">
      <div class="wiz__bg wiz__bg--banner" style="background-image:url('${setupBgSrc}')"></div>
      <div class="wiz__bg-overlay wiz__bg-overlay--banner"></div>
      <button class="wiz__back" onclick="state.scenarioIdx=null;state.episodeIdx=null;state.playerCount=0;render()">← 시나리오</button>
      <div class="wiz__panel">
        <div class="wiz__panel-header">
          <div class="wiz__hero-genre">${info.genre || ''}</div>
          <h1 class="wiz__hero-title">${sc.title}</h1>
          <p class="wiz__hero-synopsis">${info.synopsis || ''}</p>
        </div>
        <div class="wiz__step-tag">STEP 2</div>
        <h2 class="wiz__step-title">에피소드</h2>
        <div class="wiz__ep-list">
          ${sc.episodes.map((e, i) => `
            <button class="wiz-ep" onclick="selectEpisode(${i})">
              <img class="wiz-ep__img" src="${episodeBgSrc(sc.id, e.id)}" alt="" loading="lazy">
              <div class="wiz-ep__overlay">
                <span class="wiz-ep__num">EP${i+1}</span>
                <span class="wiz-ep__title">${e.title.replace(/^EP\d+:\s*/, '')}</span>
              </div>
            </button>
          `).join('')}
        </div>
      </div>
    </div>`;
  }

  // ── STEP 3~4: 설정 + 시작 ──
  return `
    <div class="wiz wiz--setup">
      <div class="wiz__bg wiz__bg--banner" style="background-image:url('${setupBgSrc}')"></div>
      <div class="wiz__bg-overlay wiz__bg-overlay--banner"></div>
      <button class="wiz__back" onclick="state.episodeIdx=null;state.playerCount=0;render()">← 에피소드</button>
      <div class="wiz__panel">
        <div class="wiz__panel-header">
          <div class="wiz__hero-genre">${info.genre || ''}</div>
          <h1 class="wiz__hero-title">${sc.title}</h1>
          <div class="wiz__hero-ep">${ep.title}</div>
        </div>
        <div class="wiz__step-tag">STEP 3</div>
        <h2 class="wiz__step-title">게임 설정</h2>

        <div class="wiz__setting-group">
          <div class="wiz__setting-label">확장팩</div>
          <div class="wiz__exp-row">
            ${EXPANSIONS.map(ex => {
              const active = state.expansions[ex.id];
              const locked = ex.required;
              const bgId = { base: 'expansion_base', daybreak: 'expansion_daybreak', daybreak_bonus1: 'expansion_bonus1', bonus2: 'expansion_bonus2' }[ex.id] || '';
              return `
              <button class="wiz-exp ${active ? 'wiz-exp--active' : ''} ${locked ? 'wiz-exp--locked' : ''}"
                onclick="${locked ? '' : `toggleExpansion('${ex.id}')`}" ${locked ? 'disabled' : ''}
                style="background-image:url('${uiImgSrc(bgId)}')">
                <span class="wiz-exp__name">${ex.name}</span>
              </button>`;
            }).join('')}
          </div>
        </div>

        <div class="wiz__setting-group">
          <div class="wiz__setting-label">인원수</div>
          <div class="wiz__pc-row">
            ${sc.playerCounts.map(n => `
              <button class="wiz-pc ${state.playerCount === n ? 'wiz-pc--active' : ''}" onclick="selectPlayerCount(${n})">${n}</button>
            `).join('')}
          </div>
        </div>

        ${ready ? `
        <div class="wiz__ready">
          <div class="wiz__code" onclick="copyCode('${code}')" title="탭하여 복사">
            <span class="wiz__code-label">방 코드</span>
            <span class="wiz__code-value">${codeDisplay}</span>
          </div>
          <button class="btn btn--primary btn--full wiz__go" onclick="enterLobby('${code}')">로비 입장</button>
        </div>
        ` : ''}
      </div>
    </div>`;
}

// -- Join
function renderJoinHTML() {
  const recentRooms = loadRecentRooms();
  const recentHTML = recentRooms.length ? `
      <div class="recent-rooms">
        <div class="recent-rooms__title">최근 참가</div>
        ${recentRooms.map(r => {
          const decoded = decodeRoomCode(r.code);
          const sc = decoded ? SCENARIOS.find(s => s.id === decoded.scenarioId) : null;
          const label = sc ? `${sc.title} · ${decoded.playerCount}명` : '';
          return `
          <button class="recent-room" onclick="enterLobby('${r.code}')">
            <span class="recent-room__code">${r.code.match(/.{1,5}/g).join('-')}</span>
            <span class="recent-room__info">${label}</span>
            <span class="recent-room__time">${formatTimeAgo(r.time)}</span>
          </button>`;
        }).join('')}
      </div>` : '';

  return `
    <div class="wiz">
      <div class="wiz__bg" style="background-image:url('${uiImgSrc('bg_m_join')}')"></div>
      <div class="wiz__bg-overlay"></div>
      <button class="wiz__back" onclick="goHome()">← 돌아가기</button>
      <div class="wiz__panel wiz__panel--center">
        <h1 class="join__title">게임 참가</h1>
        <div class="join__input-group">
          <input class="join__input" id="codeInput" maxlength="22" placeholder="방 코드 입력" autocomplete="off" autofocus>
          <div class="join__error" id="joinError"></div>
        </div>
        <button class="btn btn--primary btn--full" style="max-width:280px;" onclick="submitJoin()">입장</button>
        ${recentHTML}
      </div>
    </div>`;
}

// -- Lobby
function renderLobbyHTML() {
  const config = resolveCurrentConfig();
  const scenario = SCENARIOS.find(s => s.id === config.scenarioId);
  const episode = scenario.episodes.find(e => e.id === config.episodeId);
  const variant = resolveVariant(config);
  const code = state.roomCode || encodeRoomCode(config.scenarioId, config.episodeId, config.playerCount, variant.deck);
  const roleCounts = countRoles(variant.deck);
  const centerCount = variant.deck.length - config.playerCount;
  const info = SCENARIO_SYNOPSIS[config.scenarioId] || {};
  const ingameBgSrc = episodeBgSrc(config.scenarioId, config.episodeId);

  const wakeOrder = variant.wakeOrder || [];
  const uniqueRoles = Object.keys(roleCounts);
  uniqueRoles.sort((a, b) => {
    const ia = wakeOrder.indexOf(a);
    const ib = wakeOrder.indexOf(b);
    return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
  });

  return `
    <div class="wiz wiz--lobby">
      <div class="wiz__bg wiz__bg--banner" style="background-image:url('${ingameBgSrc}')"></div>
      <div class="wiz__bg-overlay wiz__bg-overlay--banner"></div>
      <button class="wiz__back" onclick="goBackFromLobby()">← 나가기</button>

      <div class="wiz__panel">
        <div class="wiz__panel-header">
          <div class="wiz__hero-genre">${info.genre || ''}</div>
          <h1 class="wiz__hero-title">${scenario.title}</h1>
          <div class="wiz__hero-ep">${episode.title} · ${config.playerCount}명</div>
          <div class="lobby__code-pill" onclick="copyCode('${code}')" title="탭하여 복사">
            <span class="lobby__code-icon">🔗</span>
            <span class="lobby__code-text">${code.match(/.{1,5}/g).join('-')}</span>
          </div>
        </div>
        <!-- 재생 컨트롤 -->
        <div class="lobby__play-section">
          <button class="lobby__play-big" onclick="startPlayback()" style="background-image:url('${uiImgSrc('btn_play')}')">
            <span class="lobby__play-big-inner">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              밤 행동 시작
            </span>
          </button>
          <div class="lobby__delay">
            <span class="lobby__delay-label">간격</span>
            ${[0,3,5,10,15,20].map(s => `<button class="lobby__delay-btn ${state.actionDelay === s ? 'lobby__delay-btn--active' : ''}" onclick="setActionDelay(${s})">${s === 0 ? '없음' : s + '초'}</button>`).join('')}
          </div>
        </div>

        <!-- 확장팩 + 다시뽑기 -->
        <div class="lobby__reroll">
          <div class="lobby__exp-tags">
            ${EXPANSIONS.map(ex => {
              const active = state.expansions[ex.id];
              const locked = ex.required;
              return `<button class="lobby__exp-chip ${active ? 'lobby__exp-chip--on' : ''} ${locked ? 'lobby__exp-chip--locked' : ''}"
                onclick="${locked ? '' : `toggleExpansion('${ex.id}',true);rerollDeck()`}"
                ${locked ? 'disabled' : ''}>${ex.name}</button>`;
            }).join('')}
          </div>
          <button class="lobby__reroll-btn" onclick="rerollDeck()">🎲 다시 뽑기</button>
        </div>

        <!-- 덱 정보 -->
        <div class="lobby__deck-label">덱 ${variant.deck.length}장 · 플레이어 ${config.playerCount} + 센터 ${centerCount}</div>

        <!-- 역할 카드 그리드 -->
        <div class="role-icon-grid">
          ${uniqueRoles.map(roleId => {
            const role = ROLES[roleId] || { name: roleId, team: 'village', emoji: '❓', desc: '' };
            const count = roleCounts[roleId];
            const tm = TEAM_META[role.team] || TEAM_META.village;
            const wakeIdx = wakeOrder.indexOf(roleId);
            return `
              <button class="role-tile ${tm.css}" onclick="showRoleSheet('${roleId}')">
                ${wakeIdx !== -1 ? `<span class="role-tile__order">${wakeIdx + 1}</span>` : ''}
                ${count > 1 ? `<span class="role-tile__count">×${count}</span>` : ''}
                <img class="role-tile__icon" data-role="${roleId}" src="${roleIconSrc(roleId)}" alt="" loading="lazy">
                <span class="role-tile__name">${role.name}</span>
              </button>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// -- Playing overlay
function renderPlayingOverlayHTML() {
  const clip = state.playlist[state.playlistIndex] || {};
  const total = state.playlist.length;
  const current = state.playlistIndex + 1;
  const pct = Math.round((current / total) * 100);
  const config = resolveCurrentConfig();
  const bgSrc = episodeBgSrc(config.scenarioId, config.episodeId);

  return `
    <div class="playing-overlay">
      <div class="wiz__bg wiz__bg--banner" style="background-image:url('${bgSrc}')"></div>
      <div class="wiz__bg-overlay wiz__bg-overlay--banner"></div>

      <div class="play__hero">
        ${clip.roleId ? roleIconLg(clip.roleId, 'role-icon role-icon--xxl') : '<div class="play__moon-icon"></div>'}
        <div class="play__role-name">${clip.roleId ? (ROLES[clip.roleId]?.name || clip.roleId) : (clip.phase === 'opening' ? '오프닝' : '아웃트로')}</div>
        <div class="play__role-phase">${clip.phase === 'during' ? '눈을 뜨세요' : clip.phase === 'after' ? '눈을 감으세요' : ''}</div>
        <div class="play__role-label">${clip.label || ''}</div>
      </div>

      <div class="play__panel">
        <div class="play__progress">
          <div class="play__progress-bar"><div class="play__progress-fill" style="width:${pct}%"></div></div>
          <div class="play__progress-count">${current} / ${total}</div>
        </div>

        <div class="play__controls">
          <button class="play__ctrl-btn" onclick="skipToPrev()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          </button>
          <button class="play__ctrl-main" onclick="togglePause()">
            ${state.paused
              ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
              : '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>'}
          </button>
          <button class="play__ctrl-btn" onclick="skipToNext()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM4 18l8.5-6L4 6z"/></svg>
          </button>
        </div>

        <div class="play__bgm-row">
          <span class="play__bgm-label">BGM</span>
          <input type="range" min="0" max="100" value="${Math.round(bgmEl.volume * 100)}"
            class="play__bgm-slider"
            oninput="setBgmVolume(this.value/100); this.nextElementSibling.textContent=this.value+'%'" />
          <span class="play__bgm-val">${Math.round(bgmEl.volume * 100)}%</span>
        </div>

        <button class="play__exit-btn" onclick="stopPlayback()">나가기</button>
      </div>
    </div>`;
}

function renderPlayingOverlay() {
  const existing = document.querySelector('.playing-overlay');
  if (existing) {
    const clip = state.playlist[state.playlistIndex] || {};
    const total = state.playlist.length;
    const current = state.playlistIndex + 1;
    const pct = Math.round((current / total) * 100);

    const nameEl = existing.querySelector('.play__role-name');
    const phaseEl = existing.querySelector('.play__role-phase');
    const labelEl = existing.querySelector('.play__role-label');
    const fillEl = existing.querySelector('.play__progress-fill');
    const countEl = existing.querySelector('.play__progress-count');

    if (nameEl) nameEl.textContent = clip.roleId ? (ROLES[clip.roleId]?.name || clip.roleId) : (clip.phase === 'opening' ? '오프닝' : '아웃트로');
    if (phaseEl) phaseEl.textContent = clip.phase === 'during' ? '눈을 뜨세요' : clip.phase === 'after' ? '눈을 감으세요' : '';
    if (labelEl) labelEl.textContent = clip.label || '';
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (countEl) countEl.textContent = `${current} / ${total}`;

    // 역할 아이콘 교체
    const heroEl = existing.querySelector('.play__hero');
    if (heroEl) {
      const oldIcon = heroEl.querySelector('.role-icon--xxl, .play__moon-icon');
      if (oldIcon && clip.roleId) {
        const newImg = document.createElement('img');
        newImg.className = 'role-icon role-icon--xxl';
        newImg.dataset.role = clip.roleId;
        newImg.src = roleIconSrc(clip.roleId);
        newImg.loading = 'lazy';
        oldIcon.replaceWith(newImg);
      }
    }

    const pauseBtn = existing.querySelector('.play__ctrl-main');
    if (pauseBtn) {
      pauseBtn.innerHTML = state.paused
        ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
        : '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>';
    }
  }
}

// ===== NAVIGATION =====
function goHome() {
  state.screen = 'home';
  state.scenarioIdx = null;
  state.episodeIdx = null;
  state.playerCount = null;
  state.roomCode = null;
  state.deck = null;
  clearGameSession();
  try { history.replaceState(null, '', location.pathname); } catch {}
  render();
}

function goBackFromLobby() {
  if (state.scenarioIdx !== null) {
    // 호스트: 인원 선택 화면(setup step 3)으로 복귀
    state.screen = 'setup';
    state.playerCount = null;
    state.deck = null;
    state.roomCode = null;
    try { history.replaceState(null, '', location.pathname); } catch {}
    render();
  } else {
    // 참가자: 게임 참가 페이지로 복귀
    state.roomCode = null;
    try { history.replaceState(null, '', location.pathname); } catch {}
    goJoin();
  }
}

function goSetup() {
  state.screen = 'setup';
  state.scenarioIdx = null;
  state.episodeIdx = null;
  state.playerCount = null;
  state.deck = null;
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
  const sc = SCENARIOS[state.scenarioIdx];
  const ep = sc.episodes[state.episodeIdx];
  state.deck = generateRandomDeck(n, sc.id);
  const code = encodeRoomCode(sc.id, ep.id, n, state.deck);
  enterLobby(code);
}

// ===== RECENT ROOMS (localStorage) =====
const RECENT_ROOMS_KEY = 'onw_recent_rooms';
const MAX_RECENT_ROOMS = 5;

function loadRecentRooms() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_ROOMS_KEY)) || [];
  } catch { return []; }
}

function saveRecentRoom(code) {
  const rooms = loadRecentRooms().filter(r => r.code !== code);
  rooms.unshift({ code, time: Date.now() });
  if (rooms.length > MAX_RECENT_ROOMS) rooms.length = MAX_RECENT_ROOMS;
  localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(rooms));
}

function formatTimeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function enterLobby(code) {
  saveRecentRoom(code);
  state.roomCode = code;
  state.screen = 'lobby';
  // Update URL with room code for shareable link
  try { history.replaceState(null, '', '?room=' + encodeURIComponent(code)); } catch {}
  render();
}

function submitJoin() {
  const input = document.getElementById('codeInput');
  const errorEl = document.getElementById('joinError');
  if (!input) return;
  const raw = input.value.trim();
  // Support pasting full URL: extract room= param
  let code = raw;
  try { const u = new URL(raw); code = u.searchParams.get('room') || raw; } catch {}
  const decoded = decodeRoomCode(code);
  if (!decoded) {
    if (errorEl) errorEl.textContent = '유효하지 않은 코드입니다';
    return;
  }
  enterLobby(code);
}

function setActionDelay(seconds) {
  state.actionDelay = seconds;
  try { localStorage.setItem('onw_action_delay', String(seconds)); } catch {}
  render();
}

function rerollDeck() {
  const config = resolveCurrentConfig();
  const deck = generateRandomDeck(config.playerCount, config.scenarioId);
  const code = encodeRoomCode(config.scenarioId, config.episodeId, config.playerCount, deck);
  state.roomCode = code;
  render();
}

function copyCode(code) {
  // Build shareable URL with room code
  const url = location.origin + location.pathname + '?room=' + encodeURIComponent(code);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast('링크 복사됨!'));
  } else {
    showToast(code);
  }
}

// ===== TAB BAR =====
function renderTabBarHTML() {
  const tabs = [
    { id: 'ingame',   label: '인게임', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1zM7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm5 1a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 2a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>' },
    { id: 'codex',    label: '도감',   icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>' },
    { id: 'rulebook', label: '롤북',   icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>' },
  ];
  return `
    <nav class="tab-bar">
      ${tabs.map(t => `
        <button class="tab-bar__item ${state.activeTab === t.id ? 'tab-bar__item--active' : ''}"
          onclick="switchTab('${t.id}')">
          <span class="tab-bar__icon">${t.icon}</span>
          <span class="tab-bar__label">${t.label}</span>
        </button>
      `).join('')}
    </nav>`;
}

function switchTab(tabId) {
  if (state.activeTab === tabId) return;
  state.activeTab = tabId;
  if (tabId === 'rulebook' && !state.wikiIndex) {
    loadWikiIndex();
    return;
  }
  render();
  const app = document.getElementById('app');
  if (app) app.scrollTop = 0;
}

// ===== CODEX (도감) =====
function renderCodexHTML() {
  const groups = EXPANSIONS.map(exp => ({
    ...exp,
    roles: ROLE_IDS.filter(id => ROLES[id].expansion === exp.id)
  }));

  return `
    <div class="codex">
      <div class="codex__hero">
        <h1 class="codex__title">역할 도감</h1>
        <p class="codex__subtitle">전체 ${ROLE_IDS.length}개 역할 · 탭하여 상세 보기</p>
      </div>
      <div class="codex__content">
        ${groups.map(g => `
          <div class="codex__group">
            <div class="codex__group-header">
              <div class="codex__group-title">${g.name}</div>
              <div class="codex__group-desc">${g.desc} · ${g.roles.length}개 역할</div>
            </div>
            <div class="role-icon-grid">
              ${g.roles.map(id => {
                const role = ROLES[id];
                const tm = TEAM_META[role.team] || TEAM_META.village;
                const wakeIdx = NIGHT_ORDER.indexOf(id);
                return `
                  <button class="role-tile ${tm.css}" onclick="showRoleSheet('${id}')">
                    ${wakeIdx !== -1 ? `<span class="role-tile__order">${wakeIdx + 1}</span>` : ''}
                    <img class="role-tile__icon" data-role="${id}" src="${roleIconSrc(id)}" alt="" loading="lazy">
                    <span class="role-tile__name">${role.name}</span>
                  </button>`;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

// -- Role bottom sheet (도감에서 탭 시 바텀시트로 상세 표시)
function showRoleSheet(roleId) {
  // Remove existing sheet
  closeRoleSheet();

  const role = ROLES[roleId];
  const tm = TEAM_META[role.team] || TEAM_META.village;
  const wakeIdx = NIGHT_ORDER.indexOf(roleId);

  const sheet = document.createElement('div');
  sheet.className = 'role-sheet';
  sheet.setAttribute('onclick', 'if(event.target===this)closeRoleSheet()');

  const cached = state.wikiCache[roleId];
  const heroHTML = `<div class="wiki-role-hero">
    <img class="wiki-role-hero__img" src="${roleIconSrc(roleId)}" alt="" loading="lazy" onerror="this.style.display='none'">
    <div class="wiki-role-hero__info">
      <div class="wiki-role-hero__name">${role.name}</div>
      <div class="wiki-role-hero__team ${tm.css}">${tm.label} · 밤 순서 ${wakeIdx !== -1 ? (wakeIdx + 1) + '번째' : '없음'}</div>
    </div>
  </div>`;
  const bodyHTML = cached
    ? `${heroHTML}<div class="wiki__page-content">${injectRoleIllustrations(parseMarkdown(cached).replace(/<h1[^>]*>.*?<\/h1>/, ''), roleId)}</div>`
    : `<div class="role-sheet__preview">
        <div class="role-sheet__hero">
          ${roleIconLg(roleId, 'role-icon role-icon--hero')}
          <div class="role-sheet__name">${role.name}</div>
          <div class="role-sheet__team-label ${tm.css}">${tm.label} · 밤 순서 ${wakeIdx !== -1 ? (wakeIdx + 1) + '번째' : '없음'}</div>
        </div>
        <div class="role-sheet__desc">${highlightDesc(roleId, role.desc)}</div>
        <div class="wiki__loading">상세 내용 불러오는 중...</div>
      </div>`;

  sheet.innerHTML = `
    <div class="role-sheet__panel">
      <div class="role-sheet__handle"></div>
      <div class="role-sheet__scroll" id="roleSheetScroll">${bodyHTML}</div>
      <div class="role-sheet__actions">
        <button class="btn btn--ghost role-sheet__close-btn" onclick="closeRoleSheet()">닫기</button>
        <button class="btn btn--primary role-sheet__wiki-btn" onclick="closeRoleSheet();openWikiRole('${roleId}')">위키 페이지 보기 →</button>
      </div>
    </div>`;

  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('role-sheet--open'));

  // Load full wiki content if not cached
  if (!cached) {
    fetch(`./assets/wiki/${roleId}.md`)
      .then(r => r.ok ? r.text() : Promise.reject())
      .then(md => {
        state.wikiCache[roleId] = md;
        const scroll = document.getElementById('roleSheetScroll');
        if (scroll) scroll.innerHTML = `${heroHTML}<div class="wiki__page-content">${injectRoleIllustrations(parseMarkdown(md).replace(/<h1[^>]*>.*?<\/h1>/, ''), roleId)}</div>`;
      })
      .catch(() => {});
  }

  // Swipe down to close
  _attachSheetSwipe(sheet);
}

function closeRoleSheet() {
  const sheet = document.querySelector('.role-sheet');
  if (!sheet) return;
  sheet.classList.remove('role-sheet--open');
  sheet.classList.add('role-sheet--closing');
  setTimeout(() => sheet.remove(), 250);
}

function _attachSheetSwipe(sheet) {
  const panel = sheet.querySelector('.role-sheet__panel');
  let startY = 0, currentY = 0, dragging = false;
  panel.addEventListener('touchstart', e => {
    const scroll = document.getElementById('roleSheetScroll');
    if (scroll && scroll.scrollTop > 5) return; // only swipe down when at top
    startY = e.touches[0].clientY;
    dragging = true;
  }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (!dragging) return;
    currentY = e.touches[0].clientY - startY;
    if (currentY > 0) panel.style.transform = `translateY(${currentY}px)`;
  }, { passive: true });
  panel.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    if (currentY > 100) { closeRoleSheet(); }
    else { panel.style.transform = ''; }
    currentY = 0;
  });
}

function openWikiRole(roleId) {
  state.activeTab = 'rulebook';
  state.wikiPage = roleId;
  if (!state.wikiIndex) {
    loadWikiIndex().then(() => loadWikiPage(roleId));
    return;
  }
  loadWikiPage(roleId);
}

// ===== RULEBOOK (롤북) =====
function renderRulebookHTML() {
  if (state.wikiPage && state.wikiCache[state.wikiPage]) {
    return renderWikiPageHTML();
  }
  return renderWikiIndexHTML();
}

function renderWikiIndexHTML() {
  const idx = state.wikiIndex;
  if (!idx) {
    return `
      <div class="wiki">
        <div class="wiki__header">
          <h1 class="wiki__title">롤북</h1>
        </div>
        <div class="wiki__loading">불러오는 중...</div>
      </div>`;
  }

  return `
    <div class="wiki">
      <div class="codex__hero">
        <h1 class="wiki__title">롤북</h1>
        <p class="wiki__subtitle">게임 규칙 가이드</p>
      </div>
      <div class="wiki__index">
        ${idx.categories.map(cat => `
          <div class="wiki__category">
            <div class="wiki__card-grid">
              ${cat.pages.map(p => {
                const pageBgMap = {
                  game_overview: 'bg_m_home',
                  game_setup: 'bg_m_setup',
                  night_phase: 'bg_m_night',
                  day_phase: 'bg_m_day',
                  victory: 'bg_m_vote',
                  special_rules: 'bg_m_lobby',
                };
                const bg = pageBgMap[p.id];
                const bgSrc = bg ? uiImgSrc(bg) : imgPath('rules', `banner_${p.id}`);
                return `
                <button class="wiki__page-card" onclick="openWikiPage('${p.id}')">
                  <img class="wiki__page-card-img" src="${bgSrc}" alt="" loading="lazy">
                  <div class="wiki__page-card-fade"></div>
                  <div class="wiki__page-card-body">
                    <span class="wiki__page-card-title">${p.title}</span>
                    <span class="wiki__page-card-desc">${p.desc}</span>
                  </div>
                </button>`;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

// 규칙 페이지용 삽화 맵
const RULES_ILLUST_MAP = {
  game_overview: ['overview_factions', 'overview_appeal'],
  game_setup: ['setup_cards', 'setup_app'],
  night_phase: ['night_wake', 'night_action'],
  day_phase: ['day_debate', 'day_vote'],
  victory: ['victory_village', 'victory_wolf'],
  special_rules: ['special_doppelganger', 'special_no_wolf'],
};

function injectRulesIllustrations(html, pageId) {
  const illustrations = RULES_ILLUST_MAP[pageId] || [];
  if (!illustrations.length) return html;

  const closePPositions = [];
  const pClosePattern = /<\/p>/g;
  let match;
  while ((match = pClosePattern.exec(html)) !== null) {
    closePPositions.push(match.index + match[0].length);
  }
  const totalP = closePPositions.length;
  const count = Math.min(illustrations.length, totalP - 1);
  if (count <= 0) return html;

  const step = Math.max(1, Math.floor((totalP - 1) / (count + 1)));
  const insertPositions = [];
  for (let i = 0; i < count; i++) {
    insertPositions.push(closePPositions[Math.min(step * (i + 1), totalP - 1)]);
  }

  for (let i = insertPositions.length - 1; i >= 0; i--) {
    const pos = insertPositions[i];
    const imgTag = `<div class="wiki-illust"><img src="${imgPath('rules', illustrations[i])}" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>`;
    html = html.slice(0, pos) + imgTag + html.slice(pos);
  }
  return html;
}

// 규칙 페이지 제목 매핑
const RULES_PAGE_TITLES = {
  game_overview: '게임 소개',
  game_setup: '게임 준비',
  night_phase: '밤 단계',
  day_phase: '낮 토론 & 투표',
  victory: '승리 조건',
  special_rules: '특수 규칙',
};

function renderWikiPageHTML() {
  const pageId = state.wikiPage;
  const content = state.wikiCache[pageId] || '';
  const isError = content.includes('# 연결 오류');
  let html = parseMarkdown(content);

  // 첫 h2(페이지 제목) 제거 + "목차" h2와 바로 뒤 ul 제거 — 배너가 대체
  html = html.replace(/<h2[^>]*>.*?<\/h2>/, ''); // 첫 h2(제목)
  html = html.replace(/<h2[^>]*>\s*목차\s*<\/h2>\s*<ul>[\s\S]*?<\/ul>/, ''); // 목차 h2 + ul 통째 제거

  // 배너 이미지: ui 이미지 우선, 없으면 rules 배너 폴백
  const PAGE_BANNER_MAP = {
    game_overview: 'bg_m_home',
    game_setup: 'bg_m_setup',
    night_phase: 'bg_m_night',
    day_phase: 'bg_m_day',
    victory: 'bg_m_vote',
    special_rules: 'bg_m_lobby',
  };
  const uiBanner = PAGE_BANNER_MAP[pageId];
  const bannerSrc = uiBanner ? uiImgSrc(uiBanner) : imgPath('rules', `banner_${pageId}`);
  const pageTitle = RULES_PAGE_TITLES[pageId] || pageId;
  const bannerHTML = `
    <div class="wiki-page-banner">
      <img class="wiki-page-banner__img" src="${bannerSrc}" alt="" loading="lazy" onerror="this.closest('.wiki-page-banner').classList.add('wiki-page-banner--no-img')">
      <div class="wiki-page-banner__fade"></div>
      <div class="wiki-page-banner__title">
        <button class="wiki-page-banner__back" onclick="backToWikiIndex()">← 목록</button>
        <h1>${pageTitle}</h1>
      </div>
    </div>`;

  // 삽화 주입
  html = injectRulesIllustrations(html, pageId);

  return `
    <div class="wiki wiki--page">
      ${bannerHTML}
      <div class="wiki__page-content">${html}
        ${isError ? `<button class="btn btn--primary btn--full" style="margin-top:16px" onclick="delete state.wikiCache['${pageId}'];loadWikiPage('${pageId}')">다시 시도</button>` : ''}
      </div>
      <div class="wiki__bottom-nav">
        <button class="wiki__nav-btn wiki__nav-btn--back" onclick="backToWikiIndex()">← 목록으로</button>
        <button class="wiki__nav-btn wiki__nav-btn--top" onclick="scrollAppTop()">↑ 맨 위</button>
      </div>
    </div>`;
}

function scrollAppTop() {
  const app = document.getElementById('app');
  if (app) app.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToWikiIndex() {
  state.wikiPage = null;
  render();
  const app = document.getElementById('app');
  if (app) app.scrollTop = 0;
}

function openWikiPage(pageId) {
  state.wikiPage = pageId;
  if (state.wikiCache[pageId]) {
    render();
    const app = document.getElementById('app');
    if (app) app.scrollTop = 0;
    return;
  }
  loadWikiPage(pageId);
}

async function loadWikiIndex(_retry) {
  try {
    const resp = await fetch('./assets/wiki/_index.json');
    if (!resp.ok) throw new Error('index not found');
    state.wikiIndex = await resp.json();
  } catch (e) {
    if (!_retry) { setTimeout(() => loadWikiIndex(true), 1500); return; }
    console.warn('Wiki index load failed:', e);
    state.wikiIndex = { categories: [] };
  }
  render();
}

async function loadWikiPage(pageId, _retry) {
  try {
    const resp = await fetch(`./assets/wiki/${pageId}.md`);
    if (!resp.ok) throw new Error('page not found');
    state.wikiCache[pageId] = await resp.text();
  } catch (e) {
    if (!_retry) { setTimeout(() => loadWikiPage(pageId, true), 1500); return; }
    console.warn('Wiki page load failed:', e);
    state.wikiCache[pageId] = `# 연결 오류\n\n페이지를 불러올 수 없습니다. 네트워크 상태를 확인해주세요.\n\n다시 시도하려면 아래 버튼을 눌러주세요.`;
  }
  render();
  const app = document.getElementById('app');
  if (app) app.scrollTop = 0;
}

// ===== MARKDOWN PARSER =====
function parseMarkdown(md) {
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  let inCode = false;
  let inTable = false;
  let tableHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trimStart().startsWith('```')) {
      if (inCode) { html += '</code></pre>'; inCode = false; }
      else { if (inList) { html += '</ul>'; inList = false; } inCode = true; html += '<pre><code>'; }
      continue;
    }
    if (inCode) { html += _escHtml(line) + '\n'; continue; }

    // Table rows
    if (line.includes('|') && line.trim().startsWith('|')) {
      if (inList) { html += '</ul>'; inList = false; }
      const cells = line.split('|').filter((_, ci, arr) => ci > 0 && ci < arr.length - 1).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) { tableHeader = false; continue; }
      if (!inTable) { html += '<table>'; inTable = true; tableHeader = true; }
      const tag = tableHeader ? 'th' : 'td';
      html += '<tr>' + cells.map(c => `<${tag}>${_inlineMd(c)}</${tag}>`).join('') + '</tr>';
      continue;
    }
    if (inTable) { html += '</table>'; inTable = false; }

    // Close list if needed
    if (inList && !line.startsWith('- ') && !line.startsWith('* ') && line.trim() !== '') {
      html += '</ul>'; inList = false;
    }

    // Headers (with anchor IDs) — h6~h1 순서로 매칭 (긴 것 먼저)
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const t = hMatch[2];
      const id = _slugify(t);
      html += `<h${level} id="${id}">${_inlineMd(t)}</h${level}>`;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<blockquote>${_inlineMd(line.slice(2))}</blockquote>`;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { html += '<hr>'; continue; }

    // List items
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${_inlineMd(line.slice(2))}</li>`;
      continue;
    }

    // Empty line
    if (line.trim() === '') continue;

    // Paragraph
    html += `<p>${_inlineMd(line)}</p>`;
  }

  if (inList)  html += '</ul>';
  if (inCode)  html += '</code></pre>';
  if (inTable) html += '</table>';

  return html;
}

// 역할 MD에 삽화를 자동 삽입. h2 섹션 앞에 해당 역할의 삽화를 배치.
function injectRoleIllustrations(html, roleId) {
  if (!roleId || !ROLES[roleId]) return html;
  // 삽화 ID 매핑: role_illustrations에서 해당 역할의 이미지들
  const ILLUST_MAP = {
    werewolf: ['werewolf_hunt', 'werewolf_lone', 'werewolf_accused'],
    seer: ['seer_vision', 'seer_choice', 'seer_testimony'],
    robber: ['robber_swap', 'robber_identity', 'robber_bluff'],
    minion: ['minion_devotion', 'minion_sacrifice', 'minion_deception'],
    mason: ['mason_bond', 'mason_alibi', 'mason_suspicion'],
    troublemaker: ['troublemaker_chaos', 'troublemaker_confusion', 'troublemaker_reveal'],
    tanner: ['tanner_despair', 'tanner_provocation', 'tanner_victory'],
    drunk: ['drunk_stumble', 'drunk_morning', 'drunk_accusation'],
    hunter: ['hunter_revenge', 'hunter_dilemma', 'hunter_bluff'],
    insomniac: ['insomniac_watch', 'insomniac_changed', 'insomniac_testimony'],
    doppelganger: ['doppelganger_mirror', 'doppelganger_act', 'doppelganger_crisis'],
    witch: ['witch_potion', 'witch_swap', 'witch_innocent'],
    alpha_wolf: ['alpha_wolf_convert', 'alpha_wolf_throne', 'alpha_wolf_strategy'],
    mystic_wolf: ['mystic_wolf_peek', 'mystic_wolf_info', 'mystic_wolf_alibi'],
    dream_wolf: ['dream_wolf_sleep', 'dream_wolf_vulnerability', 'dream_wolf_waking'],
    apprentice_seer: ['apprentice_seer_study', 'apprentice_seer_growth', 'apprentice_seer_testimony'],
    paranormal_investigator: ['paranormal_investigator_search', 'paranormal_investigator_convert', 'paranormal_investigator_stop'],
    village_idiot: ['village_idiot_shift', 'village_idiot_chaos', 'village_idiot_strategy'],
    revealer: ['revealer_expose', 'revealer_cover', 'revealer_impact'],
    aura_seer: ['aura_seer_sense', 'aura_seer_map', 'aura_seer_deduction'],
    prince: ['prince_immunity', 'prince_burden', 'prince_suspicion'],
    cursed: ['cursed_transformation', 'cursed_unaware', 'cursed_reveal'],
    apprentice_tanner: ['apprentice_tanner_shadow', 'apprentice_tanner_loyalty', 'apprentice_tanner_alone'],
    thing: ['thing_touch', 'thing_signal', 'thing_mystery'],
    squire: ['squire_loyalty', 'squire_shield', 'squire_intelligence'],
    beholder: ['beholder_watch', 'beholder_protect', 'beholder_confirm'],
    villager: [],
  };
  const illustrations = ILLUST_MAP[roleId] || [];
  if (!illustrations.length) return html;

  // </p> 닫는 태그 위치를 모두 수집
  const closePPositions = [];
  const pClosePattern = /<\/p>/g;
  let match;
  while ((match = pClosePattern.exec(html)) !== null) {
    closePPositions.push(match.index + match[0].length);
  }
  if (!closePPositions.length) return html;

  // 삽화를 문단 사이에 균등 배치
  // 전체 문단 수에서 균등 간격으로 삽입 위치 결정
  const totalP = closePPositions.length;
  const count = Math.min(illustrations.length, totalP - 1); // 마지막 문단 뒤는 제외
  if (count <= 0) return html;

  // 삽입 위치: 첫 문단은 건너뛰고, 이후 균등 분배
  const step = Math.max(1, Math.floor((totalP - 1) / (count + 1)));
  const insertPositions = [];
  for (let i = 0; i < count; i++) {
    const pIdx = Math.min(step * (i + 1), totalP - 1);
    insertPositions.push(closePPositions[pIdx]);
  }

  // 뒤에서부터 삽입 (offset 계산 불필요)
  for (let i = insertPositions.length - 1; i >= 0; i--) {
    const pos = insertPositions[i];
    const imgTag = `<div class="wiki-illust"><img src="${imgPath('illustrations', illustrations[i])}" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>`;
    html = html.slice(0, pos) + imgTag + html.slice(pos);
  }

  return html;
}

function _inlineMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="inline">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_, label, href) => {
      // Wiki internal link: (xxx.md) or (xxx.md#anchor)
      if (href.endsWith('.md') || href.includes('.md#')) {
        const [file, anchor] = href.replace('.md', '').split('#');
        // 역할 MD이면 인라인 아이콘 추가
        const inlineIcon = ROLES[file] ? `<img class="wiki-role-icon" src="${roleIconSrc(file)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
        return `${inlineIcon}<a href="javascript:void(0)" onclick="openWikiPage('${file}'${anchor ? `);setTimeout(()=>{const e=document.getElementById('${anchor}');if(e)e.scrollIntoView({behavior:'smooth'})},200` : ''})\" class="wiki-link">${label}</a>`;
      }
      if (href.startsWith('#')) {
        return `<a href="javascript:void(0)" onclick="document.getElementById('${href.slice(1)}')?.scrollIntoView({behavior:'smooth'})" class="wiki-link">${label}</a>`;
      }
      return `<a href="${href}" target="_blank">${label}</a>`;
    });
}

function _slugify(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎ\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
}

function _escHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Load scenario index before anything else
  await loadScenarioIndex();

  // Try to restore an active game session (e.g. after mobile tab kill / screen lock)
  const savedSession = loadGameSession();
  if (savedSession) {
    try {
      const restored = await restoreGameSession(savedSession);
      if (restored) {
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && state.screen === 'join') submitJoin();
        });
        return;
      }
    } catch { clearGameSession(); }
  }

  // Auto-join if URL has ?room= parameter
  try {
    const params = new URLSearchParams(location.search);
    const roomParam = (params.get('room') || '').trim();
    if (roomParam && decodeRoomCode(roomParam)) {
      enterLobby(roomParam);
      return;
    }
  } catch {}

  render();

  // Enter key in join input
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state.screen === 'join') {
      submitJoin();
    }
  });
});
