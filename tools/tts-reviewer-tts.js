// ============================================================================
// tts-reviewer-tts.js — TTS generation, M4A save, regen queue
// ============================================================================

// ── TTS Backend Selection ──
function getBackend() {
  return ($('ttsBackend') || {}).value || 'fish';
}

function getApiBase() {
  const val = $('ttsApiBase').value.trim().replace(/\/+$/, '');
  lsSet('apiBase', val);
  return val;
}

function getQwen3ApiBase() {
  const val = $('ttsQwen3ApiBase').value.trim().replace(/\/+$/, '');
  lsSet('qwen3ApiBase', val);
  return val;
}

function findVoiceEntry(tag) {
  if (!tag || voicesJsonData.length === 0) return null;
  return voicesJsonData.find(v => v.tag === tag) || null;
}

// Auto-load the Qwen3 server's own voices.json so users don't have to
// pick the ref folder manually. The container mounts /data/voices/ref and
// Gradio's file server exposes it via /gradio_api/file=/data/voices/ref/voices.json.
let _qwen3VoicesLoadPromise = null;
function ensureQwen3VoicesLoaded() {
  if (voicesJsonData.length > 0) return Promise.resolve();
  if (_qwen3VoicesLoadPromise) return _qwen3VoicesLoadPromise;
  const base = getQwen3ApiBase();
  _qwen3VoicesLoadPromise = (async () => {
    const url = `${base}/gradio_api/file=/data/voices/ref/voices.json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`voices.json 로드 실패 (${resp.status})`);
    const data = await resp.json();
    voicesJsonData = data.voices || [];
    serverVoices = voicesJsonData.map(v => v.tag).sort();
    console.log(`[Qwen3] voices.json 자동 로드: ${voicesJsonData.length}개`);
  })().catch(e => {
    _qwen3VoicesLoadPromise = null;
    throw e;
  });
  return _qwen3VoicesLoadPromise;
}

// ── Fish Speech TTS ──
async function generateTtsFish(text, tag) {
  const base = getApiBase();
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
    throw new Error(`Fish TTS 실패 (${resp.status}): ${errText}`);
  }

  const blob = await resp.blob();
  return { blob, blobUrl: URL.createObjectURL(blob) };
}

// ── Qwen3-TTS (Gradio API) ──
async function generateTtsQwen3(text, tag) {
  const base = getQwen3ApiBase();

  await ensureQwen3VoicesLoaded();

  // Resolve voice info from voice library
  const entry = findVoiceEntry(tag);
  const refName = entry ? entry.audio_filename : '';
  const refText = entry ? (entry.prompt_text || '') : '';
  const useXvec = entry ? (entry.xvec_only !== false) : true;
  const genKwargs = entry && entry.gen ? entry.gen : {};

  const maxTokens = genKwargs.max_new_tokens || 2048;
  const doSample = genKwargs.do_sample !== false;
  const temperature = genKwargs.temperature || 0.9;
  const topP = genKwargs.top_p || 1.0;
  const topK = genKwargs.top_k || 50;

  // Step 1: Call generate_clone_from_file
  const callUrl = `${base}/gradio_api/call/generate_clone_from_file`;
  const callResp = await fetch(callUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [refName, refText, useXvec, text, 'korean', maxTokens, doSample, temperature, topP, topK]
    }),
  });

  if (!callResp.ok) {
    const errText = await callResp.text().catch(() => callResp.statusText);
    throw new Error(`Qwen3-TTS 호출 실패 (${callResp.status}): ${errText}`);
  }

  const { event_id } = await callResp.json();
  if (!event_id) throw new Error('Qwen3-TTS: event_id 없음');

  // Step 2: Read SSE stream
  const sseUrl = `${callUrl}/${event_id}`;
  const sseResp = await fetch(sseUrl);
  const sseText = await sseResp.text();

  let audioPath = null;
  for (const line of sseText.split('\n')) {
    if (line.startsWith('event:') && line.includes('error')) {
      const nextData = sseText.split('\n').find((l, i, arr) => i > arr.indexOf(line) && l.startsWith('data:'));
      throw new Error(`Qwen3-TTS 오류: ${nextData ? nextData.slice(5) : 'unknown'}`);
    }
    if (line.startsWith('data:') && audioPath === null) {
      try {
        const parsed = JSON.parse(line.slice(5));
        if (Array.isArray(parsed) && parsed.length >= 2) {
          const statusText = parsed[1] || '';
          if (typeof statusText === 'string' && statusText.toLowerCase().includes('error')) {
            throw new Error(`Qwen3-TTS 생성 오류: ${statusText}`);
          }
          const audioObj = parsed[0];
          if (audioObj && typeof audioObj === 'object') {
            audioPath = audioObj.path || audioObj.url;
          }
        }
      } catch (e) {
        if (e.message.includes('Qwen3-TTS')) throw e;
      }
    }
  }

  if (!audioPath) throw new Error('Qwen3-TTS: 오디오 경로 없음');

  // Step 3: Download audio file
  const fileUrl = `${base}/gradio_api/file=${audioPath}`;
  const audioResp = await fetch(fileUrl);
  if (!audioResp.ok) throw new Error(`Qwen3-TTS 오디오 다운로드 실패 (${audioResp.status})`);

  const blob = await audioResp.blob();
  return { blob, blobUrl: URL.createObjectURL(blob) };
}

// ── Unified TTS dispatch (serialized via shared mutex) ──
// A single chain prevents concurrent TTS requests regardless of caller
// (batch generation, regen queue, one-off clip regen, etc.). This keeps
// only one in-flight request at a time against the TTS backend and avoids
// file-write races on the same path.
let _ttsMutexChain = Promise.resolve();
let _ttsInFlight = 0;

function getTtsInFlight() { return _ttsInFlight; }

async function generateTts(text, speakerId, overrideTag) {
  const backend = getBackend();
  const tag = overrideTag || (voiceMap ? (voiceMap[speakerId] || voiceMap['Narrator']) : null);

  // Acquire mutex slot — chain onto previous call.
  const prev = _ttsMutexChain;
  let release;
  _ttsMutexChain = new Promise(r => (release = r));

  try {
    await prev;  // wait for previous call (errors isolated below — prev never rejects here)
    _ttsInFlight++;
    if (backend === 'qwen3') return await generateTtsQwen3(text, tag);
    return await generateTtsFish(text, tag);
  } finally {
    _ttsInFlight--;
    release();  // let next queued caller proceed
  }
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
      console.error(`[regen #${idx + 1} ${roleDisplayName(clip.roleId)}]`, e);
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
