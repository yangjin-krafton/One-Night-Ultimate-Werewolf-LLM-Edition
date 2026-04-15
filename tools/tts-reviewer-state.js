// ============================================================================
// tts-reviewer-state.js — Global state, helpers, persistence, FS access
// ============================================================================

const SCENARIOS = [
  'beginner_dark_fantasy','dark_citadel','floodgate_nameplates',
  'rust_orbit','salgol_ward','school_broadcast_prayer',
];

let scenarioData = null;
let manifestData = null;
let voiceMap = null;
let currentClips = [];
let playingIdx = -1;
let isPlayAll = false;
let regenQueue = [];
let regenRunning = false;
let selectedClips = new Set(); // indices of selected clips
let queueCurrentIdx = -1;     // clip index currently being regenerated (-1 = none)
let voiceMapDirty = false;
let voiceMapOriginal = null;

// File System Access API (local mode)
let projectDirHandle = null;
let voiceLibDirHandle = null;
let voicesJsonData = [];
const audioBlobCache = {};

const isFileProtocol = location.protocol === 'file:';

// Voice library (shared between voicemap + data init)
let serverVoices = [];

// ── localStorage persistence ──
const LS_PREFIX = 'tts-reviewer:';
function lsGet(key, fallback) { try { const v = localStorage.getItem(LS_PREFIX + key); return v !== null ? v : fallback; } catch { return fallback; } }
function lsSet(key, val) { try { localStorage.setItem(LS_PREFIX + key, val); } catch {} }
function lsGetJson(key, fallback) { try { const v = localStorage.getItem(LS_PREFIX + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function lsSetJson(key, val) { try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch {} }

// ── IndexedDB for FileSystemDirectoryHandle persistence ──
const IDB_NAME = 'tts-reviewer-handles';
const IDB_STORE = 'handles';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSave(key, handle) {
  try {
    const db = await idbOpen();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, key);
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
    db.close();
  } catch {}
}

async function idbLoad(key) {
  try {
    const db = await idbOpen();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    const result = await new Promise((r, j) => { req.onsuccess = () => r(req.result); req.onerror = j; });
    db.close();
    return result || null;
  } catch { return null; }
}

async function reRequestPermission(handle, mode) {
  if (!handle) return false;
  try {
    if ((await handle.queryPermission({ mode })) === 'granted') return true;
    return (await handle.requestPermission({ mode })) === 'granted';
  } catch { return false; }
}

// ── Helpers ──
function $(id) { return document.getElementById(id); }

function basePath() {
  const loc = window.location.pathname;
  if (loc.includes('/tools/')) return loc.substring(0, loc.lastIndexOf('/tools/'));
  return '..';
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function roleDisplayName(roleId) {
  if (voiceMap && voiceMap._roles && voiceMap._roles[roleId]) return voiceMap._roles[roleId].name;
  const names = {
    'Narrator':'Narrator','doppelganger':'도플갱어','villager':'마을주민','werewolf':'늑대인간',
    'minion':'하수인','mason':'프리메이슨','seer':'예언자','robber':'강도',
    'troublemaker':'말썽쟁이','tanner':'무두장이','drunk':'주정뱅이','hunter':'사냥꾼',
    'insomniac':'불면증환자','alpha_wolf':'태초의 늑대인간','mystic_wolf':'신비한 늑대인간',
    'dream_wolf':'잠자는 늑대인간','apprentice_seer':'견습 예언자',
    'paranormal_investigator':'심령 수사관','witch':'마녀','village_idiot':'동네 얼간이',
    'revealer':'계시자','aura_seer':'영기 예언자','prince':'왕자','cursed':'저주받은 자',
    'apprentice_tanner':'견습 무두장이','thing':'어떤것','squire':'종자','beholder':'주시자',
  };
  return names[roleId] || roleId;
}

function getVoiceTag(roleId) {
  return voiceMap ? (voiceMap[roleId] || voiceMap['Narrator'] || '--') : '--';
}

// ── File System Access API helpers ──
async function getSubDir(dirHandle, pathParts) {
  let h = dirHandle;
  for (const part of pathParts) {
    h = await h.getDirectoryHandle(part);
  }
  return h;
}

async function getOrCreateSubDir(dirHandle, pathParts) {
  let h = dirHandle;
  for (const part of pathParts) h = await h.getDirectoryHandle(part, { create: true });
  return h;
}

async function readJsonFromDir(dirHandle, relativePath) {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  const fileName = parts.pop();
  const dir = parts.length > 0 ? await getSubDir(dirHandle, parts) : dirHandle;
  const fileHandle = await dir.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text);
}

async function readFileBlobUrl(dirHandle, relativePath) {
  if (audioBlobCache[relativePath]) return audioBlobCache[relativePath];
  try {
    const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    const fileName = parts.pop();
    const dir = parts.length > 0 ? await getSubDir(dirHandle, parts) : dirHandle;
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const url = URL.createObjectURL(file);
    audioBlobCache[relativePath] = url;
    return url;
  } catch {
    return null;
  }
}
