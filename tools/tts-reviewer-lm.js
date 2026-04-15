// ============================================================================
// tts-reviewer-lm.js — LM Studio Chat (skill-based, Gemma 4 / structured output)
// ============================================================================
let lmConnected = false;
let lmModel = '';
let lmChatHistory = [];
let lmStreaming = false;

// ── Knowledge system ──
let knowledgeIndex = null;   // parsed _knowledge_index.json
let knowledgeCache = {};     // id → content string
let knowledgeLoaded = [];    // ids currently attached to context

async function loadKnowledgeIndex() {
  if (knowledgeIndex) return;
  try {
    if (projectDirHandle) {
      knowledgeIndex = await readJsonFromDir(projectDirHandle, 'tools/_knowledge_index.json');
    } else {
      const resp = await fetch(`${basePath()}/tools/_knowledge_index.json`);
      if (resp.ok) knowledgeIndex = await resp.json();
    }
  } catch { knowledgeIndex = { docs: [] }; }
}

async function loadKnowledgeDoc(docId) {
  if (knowledgeCache[docId]) return knowledgeCache[docId];
  if (!knowledgeIndex) await loadKnowledgeIndex();
  const entry = (knowledgeIndex?.docs || []).find(d => d.id === docId);
  if (!entry) return null;
  try {
    let text;
    if (projectDirHandle) {
      const parts = entry.path.replace(/\\/g, '/').split('/').filter(Boolean);
      const fileName = parts.pop();
      const dir = parts.length > 0 ? await getSubDir(projectDirHandle, parts) : projectDirHandle;
      const fh = await dir.getFileHandle(fileName);
      const file = await fh.getFile();
      text = await file.text();
    } else {
      const resp = await fetch(`${basePath()}/${entry.path}`);
      if (!resp.ok) return null;
      text = await resp.text();
    }
    // Truncate very large docs to ~4000 chars to fit context
    if (text.length > 4000) text = text.substring(0, 4000) + '\n...(truncated)';
    knowledgeCache[docId] = text;
    return text;
  } catch { return null; }
}

function buildKnowledgeIndexPrompt() {
  if (!knowledgeIndex || !knowledgeIndex.docs) return '';
  const list = knowledgeIndex.docs.map(d => `  ${d.id}: ${d.desc}`).join('\n');
  return `\n== 참조 가능 문서 ==\n${list}\nrequestDocs에 필요한 문서 id를 배열로 요청하면 다음 턴에 내용이 첨부됩니다. 이미 첨부된 문서는 다시 요청 불필요.\n`;
}

function buildLoadedKnowledgePrompt() {
  if (knowledgeLoaded.length === 0) return '';
  let result = '\n== 첨부된 배경지식 ==\n';
  for (const id of knowledgeLoaded) {
    const entry = (knowledgeIndex?.docs || []).find(d => d.id === id);
    const content = knowledgeCache[id];
    if (entry && content) {
      result += `--- ${entry.title} (${id}) ---\n${content}\n\n`;
    }
  }
  return result;
}

// No response_format — json_schema conflicts with Gemma 4 <think> tokens.
// JSON output is enforced via system prompt only.

// ── Panel open/close ──
function toggleLmPanel() {
  const sidebar = $('lmSidebar');
  const isOpen = !sidebar.classList.contains('collapsed');
  if (isOpen) {
    sidebar.classList.add('collapsed');
    lsSet('lmPanelOpen', '0');
  } else {
    openLmPanel();
  }
}

function openLmPanel() {
  const sidebar = $('lmSidebar');
  sidebar.classList.remove('collapsed');
  lsSet('lmPanelOpen', '1');
  updateLmSkillInfo();
  const savedUrl = lsGet('lmServerUrl', '');
  if (savedUrl) $('lmServerUrl').value = savedUrl;
  const savedMax = lsGet('lmMaxTokens', '');
  if (savedMax) $('lmMaxTokens').value = savedMax;
  if (!lmConnected && $('lmServerUrl').value) lmConnect();
  loadKnowledgeIndex();
}

function closeLmPanel() {
  $('lmSidebar').classList.add('collapsed');
  lsSet('lmPanelOpen', '0');
}

function lmClearChat() {
  lmChatHistory = [];
  renderLmMessages();
  addLmSystemMsg('대화가 초기화되었습니다');
}

