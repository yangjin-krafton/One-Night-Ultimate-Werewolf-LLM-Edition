// ============================================================================
// tts-reviewer-audiofx.js — BGM playback + scenario SFX integration
// Requires: scenarioFx.js (loaded after this file)
// Exposes globals: audioEl, audioCtx (needed by scenarioFx.js)
// ============================================================================

// Shared refs with scenarioFx.js
const audioEl = document.getElementById('audioPlayer');
let audioCtx = null;

// Minimal state stub used by BGM fade logic (mirrors app.js)
const state = { _bgmFadeTimer: null };

// ===== BGM =====
const bgmEl = document.getElementById('bgmPlayer');
const BGM_DEFAULT_VOLUME = 0.25;
const bgmState = {
  source: null,
  compressor: null,
  makeup: null,
  gainNode: null,
  connected: false,
};

// ===== Toggle state (persisted) =====
function fxLsGet(key, fallback) {
  try { const v = localStorage.getItem('tts-reviewer:' + key); return v !== null ? v : fallback; } catch { return fallback; }
}
function fxLsSet(key, val) {
  try { localStorage.setItem('tts-reviewer:' + key, val); } catch {}
}

let bgmEnabled = fxLsGet('bgmEnabled', '1') === '1';
let sfxEnabled = fxLsGet('sfxEnabled', '1') === '1';
let currentScenarioId = null;

// ===== Playback generation token =====
// Bumped on every clip start / stop — async continuations check this
// to avoid stale SFX/BGM decisions from interrupted playback.
let _playGen = 0;
function audiofxBumpGen() { return ++_playGen; }
function audiofxIsStale(gen) { return gen !== _playGen; }

// Separate gen for async startBgm (src resolution race)
let _bgmStartGen = 0;

function getBgmUserVolume() {
  const v = parseFloat(fxLsGet('bgmVolume', String(BGM_DEFAULT_VOLUME)));
  return isNaN(v) ? BGM_DEFAULT_VOLUME : Math.max(0, Math.min(1, v));
}

// Deferred until first user gesture (browser autoplay policy).
// Returns null if called too early — callers must handle gracefully.
let _pendingScenarioId = null;
let _userGestureHappened = false;

function ensureAudioCtx() {
  if (!_userGestureHappened) return null;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function _onFirstUserGesture() {
  if (_userGestureHappened) return;
  _userGestureHappened = true;
  ensureAudioCtx();
  // If a scenario was queued while waiting for gesture, apply now.
  if (_pendingScenarioId) {
    const sid = _pendingScenarioId;
    _pendingScenarioId = null;
    audiofxOnScenarioChange(sid);
  }
}

// Register once at load — any click/key/touch unlocks audio
['click', 'keydown', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, _onFirstUserGesture, { once: false, capture: true });
});

function ensureBgmChain() {
  if (bgmState.connected || !audioCtx || !bgmEl) return;
  const src = audioCtx.createMediaElementSource(bgmEl);
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -30;
  comp.ratio.value = 14;
  comp.knee.value = 6;
  comp.attack.value = 0.005;
  comp.release.value = 0.15;
  const makeup = audioCtx.createGain();
  makeup.gain.value = 2.0;
  const gain = audioCtx.createGain();
  gain.gain.value = getBgmUserVolume();
  src.connect(comp);
  comp.connect(makeup);
  makeup.connect(gain);
  gain.connect(audioCtx.destination);
  bgmState.source = src;
  bgmState.compressor = comp;
  bgmState.makeup = makeup;
  bgmState.gainNode = gain;
  bgmState.connected = true;
}

function setBgmVolume(v) {
  const vol = Math.max(0, Math.min(1, v));
  fxLsSet('bgmVolume', String(vol));
  if (bgmState.gainNode) bgmState.gainNode.gain.value = vol;
  else if (bgmEl) bgmEl.volume = vol;
}

