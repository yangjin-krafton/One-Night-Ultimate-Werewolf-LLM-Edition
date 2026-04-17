// ===================================================================
// scenarioFx.js — Scenario-specific audio effects (Web Audio API)
// Requires: audioEl, audioCtx (globals from app.js)
// ===================================================================

// ===== SHARED UTILITIES =====
function makeDistortionCurve(amount) {
  const n = 44100, curve = new Float32Array(n);
  if (amount <= 0) {
    for (let i = 0; i < n; i++) curve[i] = i * 2 / n - 1;
    return curve;
  }
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = i * 2 / n - 1;
    curve[i] = (3 + k) * Math.atan(Math.sinh(x * 0.25) * 5) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function rfxLerp(clean, radio, t) { return clean + (radio - clean) * t; }

function rfxRamp(param, target, rampTime) {
  param.setValueAtTime(param.value, audioCtx.currentTime);
  param.linearRampToValueAtTime(target, rampTime);
}

function ensureMediaSource() {
  if (!radioFx.mediaSource) {
    radioFx.mediaSource = audioCtx.createMediaElementSource(audioEl);
  }
  return radioFx.mediaSource;
}

function ensureDirectRouting() {
  if (radioFx.mediaSource && !radioFx.active) {
    try { radioFx.mediaSource.disconnect(); } catch (_) {}
    radioFx.mediaSource.connect(audioCtx.destination);
  }
}

// ===== UNIFIED CONTROL — safe cleanup for all scenario effects =====

// Reset all per-clip flags and set intensity to 0 (clean passthrough) without tearing down chains.
// Use when interrupting playback mid-clip (pause, skip, stop).
function scenarioFxResetClip() {
  radioFx.clipHasRadio = false;
  phoneFx.clipHasPhone = false;
  cavernFx.clipHasCavern = false;
  paFx.clipHasPA = false;
  palaceFx.clipHasPalace = false;
  if (radioFx.active) updateRadioIntensity(0);
  if (phoneFx.active) updatePhoneIntensity(0);
  if (cavernFx.active) updateCavernIntensity(0);
  if (paFx.active) updatePAIntensity(0);
  if (palaceFx.active) updatePalaceIntensity(0);
}

// Mute ambient loops (static noise, drip noise) — call on pause/stop
function scenarioFxMuteAmbient() {
  if (!audioCtx) return;
  const rt = audioCtx.currentTime + 0.03;
  if (radioFx.staticNoise) rfxRamp(radioFx.staticNoise.gain.gain, 0, rt);
  if (cavernFx.dripNoise) rfxRamp(cavernFx.dripNoise.gain.gain, 0, rt);
}

// Restore ambient loops to current intensity — call on resume
function scenarioFxResumeAmbient() {
  if (!audioCtx) return;
  const rt = audioCtx.currentTime + 0.03;
  if (radioFx.active && radioFx.staticNoise) {
    rfxRamp(radioFx.staticNoise.gain.gain, 0.015 * radioFx.intensity, rt);
  }
  if (cavernFx.active && cavernFx.dripNoise) {
    rfxRamp(cavernFx.dripNoise.gain.gain, 0.08 * cavernFx.intensity, rt);
  }
}

// Tear down all effects completely — call on stopPlayback / end of playlist
function scenarioFxDisableAll() {
  disableRadioEffect();
  disablePhoneEffect();
  disableCavernEffect();
  disablePAEffect();
  disablePalaceEffect();
}

// Enable the correct effect for a scenario — single dispatch point
function scenarioFxEnableFor(scenarioId) {
  const map = {
    'rust_orbit': enableRadioEffect,
    'school_broadcast_prayer': enablePhoneEffect,
    'dark_citadel': enableCavernEffect,
    'salgol_ward': enablePAEffect,
    'floodgate_nameplates': enablePalaceEffect,
  };
  const fn = map[scenarioId];
  if (fn) { ensureMediaSource(); fn(); }
  else { ensureDirectRouting(); }
}

// ===== RADIO (WALKIE-TALKIE) EFFECT — rust_orbit =====
const radioFx = {
  active: false,
  intensity: 0,
  clipHasRadio: false,
  mediaSource: null,      // shared MediaElementAudioSourceNode
  chain: null,
  staticNoise: null,
};
const RADIO_CLIP_CHANCE = 0.5;

function buildRadioChain() {
  const highpass = audioCtx.createBiquadFilter();
  highpass.type = 'highpass'; highpass.frequency.value = 20; highpass.Q.value = 0.5;
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = 20000; lowpass.Q.value = 0.5;
  const midBoost = audioCtx.createBiquadFilter();
  midBoost.type = 'peaking'; midBoost.frequency.value = 1500; midBoost.Q.value = 2; midBoost.gain.value = 0;
  const distortion = audioCtx.createWaveShaper();
  distortion.curve = makeDistortionCurve(0);
  distortion.oversample = '4x';
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = 0; compressor.ratio.value = 1; compressor.knee.value = 10;
  const gain = audioCtx.createGain();
  gain.gain.value = 1.0;

  highpass.connect(lowpass);
  lowpass.connect(midBoost);
  midBoost.connect(distortion);
  distortion.connect(compressor);
  compressor.connect(gain);
  gain.connect(audioCtx.destination);
  return { highpass, lowpass, midBoost, distortion, compressor, gain };
}

function updateRadioIntensity(intensity) {
  radioFx.intensity = Math.max(0, Math.min(1, intensity));
  const t = radioFx.intensity;
  const c = radioFx.chain;
  if (!c) return;
  const rt = audioCtx.currentTime + 0.05;
  rfxRamp(c.highpass.frequency, rfxLerp(20, 160, t), rt);
  rfxRamp(c.lowpass.frequency, rfxLerp(20000, 11750, t), rt);
  rfxRamp(c.midBoost.gain, rfxLerp(0, 4, t), rt);
  c.distortion.curve = makeDistortionCurve(Math.round(rfxLerp(0, 75, t)));
  rfxRamp(c.compressor.ratio, rfxLerp(1, 6.5, t), rt);
  rfxRamp(c.compressor.threshold, rfxLerp(0, -15, t), rt);
  rfxRamp(c.gain.gain, rfxLerp(1.0, 0.8, t), rt);
  if (radioFx.staticNoise) {
    rfxRamp(radioFx.staticNoise.gain.gain, 0.0075 * t, rt);
  }
}

function startStaticNoise(volume) {
  const bufLen = 2 * audioCtx.sampleRate;
  const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = 3000; filter.Q.value = 0.5;
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  src.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
  src.start(0);
  return { source: src, gain };
}

function stopStaticNoise() {
  if (radioFx.staticNoise) {
    try { radioFx.staticNoise.source.stop(); } catch (_) {}
    try { radioFx.staticNoise.gain.disconnect(); } catch (_) {}
    radioFx.staticNoise = null;
  }
}

function enableRadioEffect() {
  if (radioFx.active) return;
  const src = ensureMediaSource();
  src.disconnect();
  radioFx.chain = buildRadioChain();
  src.connect(radioFx.chain.highpass);
  updateRadioIntensity(0);
  radioFx.staticNoise = startStaticNoise(0);
  radioFx.clipHasRadio = false;
  radioFx.active = true;
}

function disableRadioEffect() {
  if (!radioFx.active) return;
  stopStaticNoise();
  if (radioFx.chain) {
    Object.values(radioFx.chain).forEach(n => { try { n.disconnect(); } catch (_) {} });
    radioFx.chain = null;
  }
  if (radioFx.mediaSource) {
    try { radioFx.mediaSource.disconnect(); } catch (_) {}
    radioFx.mediaSource.connect(audioCtx.destination);
  }
  radioFx.intensity = 0;
  radioFx.clipHasRadio = false;
  radioFx.active = false;
}

function playSquelchIn() {
  if (!radioFx.active || !audioCtx || !radioFx.clipHasRadio) return Promise.resolve();
  return new Promise(resolve => {
    const now = audioCtx.currentTime;
    const bufLen = Math.floor(audioCtx.sampleRate * 0.12);
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
    const nSrc = audioCtx.createBufferSource(); nSrc.buffer = buf;
    const nFilt = audioCtx.createBiquadFilter(); nFilt.type = 'bandpass'; nFilt.frequency.value = 2500; nFilt.Q.value = 1;
    const nGain = audioCtx.createGain(); nGain.gain.value = 0.25;
    nSrc.connect(nFilt); nFilt.connect(nGain); nGain.connect(audioCtx.destination);
    nSrc.start(now);
    const osc = audioCtx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 1800;
    const bGain = audioCtx.createGain();
    bGain.gain.setValueAtTime(0, now + 0.10);
    bGain.gain.linearRampToValueAtTime(0.2, now + 0.105);
    bGain.gain.setValueAtTime(0.2, now + 0.16);
    bGain.gain.linearRampToValueAtTime(0, now + 0.17);
    osc.connect(bGain); bGain.connect(audioCtx.destination);
    osc.start(now + 0.10); osc.stop(now + 0.18);
    setTimeout(resolve, 200);
  });
}

function playSquelchOut() {
  if (!radioFx.active || !audioCtx || !radioFx.clipHasRadio) return Promise.resolve();
  return new Promise(resolve => {
    const now = audioCtx.currentTime;
    const vol = 0.3;
    const osc = audioCtx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 1800;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.2 * vol, now + 0.005);
    g.gain.setValueAtTime(0.2 * vol, now + 0.06);
    g.gain.linearRampToValueAtTime(0, now + 0.07);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.08);
    const bufLen = Math.floor(audioCtx.sampleRate * 0.08);
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) * 0.5;
    const nSrc = audioCtx.createBufferSource(); nSrc.buffer = buf;
    const nGain = audioCtx.createGain(); nGain.gain.value = 0.15 * vol;
    nSrc.connect(nGain); nGain.connect(audioCtx.destination);
    nSrc.start(now + 0.07);
    setTimeout(resolve, 160);
  });
}