// ── Server connection ──
async function lmConnect() {
  const url = $('lmServerUrl').value.trim().replace(/\/+$/, '');
  if (!url) { toast('서버 URL을 입력하세요', 'error'); return; }
  lsSet('lmServerUrl', url);
  const dot = $('lmServerDot');
  const status = $('lmStatus');
  dot.className = 'status-dot';
  status.textContent = '연결 중...';
  try {
    const resp = await fetch(`${url}/v1/models`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const models = (data.data || []).map(m => m.id);
    if (models.length === 0) throw new Error('모델 없음');
    const sel = $('lmModelSelect');
    sel.innerHTML = models.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    sel.disabled = false;
    const savedModel = lsGet('lmModel', '');
    if (savedModel && models.includes(savedModel)) sel.value = savedModel;
    lmModel = sel.value;
    sel.onchange = () => { lmModel = sel.value; lsSet('lmModel', lmModel); };
    lsSet('lmModel', lmModel);
    lmConnected = true;
    dot.className = 'status-dot ok';
    status.textContent = `${models.length}개 모델`;
    $('lmInput').disabled = false;
    $('lmSendBtn').disabled = false;
    addLmSystemMsg(`LM Studio 연결됨 — ${models.length}개 모델`);
    toast('LM Studio 서버 연결됨', 'success');
  } catch (e) {
    dot.className = 'status-dot err';
    status.textContent = '연결 실패';
    $('lmModelSelect').innerHTML = '<option value="">-- 연결 실패 --</option>';
    $('lmModelSelect').disabled = true;
    lmConnected = false;
    toast(`LM Studio 연결 실패: ${e.message}`, 'error');
  }
}

// ── Skill context / system prompt ──
function estimateTokens(text) { return Math.ceil(text.length / 3); }

function updateLmSkillInfo() {
  const desc = $('lmSkillDesc');
  const est = $('lmCtxEstimate');
  if (!desc) return;
  if (!scenarioData || !$('selEpisode').value) {
    desc.textContent = '시나리오를 선택하면 컨텍스트가 전달됩니다';
    if (est) est.textContent = '--';
    return;
  }
  const prompt = buildSkillSystemPrompt();
  const tokens = estimateTokens(prompt);
  const selLabel = selectedClips.size > 0 ? ` | ${selectedClips.size}개 선택` : '';
  desc.textContent = `${scenarioData.scenarioId}/${$('selEpisode').value} — ${currentClips.length}개 클립${selLabel}`;
  if (est) est.textContent = `~${tokens} tok`;
}

// ── Find/Replace presets (correct regex built-in, LLM just picks a name) ──
const FR_PRESETS = {
  pause_before_punct: {
    label: 'pause 태그를 문장부호 뒤로 이동',
    operations: [{ find: '\\s*\\[((?:short |long )?pause)\\]\\s*([.!?,])', replace: '$2[$1]', isRegex: true }]
  },
  remove_all_tags: {
    label: '모든 태그 삭제',
    operations: [{ find: '\\s*\\[[^\\]]+\\]', replace: '', isRegex: true }]
  },
  remove_pause: {
    label: 'pause 태그만 삭제',
    operations: [{ find: '\\s*\\[((?:short |long )?pause)\\]', replace: '', isRegex: true }]
  },
  remove_emotion_tags: {
    label: '감정 태그만 삭제 (pause 유지)',
    operations: [{ find: '\\s*\\[(?!(?:short |long )?pause)[^\\]]+\\]', replace: '', isRegex: true }]
  },
  normalize_spaces: {
    label: '연속 공백을 하나로',
    operations: [{ find: '  +', replace: ' ', isRegex: true }]
  },
};

function buildSkillSystemPrompt() {
  if (!scenarioData || !currentClips.length) return '로드된 대본 없음.';
  const sid = scenarioData.scenarioId;
  const eid = $('selEpisode').value;
  let lines = [];
  currentClips.forEach((clip, idx) => {
    const t = clip.type === 'opening' ? 'OP' : clip.type === 'outro' ? 'OUT' : clip.roleId;
    lines.push(`#${idx}|${t}|${roleDisplayName(clip.roleId)}|"${clip.text}"`);
  });

  // Selection info
  const selInfo = selectedClips.size > 0
    ? `\n유저 선택 클립: [${[...selectedClips].join(',')}] (scope 미지정 시 이 클립들 대상으로 작업)`
    : '';

  let prompt = `원나잇 늑대인간 TTS 대본 에디터. 시나리오:${sid} 에피소드:${eid}
중요: thinking은 짧게. 응답은 반드시 JSON 객체로.${selInfo}

대본(#idx|type|name|text):
${lines.join('\n')}

반드시 아래 JSON 형식으로만 응답:
{"skill":"...","scope":"...","explanation":"...","requestDocs":[],"edits":[],"operations":[],"renames":[]}

skill:
- edit: 클립 텍스트 직접 수정. edits:[{clipIndex:N,newText:"..."}]
- find_replace: 찾기/바꾸기.
  프리셋 사용(권장): "preset":"프리셋이름" 지정. operations는 빈배열로.
  ${Object.entries(FR_PRESETS).map(([k,v]) => `"${k}": ${v.label}`).join('\n  ')}
  커스텀: operations:[{find:"찾을문자열",replace:"바꿀문자열",isRegex:false}] (단순문자열 치환만)
- rename_roles: 호칭 변경 제안. renames:[{roleId:"...",oldName:"...",newName:"..."}]
- chat: 질문/답변만.

scope: current(기본)|all_episodes|all_scenarios|opening|outro|clips:0,2,4

배경지식: requestDocs에 문서id 요청시 다음 턴에 첨부. 첨부됨:[${knowledgeLoaded.join(',') || '없음'}]
${buildKnowledgeIndexPrompt()}
미사용 필드는 빈배열[]. 한국어.`;

  // Append loaded knowledge
  prompt += buildLoadedKnowledgePrompt();
  return prompt;
}

// ── Thinking token parsing ──
function stripThinking(raw) {
  const m = raw.match(/^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/);
  if (m) return { thinking: m[1].trim(), content: m[2].trim() };
  if (raw.startsWith('<think>') && !raw.includes('</think>'))
    return { thinking: raw.slice(7), content: '', thinkingInProgress: true };
  return { thinking: '', content: raw.trim() };
}

// ── Response parsing ──
function parseStructuredResponse(content) {
  try {
    const p = JSON.parse(content);
    if (p.skill && typeof p.explanation === 'string') return p;
  } catch {}
  // Fallback: ```json block
  const jm = content.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (jm) { try { const p = JSON.parse(jm[1]); if (p.skill) return p; } catch {} }
  // Fallback: raw JSON
  const rm = content.match(/\{[\s\S]*"skill"[\s\S]*\}\s*$/);
  if (rm) { try { const p = JSON.parse(rm[0]); if (p.skill) return p; } catch {} }
  return { skill: 'chat', scope: 'current', explanation: content, edits: [], operations: [], renames: [] };
}

function postProcessAssistantMsg(msgIdx) {
  const msg = lmChatHistory[msgIdx];
  if (!msg || msg.role !== 'assistant') return;

  // Always keep raw for debugging
  msg._rawLength = (msg.raw || '').length;

  const { thinking, content } = stripThinking(msg.raw || '');
  msg.thinking = thinking;
  msg._contentAfterThink = content; // for debug

  // Handle empty content
  if (!content || content.trim() === '') {
    msg.skill = 'chat';
    msg.scope = 'current';
    if (thinking) {
      msg.explanation = `[thinking ${thinking.length}자 출력 후 JSON 응답 없음 — Max tokens(${$('lmMaxTokens').value})를 늘리거나 질문을 간결하게]`;
    } else if (msg._rawLength === 0) {
      msg.explanation = '[서버 응답 없음 — LM Studio 로그를 확인하세요]';
    } else {
      msg.explanation = '[응답 파싱 실패]\n원문: ' + (msg.raw || '').substring(0, 500);
    }
    msg.requestDocs = []; msg.edits = []; msg.operations = []; msg.renames = [];
    msg.parsed = true; msg.applied = false;
    return;
  }

  const parsed = parseStructuredResponse(content);
  msg.skill = parsed.skill || 'chat';
  msg.scope = parsed.scope || 'current';
  msg.explanation = parsed.explanation || '';
  msg.requestDocs = parsed.requestDocs || [];
  msg.edits = parsed.edits || [];
  msg.operations = parsed.operations || [];
  msg.renames = parsed.renames || [];
  msg.preset = parsed.preset || '';
  msg.parsed = true;
  msg.applied = false;

  // If explanation is empty but we have content, show it
  if (!msg.explanation && msg.skill === 'chat' && content) {
    msg.explanation = content;
  }

  // Resolve preset → operations
  if (msg.skill === 'find_replace' && msg.preset && FR_PRESETS[msg.preset]) {
    msg.operations = FR_PRESETS[msg.preset].operations;
  }
  if (msg.skill === 'find_replace' && msg.operations.length > 0) {
    msg.preview = computeFindReplacePreview(msg.operations, msg.scope);
  }
}

// ── Scope resolution ──
function resolveCurrentScope(scope) {
  if (!scope || scope === 'current') return currentClips.map((c, i) => ({ clip: c, idx: i }));
  if (scope === 'opening') return currentClips.map((c, i) => ({ clip: c, idx: i })).filter(t => t.clip.type === 'opening');
  if (scope === 'outro') return currentClips.map((c, i) => ({ clip: c, idx: i })).filter(t => t.clip.type === 'outro');
  if (scope.startsWith('clips:')) {
    const indices = scope.slice(6).split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    return indices.filter(i => i >= 0 && i < currentClips.length).map(i => ({ clip: currentClips[i], idx: i }));
  }
  return currentClips.map((c, i) => ({ clip: c, idx: i }));
}

function collectAllEpisodeTexts() {
  if (!scenarioData) return [];
  const results = [];
  for (const [epId, ep] of Object.entries(scenarioData.episodes || {})) {
    if (ep.openingClips) results.push({ epId, field: 'openingClips', roleId: 'Narrator', type: 'opening', text: ep.openingClips, label: `${epId}/opening` });
    if (ep.roleClips) for (const [rid, text] of Object.entries(ep.roleClips))
      results.push({ epId, field: `roleClips.${rid}`, roleId: rid, type: 'role', text, label: `${epId}/${roleDisplayName(rid)}` });
    if (ep.nightOutroClips) results.push({ epId, field: 'nightOutroClips', roleId: 'Narrator', type: 'outro', text: ep.nightOutroClips, label: `${epId}/outro` });
  }
  return results;
}

// ── Find & Replace engine ──
function applyOps(text, operations) {
  let r = text;
  for (const op of operations) {
    try {
      r = op.isRegex ? r.replace(new RegExp(op.find, 'g'), op.replace) : r.replaceAll(op.find, op.replace);
    } catch {}
  }
  return r;
}

function countMatches(text, op) {
  try {
    if (op.isRegex) return [...text.matchAll(new RegExp(op.find, 'g'))].length;
    let c = 0, i = -1;
    while ((i = text.indexOf(op.find, i + 1)) !== -1) c++;
    return c;
  } catch { return 0; }
}

function computeFindReplacePreview(operations, scope) {
  const changes = [];
  let totalMatches = 0;

  function processText(text, label) {
    let mc = 0;
    for (const op of operations) mc += countMatches(text, op);
    if (mc > 0) {
      totalMatches += mc;
      changes.push({ label, oldText: text, newText: applyOps(text, operations), matchCount: mc });
    }
  }

  if (scope === 'all_episodes') {
    for (const t of collectAllEpisodeTexts()) processText(t.text, t.label);
  } else if (scope === 'all_scenarios') {
    // Can't preview all scenarios synchronously — just note it
    for (const t of collectAllEpisodeTexts()) processText(t.text, `${scenarioData.scenarioId}/${t.label}`);
    return { totalMatches, totalClips: changes.length, changes, note: '현재 시나리오만 미리보기. 적용 시 전체 시나리오에 반영.' };
  } else {
    const targets = resolveCurrentScope(scope);
    for (const t of targets) processText(t.clip.text, `#${t.idx + 1} ${roleDisplayName(t.clip.roleId)}`);
  }
  return { totalMatches, totalClips: changes.length, changes };
}

// ── Apply functions ──
async function applyFindReplaceFromMsg(msgIdx) {
  const msg = lmChatHistory[msgIdx];
  if (!msg || msg.skill !== 'find_replace' || msg.applied) return;
  const { operations, scope } = msg;
  let applied = 0;

  if (scope === 'all_scenarios') {
    for (const sid of SCENARIOS) {
      try {
        const data = await loadScenario(sid);
        let modified = false;
        for (const [epId, ep] of Object.entries(data.episodes || {})) {
          if (ep.openingClips) { const n = applyOps(ep.openingClips, operations); if (n !== ep.openingClips) { ep.openingClips = n; modified = true; applied++; } }
          if (ep.roleClips) for (const [rid, text] of Object.entries(ep.roleClips)) { const n = applyOps(text, operations); if (n !== text) { ep.roleClips[rid] = n; modified = true; applied++; } }
          if (ep.nightOutroClips) { const n = applyOps(ep.nightOutroClips, operations); if (n !== ep.nightOutroClips) { ep.nightOutroClips = n; modified = true; applied++; } }
        }
        if (modified) await lmSaveScenario(sid, data);
      } catch (e) { toast(`${sid} 처리 실패: ${e.message}`, 'error'); }
    }
    // Reload current
    if (scenarioData) {
      scenarioData = await loadScenario(scenarioData.scenarioId);
      renderEpisode($('selEpisode').value);
    }
  } else if (scope === 'all_episodes') {
    for (const [epId, ep] of Object.entries(scenarioData.episodes || {})) {
      if (ep.openingClips) { const n = applyOps(ep.openingClips, operations); if (n !== ep.openingClips) { ep.openingClips = n; applied++; } }
      if (ep.roleClips) for (const [rid, text] of Object.entries(ep.roleClips)) { const n = applyOps(text, operations); if (n !== text) { ep.roleClips[rid] = n; applied++; } }
      if (ep.nightOutroClips) { const n = applyOps(ep.nightOutroClips, operations); if (n !== ep.nightOutroClips) { ep.nightOutroClips = n; applied++; } }
    }
    await saveTtsJson();
    renderEpisode($('selEpisode').value);
  } else {
    const targets = resolveCurrentScope(scope);
    const epId = $('selEpisode').value;
    const ep = scenarioData?.episodes?.[epId];
    for (const t of targets) {
      const n = applyOps(t.clip.text, operations);
      if (n !== t.clip.text) {
        t.clip.text = n;
        if (ep) {
          if (t.clip.type === 'opening') ep.openingClips = n;
          else if (t.clip.type === 'outro') ep.nightOutroClips = n;
          else if (t.clip.type === 'role' && t.clip.roleId) ep.roleClips[t.clip.roleId] = n;
        }
        applied++;
      }
    }
    await saveTtsJson();
    renderClipList(); renderStats();
  }

  msg.applied = true;
  renderLmMessages();
  toast(`찾기/바꾸기 적용: ${applied}개 클립 수정됨`, 'success');
}

async function applyRenamesFromMsg(msgIdx) {
  const msg = lmChatHistory[msgIdx];
  if (!msg || msg.skill !== 'rename_roles' || msg.applied) return;
  const { renames, scope } = msg;
  if (!renames || renames.length === 0) return;

  // Build find/replace operations from renames
  const ops = renames.map(r => ({ find: r.oldName, replace: r.newName, isRegex: false }));
  let applied = 0;

  async function applyToScenario(data) {
    let modified = false;
    for (const [epId, ep] of Object.entries(data.episodes || {})) {
      if (ep.openingClips) { const n = applyOps(ep.openingClips, ops); if (n !== ep.openingClips) { ep.openingClips = n; modified = true; applied++; } }
      if (ep.roleClips) for (const [rid, text] of Object.entries(ep.roleClips)) { const n = applyOps(text, ops); if (n !== text) { ep.roleClips[rid] = n; modified = true; applied++; } }
      if (ep.nightOutroClips) { const n = applyOps(ep.nightOutroClips, ops); if (n !== ep.nightOutroClips) { ep.nightOutroClips = n; modified = true; applied++; } }
    }
    return modified;
  }

  if (scope === 'all_scenarios') {
    for (const sid of SCENARIOS) {
      try {
        const data = await loadScenario(sid);
        if (await applyToScenario(data)) await lmSaveScenario(sid, data);
      } catch {}
    }
    if (scenarioData) { scenarioData = await loadScenario(scenarioData.scenarioId); renderEpisode($('selEpisode').value); }
  } else if (scope === 'all_episodes' || scope === 'current') {
    await applyToScenario(scenarioData);
    await saveTtsJson();
    renderEpisode($('selEpisode').value);
  }

  msg.applied = true;
  renderLmMessages();
  toast(`호칭 변경 적용: ${applied}개 클립 수정됨`, 'success');
}

async function applyEditsFromMsg(msgIdx) {
  const msg = lmChatHistory[msgIdx];
  if (!msg || msg.skill !== 'edit' || msg.applied) return;
  const epId = $('selEpisode').value;
  const ep = scenarioData?.episodes?.[epId];
  let applied = 0;

  for (const edit of msg.edits) {
    const idx = edit.clipIndex;
    if (idx < 0 || idx >= currentClips.length) continue;
    currentClips[idx].text = edit.newText;
    if (ep) {
      const clip = currentClips[idx];
      if (clip.type === 'opening') ep.openingClips = edit.newText;
      else if (clip.type === 'outro') ep.nightOutroClips = edit.newText;
      else if (clip.type === 'role' && clip.roleId) ep.roleClips[clip.roleId] = edit.newText;
    }
    applied++;
  }
  if (applied > 0) await saveTtsJson();
  renderClipList(); renderStats(); updateLmSkillInfo();
  msg.applied = true;
  renderLmMessages();
  toast(`${applied}개 클립 수정 적용됨`, 'success');
}

// Single-edit apply (from individual button)
async function applyLmEdit(clipIdx, btnEl, msgIdx) {
  if (clipIdx < 0 || clipIdx >= currentClips.length) { toast('잘못된 클립 인덱스', 'error'); return; }
  const msg = lmChatHistory[msgIdx];
  if (!msg || !msg.edits) return;
  const edit = msg.edits.find(e => e.clipIndex === clipIdx);
  if (!edit) return;
  currentClips[clipIdx].text = edit.newText;
  const clip = currentClips[clipIdx];
  const ep = scenarioData?.episodes?.[$('selEpisode').value];
  if (ep) {
    if (clip.type === 'opening') ep.openingClips = edit.newText;
    else if (clip.type === 'outro') ep.nightOutroClips = edit.newText;
    else if (clip.type === 'role' && clip.roleId) ep.roleClips[clip.roleId] = edit.newText;
    await saveTtsJson();
  }
  renderClipList(); renderStats(); updateLmSkillInfo();
  btnEl.innerHTML = '&#10003; 적용됨';
  btnEl.classList.add('applied');
  btnEl.disabled = true;
  toast(`#${clipIdx + 1} ${roleDisplayName(clip.roleId)} 수정 적용됨`, 'success');
}

// Save helper for all_scenarios scope
async function lmSaveScenario(scenarioId, data) {
  if (!projectDirHandle) return;
  const parts = `public/assets/scenarios_tts/${scenarioId}.tts.json`.split('/');
  const fileName = parts.pop();
  const dir = await getSubDir(projectDirHandle, parts);
  const fh = await dir.getFileHandle(fileName, { create: false });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(data, null, 2) + '\n');
  await w.close();
}

