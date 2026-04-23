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
  if (batchRunning) {
    // Resume view on running batch — UI DOM state was preserved through close.
    // Scroll log to bottom so user sees latest entries.
    const log = $('batchLog');
    if (log) log.scrollTop = log.scrollHeight;
    toast('배치 진행 중 — 현재 상태를 동기화합니다', 'info');
  } else {
    loadBatchScenarios();
  }
}

function closeBatchPanel() {
  // Batch runs in background; closing the panel does not cancel it.
  $('batchOverlay').classList.remove('open');
  $('batchPanel').classList.remove('open');
  if (batchRunning) {
    toast('배치는 백그라운드에서 계속 진행됩니다', 'info');
  }
}

function setBatchButtonRunning(running) {
  const btn = $('btnBatch');
  if (!btn) return;
  if (running) {
    btn.classList.add('batch-btn-running');
    if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
    btn.innerHTML = '&#9881; 배치 생성 중...';
  } else {
    btn.classList.remove('batch-btn-running');
    if (btn.dataset.origHtml) {
      btn.innerHTML = btn.dataset.origHtml;
      delete btn.dataset.origHtml;
    }
  }
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
      <input type="checkbox" value="${s.id}" data-filename="${s.fileName}" checked onchange="refreshBatchRoleList()">
      <span class="name">${s.id.replace(/_/g, ' ')}</span>
      <span class="meta">${s.episodes.length} eps, ${s.clipCount} clips</span>
    </label>
  `).join('');

  const total = scenarios.reduce((sum, s) => sum + s.clipCount, 0);
  $('batchFooterInfo').textContent = `${scenarios.length}개 시나리오, 총 ${total}개 클립`;

  window._batchScenarios = scenarios;
  refreshBatchRoleList();
}

function batchSelectAll(checked) {
  $('batchScenarioList').querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = checked);
  refreshBatchRoleList();
}

// ── Role filter ──────────────────────────────────────────────────────────
function toggleBatchRoleFilter() {
  const enabled = $('batchRoleFilterEnable').checked;
  $('batchRoleFilterBody').style.display = enabled ? '' : 'none';
  $('batchRoleSelectAll').style.display = enabled ? '' : 'none';
  $('batchRoleSelectNone').style.display = enabled ? '' : 'none';
  if (enabled) refreshBatchRoleList();
  updateBatchFooterInfo();
}

function refreshBatchRoleList() {
  const scenarios = window._batchScenarios || [];
  const selectedIds = new Set(
    [...$('batchScenarioList').querySelectorAll('input:checked')].map(cb => cb.value)
  );

  // Tally clips per role across selected scenarios.
  const roleTally = new Map();
  const add = (roleId) => roleTally.set(roleId, (roleTally.get(roleId) || 0) + 1);
  for (const s of scenarios) {
    if (!selectedIds.has(s.id)) continue;
    for (const epId of s.episodes) {
      const ep = s.data.episodes[epId];
      if (ep.openingClips) add('Narrator');
      if (ep.nightOutroClips) add('Narrator');
      if (ep.roleClips) Object.keys(ep.roleClips).forEach(add);
    }
  }

  const roles = [...roleTally.entries()].sort((a, b) => {
    if (a[0] === 'Narrator') return -1;
    if (b[0] === 'Narrator') return 1;
    return a[0].localeCompare(b[0]);
  });

  const previouslySelected = window._batchSelectedRoles || new Set();
  const listEl = $('batchRoleList');

  if (roles.length === 0) {
    listEl.innerHTML = '<span style="color:var(--text-dim);font-size:11px;padding:4px">시나리오를 선택하세요</span>';
    return;
  }

  listEl.innerHTML = roles.map(([roleId, count]) => {
    const checked = previouslySelected.has(roleId) ? 'checked' : '';
    const koName = (typeof roleDisplayName === 'function') ? roleDisplayName(roleId) : roleId;
    const showId = koName !== roleId;
    return `
      <label class="batch-role-chip${checked ? ' selected' : ''}" data-role="${roleId}" data-search="${(koName + ' ' + roleId).toLowerCase()}">
        <input type="checkbox" value="${roleId}" ${checked} onchange="onBatchRoleToggle(this)">
        <span class="role-name">${koName}</span>
        ${showId ? `<span class="role-id">${roleId}</span>` : ''}
        <span class="count">${count}</span>
      </label>
    `;
  }).join('');

  updateBatchFooterInfo();
}

function onBatchRoleToggle(cb) {
  const chip = cb.closest('.batch-role-chip');
  if (cb.checked) chip.classList.add('selected');
  else chip.classList.remove('selected');

  window._batchSelectedRoles = window._batchSelectedRoles || new Set();
  if (cb.checked) window._batchSelectedRoles.add(cb.value);
  else window._batchSelectedRoles.delete(cb.value);

  updateBatchFooterInfo();
}

function batchRoleSelectAll(checked) {
  window._batchSelectedRoles = window._batchSelectedRoles || new Set();
  $('batchRoleList').querySelectorAll('input[type=checkbox]').forEach(cb => {
    // respect search filter visibility
    const chip = cb.closest('.batch-role-chip');
    if (chip.style.display === 'none') return;
    cb.checked = checked;
    if (checked) {
      chip.classList.add('selected');
      window._batchSelectedRoles.add(cb.value);
    } else {
      chip.classList.remove('selected');
      window._batchSelectedRoles.delete(cb.value);
    }
  });
  updateBatchFooterInfo();
}

function filterBatchRoleList() {
  const q = ($('batchRoleSearch').value || '').toLowerCase().trim();
  $('batchRoleList').querySelectorAll('.batch-role-chip').forEach(chip => {
    const hay = chip.getAttribute('data-search') || (chip.getAttribute('data-role') || '').toLowerCase();
    chip.style.display = (!q || hay.includes(q)) ? '' : 'none';
  });
}

function getBatchRoleFilter() {
  if (!$('batchRoleFilterEnable').checked) return null;
  const selected = [...$('batchRoleList').querySelectorAll('input:checked')].map(cb => cb.value);
  return selected.length > 0 ? new Set(selected) : new Set();  // empty set = nothing matches
}

function updateBatchFooterInfo() {
  const scenarios = window._batchScenarios || [];
  const selectedIds = new Set(
    [...$('batchScenarioList').querySelectorAll('input:checked')].map(cb => cb.value)
  );
  const filter = getBatchRoleFilter();

  let clipCount = 0;
  for (const s of scenarios) {
    if (!selectedIds.has(s.id)) continue;
    for (const epId of s.episodes) {
      const ep = s.data.episodes[epId];
      if (ep.openingClips && (!filter || filter.has('Narrator'))) clipCount++;
      if (ep.nightOutroClips && (!filter || filter.has('Narrator'))) clipCount++;
      if (ep.roleClips) {
        for (const roleId of Object.keys(ep.roleClips)) {
          if (!filter || filter.has(roleId)) clipCount++;
        }
      }
    }
  }

  const filterTxt = filter ? ` · 필터 ${filter.size}개 역할` : '';
  $('batchFooterInfo').textContent = `${selectedIds.size}개 시나리오, ${clipCount}개 클립${filterTxt}`;
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

  const roleFilter = getBatchRoleFilter();
  if (roleFilter && roleFilter.size === 0) {
    toast('역할 필터가 켜져있지만 선택된 역할이 없습니다', 'error');
    return;
  }

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
  setBatchButtonRunning(true);

  const allScenarios = window._batchScenarios || [];
  const targets = allScenarios.filter(s => selected.includes(s.id));

  const passesFilter = (roleId) => !roleFilter || roleFilter.has(roleId);

  // Count clips that will actually be processed (respecting filter).
  let totalClips = 0;
  for (const s of targets) {
    for (const epId of s.episodes) {
      const ep = s.data.episodes[epId];
      if (ep.openingClips && passesFilter('Narrator')) totalClips++;
      if (ep.nightOutroClips && passesFilter('Narrator')) totalClips++;
      if (ep.roleClips) {
        for (const rid of Object.keys(ep.roleClips)) if (passesFilter(rid)) totalClips++;
      }
    }
  }
  let doneClips = 0, failedClips = 0, skippedClips = 0;

  const fmtRoleList = (set) => [...set].map(rid => {
    const ko = (typeof roleDisplayName === 'function') ? roleDisplayName(rid) : rid;
    return ko === rid ? rid : `${ko}(${rid})`;
  }).join(', ');

  if (roleFilter) {
    batchLog(`역할 필터 활성: ${fmtRoleList(roleFilter)} (총 ${totalClips}개 대상 클립)`);
  }

  function updateStats() {
    $('batchStats').innerHTML = `
      <span style="color:var(--accent)">전체 ${totalClips}</span>
      <span style="color:var(--green)">완료 ${doneClips}</span>
      ${skippedClips > 0 ? `<span style="color:var(--text-dim)">건너뜀 ${skippedClips}</span>` : ''}
      ${failedClips > 0 ? `<span style="color:var(--red)">실패 ${failedClips}</span>` : ''}
    `;
    $('batchProgressFill').style.width = totalClips > 0
      ? `${((doneClips + failedClips + skippedClips) / totalClips) * 100}%`
      : '0%';
  }
  updateStats();

  for (const scenario of targets) {
    if (batchCancelRequested) break;
    batchLog(`\n=== ${scenario.id} (${scenario.clipCount} clips) ===`);

    if (cleanFirst) {
      try {
        const voicesDir = await getSubDir(projectDirHandle, ['public', 'assets', 'voices']);
        if (roleFilter) {
          // Only delete filtered-role files, keep other roles intact.
          for (const epId of scenario.episodes) {
            try {
              const epDir = await getSubDir(projectDirHandle,
                ['public', 'assets', 'voices', scenario.id, epId, 'pall']);
              if (roleFilter.has('Narrator')) {
                try { await epDir.removeEntry('opening', { recursive: true }); } catch {}
                try { await epDir.removeEntry('outro', { recursive: true }); } catch {}
              }
              try {
                const roleDir = await epDir.getDirectoryHandle('role');
                for (const rid of roleFilter) {
                  if (rid === 'Narrator') continue;
                  try { await roleDir.removeEntry(rid, { recursive: true }); } catch {}
                }
              } catch {}
            } catch {}
          }
          batchLog(`[clean] 필터된 역할 파일 삭제됨: ${fmtRoleList(roleFilter)}`);
        } else {
          try {
            await voicesDir.removeEntry(scenario.id, { recursive: true });
            batchLog(`[clean] 삭제됨: voices/${scenario.id}`);
          } catch { /* doesn't exist */ }
        }
      } catch {}
    }

    const manifest = [];

    async function fileExistsNonEmpty(relPath) {
      try {
        const parts = relPath.split('/').filter(Boolean);
        const fname = parts.pop();
        const dir = await getSubDir(projectDirHandle, parts);
        const fh = await dir.getFileHandle(fname);
        const f = await fh.getFile();
        return f.size > 0;
      } catch { return false; }
    }

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
        const manifestEntry = {
          clipId: `${scenario.id}/${epId}/pall/${clip.type === 'role' ? 'role/' + clip.roleId + '/during' : clip.type}/001`,
          speakerId: clip.roleId, url: clip.path + '.m4a', text: clip.text
        };

        // Role filter: if enabled and clip's role isn't in filter,
        // don't regenerate but keep manifest consistent with existing file state.
        if (roleFilter && !roleFilter.has(clip.roleId)) {
          if (await fileExistsNonEmpty(m4aRelPath)) manifest.push(manifestEntry);
          continue;
        }

        if (skipExist && !cleanFirst) {
          if (await fileExistsNonEmpty(m4aRelPath)) {
            skippedClips++;
            manifest.push(manifestEntry);
            updateStats();
            continue;
          }
        }

        const voiceTag = voiceMap[clip.roleId] || voiceMap['Narrator'] || null;
        const koName = (typeof roleDisplayName === 'function') ? roleDisplayName(clip.roleId) : clip.roleId;
        const roleLabel = koName === clip.roleId ? clip.roleId : `${koName}(${clip.roleId})`;
        batchLog(`${epId}/${roleLabel} [${voiceTag || '?'}]`);

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
          manifest.push(manifestEntry);
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
  setBatchButtonRunning(false);
}