// ===== PHONE CALL EFFECT — school_broadcast_prayer =====
const phoneFx = {
  active: false,
  intensity: 0,
  clipHasPhone: false,
  chain: null,
};
const PHONE_CLIP_CHANCE = 0.5;

function buildPhoneChain() {
  const highpass = audioCtx.createBiquadFilter();
  highpass.type = 'highpass'; highpass.frequency.value = 20; highpass.Q.value = 0.7;
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = 20000; lowpass.Q.value = 0.7;
  const midBoost = audioCtx.createBiquadFilter();
  midBoost.type = 'peaking'; midBoost.frequency.value = 1800; midBoost.Q.value = 1.5; midBoost.gain.value = 0;
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = 0; compressor.ratio.value = 1; compressor.knee.value = 8;
  const gain = audioCtx.createGain();
  gain.gain.value = 1.0;

  highpass.connect(lowpass);
  lowpass.connect(midBoost);
  midBoost.connect(compressor);
  compressor.connect(gain);
  gain.connect(audioCtx.destination);
  return { highpass, lowpass, midBoost, compressor, gain };
}

function updatePhoneIntensity(intensity) {
  phoneFx.intensity = Math.max(0, Math.min(1, intensity));
  const t = phoneFx.intensity;
  const c = phoneFx.chain;
  if (!c) return;
  const rt = audioCtx.currentTime + 0.05;
  rfxRamp(c.highpass.frequency, rfxLerp(20, 350, t), rt);
  rfxRamp(c.lowpass.frequency, rfxLerp(20000, 3400, t), rt);
  rfxRamp(c.midBoost.gain, rfxLerp(0, 5, t), rt);
  rfxRamp(c.compressor.ratio, rfxLerp(1, 6, t), rt);
  rfxRamp(c.compressor.threshold, rfxLerp(0, -20, t), rt);
  rfxRamp(c.gain.gain, rfxLerp(1.0, 0.75, t), rt);
}