// ── Messages UI ──
function addLmSystemMsg(text) {
  lmChatHistory.push({ role: 'system-msg', content: text });
  renderLmMessages();
}

function skillTag(skill) {
  const labels = { edit: 'EDIT', find_replace: 'FIND/REPLACE', rename_roles: 'RENAME', chat: 'CHAT' };
  return `<span class="lm-skill-tag ${skill}">${labels[skill] || skill}</span>`;
}

function scopeTag(scope) {
  const labels = { current: '현재 에피소드', all_episodes: '전체 에피소드', all_scenarios: '전체 시나리오', opening: '오프닝', outro: '아웃트로' };
  const label = labels[scope] || scope;
  return `<span class="lm-scope-tag">${escapeHtml(label)}</span>`;
}

function renderLmMessages() {
  const container = $('lmMessages');
  if (!container) return;

  container.innerHTML = lmChatHistory.map((msg, i) => {
    if (msg.role === 'system-msg') return `<div class="lm-msg system-msg">${escapeHtml(msg.content)}</div>`;
    if (msg.role === 'user') return `<div class="lm-msg user">${escapeHtml(msg.content)}</div>`;

    // ── Streaming (unparsed) ──
    if (!msg.parsed) {
      const { thinking, content, thinkingInProgress } = stripThinking(msg.raw);
      const elapsed = msg._startTime ? ((Date.now() - msg._startTime) / 1000).toFixed(1) : '0';
      const tokenEst = msg.raw ? Math.ceil(msg.raw.length / 3) : 0;
      let h = '<div class="lm-msg assistant">';
      if (thinking) {
        h += `<div class="lm-think"><details ${thinkingInProgress ? 'open' : ''}><summary>thinking${thinkingInProgress ? '...' : ''} (${thinking.length}자)</summary><pre>${escapeHtml(thinking)}</pre></details></div>`;
      }
      if (thinkingInProgress && !content) {
        h += `<span class="lm-streaming-status">thinking... ${elapsed}s ~${tokenEst}tok</span>`;
      } else if (content) {
        h += `<span class="lm-streaming-status">${escapeHtml(content.substring(0, 500))}${content.length > 500 ? '...' : ''}</span>`;
      } else if (!msg.raw) {
        h += `<span class="lm-streaming-status">대기 중... ${elapsed}s</span>`;
      } else {
        h += `<span class="lm-streaming-status">생성 중... ${elapsed}s ~${tokenEst}tok</span>`;
      }
      return h + '</div>';
    }

    // ── Parsed message ──
    let h = '<div class="lm-msg assistant">';
    if (msg.thinking) h += `<div class="lm-think"><details><summary>thinking (${msg.thinking.length}자)</summary><pre>${escapeHtml(msg.thinking)}</pre></details></div>`;

    // Skill + scope badges
    if (msg.skill !== 'chat') h += `<div style="margin-bottom:4px">${skillTag(msg.skill)} ${scopeTag(msg.scope)}</div>`;
    if (msg.explanation) h += `<div class="lm-explanation">${escapeHtml(msg.explanation)}</div>`;

    // ── Skill: edit ──
    if (msg.skill === 'edit' && msg.edits.length > 0) {
      h += '<div class="lm-edits">';
      for (const edit of msg.edits) {
        const idx = edit.clipIndex;
        const clip = (idx >= 0 && idx < currentClips.length) ? currentClips[idx] : null;
        const label = clip ? `#${idx + 1} ${roleDisplayName(clip.roleId)}` : `#${idx + 1}`;
        const applied = clip && clip.text === edit.newText;
        h += `<div class="lm-edit-item">
          <div class="clip-label">${escapeHtml(label)}</div>
          <div class="edit-text">${escapeHtml(edit.newText)}</div>
          <button class="lm-apply-btn ${applied ? 'applied' : ''}" onclick="applyLmEdit(${idx},this,${i})" ${applied ? 'disabled' : ''}>${applied ? '&#10003; 적용됨' : '적용'}</button>
        </div>`;
      }
      h += '</div>';
      if (!msg.applied) h += `<button class="lm-apply-all-btn" onclick="applyEditsFromMsg(${i})">전체 적용 (${msg.edits.length}개)</button>`;
      else h += `<button class="lm-apply-all-btn applied" disabled>&#10003; 전체 적용됨</button>`;
    }

    // ── Skill: find_replace ──
    if (msg.skill === 'find_replace' && msg.operations.length > 0) {
      h += '<div class="lm-ops-list">';
      for (const op of msg.operations) {
        h += `<div class="lm-op-item"><span class="lm-op-find">${escapeHtml(op.find)}</span><span class="lm-op-arrow">${op.isRegex ? '(regex) →' : '→'}</span><span class="lm-op-replace">${escapeHtml(op.replace)}</span></div>`;
      }
      h += '</div>';
      if (msg.preview) {
        const p = msg.preview;
        h += `<div class="lm-preview">`;
        h += `<div class="lm-preview-summary">${p.totalMatches}개 매치 / ${p.totalClips}개 클립${p.note ? ' — ' + escapeHtml(p.note) : ''}</div>`;
        if (p.changes.length > 0) {
          h += `<button class="lm-preview-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">미리보기 ${p.changes.length}건 ▼</button>`;
          h += `<div style="display:none;max-height:300px;overflow-y:auto">`;
          for (const c of p.changes.slice(0, 50)) {
            h += `<div class="lm-preview-item"><div class="label">${escapeHtml(c.label)} (${c.matchCount})</div><div class="lm-diff-old">${escapeHtml(c.oldText)}</div><div class="lm-diff-new">${escapeHtml(c.newText)}</div></div>`;
          }
          if (p.changes.length > 50) h += `<div style="color:var(--text-dim);font-size:11px;padding:4px">...외 ${p.changes.length - 50}건</div>`;
          h += '</div>';
        }
        h += '</div>';
        if (!msg.applied) h += `<button class="lm-apply-all-btn" onclick="applyFindReplaceFromMsg(${i})">적용 (${p.totalClips}개 클립)</button>`;
        else h += `<button class="lm-apply-all-btn applied" disabled>&#10003; 적용됨</button>`;
      }
    }

    // ── Skill: rename_roles ──
    if (msg.skill === 'rename_roles' && msg.renames.length > 0) {
      h += '<div class="lm-edits">';
      for (const r of msg.renames) {
        h += `<div class="lm-rename-item"><span class="old-name">${escapeHtml(r.oldName)}</span><span class="new-name">→ ${escapeHtml(r.newName)}</span></div>`;
      }
      h += '</div>';
      if (!msg.applied) h += `<button class="lm-apply-all-btn" onclick="applyRenamesFromMsg(${i})">호칭 변경 적용 (${msg.renames.length}개)</button>`;
      else h += `<button class="lm-apply-all-btn applied" disabled>&#10003; 적용됨</button>`;
    }

    // ── requestDocs indicator ──
    if (msg.requestDocs && msg.requestDocs.length > 0 && !msg._docsLoaded) {
      h += `<div style="margin-top:6px;font-size:11px;color:var(--blue)">&#128218; 문서 로딩 중: ${msg.requestDocs.join(', ')}...</div>`;
    } else if (msg._docsLoaded && msg._docsLoaded.length > 0) {
      h += `<div style="margin-top:6px;font-size:11px;color:var(--green)">&#128218; 첨부됨: ${msg._docsLoaded.join(', ')}</div>`;
    }

    if (msg.skill === 'chat' && !msg.explanation) {
      h += '<span style="color:var(--text-dim)">(빈 응답)</span>';
      if (msg._rawLength > 0) {
        h += `<div class="lm-think"><details><summary>raw (${msg._rawLength}자, finish:${msg._finishReason || '?'})</summary><pre>${escapeHtml((msg.raw || '').substring(0, 2000))}</pre></details></div>`;
      }
    }
    return h + '</div>';
  }).join('');

  container.scrollTop = container.scrollHeight;
}