async function resolveBgmSrc(scenarioId) {
  // Local mode: read via File System Access API
  if (typeof projectDirHandle !== 'undefined' && projectDirHandle && typeof readFileBlobUrl === 'function') {
    const url = await readFileBlobUrl(projectDirHandle, `public/assets/bgm/${scenarioId}.m4a`);
    if (url) return url;
  }
  // file:// without folder picker cannot load cross-origin — skip BGM
  if (typeof isFileProtocol !== 'undefined' && isFileProtocol) return null;
  // HTTP mode
  const base = (typeof basePath === 'function') ? basePath() : '..';
  return `${base}/public/assets/bgm/${scenarioId}.m4a`;
}

async function startBgm(scenarioId) {
  if (!bgmEl || !scenarioId) return;
  const myGen = ++_bgmStartGen;
  if (state._bgmFadeTimer) { clearInterval(state._bgmFadeTimer); state._bgmFadeTimer = null; }
  const newSrc = await resolveBgmSrc(scenarioId);
  // A newer start/stop happened while we were awaiting — abort.
  if (myGen !== _bgmStartGen) return;
  if (!newSrc) return;
  // If already playing the same source, just restore volume and bail (no restart).
  const already = bgmEl.src && bgmEl.src.endsWith('/' + scenarioId + '.m4a') && !bgmEl.paused;
  if (!already) {
    bgmEl.src = newSrc;
    bgmEl.volume = 1.0;
    bgmEl.muted = false;
    bgmEl.loop = true;
    bgmEl.currentTime = 0;
  }
  ensureAudioCtx();
  ensureBgmChain();
  if (bgmState.gainNode) bgmState.gainNode.gain.value = getBgmUserVolume();
  else bgmEl.volume = getBgmUserVolume();
  if (!already) bgmEl.play().catch(() => {});
}

function stopBgm() {
  if (!bgmEl) return;
  // Abort any pending startBgm
  _bgmStartGen++;
  if (state._bgmFadeTimer) { clearInterval(state._bgmFadeTimer); state._bgmFadeTimer = null; }
  bgmEl.pause();
  bgmEl.currentTime = 0;
  if (bgmState.gainNode) bgmState.gainNode.gain.value = getBgmUserVolume();
  else bgmEl.volume = getBgmUserVolume();
}

function fadeOutBgm(duration = 1500) {
  if (!bgmEl) return;
  const step = 50;
  const steps = Math.max(1, duration / step);
  if (bgmState.gainNode) {
    const startVol = bgmState.gainNode.gain.value;
    const volDec = startVol / steps;
    state._bgmFadeTimer = setInterval(() => {
      const cur = bgmState.gainNode.gain.value - volDec;
      bgmState.gainNode.gain.value = Math.max(0, cur);
      if (bgmState.gainNode.gain.value <= 0) {
        clearInterval(state._bgmFadeTimer);
        state._bgmFadeTimer = null;
        bgmEl.pause();
        bgmEl.currentTime = 0;
        bgmState.gainNode.gain.value = getBgmUserVolume();
      }
    }, step);
  } else {
    const volDec = bgmEl.volume / steps;
    state._bgmFadeTimer = setInterval(() => {
      bgmEl.volume = Math.max(0, bgmEl.volume - volDec);
      if (bgmEl.volume <= 0) {
        clearInterval(state._bgmFadeTimer);
        state._bgmFadeTimer = null;
        bgmEl.pause();
        bgmEl.currentTime = 0;
        bgmEl.volume = getBgmUserVolume();
      }
    }, step);
  }
}

// ===== SFX integration =====
// All SFX functions accept an optional `gen` token. If the playback
// generation changes while an async step is pending, the result is discarded
// so stale SFX never leak across clips.