function enablePhoneEffect() {
  if (phoneFx.active) return;
  const src = ensureMediaSource();
  src.disconnect();
  phoneFx.chain = buildPhoneChain();
  src.connect(phoneFx.chain.highpass);
  updatePhoneIntensity(0);
  phoneFx.clipHasPhone = false;
  phoneFx.active = true;
}

function disablePhoneEffect() {
  if (!phoneFx.active) return;
  if (phoneFx.chain) {
    Object.values(phoneFx.chain).forEach(n => { try { n.disconnect(); } catch (_) {} });
    phoneFx.chain = null;
  }
  if (radioFx.mediaSource) {
    try { radioFx.mediaSource.disconnect(); } catch (_) {}
    radioFx.mediaSource.connect(audioCtx.destination);
  }
  phoneFx.intensity = 0;
  phoneFx.clipHasPhone = false;
  phoneFx.active = false;
}

// DTMF
function playDTMF(freq1, freq2, duration, vol, startAt) {
  const o1 = audioCtx.createOscillator(); o1.type = 'sine'; o1.frequency.value = freq1;
  const o2 = audioCtx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq2;
  const g = audioCtx.createGain(); g.gain.value = vol;
  o1.connect(g); o2.connect(g); g.connect(audioCtx.destination);
  o1.start(startAt); o2.start(startAt);
  o1.stop(startAt + duration); o2.stop(startAt + duration);
}

const DTMF_FREQS = {
  '1':[697,1209],'2':[697,1336],'3':[697,1477],
  '4':[770,1209],'5':[770,1336],'6':[770,1477],
  '7':[852,1209],'8':[852,1336],'9':[852,1477],
  '0':[941,1336],'*':[941,1209],'#':[941,1477],
};

