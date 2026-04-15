// ============================================================================
// tts-reviewer-ui.js — Render, edit, audio playback, keyboard, folder picker
// ============================================================================

// ── Render ──
function renderEpisode(episodeId) {
  stopAll();
  clearRegenQueue();
  selectedClips.clear();

  const ep = scenarioData.episodes[episodeId];
  if (!ep) return;

  const scenarioId = scenarioData.scenarioId;
  currentClips = [];

  if (ep.openingClips) {
    currentClips.push({
      type: 'opening', speakerId: 'Narrator', roleId: 'Narrator',
      text: ep.openingClips, originalText: ep.openingClips,
      audioUrl: findAudioUrl(scenarioId, episodeId, 'opening', null)
            || `/assets/voices/${scenarioId}/${episodeId}/pall/opening/001/voice.m4a`,
    });
  }
  if (ep.roleClips) {
    for (const [roleId, text] of Object.entries(ep.roleClips)) {
      currentClips.push({
        type: 'role', speakerId: roleId, roleId,
        text, originalText: text,
        audioUrl: findAudioUrl(scenarioId, episodeId, 'role', roleId)
              || `/assets/voices/${scenarioId}/${episodeId}/pall/role/${roleId}/during/001/voice.m4a`,
      });
    }
  }
  if (ep.nightOutroClips) {
    currentClips.push({
      type: 'outro', speakerId: 'Narrator', roleId: 'Narrator',
      text: ep.nightOutroClips, originalText: ep.nightOutroClips,
      audioUrl: findAudioUrl(scenarioId, episodeId, 'outro', null)
            || `/assets/voices/${scenarioId}/${episodeId}/pall/outro/001/voice.m4a`,
    });
  }

  renderClipList();
  renderStats();
  $('btnPlayAll').disabled = false;
  $('btnStopAll').disabled = false;
  $('btnRegenAll').disabled = false;
  if (typeof updateLmSkillInfo === 'function') updateLmSkillInfo();
}

function findAudioUrl(scenarioId, episodeId, clipType, roleId) {
  if (!manifestData || !manifestData.clips) return null;
  for (const c of manifestData.clips) {
    const id = c.clipId || '';
    if (!id.includes(`/${episodeId}/`)) continue;
    if (clipType === 'opening' && id.includes('/opening/')) return c.url;
    if (clipType === 'outro' && id.includes('/outro/')) return c.url;
    if (clipType === 'role' && roleId && id.includes(`/role/${roleId}/`)) return c.url;
  }
  return null;
}

