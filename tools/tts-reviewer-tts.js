// ============================================================================
// tts-reviewer-tts.js — TTS generation, M4A save, regen queue
// ============================================================================

// ── TTS Regeneration (Fish Speech API) ──
function getApiBase() {
  const val = $('ttsApiBase').value.trim().replace(/\/+$/, '');
  lsSet('apiBase', val);
  return val;
}

function findVoiceEntry(tag) {
  if (!tag || voicesJsonData.length === 0) return null;
  return voicesJsonData.find(v => v.tag === tag) || null;
}

async function generateTts(text, speakerId, overrideTag) {
  const base = getApiBase();
  const tag = overrideTag || (voiceMap ? (voiceMap[speakerId] || voiceMap['Narrator']) : null);

  const body = {
    text,
    format: 'm4a',
    temperature: 0.8,
    top_p: 0.8,
    repetition_penalty: 1.1,
    max_new_tokens: 1024,
    normalize: true,
  };
  if (tag) body.reference_id = tag;

  const resp = await fetch(`${base}/v1/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`TTS 실패 (${resp.status}): ${errText}`);
  }

  const blob = await resp.blob();
  return { blob, blobUrl: URL.createObjectURL(blob) };
}

function getTagOverride(idx) {
  const el = $(`vtag-${idx}`);
  if (!el) return null;
  const val = el.value.trim();
  const defaultTag = getVoiceTag(currentClips[idx].roleId);
  return (val && val !== defaultTag) ? val : null;
}

// ── M4A File Save ──
function getExpectedAudioPath(clip) {
  if (clip.audioUrl) return clip.audioUrl;
  if (!scenarioData) return null;
  const sid = scenarioData.scenarioId;
  const eid = $('selEpisode').value;
  if (clip.type === 'opening') return `/assets/voices/${sid}/${eid}/pall/opening/001/voice.m4a`;
  if (clip.type === 'outro') return `/assets/voices/${sid}/${eid}/pall/outro/001/voice.m4a`;
  if (clip.type === 'role' && clip.roleId) return `/assets/voices/${sid}/${eid}/pall/role/${clip.roleId}/during/001/voice.m4a`;
  return null;
}

async function autoSaveClip(audioPath, m4aBlob) {
  const relPath = ('public' + audioPath).replace(/\\/g, '/');
  const parts = relPath.split('/').filter(Boolean);
  const fileName = parts.pop();
  const dir = await getOrCreateSubDir(projectDirHandle, parts);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(m4aBlob);
  await writable.close();
}

// ── Regenerate All Clips (queue-based) ──
function regenAllClips() {
  if (currentClips.length === 0) return;
  let added = 0;
  for (let idx = 0; idx < currentClips.length; idx++) {
    if (!regenQueue.some(q => q.clipIdx === idx)) {
      regenQueue.push({ clipIdx: idx });
      added++;
    }
  }
  if (added > 0) toast(`${added}개 클립이 큐에 추가됨`);
  updateQueuePanel();
  renderStats();
  if (!regenRunning) runQueue();
}

// ── Regen Queue (unified, auto-start) ──
let queueDoneCount = 0;
// queueCurrentIdx is declared in tts-reviewer-state.js

function queueAndRun(idx) {
  if (regenQueue.some(q => q.clipIdx === idx)) { toast('이미 큐에 있습니다'); return; }
  // Flush any pending edit from selection (textarea → clip.text)
  const editEl = $(`edit-${idx}`);
  if (editEl && editEl.style.display === 'block') {
    const val = editEl.value.trim();
    if (val && val !== currentClips[idx].text) {
      currentClips[idx].text = val;
      if (typeof _autoSaveClipText === 'function') _autoSaveClipText(idx, val);
    }
  }
  // Only store clipIdx — text is read at execution time (always latest)
  regenQueue.push({ clipIdx: idx });
  updateQueuePanel();
  _updateQueueButtons();
  renderStats();
  if (!regenRunning) runQueue();
}

function clearRegenQueue() { regenQueue = []; regenRunning = false; queueDoneCount = 0; queueCurrentIdx = -1; updateQueuePanel(); renderStats(); }

// Lightweight update of regen buttons without full re-render
function _updateQueueButtons() {
  currentClips.forEach((clip, idx) => {
    const actionsEl = $(`clip-${idx}`)?.querySelector('.clip-actions');
    if (!actionsEl) return;
    // Find the regen button area (2nd child onward, after play button)
    const playBtn = actionsEl.querySelector('button');
    // Remove old regen elements after play button
    while (playBtn && playBtn.nextSibling) playBtn.nextSibling.remove();
    // Re-insert
    const tmp = document.createElement('div');
    tmp.innerHTML = _renderRegenButton(idx, clip);
    while (tmp.firstChild) actionsEl.appendChild(tmp.firstChild);
  });
}

function updateQueuePanel() {
  const panel = $('queuePanel');
  if (regenQueue.length > 0 || regenRunning) {
    panel.classList.add('visible');
    $('playbackBar').style.bottom = '60px';
  } else {
    panel.classList.remove('visible');
    $('playbackBar').style.bottom = '0';
  }
  $('queueCount').textContent = regenQueue.length;
  updateBottomPadding();
}

$('btnClearQueue').addEventListener('click', () => {
  clearRegenQueue();
  $('queueLog').textContent = '';
  $('queueDone').textContent = '0';
  $('queueProgressBar').style.width = '0%';
});

async function runQueue() {
  if (regenRunning) return;
  if (regenQueue.length === 0) return;

  regenRunning = true;
  queueDoneCount = 0;
  const log = $('queueLog');

  $('queuePanel').classList.add('visible');
  $('playbackBar').style.bottom = '60px';
  updateBottomPadding();
  $('queueDone').textContent = '0';
  $('queueProgressBar').style.width = '0%';

  while (regenQueue.length > 0) {
    const item = regenQueue.shift();
    const idx = item.clipIdx;
    const clip = currentClips[idx];
    if (!clip) { queueDoneCount++; continue; }

    // Read latest text & tag at execution time (not enqueue time)
    const text = clip.text;
    const speakerId = clip.speakerId || clip.roleId;
    const tagOverride = getTagOverride(idx);
    const card = $(`clip-${idx}`);

    queueCurrentIdx = idx;
    log.textContent += `[${new Date().toLocaleTimeString()}] #${idx + 1} ${roleDisplayName(clip.roleId)} 재생성 시작...\n`;
    log.scrollTop = log.scrollHeight;
    if (card) card.classList.add('regenerating');
    _updateQueueButtons();

    try {
      const { blob, blobUrl } = await generateTts(text, speakerId, tagOverride);
      currentClips[idx].regenBlobUrl = blobUrl;

      const audioPath = getExpectedAudioPath(currentClips[idx]);
      if (projectDirHandle && audioPath) {
        try {
          await autoSaveClip(audioPath, blob);
          currentClips[idx].audioUrl = audioPath;
          delete audioBlobCache['public' + audioPath];
          log.textContent += `  -> M4A 저장 완료\n`;
        } catch (e2) {
          log.textContent += `  -> TTS 완료, 저장 실패: ${e2.message}\n`;
        }
      } else {
        log.textContent += `  -> 완료\n`;
      }
    } catch (e) {
      log.textContent += `  -> 실패: ${e.message}\n`;
    }

    queueDoneCount++;
    queueCurrentIdx = -1;
    if (card) card.classList.remove('regenerating');
    _updateQueueButtons();

    $('queueDone').textContent = queueDoneCount;
    $('queueCount').textContent = regenQueue.length;
    const total = queueDoneCount + regenQueue.length;
    $('queueProgressBar').style.width = total > 0 ? `${(queueDoneCount / total) * 100}%` : '100%';
    log.scrollTop = log.scrollHeight;
    renderStats();
  }

  regenRunning = false;
  toast(`큐 처리 완료: ${queueDoneCount}개`, 'success');
  renderClipList();
  renderStats();
  updateQueuePanel();
}