function playPhoneCallIn() {
  if (!phoneFx.active || !audioCtx || !phoneFx.clipHasPhone) return Promise.resolve();
  return new Promise(resolve => {
    const now = audioCtx.currentTime;
    const digits = '0123456789';
    const numDigits = 3 + Math.floor(Math.random() * 2);
    let t = now;
    for (let i = 0; i < numDigits; i++) {
      const d = digits[Math.floor(Math.random() * 10)];
      const [f1, f2] = DTMF_FREQS[d];
      playDTMF(f1, f2, 0.08, 0.12, t);
      t += 0.12;
    }
    const ringStart = t + 0.15;
    for (let r = 0; r < 2; r++) {
      const rs = ringStart + r * 0.55;
      const osc = audioCtx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 440;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0, rs);
      g.gain.linearRampToValueAtTime(0.1, rs + 0.02);
      g.gain.setValueAtTime(0.1, rs + 0.3);
      g.gain.linearRampToValueAtTime(0, rs + 0.35);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(rs); osc.stop(rs + 0.4);
    }
    const pickupTime = ringStart + 1.2;
    const clickLen = Math.floor(audioCtx.sampleRate * 0.03);
    const clickBuf = audioCtx.createBuffer(1, clickLen, audioCtx.sampleRate);
    const cd = clickBuf.getChannelData(0);
    for (let i = 0; i < clickLen; i++) cd[i] = (Math.random() * 2 - 1) * (1 - i / clickLen);
    const clickSrc = audioCtx.createBufferSource(); clickSrc.buffer = clickBuf;
    const clickGain = audioCtx.createGain(); clickGain.gain.value = 0.3;
    clickSrc.connect(clickGain); clickGain.connect(audioCtx.destination);
    clickSrc.start(pickupTime);
    const totalMs = (pickupTime - now + 0.08) * 1000;
    setTimeout(resolve, Math.ceil(totalMs));
  });
}

function playPhoneHangUp() {
  if (!phoneFx.active || !audioCtx || !phoneFx.clipHasPhone) return Promise.resolve();
  return new Promise(resolve => {
    const now = audioCtx.currentTime;
    // Receiver slam — thud + rattle
    const thudLen = Math.floor(audioCtx.sampleRate * 0.06);
    const thudBuf = audioCtx.createBuffer(1, thudLen, audioCtx.sampleRate);
    const td = thudBuf.getChannelData(0);
    for (let i = 0; i < thudLen; i++) {
      td[i] = (Math.random() * 2 - 1) * Math.exp(-i / (thudLen * 0.15));
    }
    const thudSrc = audioCtx.createBufferSource(); thudSrc.buffer = thudBuf;
    const thudLp = audioCtx.createBiquadFilter();
    thudLp.type = 'lowpass'; thudLp.frequency.value = 800; thudLp.Q.value = 1;
    const thudGain = audioCtx.createGain(); thudGain.gain.value = 0.4;
    thudSrc.connect(thudLp); thudLp.connect(thudGain); thudGain.connect(audioCtx.destination);
    thudSrc.start(now);

    const rattleLen = Math.floor(audioCtx.sampleRate * 0.08);
    const rattleBuf = audioCtx.createBuffer(1, rattleLen, audioCtx.sampleRate);
    const rd = rattleBuf.getChannelData(0);
    for (let i = 0; i < rattleLen; i++) {
      rd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rattleLen * 0.1))
            * (1 + 0.3 * Math.sin(i * 0.15));
    }
    const rattleSrc = audioCtx.createBufferSource(); rattleSrc.buffer = rattleBuf;
    const rattleHp = audioCtx.createBiquadFilter();
    rattleHp.type = 'highpass'; rattleHp.frequency.value = 1200; rattleHp.Q.value = 0.8;
    const rattleGain = audioCtx.createGain(); rattleGain.gain.value = 0.25;
    rattleSrc.connect(rattleHp); rattleHp.connect(rattleGain); rattleGain.connect(audioCtx.destination);
    rattleSrc.start(now + 0.01);

    const beepStart = now + 0.25;
    for (let i = 0; i < 3; i++) {
      const bs = beepStart + i * 0.2;
      const osc = audioCtx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 480;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0, bs);
      g.gain.linearRampToValueAtTime(0.15, bs + 0.005);
      g.gain.setValueAtTime(0.15, bs + 0.12);
      g.gain.linearRampToValueAtTime(0, bs + 0.14);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(bs); osc.stop(bs + 0.15);
    }
    setTimeout(resolve, 900);
  });
}

// ===== CAVERN / SEWER EFFECT — dark_citadel =====
const cavernFx = {
  active: false,
  intensity: 0,
  clipHasCavern: false,
  chain: null,
  dripNoise: null,
};
const CAVERN_CLIP_CHANCE = 0.5;