function renderClipList() {
  const container = $('clipContainer');
  container.innerHTML = '';
  let lastType = '';

  currentClips.forEach((clip, idx) => {
    if (clip.type !== lastType) {
      const header = document.createElement('div');
      header.className = 'clip-section-header';
      header.textContent = clip.type === 'opening' ? 'Opening' : clip.type === 'outro' ? 'Night Outro' : 'Role Clips';
      container.appendChild(header);
      lastType = clip.type;
    }

    const card = document.createElement('div');
    card.className = 'clip-card';
    card.id = `clip-${idx}`;
    if (clip.text !== clip.originalText) card.classList.add('modified');

    const voiceTag = getVoiceTag(clip.roleId);
    const hasAudio = !!clip.audioUrl || !!clip.regenBlobUrl;

    card.innerHTML = `
      <div class="clip-index">#${idx + 1}</div>
      <div class="clip-speaker">
        <span class="role-name">${roleDisplayName(clip.roleId)}</span>
        <span class="voice-tag" title="Voice Tag">${escapeHtml(voiceTag)}</span>
        <input class="voice-tag-input" id="vtag-${idx}" type="text" value="${escapeHtml(voiceTag)}"
               placeholder="voice tag" title="재생성 시 사용할 voice tag (수정 가능)">
      </div>
      <div class="clip-body">
        <div class="clip-text" id="text-${idx}" ${selectedClips.has(idx) ? 'style="display:none"' : ''}>${escapeHtml(clip.text)}</div>
        <textarea class="clip-text-edit" id="edit-${idx}" ${selectedClips.has(idx) ? 'style="display:block"' : ''}>${escapeHtml(clip.text)}</textarea>
      </div>
      <div class="clip-actions">
        <button class="btn btn-sm" onclick="playClip(${idx})" ${!hasAudio ? 'disabled title="오디오 파일 없음"' : ''}>
          &#9654; 재생
        </button>
        <button class="btn btn-sm primary" onclick="queueAndRun(${idx})" title="큐에 추가 후 자동 시작">
          &#9889; 재생성 & 저장
        </button>
        ${clip.regenBlobUrl ? `<span style="font-size:10px;color:var(--green)">&#10003; 저장됨</span>` : ''}
      </div>
    `;
    // Click to select (but not on buttons/inputs/textareas)
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, input, textarea, a')) return;
      toggleClipSelection(idx, e.ctrlKey || e.metaKey, e.shiftKey);
    });

    if (selectedClips.has(idx)) card.classList.add('selected');
    container.appendChild(card);
  });
}

// ── Clip selection ──
let _lastSelectedIdx = -1;

function toggleClipSelection(idx, multi, range) {
  if (range && _lastSelectedIdx >= 0) {
    // Shift+click: range select
    const lo = Math.min(_lastSelectedIdx, idx);
    const hi = Math.max(_lastSelectedIdx, idx);
    for (let i = lo; i <= hi; i++) selectedClips.add(i);
  } else if (multi) {
    // Ctrl+click: toggle one
    if (selectedClips.has(idx)) selectedClips.delete(idx);
    else selectedClips.add(idx);
  } else {
    // Plain click: select only this (or deselect if already sole selection)
    if (selectedClips.size === 1 && selectedClips.has(idx)) {
      selectedClips.clear();
    } else {
      selectedClips.clear();
      selectedClips.add(idx);
    }
  }
  _lastSelectedIdx = idx;
  // Update card classes + edit state without full re-render
  currentClips.forEach((_, i) => {
    const el = $(`clip-${i}`);
    if (!el) return;
    const wasSelected = el.classList.contains('selected');
    const isSelected = selectedClips.has(i);
    el.classList.toggle('selected', isSelected);

    const textEl = $(`text-${i}`), editEl = $(`edit-${i}`);
    if (!textEl || !editEl) return;

    if (isSelected && !wasSelected) {
      // Entering selection → show editor
      textEl.style.display = 'none';
      editEl.style.display = 'block';
      editEl.value = currentClips[i].text;
    } else if (!isSelected && wasSelected) {
      // Leaving selection → auto-save if changed
      const newText = editEl.value.trim();
      if (newText && newText !== currentClips[i].text) {
        currentClips[i].text = newText;
        el.classList.toggle('modified', newText !== currentClips[i].originalText);
        _autoSaveClipText(i, newText);
      }
      textEl.textContent = currentClips[i].text;
      textEl.style.display = '';
      editEl.style.display = 'none';
    }
  });
  renderStats();
  if (typeof updateLmSkillInfo === 'function') updateLmSkillInfo();
}

function renderStats() {
  const total = currentClips.length;
  const withAudio = currentClips.filter(c => c.audioUrl).length;
  const missing = total - withAudio;
  const regenCount = currentClips.filter(c => c.regenBlobUrl).length;
  const modifiedCount = currentClips.filter(c => c.text !== c.originalText).length;
  $('statsBar').innerHTML = `
    <div class="stat-chip"><span class="num">${total}</span> 전체 클립</div>
    <div class="stat-chip" style="color:var(--green)"><span class="num">${withAudio}</span> 오디오 있음</div>
    ${missing > 0 ? `<div class="stat-chip" style="color:var(--red)"><span class="num">${missing}</span> 오디오 없음</div>` : ''}
    <div class="stat-chip"><span class="num">${regenQueue.length}</span> 재생성 큐</div>
    ${regenCount > 0 ? `<div class="stat-chip" style="color:var(--orange)"><span class="num">${regenCount}</span> 재생성됨 (자동저장)</div>` : ''}
    ${modifiedCount > 0 ? `<div class="stat-chip" style="color:var(--orange)"><span class="num">${modifiedCount}</span> 텍스트 수정됨</div>` : ''}
    ${selectedClips.size > 0 ? `<div class="stat-chip" style="color:var(--accent)"><span class="num">${selectedClips.size}</span> 선택됨 <span style="cursor:pointer;margin-left:4px" onclick="selectedClips.clear();renderClipList();renderStats();">&#10005;</span></div>` : ''}
  `;
}

// ── Auto-save helper (used by selection deselect) ──
let _saveTimer = null;
function _autoSaveClipText(idx, newText) {
  const clip = currentClips[idx];
  const episodeId = $('selEpisode').value;
  const ep = scenarioData?.episodes?.[episodeId];
  if (ep) {
    if (clip.type === 'opening') ep.openingClips = newText;
    else if (clip.type === 'outro') ep.nightOutroClips = newText;
    else if (clip.type === 'role' && clip.roleId) ep.roleClips[clip.roleId] = newText;
  }
  // Debounce save (multiple clips may deselect at once)
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveTtsJson(), 300);
}

// ── Edit ──
function toggleEdit(idx) {
  const textEl = $(`text-${idx}`), editEl = $(`edit-${idx}`);
  if (editEl.style.display !== 'none') { cancelEdit(idx); return; }
  textEl.style.display = 'none';
  editEl.style.display = 'block';
  editEl.value = currentClips[idx].text;
  $(`saveBtn-${idx}`).style.display = '';
  $(`cancelBtn-${idx}`).style.display = '';
  $(`revertBtn-${idx}`).style.display = currentClips[idx].text !== currentClips[idx].originalText ? '' : 'none';
  editEl.focus();
}

async function saveEdit(idx) {
  const newText = $(`edit-${idx}`).value.trim();
  if (!newText) return;
  currentClips[idx].text = newText;
  $(`text-${idx}`).textContent = newText;
  $(`text-${idx}`).style.display = '';
  $(`edit-${idx}`).style.display = 'none';
  $(`saveBtn-${idx}`).style.display = 'none';
  $(`cancelBtn-${idx}`).style.display = 'none';
  $(`revertBtn-${idx}`).style.display = 'none';
  const card = $(`clip-${idx}`);
  if (newText !== currentClips[idx].originalText) card.classList.add('modified');
  else card.classList.remove('modified');
  renderStats();

  const clip = currentClips[idx];
  const episodeId = $('selEpisode').value;
  const ep = scenarioData?.episodes?.[episodeId];
  if (ep) {
    if (clip.type === 'opening') ep.openingClips = newText;
    else if (clip.type === 'outro') ep.nightOutroClips = newText;
    else if (clip.type === 'role' && clip.roleId) ep.roleClips[clip.roleId] = newText;
    await saveTtsJson();
  }
}

async function saveTtsJson() {
  if (!scenarioData) return;
  const scenarioId = scenarioData.scenarioId;
  if (projectDirHandle) {
    try {
      const parts = `public/assets/scenarios_tts/${scenarioId}.tts.json`.split('/');
      const fileName = parts.pop();
      const dir = await getSubDir(projectDirHandle, parts);
      const fileHandle = await dir.getFileHandle(fileName, { create: false });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(scenarioData, null, 2) + '\n');
      await writable.close();
      toast(`${scenarioId}.tts.json 저장 완료`, 'success');
    } catch (e) {
      toast(`tts.json 저장 실패: ${e.message}`, 'error');
    }
  } else {
    const blob = new Blob([JSON.stringify(scenarioData, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${scenarioId}.tts.json`;
    a.click(); URL.revokeObjectURL(url);
    toast(`${scenarioId}.tts.json 다운로드됨`, 'success');
  }
}

function cancelEdit(idx) {
  $(`text-${idx}`).style.display = '';
  $(`edit-${idx}`).style.display = 'none';
  $(`saveBtn-${idx}`).style.display = 'none';
  $(`cancelBtn-${idx}`).style.display = 'none';
  $(`revertBtn-${idx}`).style.display = 'none';
}

function revertEdit(idx) {
  currentClips[idx].text = currentClips[idx].originalText;
  $(`text-${idx}`).textContent = currentClips[idx].originalText;
  $(`edit-${idx}`).value = currentClips[idx].originalText;
  cancelEdit(idx);
  $(`clip-${idx}`).classList.remove('modified');
  renderStats();
}

// ── Audio Playback ──
const audioPlayer = document.getElementById('audioPlayer');

function playClip(idx) { stopAll(); isPlayAll = false; _play(idx); }

async function _play(idx) {
  if (idx < 0 || idx >= currentClips.length) { stopAll(); return; }

  const clip = currentClips[idx];
  const src = await resolveAudioSrc(clip);
  if (!src) {
    if (isPlayAll) { _play(idx + 1); } else { toast('오디오 파일이 없습니다', 'error'); }
    return;
  }

  playingIdx = idx;

  document.querySelectorAll('.clip-card.playing').forEach(el => el.classList.remove('playing'));
  const card = $(`clip-${idx}`);
  if (card) { card.classList.add('playing'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

  $('playbackBar').classList.add('visible');
  $('pbNowPlaying').innerHTML = `<span class="role">${roleDisplayName(clip.roleId)}</span> &mdash; ${escapeHtml(clip.text.substring(0, 80))}...`;

  audioPlayer.src = src;
  audioPlayer.play().catch(() => {});
}

audioPlayer.addEventListener('ended', () => {
  document.querySelectorAll('.clip-card.playing').forEach(el => el.classList.remove('playing'));
  if (isPlayAll) { _play(playingIdx + 1); }
  else { playingIdx = -1; $('playbackBar').classList.remove('visible'); }
});
audioPlayer.addEventListener('error', () => {
  toast(`오디오 재생 실패: clip #${playingIdx + 1}`, 'error');
  if (isPlayAll) _play(playingIdx + 1);
});

function stopAll() {
  isPlayAll = false;
  audioPlayer.pause();
  audioPlayer.removeAttribute('src');
  playingIdx = -1;
  document.querySelectorAll('.clip-card.playing').forEach(el => el.classList.remove('playing'));
  $('playbackBar').classList.remove('visible');
}

$('btnPlayAll').addEventListener('click', () => { stopAll(); isPlayAll = true; _play(0); });
$('btnStopAll').addEventListener('click', stopAll);
$('pbPrev').addEventListener('click', () => { if (playingIdx > 0) { const p = playingIdx; stopAll(); _play(p - 1); } });
$('pbNext').addEventListener('click', () => { if (playingIdx < currentClips.length - 1) { const p = playingIdx; stopAll(); _play(p + 1); } });

// ── Server Ping ──
async function pingServer() {
  const dot = $('serverStatus');
  try {
    const resp = await fetch(getApiBase() + '/v1/health', { method: 'GET' });
    if (resp.ok) {
      dot.className = 'status-dot ok'; dot.title = '연결됨 (Fish Speech)';
    } else {
      dot.className = 'status-dot err'; dot.title = `서버 응답: ${resp.status}`;
    }
  } catch {
    dot.className = 'status-dot err'; dot.title = '연결 실패';
  }
}

$('btnPing').addEventListener('click', async () => {
  $('serverStatus').className = 'status-dot';
  await pingServer();
  toast($('serverStatus').classList.contains('ok') ? 'TTS 서버 연결됨' : 'TTS 서버 연결 실패',
        $('serverStatus').classList.contains('ok') ? 'success' : 'error');
});

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.key === ' ') { e.preventDefault(); audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause(); }
  if (e.key === 'Escape') {
    if ($('vbRolePicker').style.display !== 'none') { hideRolePicker(); return; }
    const confirmEl = document.querySelector('.confirm-overlay');
    if (confirmEl) { confirmEl.remove(); return; }
    if ($('lmSidebar') && !$('lmSidebar').classList.contains('collapsed')) { closeLmPanel(); return; }
    closeVoiceMapPanel(false); stopAll();
  }
  if (e.key === 'ArrowRight' && playingIdx >= 0) _play(playingIdx + 1);
  if (e.key === 'ArrowLeft' && playingIdx > 0) _play(playingIdx - 1);
});

