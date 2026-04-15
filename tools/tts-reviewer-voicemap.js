// ============================================================================
// tts-reviewer-voicemap.js — Voice Map Panel + Voice Browser
// ============================================================================

const voicePreviewCache = {};

function openVoiceMapPanel() {
  $('vmOverlay').classList.add('open');
  $('vmPanel').classList.add('open');
  renderVoiceMapList();
  renderVoiceBrowser();
  if (serverVoices.length === 0 && !voiceLibDirHandle) fetchServerVoices();
}

function hideRolePicker() {
  const picker = $('vbRolePicker');
  if (picker) picker.style.display = 'none';
  const backdrop = document.querySelector('.vb-role-picker-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

function closeVoiceMapPanel(force) {
  if (!force && voiceMapDirty) {
    showConfirm(
      'Voice Map 변경사항',
      '저장하지 않은 변경사항이 있습니다. 저장하시겠습니까?',
      [
        { label: '저장 후 닫기', cls: 'primary', action: async () => { await saveVoiceMap(); doCloseVmPanel(); } },
        { label: '저장 안 함', cls: 'danger', action: () => { revertVoiceMap(); doCloseVmPanel(); } },
        { label: '취소', cls: '', action: () => {} },
      ]
    );
    return;
  }
  doCloseVmPanel();
}

function doCloseVmPanel() {
  $('vmOverlay').classList.remove('open');
  $('vmPanel').classList.remove('open');
  hideRolePicker();
}

function revertVoiceMap() {
  if (voiceMapOriginal) {
    try { voiceMap = JSON.parse(voiceMapOriginal); } catch {}
  }
  voiceMapDirty = false;
  updateVmSaveBtn();
  if (currentClips.length > 0) renderClipList();
}

function showConfirm(title, message, buttons) {
  const existing = document.querySelector('.confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="actions" id="confirmActions"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const actionsEl = overlay.querySelector('#confirmActions');
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = `btn ${b.cls}`;
    btn.textContent = b.label;
    btn.addEventListener('click', () => { overlay.remove(); b.action(); });
    actionsEl.appendChild(btn);
  }
}

async function fetchServerVoices() {
  if (!voiceLibDirHandle) {
    try {
      voiceLibDirHandle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (e) {
      if (e.name !== 'AbortError') toast(`폴더 선택 실패: ${e.message}`, 'error');
      return;
    }
  }

  try {
    const fileHandle = await voiceLibDirHandle.getFileHandle('voices.json');
    const file = await fileHandle.getFile();
    const data = JSON.parse(await file.text());
    voicesJsonData = data.voices || [];
    serverVoices = voicesJsonData.map(v => v.tag).sort();
    lsSetJson('serverVoices', serverVoices);
    lsSet('voiceLibName', voiceLibDirHandle.name);
    idbSave('voiceLibDir', voiceLibDirHandle);
    $('vmVoiceCount').textContent = `${serverVoices.length}개 음성`;
    renderVoiceMapList();
    toast(`음성 라이브러리 ${serverVoices.length}개 로드됨 (${voiceLibDirHandle.name})`, 'success');
  } catch (e) {
    toast(`voices.json 로드 실패: ${e.message}. data/voices/ref 폴더를 선택하세요.`, 'error');
    voiceLibDirHandle = null;
  }
}

function getRoleEntries() {
  if (!voiceMap) return [];
  const skip = new Set(['_comment','_voicesSource','_note','_roles']);
  return Object.entries(voiceMap).filter(([k]) => !skip.has(k) && !k.startsWith('_'));
}

function renderVoiceMapList() {
  const container = $('vmRoleList');
  const entries = getRoleEntries();
  if (entries.length === 0) {
    container.innerHTML = '<div class="loading">voice_map.json을 먼저 로드하세요</div>';
    return;
  }

  const filter = ($('vmSearch').value || '').toLowerCase();

  let html = '';
  for (const [roleId, currentVoice] of entries) {
    const displayName = roleDisplayName(roleId);
    if (filter && !displayName.toLowerCase().includes(filter) && !roleId.toLowerCase().includes(filter) && !currentVoice.toLowerCase().includes(filter)) continue;

    let options;
    if (serverVoices.length > 0) {
      options = serverVoices.map(v => {
        const sel = v === currentVoice ? 'selected' : '';
        return `<option value="${escapeHtml(v)}" ${sel}>${escapeHtml(v)}</option>`;
      }).join('');
      if (currentVoice && !serverVoices.includes(currentVoice)) {
        options = `<option value="${escapeHtml(currentVoice)}" selected>${escapeHtml(currentVoice)} (unknown)</option>` + options;
      }
    } else {
      options = `<option value="${escapeHtml(currentVoice)}" selected>${escapeHtml(currentVoice)}</option>`;
    }

    html += `
      <div class="vm-role-row">
        <div>
          <div class="vm-role-name">${displayName}</div>
          <div class="vm-role-id">${roleId}</div>
        </div>
        <select class="vm-voice-select" data-role="${roleId}" onchange="onVoiceMapChange(this)">
          ${options}
        </select>
        <button class="vm-preview-btn" data-role="${roleId}" onclick="previewVoice(this)">
          &#9654; 미리듣기
        </button>
      </div>`;
  }
  container.innerHTML = html || '<div style="color:var(--text-dim);padding:20px;text-align:center">검색 결과 없음</div>';
}

$('vmSearch').addEventListener('input', renderVoiceMapList);

function onVoiceMapChange(selectEl) {
  const roleId = selectEl.dataset.role;
  const newVoice = selectEl.value;
  if (voiceMap) voiceMap[roleId] = newVoice;
  voiceMapDirty = true;
  updateVmSaveBtn();
  if (currentClips.length > 0) renderClipList();
}

function updateVmSaveBtn() {
  const btn = $('btnVmSave');
  if (voiceMapDirty) {
    btn.innerHTML = '&#128190; voice_map.json 저장 <span style="color:var(--orange);font-size:10px">(변경됨)</span>';
    btn.classList.add('primary');
  } else {
    btn.innerHTML = 'voice_map.json 저장';
    btn.classList.remove('primary');
  }
}

async function previewVoice(btn) {
  const selectEl = btn.parentElement.querySelector('.vm-voice-select');
  const tag = selectEl.value;
  if (!tag) return;

  if (voicePreviewCache[tag]) {
    audioPlayer.src = voicePreviewCache[tag];
    audioPlayer.play().catch(() => {});
    $('playbackBar').classList.add('visible');
    $('pbNowPlaying').innerHTML = `<span class="role">미리듣기</span> &mdash; ${escapeHtml(tag)}`;
    return;
  }

  if (!voiceLibDirHandle) {
    toast('음성 라이브러리 폴더를 먼저 선택하세요 (새로고침 버튼)', 'error');
    return;
  }

  const entry = findVoiceEntry(tag);
  if (!entry) { toast(`"${tag}" 음성 정보를 찾을 수 없습니다`, 'error'); return; }

  btn.disabled = true;
  btn.textContent = '로딩...';

  try {
    const fileHandle = await voiceLibDirHandle.getFileHandle(entry.audio_filename);
    const file = await fileHandle.getFile();
    const blobUrl = URL.createObjectURL(file);
    voicePreviewCache[tag] = blobUrl;

    audioPlayer.src = blobUrl;
    audioPlayer.play().catch(() => {});
    $('playbackBar').classList.add('visible');
    const promptPreview = (entry.prompt_text || '').substring(0, 50);
    $('pbNowPlaying').innerHTML = `<span class="role">${escapeHtml(tag)}</span> &mdash; ${escapeHtml(promptPreview)}...`;
  } catch (e) {
    toast(`미리듣기 실패: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '&#9654; 미리듣기';
  }
}

async function saveVoiceMap() {
  if (!voiceMap) { toast('voice_map 데이터 없음', 'error'); return; }

  if (projectDirHandle) {
    try {
      const parts = 'characters/voice_map.json'.split('/');
      const fileName = parts.pop();
      const dir = await getSubDir(projectDirHandle, parts);
      const fileHandle = await dir.getFileHandle(fileName, { create: false });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(voiceMap, null, 2) + '\n');
      await writable.close();
      voiceMapDirty = false;
      voiceMapOriginal = JSON.stringify(voiceMap);
      updateVmSaveBtn();
      toast('voice_map.json 저장 완료', 'success');
    } catch (e) {
      toast(`저장 실패: ${e.message}`, 'error');
    }
  } else {
    const blob = new Blob([JSON.stringify(voiceMap, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'voice_map.json';
    a.click(); URL.revokeObjectURL(url);
    voiceMapDirty = false;
    voiceMapOriginal = JSON.stringify(voiceMap);
    updateVmSaveBtn();
    toast('voice_map.json 다운로드됨 (수동으로 교체하세요)', 'success');
  }
}

// ── Voice Browser (hover-to-play) ──
let vbHoverTimer = null;
let vbPlayingTag = null;

function chipGradient(str) {
  let h1 = 0, h2 = 0;
  for (let i = 0; i < str.length; i++) {
    h1 = (h1 * 31 + str.charCodeAt(i)) & 0xFFFFFF;
    h2 = (h2 * 37 + str.charCodeAt(str.length - 1 - i)) & 0xFFFFFF;
  }
  const hue1 = h1 % 360, hue2 = (h2 % 360);
  return `linear-gradient(135deg, hsl(${hue1},55%,38%), hsl(${hue2},55%,32%))`;
}

function renderVoiceBrowser() {
  const grid = $('vbGrid');
  if (!grid) return;
  if (serverVoices.length === 0) {
    grid.innerHTML = '<span style="color:var(--text-dim);font-size:12px;padding:8px">음성 라이브러리를 먼저 로드하세요</span>';
    const countEl = $('vbCount'); if (countEl) countEl.textContent = '0';
    return;
  }

  const searchEl = $('vbSearch');
  const filter = (searchEl ? searchEl.value : '').toLowerCase();
  const filtered = filter ? serverVoices.filter(v => v.toLowerCase().includes(filter)) : serverVoices;
  const countEl = $('vbCount'); if (countEl) countEl.textContent = `${filtered.length}/${serverVoices.length}`;

  grid.innerHTML = filtered.map(tag =>
    `<span class="vb-chip ${tag === vbPlayingTag ? 'playing' : ''}" data-tag="${escapeHtml(tag)}" style="background:${chipGradient(tag)}">${escapeHtml(tag)}</span>`
  ).join('');

  grid.querySelectorAll('.vb-chip').forEach(chip => {
    chip.addEventListener('mouseenter', onVbChipEnter);
    chip.addEventListener('mouseleave', onVbChipLeave);
    chip.addEventListener('click', onVbChipClick);
  });
}

async function onVbChipEnter(e) {
  const tag = e.target.dataset.tag;
  clearTimeout(vbHoverTimer);
  vbHoverTimer = setTimeout(() => playVoicePreview(tag), 200);
}

function onVbChipLeave() {
  clearTimeout(vbHoverTimer);
}

function onVbChipClick(e) {
  const tag = e.target.dataset.tag;
  if (!tag || !voiceMap) return;
  const rect = e.target.getBoundingClientRect();
  showRolePicker(tag, rect.right + 8, rect.top);
}

function showRolePicker(tag, x, y) {
  const picker = $('vbRolePicker');
  const entries = getRoleEntries();
  if (entries.length === 0) return;

  const vw = window.innerWidth, vh = window.innerHeight;
  if (x + 260 > vw) x = vw - 270;
  if (y + 360 > vh) y = Math.max(10, vh - 370);

  picker.style.left = x + 'px';
  picker.style.top = y + 'px';
  picker.style.display = 'flex';

  picker.innerHTML = `
    <div class="vb-role-picker-header">
      <span>${escapeHtml(tag)}</span>
      <button class="close-btn" onclick="hideRolePicker()">&#10005;</button>
    </div>
    <div class="vb-role-picker-list">
      ${entries.map(([rid, curVoice]) => {
        const isSame = curVoice === tag;
        return `<div class="vb-role-picker-item ${isSame ? 'same-voice' : ''}"
                     data-role="${rid}" data-tag="${escapeHtml(tag)}">
          <span class="role-label">${roleDisplayName(rid)}</span>
          <span class="cur-voice" title="${escapeHtml(curVoice)}">${isSame ? '&#10003; 현재' : escapeHtml(curVoice)}</span>
        </div>`;
      }).join('')}
    </div>
  `;

  let backdrop = document.querySelector('.vb-role-picker-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'vb-role-picker-backdrop';
    backdrop.addEventListener('click', hideRolePicker);
    document.body.appendChild(backdrop);
  }
  backdrop.style.display = 'block';

  picker.querySelectorAll('.vb-role-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      const roleId = item.dataset.role;
      const voiceTag = item.dataset.tag;
      voiceMap[roleId] = voiceTag;
      voiceMapDirty = true;
      updateVmSaveBtn();
      toast(`${roleDisplayName(roleId)} → ${voiceTag}`, 'success');
      hideRolePicker();
      renderVoiceMapList();
      if (currentClips.length > 0) renderClipList();
    });
  });
}

async function playVoicePreview(tag) {
  if (!voiceLibDirHandle) return;

  document.querySelectorAll('.vb-chip.playing').forEach(c => c.classList.remove('playing'));
  const chip = document.querySelector(`.vb-chip[data-tag="${CSS.escape(tag)}"]`);
  if (chip) chip.classList.add('playing');
  vbPlayingTag = tag;
  $('vbNowPlaying').textContent = tag;

  if (voicePreviewCache[tag]) {
    audioPlayer.src = voicePreviewCache[tag];
    audioPlayer.play().catch(() => {});
    return;
  }

  const entry = findVoiceEntry(tag);
  if (!entry) return;

  try {
    const fileHandle = await voiceLibDirHandle.getFileHandle(entry.audio_filename);
    const file = await fileHandle.getFile();
    const blobUrl = URL.createObjectURL(file);
    voicePreviewCache[tag] = blobUrl;
    audioPlayer.src = blobUrl;
    audioPlayer.play().catch(() => {});
  } catch {}
}