function makeCaveIR(duration, decay) {
  const len = Math.floor(audioCtx.sampleRate * duration);
  const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * decay));
    }
  }
  return buf;
}

function buildCavernChain() {
  // Low-frequency resonance (sewer rumble)
  const lowBoost = audioCtx.createBiquadFilter();
  lowBoost.type = 'peaking'; lowBoost.frequency.value = 150; lowBoost.Q.value = 0.6; lowBoost.gain.value = 0;

  // Highcut — dampens high freqs to sound distant/muffled
  const highcut = audioCtx.createBiquadFilter();
  highcut.type = 'lowpass'; highcut.frequency.value = 20000; highcut.Q.value = 0.5;

  // Long reverb for large wet space
  const convolver = audioCtx.createConvolver();
  convolver.buffer = makeCaveIR(4.0, 1.0); // 4s reverb, slow 1s decay — large damp space

  // Dry/wet mix
  const dryGain = audioCtx.createGain(); dryGain.gain.value = 1.0;
  const wetGain = audioCtx.createGain(); wetGain.gain.value = 0;
  const output = audioCtx.createGain(); output.gain.value = 1.0;

  // Routing: source → lowBoost → highcut → [dry → output, convolver → wet → output] → destination
  lowBoost.connect(highcut);
  highcut.connect(dryGain);
  highcut.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(output);
  wetGain.connect(output);
  output.connect(audioCtx.destination);
  return { lowBoost, highcut, convolver, dryGain, wetGain, output };
}

function updateCavernIntensity(intensity) {
  cavernFx.intensity = Math.max(0, Math.min(1, intensity));
  const t = cavernFx.intensity;
  const c = cavernFx.chain;
  if (!c) return;
  const rt = audioCtx.currentTime + 0.05;
  // Low boost: 0→8dB (deeper rumble)
  rfxRamp(c.lowBoost.gain, rfxLerp(0, 8, t), rt);
  // Highcut: 20kHz (clean) → 2800Hz (distant/muffled)
  rfxRamp(c.highcut.frequency, rfxLerp(20000, 2800, t), rt);
  // Wet reverb: 0 → 0.6 (heavy, damp echo)
  rfxRamp(c.wetGain.gain, rfxLerp(0, 0.6, t), rt);
  // Dry lowered more to emphasize reverb (distant feel)
  rfxRamp(c.dryGain.gain, rfxLerp(1.0, 0.55, t), rt);
  // Drip noise louder
  if (cavernFx.dripNoise) {
    rfxRamp(cavernFx.dripNoise.gain.gain, 0.08 * t, rt);
  }
}

function startDripNoise() {
  const dur = 4;
  const len = audioCtx.sampleRate * dur;
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  const numDrips = 5 + Math.floor(Math.random() * 4);
  for (let n = 0; n < numDrips; n++) {
    const pos = Math.floor(Math.random() * (len - 2000));
    const freq = 1800 + Math.random() * 2400;
    const dripLen = 300 + Math.floor(Math.random() * 400);
    for (let i = 0; i < dripLen && pos + i < len; i++) {
      d[pos + i] += Math.sin(2 * Math.PI * freq * i / audioCtx.sampleRate)
                   * Math.exp(-i / (dripLen * 0.2)) * 0.3;
    }
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const gain = audioCtx.createGain(); gain.gain.value = 0;
  // Longer, wetter reverb on drips for dampness
  const dripReverb = audioCtx.createConvolver();
  dripReverb.buffer = makeCaveIR(3.0, 0.8);
  // Lowpass on drip reverb tail — muffled, distant drips
  const dripLp = audioCtx.createBiquadFilter();
  dripLp.type = 'lowpass'; dripLp.frequency.value = 3000; dripLp.Q.value = 0.5;
  src.connect(dripReverb);
  dripReverb.connect(dripLp);
  dripLp.connect(gain);
  gain.connect(audioCtx.destination);
  src.start(0);
  return { source: src, gain };
}

function stopDripNoise() {
  if (cavernFx.dripNoise) {
    try { cavernFx.dripNoise.source.stop(); } catch (_) {}
    try { cavernFx.dripNoise.gain.disconnect(); } catch (_) {}
    cavernFx.dripNoise = null;
  }
}

function enableCavernEffect() {
  if (cavernFx.active) return;
  const src = ensureMediaSource();
  src.disconnect();
  cavernFx.chain = buildCavernChain();
  src.connect(cavernFx.chain.lowBoost);
  updateCavernIntensity(0);
  cavernFx.dripNoise = startDripNoise();
  cavernFx.clipHasCavern = false;
  cavernFx.active = true;
}

function disableCavernEffect() {
  if (!cavernFx.active) return;
  stopDripNoise();
  if (cavernFx.chain) {
    Object.values(cavernFx.chain).forEach(n => { try { n.disconnect(); } catch (_) {} });
    cavernFx.chain = null;
  }
  if (radioFx.mediaSource) {
    try { radioFx.mediaSource.disconnect(); } catch (_) {}
    radioFx.mediaSource.connect(audioCtx.destination);
  }
  cavernFx.intensity = 0;
  cavernFx.clipHasCavern = false;
  cavernFx.active = false;
}

function playCavernIntro() {
  if (!cavernFx.active || !audioCtx || !cavernFx.clipHasCavern) return Promise.resolve();
  return new Promise(resolve => {
    const now = audioCtx.currentTime;
    const freq = 2200 + Math.random() * 1500;
    const osc = audioCtx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    const rev = audioCtx.createConvolver(); rev.buffer = makeCaveIR(1.2, 0.35);
    osc.connect(g); g.connect(rev); rev.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.35);

    const rumble = audioCtx.createOscillator(); rumble.type = 'sine'; rumble.frequency.value = 55;
    const rg = audioCtx.createGain();
    rg.gain.setValueAtTime(0, now);
    rg.gain.linearRampToValueAtTime(0.08, now + 0.3);
    rg.gain.linearRampToValueAtTime(0, now + 0.6);
    rumble.connect(rg); rg.connect(audioCtx.destination);
    rumble.start(now); rumble.stop(now + 0.65);
    setTimeout(resolve, 500);
  });
}

