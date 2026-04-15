// ============================================================================
// tts-reviewer-batch.js — Batch TTS Generation Panel
// ============================================================================
let batchRunning = false;
let batchCancelRequested = false;

function cancelBatchGeneration() {
  if (!batchRunning) return;
  batchCancelRequested = true;
  $('btnBatchCancel').disabled = true;
  $('btnBatchCancel').textContent = '중단 중...';
  batchLog('⚠ 중단 요청됨 — 현재 클립 완료 후 중단합니다.');
}

function openBatchPanel() {
  if (!projectDirHandle) { toast('프로젝트 폴더를 먼저 연결하세요', 'error'); return; }
  $('batchOverlay').classList.add('open');
  $('batchPanel').classList.add('open');
  loadBatchScenarios();
}

function closeBatchPanel() {
  if (batchRunning) { toast('배치 생성 중에는 닫을 수 없습니다', 'error'); return; }
  $('batchOverlay').classList.remove('open');
  $('batchPanel').classList.remove('open');
}

async function loadBatchScenarios() {
  const list = $('batchScenarioList');
  list.innerHTML = '<span style="color:var(--text-dim);font-size:12px">로딩 중...</span>';

  const scenarios = [];
  try {
    const ttsDir = await getSubDir(projectDirHandle, ['public', 'assets', 'scenarios_tts']);
    for await (const entry of ttsDir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.tts.json')) {
        const file = await entry.getFile();
        const data = JSON.parse(await file.text());
        const sid = data.scenarioId || entry.name.replace('.tts.json', '');
        const eps = Object.keys(data.episodes || {});
        let clipCount = 0;
        for (const ep of eps) {
          const epData = data.episodes[ep];
          if (epData.openingClips) clipCount++;
          if (epData.roleClips) clipCount += Object.keys(epData.roleClips).length;
          if (epData.nightOutroClips) clipCount++;
        }
        scenarios.push({ id: sid, fileName: entry.name, episodes: eps, clipCount, data });
      }
    }
  } catch (e) {
    list.innerHTML = `<span style="color:var(--red);font-size:12px">시나리오 로드 실패: ${e.message}</span>`;
    return;
  }

  scenarios.sort((a, b) => a.id.localeCompare(b.id));

  list.innerHTML = scenarios.map(s => `
    <label class="batch-scenario-item">
      <input type="checkbox" value="${s.id}" data-filename="${s.fileName}" checked>
      <span class="name">${s.id.replace(/_/g, ' ')}</span>
      <span class="meta">${s.episodes.length} eps, ${s.clipCount} clips</span>
    </label>
  `).join('');

  const total = scenarios.reduce((sum, s) => sum + s.clipCount, 0);
  $('batchFooterInfo').textContent = `${scenarios.length}개 시나리오, 총 ${total}개 클립`;

  window._batchScenarios = scenarios;
}

function batchSelectAll(checked) {
  $('batchScenarioList').querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = checked);
}

function batchLog(msg) {
  const log = $('batchLog');
  log.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  log.scrollTop = log.scrollHeight;
}

