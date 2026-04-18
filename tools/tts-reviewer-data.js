// ============================================================================
// tts-reviewer-data.js — Data loading, selectors, restore/init
// ============================================================================

// ── Data Loading (dual mode: fetch vs FileSystemAccess) ──
async function loadVoiceMap() {
  try {
    if (projectDirHandle) {
      voiceMap = await readJsonFromDir(projectDirHandle, 'characters/voice_map.json');
    } else {
      const resp = await fetch(`${basePath()}/characters/voice_map.json`);
      if (resp.ok) voiceMap = await resp.json();
    }
    voiceMapOriginal = voiceMap ? JSON.stringify(voiceMap) : null;
    voiceMapDirty = false;
  } catch { /* ignore */ }
}

async function loadScenario(scenarioId) {
  if (projectDirHandle) {
    return readJsonFromDir(projectDirHandle, `public/assets/scenarios_tts/${scenarioId}.tts.json`);
  }
  const resp = await fetch(`${basePath()}/public/assets/scenarios_tts/${scenarioId}.tts.json`);
  if (!resp.ok) throw new Error(`Failed to load scenario: ${resp.status}`);
  return resp.json();
}

async function loadManifest(scenarioId) {
  try {
    if (projectDirHandle) {
      return await readJsonFromDir(projectDirHandle, `public/assets/voices/${scenarioId}/_manifest.json`);
    }
    const resp = await fetch(`${basePath()}/public/assets/voices/${scenarioId}/_manifest.json`);
    if (resp.ok) return resp.json();
  } catch { /* no manifest */ }
  return null;
}

async function resolveAudioSrc(clip) {
  if (clip.regenBlobUrl) return clip.regenBlobUrl;
  if (!clip.audioUrl) return null;

  if (projectDirHandle) {
    const relPath = 'public' + clip.audioUrl;
    return readFileBlobUrl(projectDirHandle, relPath);
  }
  return `${basePath()}/public${clip.audioUrl}`;
}

// ── UI: Init & Selectors ──
function showSelectors() {
  $('selectorGroup').style.display = '';
  $('episodeGroup').style.display = '';
  $('playGroup').style.display = '';
  const fx = $('audioFxGroup');
  if (fx) fx.style.display = '';
}

function initSelectors() {
  const selScenario = $('selScenario');
  selScenario.innerHTML = '<option value="">-- 시나리오 선택 --</option>';
  for (const s of SCENARIOS) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s.replace(/_/g, ' ');
    selScenario.appendChild(opt);
  }
  selScenario.addEventListener('change', onScenarioChange);
  $('selEpisode').addEventListener('change', onEpisodeChange);
  showSelectors();
}

async function onScenarioChange() {
  const scenarioId = $('selScenario').value;
  if (!scenarioId) return;
  lsSet('scenario', scenarioId);

  $('clipContainer').innerHTML = '<div class="loading"><div class="spinner"></div>로딩 중...</div>';

  try {
    [scenarioData, manifestData] = await Promise.all([
      loadScenario(scenarioId),
      loadManifest(scenarioId),
    ]);

    const selEp = $('selEpisode');
    selEp.innerHTML = '';
    const eps = Object.keys(scenarioData.episodes || {});
    for (const ep of eps) {
      const opt = document.createElement('option');
      opt.value = ep;
      opt.textContent = ep.toUpperCase();
      selEp.appendChild(opt);
    }
    if (eps.length > 0) {
      selEp.value = eps[0];
      renderEpisode(eps[0]);
    }
  } catch (e) {
    $('clipContainer').innerHTML = `<div class="loading" style="color:var(--red)">${e.message}</div>`;
  }
}

function onEpisodeChange() {
  const ep = $('selEpisode').value;
  if (ep) { lsSet('episode', ep); renderEpisode(ep); }
}

// ── Restore / Init helpers ──
function restoreFromCache() {
  const savedApi = lsGet('apiBase', '');
  if (savedApi) $('ttsApiBase').value = savedApi;

  const savedQwen3Api = lsGet('qwen3ApiBase', '');
  if (savedQwen3Api) $('ttsQwen3ApiBase').value = savedQwen3Api;

  const savedBackend = lsGet('ttsBackend', 'fish');
  if (savedBackend && $('ttsBackend')) {
    $('ttsBackend').value = savedBackend;
    $('ttsApiBase').style.display = savedBackend === 'fish' ? '' : 'none';
    $('ttsQwen3ApiBase').style.display = savedBackend === 'qwen3' ? '' : 'none';
  }

  const cachedVoices = lsGetJson('serverVoices', []);
  if (cachedVoices.length > 0) serverVoices = cachedVoices;
}

function restoreSelection() {
  const savedScenario = lsGet('scenario', '');
  const savedEpisode = lsGet('episode', '');
  if (savedScenario && $('selScenario').querySelector(`option[value="${savedScenario}"]`)) {
    $('selScenario').value = savedScenario;
    onScenarioChange().then(() => {
      if (savedEpisode && $('selEpisode').querySelector(`option[value="${savedEpisode}"]`)) {
        $('selEpisode').value = savedEpisode;
        renderEpisode(savedEpisode);
      }
    });
  }
}

async function tryRestoreHandles() {
  const savedProjectHandle = await idbLoad('projectDir');
  if (savedProjectHandle) {
    $('clipContainer').innerHTML = '<div class="loading"><div class="spinner"></div>이전 폴더 권한 확인 중...</div>';
    const granted = await reRequestPermission(savedProjectHandle, 'readwrite');
    if (granted) {
      try {
        await readJsonFromDir(savedProjectHandle, 'characters/voice_map.json');
        projectDirHandle = savedProjectHandle;
        $('modeBadge').textContent = 'LOCAL';
        $('modeBadge').className = 'mode-badge local';
        await loadVoiceMap();
        initSelectors();
        $('clipContainer').innerHTML = '<div class="loading">시나리오를 선택하세요</div>';
        restoreSelection();
        toast('프로젝트 폴더 자동 연결됨', 'success');
      } catch {
        showFolderPicker(lsGet('folderName', ''));
      }
    } else {
      showFolderPicker(lsGet('folderName', ''));
    }
  } else {
    showFolderPicker(lsGet('folderName', ''));
  }

  const savedVoiceLibHandle = await idbLoad('voiceLibDir');
  if (savedVoiceLibHandle) {
    const granted = await reRequestPermission(savedVoiceLibHandle, 'read');
    if (granted) {
      try {
        const fh = await savedVoiceLibHandle.getFileHandle('voices.json');
        const file = await fh.getFile();
        const data = JSON.parse(await file.text());
        voiceLibDirHandle = savedVoiceLibHandle;
        voicesJsonData = data.voices || [];
        serverVoices = voicesJsonData.map(v => v.tag).sort();
        lsSetJson('serverVoices', serverVoices);
      } catch {
        voiceLibDirHandle = null;
      }
    }
  }
}