async function audiofxBeforeClipPlay(gen) {
  if (!sfxEnabled) return;
  if (!ensureAudioCtx()) return;
  // Always reset per-clip flags first — no leftovers from previous clip.
  if (typeof scenarioFxResetClip === 'function') scenarioFxResetClip();
  if (gen !== undefined && audiofxIsStale(gen)) return;

  // Radio
  if (typeof radioFx !== 'undefined' && radioFx.active) {
    if (Math.random() < (typeof RADIO_CLIP_CHANCE !== 'undefined' ? RADIO_CLIP_CHANCE : 0.5)) {
      radioFx.clipHasRadio = true; updateRadioIntensity(1);
    } else { radioFx.clipHasRadio = false; updateRadioIntensity(0); }
  }
  // Phone
  if (typeof phoneFx !== 'undefined' && phoneFx.active) {
    if (Math.random() < (typeof PHONE_CLIP_CHANCE !== 'undefined' ? PHONE_CLIP_CHANCE : 0.5)) {
      phoneFx.clipHasPhone = true; updatePhoneIntensity(1);
    } else { phoneFx.clipHasPhone = false; updatePhoneIntensity(0); }
  }
  // Cavern
  if (typeof cavernFx !== 'undefined' && cavernFx.active) {
    if (Math.random() < (typeof CAVERN_CLIP_CHANCE !== 'undefined' ? CAVERN_CLIP_CHANCE : 0.5)) {
      cavernFx.clipHasCavern = true; updateCavernIntensity(1);
    } else { cavernFx.clipHasCavern = false; updateCavernIntensity(0); }
  }
  // PA
  if (typeof paFx !== 'undefined' && paFx.active) {
    if (Math.random() < (typeof PA_CLIP_CHANCE !== 'undefined' ? PA_CLIP_CHANCE : 0.5)) {
      paFx.clipHasPA = true; updatePAIntensity(1);
    } else { paFx.clipHasPA = false; updatePAIntensity(0); }
  }
  // Palace
  if (typeof palaceFx !== 'undefined' && palaceFx.active) {
    if (Math.random() < (typeof PALACE_CLIP_CHANCE !== 'undefined' ? PALACE_CLIP_CHANCE : 0.5)) {
      palaceFx.clipHasPalace = true; updatePalaceIntensity(1);
    } else { palaceFx.clipHasPalace = false; updatePalaceIntensity(0); }
  }
  if (gen !== undefined && audiofxIsStale(gen)) return;

  // Play intro SFX in parallel
  const p = [];
  if (typeof radioFx !== 'undefined' && radioFx.clipHasRadio && typeof playSquelchIn === 'function') p.push(playSquelchIn());
  if (typeof phoneFx !== 'undefined' && phoneFx.clipHasPhone && typeof playPhoneCallIn === 'function') p.push(playPhoneCallIn());
  if (typeof cavernFx !== 'undefined' && cavernFx.clipHasCavern && typeof playCavernIntro === 'function') p.push(playCavernIntro());
  if (typeof paFx !== 'undefined' && paFx.clipHasPA && typeof playPAChime === 'function') p.push(playPAChime());
  if (typeof palaceFx !== 'undefined' && palaceFx.clipHasPalace && typeof playPalaceIntro === 'function') p.push(playPalaceIntro());
  if (p.length) await Promise.all(p).catch(() => {});
}

async function audiofxAfterClipEnd(gen) {
  if (!sfxEnabled) return;
  if (gen !== undefined && audiofxIsStale(gen)) return;
  const p = [];
  if (typeof radioFx !== 'undefined' && radioFx.clipHasRadio && typeof playSquelchOut === 'function') p.push(playSquelchOut());
  if (typeof phoneFx !== 'undefined' && phoneFx.clipHasPhone && typeof playPhoneHangUp === 'function') p.push(playPhoneHangUp());
  if (typeof cavernFx !== 'undefined' && cavernFx.clipHasCavern && typeof playCavernOutro === 'function') p.push(playCavernOutro());
  if (typeof paFx !== 'undefined' && paFx.clipHasPA && typeof playPAChimeOut === 'function') p.push(playPAChimeOut());
  if (typeof palaceFx !== 'undefined' && palaceFx.clipHasPalace && typeof playPalaceOutro === 'function') p.push(playPalaceOutro());
  if (p.length) await Promise.all(p).catch(() => {});
}