function playCavernOutro() {
  if (!cavernFx.active || !audioCtx || !cavernFx.clipHasCavern) return Promise.resolve();
  return new Promise(resolve => {
    const now = audioCtx.currentTime;
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.35;
      const freq = 2500 + Math.random() * 1500;
      const vol = 0.15 * (1 - i * 0.4);
      const osc = audioCtx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      const rev = audioCtx.createConvolver(); rev.buffer = makeCaveIR(1.0, 0.3);
      osc.connect(g); g.connect(rev); rev.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + 0.3);
    }
    setTimeout(resolve, 550);
  });
}

// ===== HOSPITAL PA (PUBLIC ADDRESS) EFFECT — salgol_ward =====
// Tinny speaker + hall reverb + chime intro/outro.
const paFx = {
  active: false,
  intensity: 0,
  clipHasPA: false,
  chain: null,  // { highpass, lowpass, midBoost, compressor, gain, convolver, dryGain, wetGain, output }
};
const PA_CLIP_CHANCE = 0.5;

function buildPAChain() {
  // Aggressive highpass — no bass at all, like a horn speaker
  const highpass = audioCtx.createBiquadFilter();
  highpass.type = 'highpass'; highpass.frequency.value = 20; highpass.Q.value = 0.8;
  // Harsh lowpass — ceiling speaker can't reproduce highs
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = 20000; lowpass.Q.value = 0.8;
  // Aggressive mid resonance — megaphone/horn character
  const midBoost = audioCtx.createBiquadFilter();
  midBoost.type = 'peaking'; midBoost.frequency.value = 2000; midBoost.Q.value = 1.8; midBoost.gain.value = 0;
  // Secondary upper-mid peak — adds "tinny" harshness
  const midBoost2 = audioCtx.createBiquadFilter();
  midBoost2.type = 'peaking'; midBoost2.frequency.value = 3200; midBoost2.Q.value = 2.0; midBoost2.gain.value = 0;
  // Speaker distortion/clipping — overdriven amp character
  const distortion = audioCtx.createWaveShaper();
  distortion.curve = makeDistortionCurve(0);
  distortion.oversample = '4x';
  // Hard compression — PA systems are heavily limited
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = 0; compressor.ratio.value = 1; compressor.knee.value = 5;
  // Hall reverb (hospital corridor)
  const convolver = audioCtx.createConvolver();
  convolver.buffer = makeCaveIR(2.5, 0.5);
  const dryGain = audioCtx.createGain(); dryGain.gain.value = 1.0;
  const wetGain = audioCtx.createGain(); wetGain.gain.value = 0;
  const output = audioCtx.createGain(); output.gain.value = 1.0;

  highpass.connect(lowpass);
  lowpass.connect(midBoost);
  midBoost.connect(midBoost2);
  midBoost2.connect(distortion);
  distortion.connect(compressor);
  compressor.connect(dryGain);
  compressor.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(output);
  wetGain.connect(output);
  output.connect(audioCtx.destination);
  return { highpass, lowpass, midBoost, midBoost2, distortion, compressor, convolver, dryGain, wetGain, output };
}