// ── Folder Picker ──
function showFolderPicker(savedName) {
  const hint = savedName ? `<br><small style="color:var(--green)">이전 폴더: ${escapeHtml(savedName)}</small>` : '';
  $('clipContainer').innerHTML = `
    <div class="folder-banner">
      <h2>프로젝트 폴더 선택</h2>
      <p>
        file:// 프로토콜에서는 보안 제한으로 직접 파일을 읽을 수 없습니다.<br>
        아래 버튼을 클릭해서 프로젝트 루트 폴더를 선택해주세요.<br>
        <small style="color:var(--text-dim)">
          (One-Night-Ultimate-Werewolf-LLM-Edition 폴더)
        </small>
        ${hint}
      </p>
      <button class="btn primary" onclick="pickProjectFolder()">폴더 선택</button>
    </div>
  `;
}

async function pickProjectFolder() {
  try {
    projectDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

    try {
      await readJsonFromDir(projectDirHandle, 'characters/voice_map.json');
    } catch {
      toast('올바른 프로젝트 폴더가 아닙니다. One-Night-Ultimate-Werewolf-LLM-Edition 폴더를 선택해주세요.', 'error');
      projectDirHandle = null;
      return;
    }

    lsSet('folderName', projectDirHandle.name);
    idbSave('projectDir', projectDirHandle);
    $('modeBadge').textContent = 'LOCAL';
    $('modeBadge').className = 'mode-badge local';
    toast('프로젝트 폴더 연결됨', 'success');

    await loadVoiceMap();
    initSelectors();
    $('clipContainer').innerHTML = '<div class="loading">시나리오를 선택하세요</div>';
    restoreSelection();
  } catch (e) {
    if (e.name !== 'AbortError') {
      toast(`폴더 선택 실패: ${e.message}`, 'error');
    }
  }
}