// ── Send message ──
async function lmSendMessage() {
  if (!lmConnected || lmStreaming) return;
  const input = $('lmInput');
  const userMsg = input.value.trim();
  if (!userMsg) return;
  input.value = '';
  input.style.height = 'auto';
  lmChatHistory.push({ role: 'user', content: userMsg });
  renderLmMessages();
  updateLmSkillInfo();
  await loadKnowledgeIndex();
  await _lmExecuteRequest();
}

async function _lmExecuteRequest() {
  const maxTokens = parseInt($('lmMaxTokens').value) || 8192;
  lsSet('lmMaxTokens', maxTokens);

  const systemPrompt = buildSkillSystemPrompt();
  const recentMsgs = lmChatHistory
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-4)
    .map(m => ({ role: m.role, content: m.role === 'user' ? m.content : (m.explanation || m.raw || '') }));

  lmStreaming = true;
  $('lmSendBtn').disabled = true;
  $('lmInput').disabled = true;

  lmChatHistory.push({ role: 'assistant', raw: '', parsed: false, _startTime: Date.now() });
  const aIdx = lmChatHistory.length - 1;
  renderLmMessages();

  // Timer to update elapsed time display during long waits
  const elapsedTimer = setInterval(() => {
    if (lmChatHistory[aIdx]?.parsed) { clearInterval(elapsedTimer); return; }
    renderLmMessages();
  }, 1000);

  const url = $('lmServerUrl').value.trim().replace(/\/+$/, '');
  try {
    const resp = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: lmModel,
        messages: [{ role: 'system', content: systemPrompt }, ...recentMsgs],
        stream: true,
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });
    if (!resp.ok) { const t = await resp.text().catch(() => resp.statusText); throw new Error(`HTTP ${resp.status}: ${t}`); }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', lastRender = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const tr = line.trim();
        if (!tr || tr === 'data: [DONE]' || !tr.startsWith('data: ')) continue;
        try {
          const chunk = JSON.parse(tr.slice(6));
          const choice = chunk.choices?.[0];
          // content: main text; reasoning_content: some servers put thinking here
          const delta = choice?.delta?.content || choice?.delta?.reasoning_content || '';
          if (delta) {
            lmChatHistory[aIdx].raw += delta;
            const now = Date.now();
            if (now - lastRender > 100) { renderLmMessages(); lastRender = now; }
          }
          // Also capture finish_reason for debugging
          if (choice?.finish_reason) {
            lmChatHistory[aIdx]._finishReason = choice.finish_reason;
          }
        } catch {}
      }
    }
    postProcessAssistantMsg(aIdx);
    renderLmMessages();

    // ── Knowledge chain: if LLM requested docs, load them and re-execute ──
    const msg = lmChatHistory[aIdx];
    const newDocs = (msg.requestDocs || []).filter(id => !knowledgeLoaded.includes(id));
    if (newDocs.length > 0) {
      const loaded = [];
      for (const id of newDocs) {
        const content = await loadKnowledgeDoc(id);
        if (content) { knowledgeLoaded.push(id); loaded.push(id); }
      }
      msg._docsLoaded = loaded;
      renderLmMessages();

      if (loaded.length > 0) {
        addLmSystemMsg(`문서 ${loaded.length}개 로드됨: ${loaded.join(', ')} — 지식 포함하여 재실행 중...`);
        lmStreaming = false; // allow re-entry
        await _lmExecuteRequest(); // chain: re-execute with docs attached
        return; // skip finally below (handled by inner call)
      }
    }
  } catch (e) {
    const msg = lmChatHistory[aIdx];
    msg.raw = msg.raw || '';
    msg.explanation = (msg.explanation || msg.raw || '') + (msg.raw ? '\n\n' : '') + `[error: ${e.message}]`;
    msg.skill = 'chat'; msg.edits = []; msg.operations = []; msg.renames = []; msg.requestDocs = [];
    msg.parsed = true;
    renderLmMessages();
    toast(`LM Studio: ${e.message}`, 'error');
  } finally {
    clearInterval(elapsedTimer);
    lmStreaming = false;
    $('lmSendBtn').disabled = false;
    $('lmInput').disabled = false;
    $('lmInput').focus();
  }
}