function updatePAIntensity(intensity) {
  paFx.intensity = Math.max(0, Math.min(1, intensity));
  const t = paFx.intensity;
  const c = paFx.chain;
  if (!c) return;
  const rt = audioCtx.currentTime + 0.05;
  // Highpass: 20→600Hz (kills all bass — horn speaker)
  rfxRamp(c.highpass.frequency, rfxLerp(20, 600, t), rt);
  // Lowpass: 20kHz→3800Hz (harsh ceiling speaker rolloff)
  rfxRamp(c.lowpass.frequency, rfxLerp(20000, 3800, t), rt);
  // Mid boost: 0→12dB (extreme megaphone resonance)
  rfxRamp(c.midBoost.gain, rfxLerp(0, 12, t), rt);
  // Upper-mid: 0→8dB (tinny harshness)
  rfxRamp(c.midBoost2.gain, rfxLerp(0, 8, t), rt);
  // Distortion: 0→80 (speaker clipping)
  c.distortion.curve = makeDistortionCurve(Math.round(rfxLerp(0, 80, t)));
  // Hard compression
  rfxRamp(c.compressor.ratio, rfxLerp(1, 15, t), rt);
  rfxRamp(c.compressor.threshold, rfxLerp(0, -28, t), rt);
  // Corridor reverb: 0→0.35
  rfxRamp(c.wetGain.gain, rfxLerp(0, 0.35, t), rt);
  rfxRamp(c.dryGain.gain, rfxLerp(1.0, 0.55, t), rt);
  rfxRamp(c.output.gain, rfxLerp(1.0, 0.7, t), rt);
}

function enablePAEffect() {
  if (paFx.active) return;
  const src = ensureMediaSource();
  src.disconnect();
  paFx.chain = buildPAChain();
  src.connect(paFx.chain.highpass);
  updatePAIntensity(0);
  paFx.clipHasPA = false;
  paFx.active = true;
}

function disablePAEffect() {
  if (!paFx.active) return;
  if (paFx.chain) {
    Object.values(paFx.chain).forEach(n => { try { n.disconnect(); } catch (_) {} });
    paFx.chain = null;
  }
  if (radioFx.mediaSource) {
    try { radioFx.mediaSource.disconnect(); } catch (_) {}
    radioFx.mediaSource.connect(audioCtx.destination);
  }
  paFx.intensity = 0;
  paFx.clipHasPA = false;
  paFx.active = false;
}

// Hospital chime: 띵-똥 (two-tone descending, classic Korean hospital PA)
function playPAChime() {
  if (!paFx.active || !audioCtx || !paFx.clipHasPA) return Promise.resolve();
  return new Promise(resolve => {
    const now = audioCtx.currentTime;
    // First tone: G5 (783Hz)
    const osc1 = audioCtx.createOscillator(); osc1.type = 'sine'; osc1.frequency.value = 783;
    const g1 = audioCtx.createGain();
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.054, now + 0.02);
    g1.gain.setValueAtTime(0.054, now + 0.25);
    g1.gain.linearRampToValueAtTime(0, now + 0.35);
    osc1.connect(g1); g1.connect(audioCtx.destination);
    osc1.start(now); osc1.stop(now + 0.4);

    // Second tone: E5 (659Hz)
    const osc2 = audioCtx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 659;
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0, now + 0.35);
    g2.gain.linearRampToValueAtTime(0.054, now + 0.37);
    g2.gain.setValueAtTime(0.054, now + 0.6);
    g2.gain.linearRampToValueAtTime(0, now + 0.7);
    osc2.connect(g2); g2.connect(audioCtx.destination);
    osc2.start(now + 0.35); osc2.stop(now + 0.75);

    setTimeout(resolve, 800);
  });
}

// PA outro: reverse chime (똥-띵, ascending)
function playPAChimeOut() {
  if (!paFx.active || !audioCtx || !paFx.clipHasPA) return Promise.resolve();
  return new Promise(resolve => {
    const now = audioCtx.currentTime;
    // E5 → G5 (ascending)
    const osc1 = audioCtx.createOscillator(); osc1.type = 'sine'; osc1.frequency.value = 659;
    const g1 = audioCtx.createGain();
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.045, now + 0.02);
    g1.gain.setValueAtTime(0.045, now + 0.2);
    g1.gain.linearRampToValueAtTime(0, now + 0.3);
    osc1.connect(g1); g1.connect(audioCtx.destination);
    osc1.start(now); osc1.stop(now + 0.35);

    const osc2 = audioCtx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 783;
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0, now + 0.3);
    g2.gain.linearRampToValueAtTime(0.045, now + 0.32);
    g2.gain.setValueAtTime(0.045, now + 0.55);
    g2.gain.linearRampToValueAtTime(0, now + 0.65);
    osc2.connect(g2); g2.connect(audioCtx.destination);
    osc2.start(now + 0.3); osc2.stop(now + 0.7);

    setTimeout(resolve, 700);
  });
}

