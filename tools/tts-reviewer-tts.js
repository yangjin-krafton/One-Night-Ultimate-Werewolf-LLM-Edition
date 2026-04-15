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
      const clip = currentClips[idx];
      regenQueue.push({
        clipIdx: idx, text: clip.text, speakerId: clip.speakerId,
        roleId: clip.roleId, tagOverride: null
      });
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

function queueAndRun(idx) {
  const clip = currentClips[idx];
  if (regenQueue.some(q => q.clipIdx === idx)) { toast('이미 큐에 있습니다'); return; }
  regenQueue.push({
    clipIdx: idx, text: clip.text, speakerId: clip.speakerId,
    roleId: clip.roleId, tagOverride: getTagOverride(idx)
  });
  updateQueuePanel();
  renderStats();
  if (!regenRunning) runQueue();
}

function clearRegenQueue() { regenQueue = []; regenRunning = false; queueDoneCount = 0; updateQueuePanel(); renderStats(); }

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
  $('queueDone').textContent = '0';
  $('queueProgressBar').style.width = '0%';

  while (regenQueue.length > 0) {
    const item = regenQueue.shift();
    const idx = item.clipIdx;
    const card = $(`clip-${idx}`);

    log.textContent += `[${new Date().toLocaleTimeString()}] #${idx + 1} ${roleDisplayName(item.roleId)} 재생성 시작...\n`;
    log.scrollTop = log.scrollHeight;
    if (card) card.classList.add('regenerating');

    try {
      const { blob, blobUrl } = await generateTts(item.text, item.speakerId, item.tagOverride);
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
    if (card) card.classList.remove('regenerating');

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