// ── Input history (arrow up/down) ──
const LM_HISTORY_KEY = 'lmInputHistory';
let lmInputHistory = lsGetJson(LM_HISTORY_KEY, []);
let lmHistoryIdx = -1;
let lmHistoryDraft = '';

function lmSaveToHistory(text) {
  if (!text) return;
  // Remove duplicate if exists
  lmInputHistory = lmInputHistory.filter(h => h !== text);
  lmInputHistory.push(text);
  // Keep last 50
  if (lmInputHistory.length > 50) lmInputHistory = lmInputHistory.slice(-50);
  lsSetJson(LM_HISTORY_KEY, lmInputHistory);
  lmHistoryIdx = -1;
}

// ── Init ──
// Restore panel state (default: open)
(function initLmPanel() {
  const saved = lsGet('lmPanelOpen', '1');
  if (saved === '0') {
    $('lmSidebar').classList.add('collapsed');
  } else {
    // Auto-open on load
    setTimeout(() => openLmPanel(), 300);
  }
})();

(function initLmInput() {
  const el = $('lmInput');
  if (!el) return;

  el.addEventListener('keydown', (e) => {
    // Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = el.value.trim();
      if (text) lmSaveToHistory(text);
      lmSendMessage();
      return;
    }
    // Arrow Up/Down for input history
    if (e.key === 'ArrowUp' && lmInputHistory.length > 0) {
      // Only activate at beginning of input or empty
      if (el.selectionStart === 0 || !el.value) {
        e.preventDefault();
        if (lmHistoryIdx === -1) lmHistoryDraft = el.value;
        lmHistoryIdx = lmHistoryIdx === -1 ? lmInputHistory.length - 1 : Math.max(0, lmHistoryIdx - 1);
        el.value = lmInputHistory[lmHistoryIdx];
      }
    }
    if (e.key === 'ArrowDown' && lmHistoryIdx !== -1) {
      if (el.selectionStart === el.value.length || !el.value) {
        e.preventDefault();
        lmHistoryIdx++;
        if (lmHistoryIdx >= lmInputHistory.length) {
          lmHistoryIdx = -1;
          el.value = lmHistoryDraft;
        } else {
          el.value = lmInputHistory[lmHistoryIdx];
        }
      }
    }
  });

  el.addEventListener('input', () => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    // Reset history navigation when user types
    if (lmHistoryIdx !== -1) { lmHistoryIdx = -1; }
  });

  $('lmMaxTokens').addEventListener('change', () => { lsSet('lmMaxTokens', $('lmMaxTokens').value); });
})();