// ===== [EXPERIMENTAL] PALACE HALL EFFECT — floodgate_nameplates =====
// 궁전 전각 — 하수도(cavern)보다 건조하고 밝은 리버브. 제거 시 이 블록 전체 삭제 + app.js에서 palaceFx 참조 제거.
// >>> EXPERIMENTAL START — floodgate_nameplates palace-hall <<<
const palaceFx = {
  active: false,
  intensity: 0,
  clipHasPalace: false,
  chain: null, // { lowcut, presence, convolver, dryGain, wetGain, output }
};
const PALACE_CLIP_CHANCE = 0.5;

// Dry palace IR — shorter decay, brighter than cave (stone floor + wooden ceiling)
function makePalaceIR(duration, decay) {
  const len = Math.floor(audioCtx.sampleRate * duration);
  const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * decay));
    }
  }
  return buf;
}

function buildPalaceChain() {
  // Low cut — removes muddy room rumble (dry stone floor)
  const lowcut = audioCtx.createBiquadFilter();
  lowcut.type = 'highpass'; lowcut.frequency.value = 20; lowcut.Q.value = 0.5;
  // Presence — voice clarity bouncing off hard surfaces
  const presence = audioCtx.createBiquadFilter();
  presence.type = 'peaking'; presence.frequency.value = 2800; presence.Q.value = 0.8; presence.gain.value = 0;
  // Palace reverb — shorter & drier than cave, brighter tail
  const convolver = audioCtx.createConvolver();
  convolver.buffer = makePalaceIR(2.0, 0.35); // 2s, fast decay — hard surfaces, open space
  // Dry/wet
  const dryGain = audioCtx.createGain(); dryGain.gain.value = 1.0;
  const wetGain = audioCtx.createGain(); wetGain.gain.value = 0;
  const output = audioCtx.createGain(); output.gain.value = 1.0;

  lowcut.connect(presence);
  presence.connect(dryGain);
  presence.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(output);
  wetGain.connect(output);
  output.connect(audioCtx.destination);
  return { lowcut, presence, convolver, dryGain, wetGain, output };
}

function updatePalaceIntensity(intensity) {
  palaceFx.intensity = Math.max(0, Math.min(1, intensity));
  const t = palaceFx.intensity;
  const c = palaceFx.chain;
  if (!c) return;
  const rt = audioCtx.currentTime + 0.05;
  // Low cut: 20→100Hz (clean, not boomy)
  rfxRamp(c.lowcut.frequency, rfxLerp(20, 100, t), rt);
  // Presence: 0→4dB (bright clarity — stone/wood reflections)
  rfxRamp(c.presence.gain, rfxLerp(0, 4, t), rt);
  // Wet: 0→0.3 (noticeable echo but dry, not washy)
  rfxRamp(c.wetGain.gain, rfxLerp(0, 0.3, t), rt);
  // Dry stays strong
  rfxRamp(c.dryGain.gain, rfxLerp(1.0, 0.8, t), rt);
}

function enablePalaceEffect() {
  if (palaceFx.active) return;
  const src = ensureMediaSource();
  src.disconnect();
  palaceFx.chain = buildPalaceChain();
  src.connect(palaceFx.chain.lowcut);
  updatePalaceIntensity(0);
  palaceFx.clipHasPalace = false;
  palaceFx.active = true;
}

function disablePalaceEffect() {
  if (!palaceFx.active) return;
  if (palaceFx.chain) {
    Object.values(palaceFx.chain).forEach(n => { try { n.disconnect(); } catch (_) {} });
    palaceFx.chain = null;
  }
  if (radioFx.mediaSource) {
    try { radioFx.mediaSource.disconnect(); } catch (_) {}
    radioFx.mediaSource.connect(audioCtx.destination);
  }
  palaceFx.intensity = 0;
  palaceFx.clipHasPalace = false;
  palaceFx.active = false;
}

// No intro/outro sound — just the reverb on the voice is the effect
function playPalaceIntro() { return Promise.resolve(); }
function playPalaceOutro() { return Promise.resolve(); }
// >>> EXPERIMENTAL END — floodgate_nameplates palace-hall <<<
