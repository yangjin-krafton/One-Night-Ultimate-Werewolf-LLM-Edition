/* ============================================================
   한밤의 늑대인간 LLM Edition — Static Narration Player
   서버 없이 동작하는 정적 나레이션 + 역할 레퍼런스 앱
   ============================================================ */

// ===== ROLE DATA =====
// Teams: village, wolf, tanner, vampire, alien
const TEAM_META = {
  village: { label: '마을 팀',     css: 'role-card--village' },
  wolf:    { label: '늑대 팀',     css: 'role-card--wolf' },
  tanner:  { label: '독립 (무두장이)', css: 'role-card--tanner' },
  vampire: { label: '뱀파이어 팀', css: 'role-card--vampire' },
  alien:   { label: '에일리언 팀', css: 'role-card--alien' },
};

const ROLES = {
  // ── 기본판 ──
  doppelganger:            { name: '도플갱어',       team: 'village', emoji: '🪞', desc: '다른 플레이어 1명의 카드를 보고 그 역할을 복제합니다. 복제한 역할의 팀에 속하며, 역할에 따라 즉시 행동하거나 해당 순서에 다시 행동합니다.', expansion: 'base' },
  werewolf:                { name: '늑대인간',       team: 'wolf',    emoji: '🐺', desc: '밤에 눈을 떠서 다른 늑대인간을 확인합니다. 혼자라면 센터 카드 1장을 볼 수 있습니다. 하수인 행동 시 눈을 감은 채 엄지를 올려 자신을 알립니다.', expansion: 'base' },
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
  sentinel:                { name: '경비병',         team: 'village', emoji: '🛡️', desc: '밤에 플레이어 1명의 카드에 방패 토큰을 놓습니다. 방패를 받은 플레이어의 카드는 다른 사람이 보거나 옮길 수 없습니다.', expansion: 'daybreak' },
  alpha_wolf:              { name: '태초의 늑대인간', team: 'wolf',   emoji: '🐺‍', desc: '늑대인간처럼 동료를 확인합니다. 추가로 센터 카드 1장을 비늑대 플레이어 카드와 교환해 새 늑대인간을 만들 수 있습니다.', expansion: 'daybreak' },
  mystic_wolf:             { name: '신비한 늑대인간', team: 'wolf',   emoji: '🔮🐺', desc: '늑대인간처럼 동료를 확인한 뒤, 다른 플레이어 1명의 카드를 몰래 볼 수 있습니다.', expansion: 'daybreak' },
  dream_wolf:              { name: '잠자는 늑대인간', team: 'wolf',   emoji: '💤🐺', desc: '늑대 팀이지만 밤에 눈을 뜨지 않습니다. 다른 늑대는 잠자는 늑대인간의 존재를 확인할 수 있습니다.', expansion: 'daybreak' },
  apprentice_seer:         { name: '견습 예언자',    team: 'village', emoji: '🔮✨', desc: '밤에 센터 카드 1장만 확인할 수 있습니다. 예언자의 약화 버전입니다.', expansion: 'daybreak' },
  paranormal_investigator: { name: '심령 수사관',    team: 'village', emoji: '🕵️', desc: '플레이어 카드를 최대 2장까지 차례로 확인합니다. 늑대인간이나 무두장이를 보면 즉시 그 팀에 합류하고 확인을 멈춥니다.', expansion: 'daybreak' },
  witch:                   { name: '마녀',           team: 'village', emoji: '🧙', desc: '밤에 센터 카드 1장을 확인합니다. 원한다면 그 카드를 다른 플레이어 카드와 바꿔야 합니다.', expansion: 'daybreak' },
  village_idiot:           { name: '동네 얼간이',    team: 'village', emoji: '🤪', desc: '자신을 제외한 모든 플레이어의 카드를 왼쪽 또는 오른쪽으로 한 칸씩 이동시킬 수 있습니다.', expansion: 'daybreak' },
  revealer:                { name: '계시자',         team: 'village', emoji: '👁️', desc: '플레이어 1명의 카드를 뒤집어 공개합니다. 늑대인간이나 무두장이면 다시 덮습니다.', expansion: 'daybreak' },
  curator:                 { name: '유물 관리자',    team: 'village', emoji: '🏺', desc: '밤에 플레이어 1명에게 유물 토큰을 놓습니다. 유물 효과로 역할이나 승리 조건이 바뀔 수 있습니다.', expansion: 'daybreak' },
  bodyguard:               { name: '호위병',         team: 'village', emoji: '💪', desc: '자신이 투표한 사람은 죽지 않습니다. 최다 득표자가 보호 대상이면 다음 득표자가 대신 죽습니다.', expansion: 'daybreak' },

  // ── 데이브레이크 보너스팩 1 ──
  aura_seer:               { name: '영기 예언자',    team: 'village', emoji: '✨🔮', desc: '밤 동안 카드를 이동하거나 확인한 플레이어가 누구인지 감지합니다.', expansion: 'daybreak_bonus1' },
  prince:                  { name: '왕자',           team: 'village', emoji: '👑', desc: '투표로 죽지 않습니다. 최다 득표를 받아도 생존하며, 다음 득표자가 대신 죽습니다.', expansion: 'daybreak_bonus1' },
  cursed:                  { name: '저주받은 자',    team: 'village', emoji: '🌑', desc: '예언자나 견습 예언자가 이 카드를 보면 늑대인간으로 변합니다.', expansion: 'daybreak_bonus1' },

  // ── 보너스팩 2 ──
  apprentice_tanner:       { name: '견습 무두장이',  team: 'tanner',  emoji: '💀✨', desc: '무두장이가 죽으면 함께 승리합니다. 무두장이가 없으면 마을 팀으로 행동합니다.', expansion: 'bonus2' },
  thing:                   { name: '어떤것',         team: 'village', emoji: '👆', desc: '밤에 바로 옆 사람의 어깨를 톡 쳐서 자신의 존재를 알립니다.', expansion: 'bonus2' },
  squire:                  { name: '종자',           team: 'wolf',    emoji: '🛡️🐺', desc: '늑대인간이 누구인지 확인할 수 있는 늑대 팀 보조 역할입니다. 하수인과 비슷하지만 별도로 행동합니다.', expansion: 'bonus2' },
  beholder:                { name: '주시자',         team: 'village', emoji: '👀', desc: '예언자가 누구인지 확인합니다. 예언자의 정체를 아는 마을 보조 역할입니다.', expansion: 'bonus2' },

  // ── 뱀파이어 확장 ──
  copycat:                 { name: '카피캣',         team: 'village', emoji: '🐱', desc: '황혼에 센터 카드 1장을 보고 그 역할이 됩니다. 밤 행동이 있는 역할이면 해당 순서에 다시 행동합니다.', expansion: 'vampire' },
  vampire:                 { name: '뱀파이어',       team: 'vampire', emoji: '🧛', desc: '다른 뱀파이어를 확인하고, 뱀파이어가 아닌 사람 1명에게 뱀파이어 표식을 줘서 뱀파이어 팀으로 만듭니다.', expansion: 'vampire' },
  the_count:               { name: '백작',           team: 'vampire', emoji: '🧛‍♂️', desc: '공포의 표식을 줘서 대상의 밤 행동을 막을 수 있습니다.', expansion: 'vampire' },
  renfield:                { name: '랜필드',         team: 'vampire', emoji: '🦇', desc: '뱀파이어 팀 보조 역할입니다. 뱀파이어가 표식을 준 대상을 확인할 수 있습니다.', expansion: 'vampire' },
  diseased:                { name: '감염자',         team: 'village', emoji: '🤒', desc: '옆 사람에게 질병의 표식을 줍니다. 질병 표식은 투표 패배 조건에 영향을 줍니다.', expansion: 'vampire' },
  cupid:                   { name: '큐피트',         team: 'village', emoji: '💘', desc: '두 사람에게 사랑의 표식을 줍니다. 한 명이 죽으면 다른 한 명도 함께 죽습니다.', expansion: 'vampire' },
  instigator:              { name: '선동가',         team: 'village', emoji: '📢', desc: '배신의 표식을 줍니다. 표식을 받은 사람의 승리 조건이 뒤바뀝니다.', expansion: 'vampire' },
  priest:                  { name: '성직자',         team: 'village', emoji: '⛪', desc: '결백의 표식으로 다른 나쁜 표식을 정화합니다.', expansion: 'vampire' },
  assassin:                { name: '암살자',         team: 'village', emoji: '🗡️💀', desc: '암살 표식을 줍니다. 표식을 받은 사람이 죽으면 암살자가 승리하는 독립 승리 조건입니다.', expansion: 'vampire' },
  apprentice_assassin:     { name: '견습 암살자',    team: 'village', emoji: '🗡️✨', desc: '암살자와 함께 행동합니다. 암살자가 없으면 일반 마을 주민처럼 행동합니다.', expansion: 'vampire' },
  marksman:                { name: '저격수',         team: 'village', emoji: '🎯', desc: '카드와 표식을 각각 확인할 수 있습니다. 황혼과 밤에 각각 행동합니다.', expansion: 'vampire' },
  pickpocket:              { name: '소매치기',       team: 'village', emoji: '🤏', desc: '다른 플레이어와 표식을 바꾸고, 가져온 표식을 확인합니다.', expansion: 'vampire' },
  gremlin:                 { name: '그렘린',         team: 'village', emoji: '👺', desc: '다른 플레이어의 카드 또는 표식을 뒤섞을 수 있습니다.', expansion: 'vampire' },
  vampire_lord:            { name: '뱀파이어 군주',  team: 'vampire', emoji: '🧛👑', desc: '뱀파이어입니다. 뱀파이어가 최다 득표자인 특정 투표 상황에서 죽지 않습니다.', expansion: 'vampire' },

  // ── 에일리언 확장 ──
  oracle:                  { name: '오라클',         team: 'village', emoji: '🌀', desc: '앱의 질문에 답하고, 결과를 앱이 처리합니다. 답에 따라 다른 정보를 얻습니다.', expansion: 'alien' },
  alien:                   { name: '에일리언',       team: 'alien',   emoji: '👽', desc: '다른 에일리언을 확인하고 앱 지시를 수행합니다. 에일리언 팀으로 행동합니다.', expansion: 'alien' },
  synthetic_alien:         { name: '인조 외계인',    team: 'village', emoji: '🤖👽', desc: '에일리언처럼 눈을 뜨지만 에일리언 팀이 아닙니다. 별도의 승리 조건을 가집니다.', expansion: 'alien' },
  cow:                     { name: '소',             team: 'village', emoji: '🐄', desc: '양옆에 에일리언이 있는지 신호로 확인합니다. 에일리언 탐지 보조 역할입니다.', expansion: 'alien' },
  groob:                   { name: '그루브',         team: 'alien',   emoji: '👾', desc: '제르브와 함께 있을 때 특수 승리 조건을 가집니다.', expansion: 'alien' },
  zerb:                    { name: '제르브',         team: 'alien',   emoji: '👾✨', desc: '그루브와 함께 있을 때 특수 승리 조건을 가집니다.', expansion: 'alien' },
  leader:                  { name: '리더',           team: 'alien',   emoji: '👽👑', desc: '에일리언들을 확인하고, 일부 특수 승리 조건을 가집니다.', expansion: 'alien' },
  psychic:                 { name: '초능력자',       team: 'village', emoji: '🧠', desc: '앱 지시에 따라 카드를 확인합니다.', expansion: 'alien' },
  rascal:                  { name: '악동',           team: 'village', emoji: '😈', desc: '앱 지시에 따라 카드를 이동시킵니다.', expansion: 'alien' },
  exposer:                 { name: '폭로자',         team: 'village', emoji: '📸', desc: '앱 지시에 따라 카드를 공개합니다.', expansion: 'alien' },
  blob:                    { name: '방울',           team: 'village', emoji: '🫧', desc: '자신과 양옆 플레이어 전체가 살아남아야 승리하는 특수 역할입니다.', expansion: 'alien' },
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
  sentinel: [
    { t: '방패 토큰', c: '#60a5fa' },
    { t: '보거나 옮길 수 없습니다', c: '#34d399' },
  ],
  alpha_wolf: [
    { t: '동료를 확인', c: '#fb7185' },
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
  curator: [
    { t: '유물 토큰', c: '#fbbf24' },
    { t: '역할이나 승리 조건이 바뀔 수 있습니다', c: '#22d3ee' },
  ],
  bodyguard: [
    { t: '자신이 투표한 사람은 죽지 않습니다', c: '#34d399' },
    { t: '다음 득표자가 대신 죽습니다', c: '#fb7185' },
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
  // 뱀파이어 확장
  copycat: [
    { t: '센터 카드 1장을 보고 그 역할이 됩니다', c: '#a78bfa' },
  ],
  vampire: [
    { t: '다른 뱀파이어를 확인', c: '#9040c0' },
    { t: '뱀파이어 표식', c: '#fb7185' },
    { t: '뱀파이어 팀으로 만듭니다', c: '#fbbf24' },
  ],
  the_count: [
    { t: '공포의 표식', c: '#fb7185' },
    { t: '밤 행동을 막을 수 있습니다', c: '#fbbf24' },
  ],
  renfield: [
    { t: '뱀파이어 팀 보조', c: '#9040c0' },
    { t: '표식을 준 대상을 확인', c: '#22d3ee' },
  ],
  diseased: [
    { t: '질병의 표식', c: '#fb7185' },
    { t: '투표 패배 조건에 영향', c: '#fbbf24' },
  ],
  cupid: [
    { t: '사랑의 표식', c: '#fb7185' },
    { t: '함께 죽습니다', c: '#fbbf24' },
  ],
  instigator: [
    { t: '배신의 표식', c: '#fb7185' },
    { t: '승리 조건이 뒤바뀝니다', c: '#fbbf24' },
  ],
  priest: [
    { t: '결백의 표식', c: '#34d399' },
    { t: '정화합니다', c: '#22d3ee' },
  ],
  assassin: [
    { t: '암살 표식', c: '#fb7185' },
    { t: '독립 승리 조건', c: '#c88030' },
  ],
  apprentice_assassin: [
    { t: '암살자와 함께 행동', c: '#fb7185' },
  ],
  marksman: [
    { t: '카드와 표식을 각각 확인', c: '#22d3ee' },
  ],
  pickpocket: [
    { t: '표식을 바꾸고', c: '#fbbf24' },
    { t: '가져온 표식을 확인', c: '#22d3ee' },
  ],
  gremlin: [
    { t: '카드 또는 표식을 뒤섞을 수 있습니다', c: '#fbbf24' },
  ],
  vampire_lord: [
    { t: '죽지 않습니다', c: '#34d399' },
  ],
  // 에일리언 확장
  oracle: [
    { t: '앱의 질문에 답하고', c: '#22d3ee' },
  ],
  alien: [
    { t: '다른 에일리언을 확인', c: '#40c060' },
    { t: '앱 지시를 수행', c: '#fbbf24' },
  ],
  synthetic_alien: [
    { t: '에일리언 팀이 아닙니다', c: '#94a3b8' },
    { t: '별도의 승리 조건', c: '#c88030' },
  ],
  cow: [
    { t: '에일리언이 있는지', c: '#40c060' },
    { t: '신호로 확인', c: '#22d3ee' },
  ],
  groob: [
    { t: '제르브와 함께', c: '#40c060' },
    { t: '특수 승리 조건', c: '#fbbf24' },
  ],
  zerb: [
    { t: '그루브와 함께', c: '#40c060' },
    { t: '특수 승리 조건', c: '#fbbf24' },
  ],
  leader: [
    { t: '에일리언들을 확인', c: '#40c060' },
    { t: '특수 승리 조건', c: '#fbbf24' },
  ],
  psychic: [
    { t: '앱 지시에 따라 카드를 확인', c: '#22d3ee' },
  ],
  rascal: [
    { t: '앱 지시에 따라 카드를 이동', c: '#fbbf24' },
  ],
  exposer: [
    { t: '앱 지시에 따라 카드를 공개', c: '#fb7185' },
  ],
  blob: [
    { t: '양옆 플레이어 전체가 살아남아야', c: '#22d3ee' },
    { t: '특수 역할', c: '#fbbf24' },
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
  { id: 'daybreak',        name: '데이브레이크',     desc: '늑대 변종, 경비병, 마녀 등' },
  { id: 'daybreak_bonus1', name: '보너스팩 1',       desc: '영기 예언자, 왕자, 저주받은 자' },
  { id: 'bonus2',          name: '보너스팩 2',       desc: '종자, 주시자, 견습 무두장이 등' },
  { id: 'vampire',         name: '뱀파이어',         desc: '황혼 단계, 표식 시스템' },
  { id: 'alien',           name: '에일리언',         desc: '앱 연동, 에일리언 팀' },
];

function loadExpansions() {
  try {
    const saved = JSON.parse(localStorage.getItem('onw_expansions'));
    if (saved && typeof saved === 'object') return saved;
  } catch {}
  // Default: base + daybreak
  return { base: true, daybreak: true, daybreak_bonus1: false, bonus2: false, vampire: false, alien: false };
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
  // 데이브레이크 (11)
  'sentinel','alpha_wolf','mystic_wolf','dream_wolf',
  'apprentice_seer','paranormal_investigator','witch','village_idiot',
  'revealer','curator','bodyguard',
  // 보너스팩1 (3)
  'aura_seer','prince','cursed',
  // 보너스팩2 (4)
  'apprentice_tanner','thing','squire','beholder',
  // 뱀파이어 확장 (14)
  'copycat','vampire','the_count','renfield','diseased','cupid',
  'instigator','priest','assassin','apprentice_assassin',
  'marksman','pickpocket','gremlin','vampire_lord',
  // 에일리언 확장 (11)
  'oracle','alien','synthetic_alien','cow','groob','zerb',
  'leader','psychic','rascal','exposer','blob',
];

// 황혼 단계 (뱀파이어 확장)
const DUSK_ORDER = [
  'copycat','vampire','the_count','renfield',
  'diseased','cupid','instigator','priest',
  'assassin','apprentice_assassin','marksman','pickpocket',
];

// 밤 단계
const NIGHT_ORDER = [
  'doppelganger','sentinel',
  'werewolf','alpha_wolf','mystic_wolf',
  'minion','mason',
  'seer','apprentice_seer','paranormal_investigator',
  'robber','witch','troublemaker',
  'village_idiot','drunk',
  'aura_seer','thing','beholder','squire',
  'gremlin','marksman',
  // 에일리언
  'oracle','alien','synthetic_alien','cow',
  'groob','zerb','leader','psychic','rascal','exposer','blob',
  // 마지막
  'insomniac','curator','revealer',
];

function encodeDeck(deck) {
  // Each role can appear 0-3 times → 2 bits each. 55 roles × 2 = 110 bits → base62(~20 chars)
  const counts = ROLE_IDS.map(r => deck.filter(d => d === r).length);
  let val = 0n;
  for (let i = 0; i < counts.length; i++) val = val * 4n + BigInt(counts[i]);
  let code = '';
  let v = val;
  if (v === 0n) return '0'.padStart(19, '0');
  while (v > 0n) { code = _B62[Number(v % 62n)] + code; v = v / 62n; }
  return code.padStart(19, '0');
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

function deriveDuskOrder(deck) {
  const present = new Set(deck);
  return DUSK_ORDER.filter(r => present.has(r));
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
  const wolfUnits = [
    ['werewolf'],
    ['werewolf'],
    ['alpha_wolf'],
    ['mystic_wolf'],
    ['dream_wolf'],
    ['minion'],
    ['squire'],
  ].filter(u => u.every(allowed));

  const villageUnits = [
    ['seer'],
    ['robber'],
    ['troublemaker'],
    ['drunk'],
    ['insomniac'],
    ['mason', 'mason'],
    ['hunter'],
    ['doppelganger'],
    // 데이브레이크
    ['witch'],
    ['apprentice_seer'],
    ['paranormal_investigator'],
    ['village_idiot'],
    ['sentinel'],
    ['curator'],
    ['revealer'],
    ['bodyguard'],
    // 보너스팩1
    ['aura_seer'],
    ['prince'],
    ['cursed'],
    // 보너스팩2
    ['thing'],
    ['beholder'],
    // 뱀파이어 마을 역할
    ['copycat'],
    ['diseased'],
    ['cupid'],
    ['instigator'],
    ['priest'],
    ['assassin'],
    ['apprentice_assassin'],
    ['marksman'],
    ['pickpocket'],
    ['gremlin'],
    // 에일리언 마을 역할
    ['oracle'],
    ['synthetic_alien'],
    ['cow'],
    ['psychic'],
    ['rascal'],
    ['exposer'],
    ['blob'],
  ].filter(u => u.every(allowed));

  // Vampire pool
  const vampireUnits = [
    ['vampire'],
    ['vampire'],
    ['the_count'],
    ['renfield'],
    ['vampire_lord'],
  ].filter(u => u.every(allowed));

  // Alien pool
  const alienUnits = [
    ['alien'],
    ['alien'],
    ['groob'],
    ['zerb'],
    ['leader'],
  ].filter(u => u.every(allowed));

  // Tanner / independent pool
  const specialUnits = [
    ['tanner'],
    ['apprentice_tanner'],
  ].filter(u => u.every(allowed));

  // === Budget calculation ===
  // Multi-team balancing: enemies = wolf + vampire + alien budget total
  const hasVampire = exps.vampire && vampireUnits.length > 0;
  const hasAlien = exps.alien && alienUnits.length > 0;
  // Total enemy budget (wolf + others) stays proportional
  const maxVampire = hasVampire ? (playerCount <= 6 ? 1 : playerCount <= 8 ? 2 : 2) : 0;
  const maxAlien = hasAlien ? (playerCount <= 6 ? 1 : playerCount <= 8 ? 2 : 2) : 0;
  // Reduce wolf budget when other enemy teams present
  const wolfBudget = Math.max(1, maxWolf - (hasVampire ? 1 : 0) - (hasAlien ? 1 : 0));

  const deck = [];
  let wolfCount = 0;
  let vampCount = 0;
  let alienCount = 0;

  // Guarantee at least 1 werewolf and 1 seer
  deck.push('werewolf'); wolfCount++;
  deck.push('seer');

  // Fill wolf cards
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

  // Fill vampire cards
  if (maxVampire > 0) {
    for (const unit of shuffle([...vampireUnits])) {
      if (deck.length + unit.length > need) continue;
      if (vampCount + unit.length > maxVampire) continue;
      deck.push(...unit); vampCount += unit.length;
    }
  }

  // Fill alien cards
  if (maxAlien > 0) {
    for (const unit of shuffle([...alienUnits])) {
      if (deck.length + unit.length > need) continue;
      if (alienCount + unit.length > maxAlien) continue;
      deck.push(...unit); alienCount += unit.length;
    }
  }

  // Maybe add tanner (30% chance)
  if (deck.length < need && specialUnits.length > 0 && Math.random() < 0.3) {
    for (const unit of shuffle([...specialUnits])) {
      if (deck.length + unit.length > need) continue;
      deck.push(...unit);
      break;
    }
  }

  // Fill village cards (skip seer, already added)
  for (const unit of shuffle([...villageUnits])) {
    if (deck.length >= need) break;
    if (unit.length === 1 && unit[0] === 'seer') continue;
    if (deck.length + unit.length > need) continue;
    deck.push(...unit);
  }

  // Pad with villager if needed
  while (deck.length < need) deck.push('villager');

  return deck;
}

// ===== SCENARIO DATA (embedded) =====
const FULL_MOON_EPISODES = [
  { id: 'ep1', title: 'EP1: 보름달의 저주',
    variants: {
      '3':  { deck: ['werewolf','seer','robber','troublemaker','villager','villager'], wakeOrder: ['werewolf','seer','robber','troublemaker'] },
      '4':  { deck: ['werewolf','werewolf','seer','robber','troublemaker','drunk','insomniac'], wakeOrder: ['werewolf','seer','robber','troublemaker','drunk','insomniac'] },
      '5':  { deck: ['werewolf','werewolf','minion','seer','robber','troublemaker','drunk','insomniac'], wakeOrder: ['werewolf','minion','seer','robber','troublemaker','drunk','insomniac'] },
      '6':  { deck: ['werewolf','alpha_wolf','seer','robber','troublemaker','witch','drunk','insomniac','sentinel'], wakeOrder: ['sentinel','werewolf','alpha_wolf','seer','robber','troublemaker','witch','drunk','insomniac'] },
      '7':  { deck: ['werewolf','alpha_wolf','minion','seer','apprentice_seer','robber','troublemaker','witch','drunk','insomniac'], wakeOrder: ['werewolf','alpha_wolf','minion','seer','apprentice_seer','robber','troublemaker','witch','drunk','insomniac'] },
      '8':  { deck: ['werewolf','alpha_wolf','minion','seer','robber','troublemaker','witch','drunk','insomniac','mason','mason','sentinel'], wakeOrder: ['sentinel','werewolf','alpha_wolf','minion','mason','seer','robber','troublemaker','witch','drunk','insomniac'] },
      '9':  { deck: ['werewolf','alpha_wolf','mystic_wolf','minion','seer','apprentice_seer','robber','troublemaker','witch','drunk','insomniac','mason','mason'], wakeOrder: ['werewolf','alpha_wolf','mystic_wolf','minion','mason','seer','apprentice_seer','robber','troublemaker','witch','drunk','insomniac'] },
      '10': { deck: ['werewolf','alpha_wolf','mystic_wolf','minion','seer','paranormal_investigator','robber','troublemaker','witch','village_idiot','drunk','sentinel','insomniac','mason','mason','revealer'], wakeOrder: ['sentinel','werewolf','alpha_wolf','mystic_wolf','minion','mason','seer','paranormal_investigator','robber','witch','troublemaker','village_idiot','drunk','insomniac','revealer'] },
    }
  },
  { id: 'ep2', title: 'EP2: 새벽의 심판',
    variants: {
      '3':  { deck: ['werewolf','seer','robber','troublemaker','villager','villager'], wakeOrder: ['werewolf','seer','robber','troublemaker'] },
      '4':  { deck: ['werewolf','werewolf','seer','robber','troublemaker','drunk','insomniac'], wakeOrder: ['werewolf','seer','robber','troublemaker','drunk','insomniac'] },
      '5':  { deck: ['werewolf','dream_wolf','minion','seer','robber','troublemaker','drunk','insomniac'], wakeOrder: ['werewolf','minion','seer','robber','troublemaker','drunk','insomniac'] },
      '6':  { deck: ['werewolf','mystic_wolf','seer','robber','troublemaker','witch','drunk','insomniac','curator'], wakeOrder: ['werewolf','mystic_wolf','seer','robber','witch','troublemaker','drunk','curator','insomniac'] },
      '7':  { deck: ['werewolf','alpha_wolf','minion','seer','paranormal_investigator','robber','troublemaker','witch','drunk','insomniac'], wakeOrder: ['werewolf','alpha_wolf','minion','seer','paranormal_investigator','robber','troublemaker','witch','drunk','insomniac'] },
      '8':  { deck: ['werewolf','alpha_wolf','dream_wolf','minion','seer','robber','troublemaker','witch','drunk','insomniac','bodyguard','mason','mason'], wakeOrder: ['werewolf','alpha_wolf','minion','mason','seer','robber','troublemaker','witch','drunk','insomniac','bodyguard'] },
      '9':  { deck: ['werewolf','alpha_wolf','mystic_wolf','minion','seer','apprentice_seer','robber','troublemaker','witch','village_idiot','drunk','insomniac'], wakeOrder: ['werewolf','alpha_wolf','mystic_wolf','minion','seer','apprentice_seer','robber','witch','troublemaker','village_idiot','drunk','insomniac'] },
      '10': { deck: ['werewolf','alpha_wolf','mystic_wolf','dream_wolf','minion','seer','paranormal_investigator','robber','troublemaker','witch','village_idiot','drunk','curator','insomniac','revealer','bodyguard'], wakeOrder: ['werewolf','alpha_wolf','mystic_wolf','minion','seer','paranormal_investigator','robber','witch','troublemaker','village_idiot','drunk','curator','insomniac','revealer','bodyguard'] },
    }
  }
];

const SCENARIOS = [
  {
    id: 'full_moon', title: '보름달의 밤', subtitle: '전역할 시나리오 · 3~10인',
    playerCounts: [3,4,5,6,7,8,9,10],
    episodes: FULL_MOON_EPISODES
  },
  {
    id: 'full_moon_modern', title: '한밤의 서울 늑대', subtitle: '현대 한국 도시 테마 · 3~10인',
    playerCounts: [3,4,5,6,7,8,9,10],
    episodes: FULL_MOON_EPISODES
  },
  {
    id: 'night_shift_handover', title: '야간 병동 인계 시간', subtitle: '병원 미스터리 테마 · 3~10인',
    playerCounts: [3,4,5,6,7,8,9,10],
    episodes: FULL_MOON_EPISODES
  },
  {
    id: 'orbital_station', title: '우주 정거장', subtitle: '폐쇄 우주정거장 미스터리 · 3~10인',
    playerCounts: [3,4,5,6,7,8,9,10],
    episodes: FULL_MOON_EPISODES
  },
  {
    id: 'abandoned_school_shoot', title: '폐교 탐사 유튜브 촬영', subtitle: '카메라 밖의 진실 · 3~10인',
    playerCounts: [3,4,5,6,7,8,9,10],
    episodes: FULL_MOON_EPISODES
  }
];

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
};

// ===== ROOM CODE =====
// v2: scenario(4 bits) + episode(1 bit) + deck(55 roles × 2 bits = 110 bits) = 115 bits → base62(20 chars)
// Player count derived from deck.length - 3.
const _B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const _DECK_BITS = BigInt(ROLE_IDS.length * 2); // 110

function encodeRoomCode(scenarioId, episodeId, playerCount, deck) {
  const sIdx = BigInt(Math.max(0, SCENARIOS.findIndex(s => s.id === scenarioId)));
  const epBit = episodeId === 'ep2' ? 1n : 0n;
  const counts = ROLE_IDS.map(r => deck.filter(d => d === r).length);
  let deckVal = 0n;
  for (let i = 0; i < counts.length; i++) deckVal = deckVal * 4n + BigInt(counts[i]);
  const val = (sIdx << (_DECK_BITS + 1n)) | (epBit << _DECK_BITS) | deckVal;
  let code = '';
  let v = val;
  if (v === 0n) return '0'.padStart(20, '0');
  while (v > 0n) { code = _B62[Number(v % 62n)] + code; v = v / 62n; }
  return code.padStart(20, '0');
}

function decodeRoomCode(code) {
  code = code.trim();
  if (code.length < 6 || code.length > 22) return null;
  let val = 0n;
  for (const ch of code) {
    const idx = _B62.indexOf(ch);
    if (idx < 0) return null;
    val = val * 62n + BigInt(idx);
  }
  const deckMask = (1n << _DECK_BITS) - 1n;
  const deckVal = val & deckMask;
  const sIdx = Number((val >> (_DECK_BITS + 1n)) & 0xFn);
  const epBit = Number((val >> _DECK_BITS) & 1n);
  const episodeId = `ep${epBit + 1}`;

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
  const v = episode.variants;
  let variant = v[String(playerCount)];
  if (!variant) {
    // fallback: smallest key >= playerCount, else largest key
    const keys = Object.keys(v).map(Number).sort((a, b) => a - b);
    const fit = keys.find(k => k >= playerCount);
    variant = v[String(fit != null ? fit : keys[keys.length - 1])];
  }
  if (!variant) return null;
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

  const playerKey = `p${ttsScenario.playerCount || 10}`;
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

// ===== BGM =====
const bgmEl = document.getElementById('bgmPlayer');
const BGM_DEFAULT_VOLUME = 0.25;
bgmEl.volume = (() => { try { return parseFloat(localStorage.getItem('onw_bgm_vol')) || BGM_DEFAULT_VOLUME; } catch { return BGM_DEFAULT_VOLUME; } })();

function setBgmVolume(v) {
  bgmEl.volume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('onw_bgm_vol', String(bgmEl.volume)); } catch {}
}

function startBgm() {
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

// ===== AUDIO PLAYBACK (mobile-safe, event-driven) =====
const audioEl = document.getElementById('audioPlayer');
let audioCtx = null;

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
  if (bp) bp.then(() => { bgmEl.pause(); bgmEl.muted = false; }).catch(() => { bgmEl.muted = false; });
}

function stopPlayback() {
  state.playing = false;
  state.paused = false;
  if (state._delayTimer) { clearTimeout(state._delayTimer); state._delayTimer = null; }
  cancelSpeechPlayback();
  audioEl.pause();
  stopBgm();
  releaseWakeLock();
  audioEl.removeAttribute('src');
  audioEl.onended = null;
  audioEl.onerror = null;
  render();
}

function togglePause() {
  if (!state.playing) return;
  const curClip = state.playlist[state.playlistIndex];
  if (state.paused) {
    // Resume
    state.paused = false;
    if (state._pausedDelay) {
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
    fadeOutBgm(3000);
    releaseWakeLock();
    render();
    showToast('밤이 끝났습니다. 토론을 시작하세요!');
    return;
  }

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

function playClip(clip) {
  renderPlayingOverlay();
  cancelSpeechPlayback();
  audioEl.pause();

  if (isSpeechClip(clip)) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      showToast('브라우저 음성 읽기를 지원하지 않습니다');
      playNext();
      return;
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

  audioEl.src = clip.url;
  audioEl.load();
  audioEl.play().catch((err) => {
    console.warn('play() rejected:', clip.url, err);
    playNext();
  });
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
    render();
    showToast('밤이 끝났습니다. 토론을 시작하세요!');
    return;
  }
  state.playlistIndex = target;
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
  startBgm();
  requestWakeLock();
  render();

  // Event-driven chain: ended → playNext (no async gaps that break mobile)
  audioEl.onended = () => playNext();
  audioEl.onerror = () => {
    console.warn('Audio error, skipping:', state.playlist[state.playlistIndex]?.url);
    playNext();
  };

  // Start first clip
  const firstClip = state.playlist[0];
  if (isSpeechClip(firstClip)) {
    playClip(firstClip);
  } else {
    audioEl.src = firstClip.url;
    audioEl.load();
    audioEl.play().catch((err) => {
      console.warn('First play() rejected:', err);
      showToast('오디오 재생에 실패했습니다. 다시 시도해주세요.');
      state.playing = false;
      render();
    });
  }
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
  switch (state.screen) {
    case 'home':      app.innerHTML = renderHomeHTML(); break;
    case 'setup':     app.innerHTML = renderSetupHTML(); break;
    case 'join':      app.innerHTML = renderJoinHTML(); break;
    case 'lobby':     app.innerHTML = renderLobbyHTML(); break;
    case 'changelog': app.innerHTML = renderChangelogHTML(); break;
  }
}

// -- Home
function renderHomeHTML() {
  return `
    <div class="home">
      <div class="home__moon"></div>
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
    </div>`;
}

// -- Changelog
const CHANGELOG = [
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
  let codeDisplay = '';
  if (ready) {
    code = encodeRoomCode(sc.id, ep.id, state.playerCount, state.deck);
    codeDisplay = code.match(/.{1,5}/g).join('-');
  }

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
        <div class="setup__section-title">확장팩</div>
        <div class="expansion-grid">
          ${EXPANSIONS.map(ex => {
            const active = state.expansions[ex.id];
            const locked = ex.required;
            return `
              <button class="expansion-btn ${active ? 'expansion-btn--active' : ''} ${locked ? 'expansion-btn--locked' : ''}"
                onclick="${locked ? '' : `toggleExpansion('${ex.id}')`}"
                ${locked ? 'disabled' : ''}>
                <span class="expansion-btn__name">${ex.name}</span>
                <span class="expansion-btn__desc">${ex.desc}</span>
              </button>`;
          }).join('')}
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
          <div class="room-code-display__code" onclick="copyCode('${code}')" title="탭하여 복사">${codeDisplay}</div>
          <div class="room-code-display__hint">탭하여 링크 복사 · 참가자에게 공유하세요</div>
        </div>
        <button class="btn btn--primary btn--full" onclick="enterLobby('${code}')">로비 입장</button>
      </div>
      ` : ''}
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
    <div class="join">
      <button class="back-btn" onclick="goHome()" style="position:absolute;top:20px;left:20px;">← 돌아가기</button>
      <h1 class="join__title">게임 참가</h1>
      <div class="join__input-group">
        <input class="join__input" id="codeInput" maxlength="22" placeholder="방 코드 입력" autocomplete="off" autofocus>
        <div class="join__error" id="joinError"></div>
      </div>
      <button class="btn btn--primary btn--full" style="max-width:280px;" onclick="submitJoin()">입장</button>
      ${recentHTML}
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

  // Sort: by night wake order, then non-waking roles at end
  const wakeOrder = variant.wakeOrder || [];
  const uniqueRoles = Object.keys(roleCounts);
  uniqueRoles.sort((a, b) => {
    const ia = wakeOrder.indexOf(a);
    const ib = wakeOrder.indexOf(b);
    const oa = ia === -1 ? 9999 : ia;
    const ob = ib === -1 ? 9999 : ib;
    return oa - ob;
  });

  return `
    <div class="lobby">
      <div class="lobby__header">
        <div class="lobby__info">
          <div class="lobby__scenario-title">${scenario.title} · ${episode.title}</div>
          <div class="lobby__meta">${config.playerCount}명 플레이 · 센터 카드 ${centerCount}장</div>
        </div>
        <div class="lobby__code" onclick="copyCode('${code}')" title="탭하여 링크 복사">${code.match(/.{1,5}/g).join('-')}</div>
      </div>

      <div class="reroll-bar">
        <div class="expansion-toggles">
          ${EXPANSIONS.map(ex => {
            const active = state.expansions[ex.id];
            const locked = ex.required;
            return `<button class="exp-tag ${active ? 'exp-tag--active' : ''} ${locked ? 'exp-tag--locked' : ''}"
              onclick="${locked ? '' : `toggleExpansion('${ex.id}',true);rerollDeck()`}"
              ${locked ? 'disabled' : ''}
              title="${ex.desc}">${ex.name}</button>`;
          }).join('')}
        </div>
        <button class="reroll-btn" onclick="rerollDeck()">🎲 역할 다시 뽑기</button>
      </div>

      <div class="play-bar">
        <button class="play-btn" onclick="startPlayback()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          밤 행동 음성 재생
        </button>
        <div class="delay-options">
          <span class="delay-options__label">행동 간격</span>
          <div class="delay-options__btns">
            ${[0,3,5,10,15,20].map(s => `<button class="delay-btn ${state.actionDelay === s ? 'selected' : ''}" onclick="setActionDelay(${s})">${s === 0 ? '없음' : s + '초'}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="center-info">카드 ${variant.deck.length}장 (플레이어 ${config.playerCount} + 센터 ${centerCount})</div>

      <div class="role-grid">
        ${uniqueRoles.map(roleId => {
          const role = ROLES[roleId] || { name: roleId, team: 'village', emoji: '❓', desc: '' };
          const count = roleCounts[roleId];
          const tm = TEAM_META[role.team] || TEAM_META.village;
          const teamClass = tm.css;
          const teamLabel = tm.label;
          const wakeIdx = wakeOrder.indexOf(roleId);
          const orderBadge = wakeIdx !== -1
            ? `<span class="role-card__order">${wakeIdx + 1}</span>`
            : `<span class="role-card__order role-card__order--none">-</span>`;
          return `
            <div class="role-card ${teamClass}">
              <div class="role-card__top">
                ${orderBadge}
                <span class="role-card__emoji">${role.emoji}</span>
                <span class="role-card__name">${role.name}</span>
                ${count > 1 ? `<span class="role-card__count">×${count}</span>` : ''}
              </div>
              <div class="role-card__team">${teamLabel}</div>
              <div class="role-card__desc">${highlightDesc(roleId, role.desc)}</div>
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
      <div class="playing__controls">
        <button class="playing__skip" onclick="skipToPrev()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          이전
        </button>
        <button class="playing__pause" onclick="togglePause()">
          ${state.paused
            ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
            : '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>'}
          ${state.paused ? '재개' : '일시정지'}
        </button>
        <button class="playing__skip" onclick="skipToNext()">
          다음
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM4 18l8.5-6L4 6z" /></svg>
        </button>
      </div>
      <div class="playing__bgm">
        <span class="playing__bgm-label">🎵 BGM</span>
        <input type="range" min="0" max="100" value="${Math.round(bgmEl.volume * 100)}"
          class="playing__bgm-slider"
          oninput="setBgmVolume(this.value/100); this.nextElementSibling.textContent=this.value+'%'" />
        <span class="playing__bgm-val">${Math.round(bgmEl.volume * 100)}%</span>
      </div>
      <button class="playing__exit" onclick="stopPlayback()">나가기</button>
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

    const pauseBtn = existing.querySelector('.playing__pause');
    if (pauseBtn) {
      pauseBtn.innerHTML = state.paused
        ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 재개'
        : '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg> 일시정지';
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
  try { history.replaceState(null, '', location.pathname); } catch {}
  render();
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

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
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