// Called when scenario (or episode) is loaded — sets up SFX chain only.
// BGM is NOT started here; it starts when a clip actually plays.
function audiofxOnScenarioChange(scenarioId) {
  if (!_userGestureHappened) {
    _pendingScenarioId = scenarioId;
    return;
  }
  const changed = currentScenarioId !== scenarioId;
  currentScenarioId = scenarioId;
  const ctx = ensureAudioCtx();
  if (!ctx) { _pendingScenarioId = scenarioId; return; }

  if (changed) {
    if (typeof scenarioFxDisableAll === 'function') scenarioFxDisableAll();
    if (sfxEnabled && typeof scenarioFxEnableFor === 'function') {
      scenarioFxEnableFor(scenarioId);
    }
    // Stop any leftover BGM from previous scenario
    stopBgm();
  }
}

// Called right before a clip starts playing.
// Bumps the generation (invalidating all stale async SFX/BGM ops) and
// ensures BGM is running. Returns the new gen — pass it to
// audiofxBeforeClipPlay / audiofxAfterClipEnd so they can abort if superseded.
function audiofxOnClipStart() {
  const gen = audiofxBumpGen();
  if (!bgmEnabled || !currentScenarioId || !bgmEl) return gen;
  // Cancel any in-progress fade-out
  if (state._bgmFadeTimer) {
    clearInterval(state._bgmFadeTimer);
    state._bgmFadeTimer = null;
    if (bgmState.gainNode) bgmState.gainNode.gain.value = getBgmUserVolume();
    else bgmEl.volume = getBgmUserVolume();
  }
  if (bgmEl.paused) startBgm(currentScenarioId);
  return gen;
}

// Called when playback ends or stops — fade BGM out.
// Idempotent: repeated calls don't stack fade timers, and reset-clip flags
// ensure no stale outro SFX leaks.
function audiofxOnPlaybackEnd() {
  // Invalidate any pending async continuations (intro/outro promises).
  audiofxBumpGen();
  if (typeof scenarioFxResetClip === 'function') scenarioFxResetClip();
  if (bgmEl && !bgmEl.paused && !state._bgmFadeTimer) fadeOutBgm(1500);
}

function audiofxOnStop() { audiofxOnPlaybackEnd(); }

// ===== UI wiring =====
function updateBgmToggleUi() {
  const cb = document.getElementById('bgmToggle');
  const slider = document.getElementById('bgmVolume');
  if (cb) cb.checked = bgmEnabled;
  if (slider) {
    slider.value = Math.round(getBgmUserVolume() * 100);
    slider.disabled = !bgmEnabled;
  }
}
function updateSfxToggleUi() {
  const cb = document.getElementById('sfxToggle');
  if (cb) cb.checked = sfxEnabled;
}

document.addEventListener('DOMContentLoaded', () => {
  updateBgmToggleUi();
  updateSfxToggleUi();

  const bgmCb = document.getElementById('bgmToggle');
  if (bgmCb) bgmCb.addEventListener('change', () => {
    bgmEnabled = bgmCb.checked;
    fxLsSet('bgmEnabled', bgmEnabled ? '1' : '0');
    updateBgmToggleUi();
    // Toggled OFF during playback → stop immediately.
    // Toggled ON → next clip start will kick BGM off.
    if (!bgmEnabled) stopBgm();
    else if (audioEl && !audioEl.paused && currentScenarioId) startBgm(currentScenarioId);
  });

  const slider = document.getElementById('bgmVolume');
  if (slider) slider.addEventListener('input', () => {
    setBgmVolume(parseInt(slider.value, 10) / 100);
  });

  const sfxCb = document.getElementById('sfxToggle');
  if (sfxCb) sfxCb.addEventListener('change', () => {
    sfxEnabled = sfxCb.checked;
    fxLsSet('sfxEnabled', sfxEnabled ? '1' : '0');
    if (sfxEnabled) {
      if (currentScenarioId && typeof scenarioFxEnableFor === 'function') {
        scenarioFxEnableFor(currentScenarioId);
      }
    } else {
      if (typeof scenarioFxDisableAll === 'function') scenarioFxDisableAll();
    }
  });
});