async function runBatchGeneration() {
  if (batchRunning) return;
  if (!projectDirHandle) { toast('프로젝트 폴더를 먼저 연결하세요', 'error'); return; }
  if (!voiceMap) { toast('voice_map.json이 로드되지 않았습니다', 'error'); return; }

  const selected = [...$('batchScenarioList').querySelectorAll('input:checked')].map(cb => cb.value);
  if (selected.length === 0) { toast('시나리오를 선택하세요', 'error'); return; }

  const skipExist = $('batchOptSkipExist').checked;
  const cleanFirst = $('batchOptClean').checked;

  batchRunning = true;
  batchCancelRequested = false;
  $('btnBatchStart').disabled = true;
  $('btnBatchStart').style.display = 'none';
  $('btnBatchCancel').style.display = '';
  $('btnBatchCancel').disabled = false;
  $('btnBatchCancel').innerHTML = '&#9632; 중단';
  $('batchLog').style.display = 'block';
  $('batchLog').textContent = '';
  $('batchProgressBar').style.display = 'block';
  $('batchProgressFill').style.width = '0%';

  const allScenarios = window._batchScenarios || [];
  const targets = allScenarios.filter(s => selected.includes(s.id));

  let totalClips = targets.reduce((sum, s) => sum + s.clipCount, 0);
  let doneClips = 0, failedClips = 0, skippedClips = 0;

  function updateStats() {
    $('batchStats').innerHTML = `
      <span style="color:var(--accent)">전체 ${totalClips}</span>
      <span style="color:var(--green)">완료 ${doneClips}</span>
      ${skippedClips > 0 ? `<span style="color:var(--text-dim)">건너뜀 ${skippedClips}</span>` : ''}
      ${failedClips > 0 ? `<span style="color:var(--red)">실패 ${failedClips}</span>` : ''}
    `;
    $('batchProgressFill').style.width = `${((doneClips + failedClips + skippedClips) / totalClips) * 100}%`;
  }
  updateStats();

  for (const scenario of targets) {
    if (batchCancelRequested) break;
    batchLog(`\n=== ${scenario.id} (${scenario.clipCount} clips) ===`);

    if (cleanFirst) {
      try {
        const voicesDir = await getSubDir(projectDirHandle, ['public', 'assets', 'voices']);
        try {
          await voicesDir.removeEntry(scenario.id, { recursive: true });
          batchLog(`[clean] 삭제됨: voices/${scenario.id}`);
        } catch { /* doesn't exist */ }
      } catch {}
    }

    const manifest = [];

    for (const epId of scenario.episodes) {
      if (batchCancelRequested) break;
      const epData = scenario.data.episodes[epId];
      const clips = [];

      if (epData.openingClips) {
        clips.push({ type: 'opening', roleId: 'Narrator', text: epData.openingClips,
          path: `/assets/voices/${scenario.id}/${epId}/pall/opening/001/voice` });
      }
      if (epData.roleClips) {
        for (const [roleId, text] of Object.entries(epData.roleClips)) {
          clips.push({ type: 'role', roleId, text,
            path: `/assets/voices/${scenario.id}/${epId}/pall/role/${roleId}/during/001/voice` });
        }
      }
      if (epData.nightOutroClips) {
        clips.push({ type: 'outro', roleId: 'Narrator', text: epData.nightOutroClips,
          path: `/assets/voices/${scenario.id}/${epId}/pall/outro/001/voice` });
      }

      for (const clip of clips) {
        if (batchCancelRequested) break;
        const m4aRelPath = `public${clip.path}.m4a`;

        if (skipExist && !cleanFirst) {
          try {
            const parts = m4aRelPath.split('/').filter(Boolean);
            const fname = parts.pop();
            const dir = await getSubDir(projectDirHandle, parts);
            const fh = await dir.getFileHandle(fname);
            const f = await fh.getFile();
            if (f.size > 0) {
              skippedClips++;
              manifest.push({ clipId: `${scenario.id}/${epId}/pall/${clip.type === 'role' ? 'role/' + clip.roleId + '/during' : clip.type}/001`,
                speakerId: clip.roleId, url: clip.path + '.m4a', text: clip.text });
              updateStats();
              continue;
            }
          } catch { /* doesn't exist, proceed */ }
        }

        const voiceTag = voiceMap[clip.roleId] || voiceMap['Narrator'] || null;
        batchLog(`${epId}/${clip.roleId} [${voiceTag || '?'}]`);

        try {
          const { blob } = await generateTts(clip.text, clip.roleId, null);

          const parts = m4aRelPath.split('/').filter(Boolean);
          const fname = parts.pop();
          const dir = await getOrCreateSubDir(projectDirHandle, parts);
          const fh = await dir.getFileHandle(fname, { create: true });
          const writable = await fh.createWritable();
          await writable.write(blob);
          await writable.close();

          doneClips++;
          manifest.push({ clipId: `${scenario.id}/${epId}/pall/${clip.type === 'role' ? 'role/' + clip.roleId + '/during' : clip.type}/001`,
            speakerId: clip.roleId, url: clip.path + '.m4a', text: clip.text });
        } catch (e) {
          batchLog(`  → 실패: ${e.message}`);
          failedClips++;
        }
        updateStats();
      }
    }

    if (manifest.length > 0) {
      try {
        const manifestObj = { generatedFrom: scenario.fileName, clips: manifest };
        const manifestJson = JSON.stringify(manifestObj, null, 2);
        const manifestParts = ['public', 'assets', 'voices', scenario.id];
        const manifestDir = await getOrCreateSubDir(projectDirHandle, manifestParts);
        const fh = await manifestDir.getFileHandle('_manifest.json', { create: true });
        const writable = await fh.createWritable();
        await writable.write(manifestJson);
        await writable.close();
        batchLog(`[manifest] ${scenario.id}/_manifest.json 저장 (${manifest.length} clips)`);
      } catch (e) {
        batchLog(`[manifest] 저장 실패: ${e.message}`);
      }
    }
  }

  const cancelled = batchCancelRequested;
  const statusMsg = cancelled
    ? `배치 중단됨: 성공 ${doneClips}, 실패 ${failedClips}, 건너뜀 ${skippedClips}`
    : `배치 완료: 성공 ${doneClips}, 실패 ${failedClips}, 건너뜀 ${skippedClips}`;
  batchLog(`\n=== ${statusMsg} ===`);
  toast(statusMsg, cancelled ? 'error' : (doneClips > 0 ? 'success' : 'error'));

  batchRunning = false;
  batchCancelRequested = false;
  $('btnBatchCancel').style.display = 'none';
  $('btnBatchStart').style.display = '';
  $('btnBatchStart').disabled = false;
  $('btnBatchStart').innerHTML = '&#9889; 생성 시작';
}
