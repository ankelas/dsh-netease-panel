/**
 * dsh-netease-panel — host half.
 *
 * Bridges the DSH Web UI to the local NetEase Cloud Music desktop client:
 *  - a PowerShell helper controls the client through the Windows media session
 *    (play / pause / previous / next) and reports the current track;
 *  - `cloudmusic.elog` is tailed for the real playback position (the client
 *    does not publish a timeline through SMTC), using the same custom byte
 *    encoding the client writes;
 *  - lyrics come from NetEase's public lyric endpoint, keyed by song id;
 *  - playlists come from the account's public playlist list, with the local
 *    play history as an offline fallback;
 *  - opening a playlist hands `orpheus://playlist/<id>` to the client.
 */
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.join(HERE, 'helper.ps1');

export const inject = ['webServer'];

function findAppExe() {
  const candidates = [];
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\Software\\Classes\\orpheus\\shell\\open\\command', '/ve'], { encoding: 'utf8', windowsHide: true });
    const m = out.match(/"([^"]*cloudmusic\.exe)"/i);
    if (m) candidates.push(m[1]);
  } catch (e) { /* registry probe is best effort */ }
  const local = process.env.LOCALAPPDATA || '';
  candidates.push(
    path.join(local, 'Programs', 'NetEase', 'CloudMusic', 'cloudmusic.exe'),
    'C:\\Program Files (x86)\\Netease\\CloudMusic\\cloudmusic.exe',
    'C:\\Program Files\\Netease\\CloudMusic\\cloudmusic.exe',
    'D:\\CloudMusic\\cloudmusic.exe',
  );
  for (const file of candidates) {
    if (file && existsSync(file)) return file;
  }
  return '';
}

let child = null;
let buffers = '';
const state = { ok: true, session: false, title: '', artist: '', album: '', status: '', app: '', volume: null, titleSince: 0 };
let playlists = { at: 0, items: [], source: 'none' };
const lyricCache = new Map();
let lyricOffset = 0;
const metaCache = new Map();

/* ────────────────────────────── SMTC helper ────────────────────────────── */

function send(cmd) {
  if (!child) return false;
  try {
    child.stdin.write(cmd + '\n');
    return true;
  } catch (e) {
    return false;
  }
}

function startHelper() {
  if (child) return;
  try {
    child = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', HELPER,
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (e) {
    child = null;
    return;
  }
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffers += chunk;
    let at;
    while ((at = buffers.indexOf('\n')) >= 0) {
      const line = buffers.slice(0, at).trim();
      buffers = buffers.slice(at + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg && 'session' in msg) {
          const prevTitle = state.title;
          Object.assign(state, msg);
          if (msg.title && msg.title !== prevTitle) state.titleSince = Date.now() - 300;
        }
      } catch (e) { /* ignore malformed line */ }
    }
  });
  child.on('error', () => {});
  child.on('exit', () => {
    child = null;
    setTimeout(() => {
      try { startHelper(); } catch (e) { /* next request retries */ }
    }, 3000);
  });
  send('state');
}

/* ─────────────────────────── NetEase play log tail ─────────────────────── */

const DECODE_TABLE = (() => {
  const t = Buffer.alloc(256);
  for (let b = 0; b < 256; b++) {
    const high = b >> 4;
    const low = b & 0x0f;
    const hex = (high ^ ((low + 8) % 16)) % 16;
    t[b] = (hex * 16 + (b >> 6) * 4 + ((~high) & 3)) & 0xff;
  }
  return t;
})();

function decodeElog(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = DECODE_TABLE[buf[i]];
  return out.toString('utf8');
}

function rand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

const HEADER_RE = /^\[(\d+):(\d+):(\d{4}\/\d{6}:\d+):([A-Z]+):([a-zA-Z0-9._-]+)\((\d+)\)\]\s+\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/;
const RE_POSITION = /【playing】,"setPlayingPosition",(\d+(?:\.\d+)?)/;
const RE_STATUS = /【playing】,"native播放state",(\d+),/;

const elog = {
  path: '',
  offset: 0,
  song: null,
  pausing: false,
  position: 0,
  relativeTime: 0,
  timer: null,
  pending: '',
  decoder: null,
};

function findElog() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const direct = path.join(local, 'NetEase', 'CloudMusic', 'cloudmusic.elog');
  try {
    statSync(direct);
    return direct;
  } catch (e) { /* try Store paths below */ }
  const packages = path.join(local, 'Packages');
  try {
    for (const id of readdirSync(packages)) {
      const candidates = [
        path.join(packages, id, 'LocalCache', 'Local', 'NetEase', 'CloudMusic', 'cloudmusic.elog'),
        path.join(packages, id, 'Local', 'NetEase', 'CloudMusic', 'cloudmusic.elog'),
      ];
      for (const p of candidates) {
        try { statSync(p); return p; } catch (e) { /* keep looking */ }
      }
    }
  } catch (e) { /* no Store install */ }
  return '';
}

function headerTimestamp(line) {
  const m = HEADER_RE.exec(line.replace(/^\s+/, ''));
  if (!m) return null;
  const startup = Number(m[3].split(':').pop());
  return startup + (Date.now() - Math.round(os.uptime() * 1000));
}

function trackFrom(data) {
  const t = data.track || data;
  const album = t.album || {};
  return {
    id: Number(t.id ?? t.songId ?? -1),
    name: t.name || '',
    artist: (t.artists || []).map((a) => a.name).filter(Boolean).join(' / '),
    duration: (t.duration || 0) / 1000,
  };
}

function resetElog() {
  elog.song = null;
  elog.pausing = false;
  elog.position = 0;
  elog.relativeTime = 0;
}

function seedMeta(t) {
  if (!t || !t.id) return;
  metaCache.set(String(t.id), {
    id: Number(t.id),
    name: t.name || '',
    artist: t.artist || '',
    duration: t.duration || 0,
  });
}

async function ensureMeta(id) {
  const key = String(id || '');
  if (!key || metaCache.has(key)) return;
  try {
    const res = await fetch(
      'https://music.163.com/api/song/detail?ids=[' + encodeURIComponent(key) + ']',
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } },
    );
    const data = await res.json();
    const song = data && Array.isArray(data.songs) ? data.songs[0] : null;
    if (!song) return;
    metaCache.set(key, {
      id: Number(song.id),
      name: song.name || '',
      artist: (song.ar || song.artists || []).map((a) => a.name).filter(Boolean).join(' / '),
      duration: (song.dt || song.duration || 0) / 1000,
    });
  } catch (e) { /* metadata is best effort */ }
}

function applyElogLine(line, ts) {
  if (!line) return;
  if (line.includes('【app】,{"actionId":"exitApp"}')) {
    resetElog();
    return;
  }
  if (line.includes('【playing】,"checkPlayPrivilege",') ||
      line.includes('【playing】,"playOneTrackInPlayingList"')) {
    const m = /\{.*\}/.exec(line);
    if (!m) return;
    try { seedMeta(trackFrom(JSON.parse(m[0]))); } catch (e) { /* ignore */ }
    return;
  }
  if (line.includes('【playing】,"native播放资源load完成，开始播放"')) {
    const m = /\{.*\}/.exec(line);
    if (!m) return;
    let data;
    try { data = JSON.parse(m[0]); } catch { return; }
    const id = Number(data && data.songId);
    if (!id) return;
    const same = elog.song && elog.song.id === id;
    const meta = metaCache.get(String(id));
    elog.song = meta ? { ...meta } : { id, name: '', artist: '', duration: 0 };
    elog.pausing = false;
    if (!same) {
      elog.position = 0;
      elog.relativeTime = Date.now();
    }
    if (!meta) ensureMeta(id);
    return;
  }
  if (line.includes('【playing】,"setPlayingPosition"')) {
    const m = RE_POSITION.exec(line);
    if (!m) return;
    const pos = Number(m[1]);
    const offset = (Date.now() - ts) / 1000;
    if (elog.pausing) {
      elog.position = pos;
    } else {
      elog.relativeTime = Math.round(Date.now() - pos * 1000 - offset * 1000);
    }
    return;
  }
  if (line.includes('【playing】,"native播放state"')) {
    const m = RE_STATUS.exec(line);
    if (!m) return;
    const newRel = Date.now() - elog.position * 1000;
    const newPos = (Date.now() - elog.relativeTime) / 1000;
    elog.pausing = Number(m[1]) === 2;
    elog.position = elog.pausing ? newPos - (Date.now() - ts) / 1000 : 0;
    elog.relativeTime = elog.pausing ? 0 : Math.round(newRel - (Date.now() - ts));
  }
}

function playState() {
  if (!elog.song) return { ok: true, playing: false, song: null, position: 0 };
  const meta = metaCache.get(String(elog.song.id)) || elog.song;
  if (!meta.duration) ensureMeta(elog.song.id);
  const position = (elog.pausing
    ? elog.position
    : Math.min((Date.now() - elog.relativeTime) / 1000, meta.duration || 1e9)) + lyricOffset;
  return {
    ok: true,
    playing: !elog.pausing,
    position: Math.max(0, Math.round(position * 10) / 10),
    song: meta,
  };
}

let lastSmtcSync = 0;

async function findSongByTitle(title, artist) {
  try {
    const q = encodeURIComponent((title + ' ' + (artist || '')).trim());
    const res = await fetch(
      'https://music.163.com/api/search/get/web?s=' + q + '&type=1&limit=5',
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } },
    );
    const data = await res.json();
    const songs = (data && data.result && data.result.songs) || [];
    return songs.find((s) => s.name === title) || songs[0] || null;
  } catch (e) {
    return null;
  }
}

// Some client transitions (gapless / preloaded queue) never write a new
// "resource load" line to the play log, so the log alone can keep reporting the
// previous song. The media session title does change; use it to resync.
async function syncFromSmtc() {
  if (Date.now() - lastSmtcSync < 1200) return;
  lastSmtcSync = Date.now();
  if (!state.session || !state.title) return;
  if (state.source === 'window') return;
  const current = elog.song;
  if (current && current.name === state.title) return;
  const song = await findSongByTitle(state.title, state.artist);
  if (!song) return;
  const meta = {
    id: Number(song.id),
    name: song.name || state.title,
    artist: (song.artists || []).map((a) => a.name).filter(Boolean).join(' / ') || state.artist,
    duration: (song.duration || 0) / 1000,
  };
  metaCache.set(String(meta.id), meta);
  elog.song = meta;
  elog.pausing = state.status !== 'Playing';
  elog.position = 0;
  elog.relativeTime = state.titleSince || Date.now();
}

function startElog() {
  const file = findElog();
  if (!file) return;
  elog.path = file;
  try {
    const buf = readFileSync(file);
    elog.offset = buf.length;
    elog.decoder = new TextDecoder('utf-8');
    elog.pending = '';
    const lines = decodeElog(buf).split('\n');
    elog.pending = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const ts = headerTimestamp(line);
      if (ts !== null) applyElogLine(line, ts);
    }
  } catch (e) { /* leave state empty; the tailer retries below */ }

  elog.timer = setInterval(() => {
    try {
      const size = statSync(elog.path).size;
      if (size < elog.offset) {
        elog.offset = 0;
        elog.pending = '';
        elog.decoder = new TextDecoder('utf-8');
      }
      if (size <= elog.offset) return;
      const fd = openSync(elog.path, 'r');
      try {
        const len = size - elog.offset;
        const buf = Buffer.alloc(len);
        readSync(fd, buf, 0, len, elog.offset);
        elog.offset = size;
        const text = elog.decoder.decode(buf, { stream: true });
        elog.pending += text;
        const parts = elog.pending.split('\n');
        elog.pending = parts.pop() || '';
        for (const raw of parts) {
          const line = raw.trim();
          if (!line) continue;
          const ts = headerTimestamp(line);
          if (ts !== null) applyElogLine(line, ts);
        }
      } finally {
        closeSync(fd);
      }
    } catch (e) { /* file locked or rotated: retry next tick */ }
  }, 300);
}

function stopElog() {
  if (elog.timer) {
    clearInterval(elog.timer);
    elog.timer = null;
  }
}

/* ─────────────────────────────── lyrics ────────────────────────────────── */

function parseLrc(text) {
  const out = [];
  if (!text) return out;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const tags = [...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const body = line.replace(/^(\[[^\]]*\]\s*)+/, '').trim();
    if (!body) continue;
    if (/^(作词|作曲|编曲|制作人|出品|监制|混音|母带|Lyrics|Composed|Composer|Arranged|Producer)\s*[:：]/i.test(body)) continue;
    const last = tags[tags.length - 1];
    const msec = last[3] ? Number(last[3].padEnd(3, '0')) / 1000 : 0;
    out.push({ t: Number(last[1]) * 60 + Number(last[2]) + msec, text: body });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

async function getLyric(id) {
  const key = String(id || '');
  if (!key) return { ok: false, lines: [] };
  const hit = lyricCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.data;
  try {
    const res = await fetch(
      'https://music.163.com/api/song/lyric?id=' + encodeURIComponent(key) + '&lv=1&tv=1',
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } },
    );
    const data = await res.json();
    const main = parseLrc(data && data.lrc && data.lrc.lyric);
    const trans = parseLrc(data && data.tlyric && data.tlyric.lyric);
    const transByTime = new Map();
    for (const line of trans) {
      transByTime.set(line.t.toFixed(2), line.text);
    }
    const merged = main.map((line) => {
      const tr = transByTime.get(line.t.toFixed(2));
      return tr ? { t: line.t, text: line.text, tr } : { t: line.t, text: line.text };
    });
    const payload = { ok: merged.length > 0, lines: merged };
    lyricCache.set(key, { at: Date.now(), data: payload });
    return payload;
  } catch (e) {
    return { ok: false, lines: [] };
  }
}

/* ──────────────────────────── playlists / client ───────────────────────── */

async function withDb(fn) {
  const { DatabaseSync } = await import('node:sqlite');
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const file = path.join(local, 'NetEase', 'CloudMusic', 'Library', 'webdb.dat');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return fn(db);
  } finally {
    try { db.close(); } catch (e) { /* ignore */ }
  }
}

async function readUid() {
  try {
    return await withDb((db) => {
      const row = db.prepare('select uid from playingCount where uid is not null limit 1').get();
      return row && row.uid ? String(row.uid) : '';
    });
  } catch (e) {
    return '';
  }
}

async function readHistoryPlaylists() {
  try {
    return await withDb((db) => {
      const rows = db.prepare('select jsonStr from historyPlaylists order by playtime desc limit 60').all();
      const out = [];
      for (const row of rows) {
        try {
          const item = JSON.parse(row.jsonStr);
          if (!item || !item.id) continue;
          out.push({
            id: String(item.id),
            name: String(item.name || '未命名歌单'),
            tracks: 0,
            plays: Number(item.playCount) || 0,
          });
        } catch (e) { /* skip broken row */ }
      }
      return out;
    });
  } catch (e) {
    return [];
  }
}

async function fetchPlaylists() {
  if (Date.now() - playlists.at < 5 * 60 * 1000 && playlists.items.length) return playlists;
  let items = [];
  let source = 'none';
  const uid = await readUid();
  if (uid) {
    try {
      const res = await fetch(
        'https://music.163.com/api/user/playlist?uid=' + encodeURIComponent(uid) + '&limit=100&offset=0',
        { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } },
      );
      const data = await res.json();
      if (data && Array.isArray(data.playlist)) {
        items = data.playlist
          .filter((p) => p && p.id)
          .map((p) => ({
            id: String(p.id),
            name: String(p.name || '未命名歌单'),
            tracks: Number(p.trackCount) || 0,
            plays: Number(p.playCount) || 0,
          }));
        if (items.length) source = 'account';
      }
    } catch (e) { /* fall back to local history */ }
  }
  if (!items.length) {
    items = await readHistoryPlaylists();
    if (items.length) source = 'history';
  }
  playlists = { at: Date.now(), items, source };
  return playlists;
}

async function fetchSongs(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200).join(',');
    try {
      const res = await fetch(
        'https://music.163.com/api/song/detail?ids=[' + chunk + ']',
        { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } },
      );
      const data = await res.json();
      for (const s of (data && data.songs) || []) {
        out.push({
          id: String(s.id),
          name: s.name || '',
          artist: (s.ar || s.artists || []).map((a) => a.name).filter(Boolean).join(' / '),
          duration: (s.dt || s.duration || 0) / 1000,
        });
      }
    } catch (e) { /* keep the other chunks */ }
  }
  return out;
}

async function fetchPlaylistTracks(id) {
  try {
    const res = await fetch(
      'https://music.163.com/api/v6/playlist/detail?id=' + encodeURIComponent(id),
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } },
    );
    const data = await res.json();
    const p = data && data.playlist;
    if (!p) return { ok: false, name: '', tracks: [] };
    const ids = (p.trackIds || []).map((x) => x.id).filter(Boolean);
    const tracks = await fetchSongs(ids);
    return { ok: tracks.length > 0, name: p.name || '', tracks };
  } catch (e) {
    return { ok: false, name: '', tracks: [] };
  }
}

let lastPlayCommand = { id: '', at: 0 };
function playSongCommand(id) {
  if (id === lastPlayCommand.id && Date.now() - lastPlayCommand.at < 5000) return;
  lastPlayCommand = { id, at: Date.now() };
  const payload = JSON.stringify({ type: 'song', id: String(id), cmd: 'play' });
  const encoded = Buffer.from(payload, 'utf8').toString('base64');
  send('open orpheus://' + encoded);
}

/* ─────────────────────────────── overlay ─────────────────────────────── */

const OVERLAY_FILE = path.join(os.tmpdir(), 'dsh-netease-overlay.json');
const overlay = { child: null, timer: null, busy: false };

function overlayStop() {
  if (overlay.timer) {
    clearInterval(overlay.timer);
    overlay.timer = null;
  }
  if (overlay.child) {
    try { overlay.child.kill(); } catch (e) { /* ignore */ }
    overlay.child = null;
  }
  try { writeFileSync(OVERLAY_FILE, JSON.stringify({ lines: [] }), 'utf8'); } catch (e) { /* ignore */ }
}

async function overlayTick() {
  if (overlay.busy) return;
  overlay.busy = true;
  try {
    await syncFromSmtc();
    const play = playState();
    if (play.song && play.song.duration > 0 && play.position >= play.song.duration - 1) {
      writeFileSync(OVERLAY_FILE, JSON.stringify({ lines: [] }), 'utf8');
      return;
    }
    if (!play.song) {
      writeFileSync(OVERLAY_FILE, JSON.stringify({ lines: [] }), 'utf8');
      return;
    }
    const lyric = await getLyric(play.song.id);
    const lines = (lyric && lyric.lines) || [];
    const position = play.position;
    let index = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t <= position + 0.15) index = i;
      else break;
    }
    const out = [];
    if (index >= 0) {
      const KEEP = 9.5;
      const FADE_START = 8.0;
      const FADE_LEN = 1.5;
      for (let i = Math.max(0, index - 4); i <= index; i++) {
        const line = lines[i];
        const age = position - line.t;
        if (age < 0 || age > KEEP) continue;
        const seed = i * 137 + (play.song.id || 1);
        const x = 30 + rand(seed) * 40;
        const y = 16 + rand(seed + 17) * 54;
        const rot = -6 + rand(seed + 31) * 12;
        const fade = age <= FADE_START ? 1 : Math.max(0, 1 - (age - FADE_START) / FADE_LEN);
        const chars = Array.from(line.text);
        const text = line.text;
        let shown = chars.length;
        if (i === index) {
          const next = lines[i + 1];
          const span = Math.max(0.8, (next ? next.t : position + 6) - line.t);
          const per = Math.min(0.2, span / Math.max(1, chars.length));
          shown = Math.max(0, Math.min(chars.length, Math.floor((position - line.t) / per) + 1));
        }
        const trText = line.tr && line.tr !== line.text ? line.tr : '';
        const trChars = Array.from(trText);
        const trShown = Math.floor(trChars.length * (chars.length ? shown / chars.length : 1));
        out.push({
          key: play.song.id + '-' + i,
          text,
          shown,
          tr: trText,
          trShown,
          seed: Math.round(seed * 1000),
          rot: Number(rot.toFixed(1)),
          opacity: i === index ? 1 : Number((fade * 0.9).toFixed(3)),
        });
      }
    }
    writeFileSync(OVERLAY_FILE, JSON.stringify({ lines: out }), 'utf8');
  } catch (e) {
    /* transient: next tick retries */
  } finally {
    overlay.busy = false;
  }
}

function overlayStart() {
  if (overlay.child) return true;
  try {
    overlay.child = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(HERE, 'overlay.ps1'),
    ], { windowsHide: true, stdio: 'ignore' });
  } catch (e) {
    overlay.child = null;
    return false;
  }
  overlay.child.on('exit', () => {
    overlay.child = null;
    if (overlay.timer) {
      clearInterval(overlay.timer);
      overlay.timer = null;
    }
  });
  overlay.timer = setInterval(overlayTick, 150);
  overlayTick();
  return true;
}

function openApp() {
  try {
    const p = spawn(findAppExe(), [], { detached: true, stdio: 'ignore' });
    p.unref();
    return true;
  } catch (e) {
    return false;
  }
}

function reply(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(text);
}

export function apply(ctx) {
  if (process.platform !== 'win32') return;
  const web = ctx.get('webServer');
  if (!web) return;

  startHelper();
  startElog();
  ctx.effect(() => {
    const timer = setInterval(() => send('state'), 1000);
    return () => {
      clearInterval(timer);
      send('quit');
      stopElog();
      overlayStop();
      if (child) {
        try { child.kill(); } catch (e) { /* ignore */ }
        child = null;
      }
    };
  });

  ctx.effect(() => web.register({
    kind: 'prefix',
    path: '/netease',
    async handler(req, res) {
      const url = new URL(req.url || '/', 'http://localhost');
      const p = url.pathname;
      if (p === '/netease/state') {
        send('state');
        const out = { ...state };
        if (!out.title && elog.song && elog.song.name) {
          out.title = elog.song.name;
          out.artist = elog.song.artist || '';
          out.session = true;
          out.status = playState().playing ? 'Playing' : 'Paused';
          out.source = 'elog';
        }
        return reply(res, 200, out);
      }
      if (p === '/netease/offset') {
        const v = Number(url.searchParams.get('v'));
        if (Number.isFinite(v)) lyricOffset = Math.max(-5, Math.min(5, v));
        return reply(res, 200, { ok: true, offset: lyricOffset });
      }
      if (p === '/netease/diag') {
        let size = -1;
        try { size = statSync(elog.path).size; } catch (e) { /* ignore */ }
        return reply(res, 200, {
          state,
          elog: { path: elog.path || '', size, offset: elog.offset, song: elog.song, pending: elog.pending.length },
          platform: process.platform,
          node: process.version,
        });
      }
      if (p === '/netease/play') {
        await syncFromSmtc();
        return reply(res, 200, playState());
      }
      if (p === '/netease/play-song') {
        const id = String(url.searchParams.get('id') || '').replace(/\D/g, '');
        if (!id) return reply(res, 400, { ok: false, error: 'bad-id' });
        playSongCommand(id);
        return reply(res, 200, { ok: true });
      }
      if (p === '/netease/overlay') {
        const on = url.searchParams.get('on');
        if (on === '1') return reply(res, 200, { ok: overlayStart(), on: Boolean(overlay.child) });
        if (on === '0') {
          overlayStop();
          return reply(res, 200, { ok: true, on: false });
        }
        return reply(res, 200, { ok: true, on: Boolean(overlay.child) });
      }
      if (p === '/netease/playlist') {
        const id = String(url.searchParams.get('id') || '').replace(/\D/g, '');
        if (!id) return reply(res, 400, { ok: false, error: 'bad-id' });
        return reply(res, 200, await fetchPlaylistTracks(id));
      }
      if (p === '/netease/lyric') {
        const id = String(url.searchParams.get('id') || '').replace(/\D/g, '');
        return reply(res, 200, await getLyric(id));
      }
      if (p === '/netease/playlists') {
        try {
          const data = await fetchPlaylists();
          return reply(res, 200, { ok: true, source: data.source, items: data.items });
        } catch (e) {
          return reply(res, 200, { ok: false, source: 'none', items: [] });
        }
      }
      if (p === '/netease/action') {
        const action = url.searchParams.get('do') || '';
        if (!['toggle', 'next', 'prev'].includes(action)) {
          return reply(res, 400, { ok: false, error: 'bad-action' });
        }
        send(action);
        return reply(res, 200, { ok: true });
      }
      if (p === '/netease/volume') {
        const value = Number(url.searchParams.get('v'));
        if (!Number.isFinite(value)) return reply(res, 400, { ok: false, error: 'bad-volume' });
        const level = Math.max(0, Math.min(100, value));
        // The client fades its session volume back towards its own level for a
        // moment after an external change. Re-apply briefly so the target sticks.
        send('setvol ' + level);
        let left = 9;
        const timer = setInterval(() => {
          send('setvol ' + level);
          if (--left <= 0) clearInterval(timer);
        }, 180);
        return reply(res, 200, { ok: true, volume: level, via: 'session' });
      }
      if (p === '/netease/open') {
        const id = String(url.searchParams.get('playlist') || '').replace(/\D/g, '');
        if (!id) return reply(res, 400, { ok: false, error: 'bad-id' });
        send('open orpheus://playlist/' + id);
        setTimeout(() => {
          if (state.session && state.status !== 'Playing') send('toggle');
        }, 1600);
        return reply(res, 200, { ok: true });
      }
      if (p === '/netease/app') {
        return reply(res, 200, { ok: openApp() });
      }
      if (p === '/netease/icon') {
        try {
          const bytes = readFileSync(path.join(HERE, 'netease-logo.png'));
          res.writeHead(200, {
            'content-type': 'image/png',
            'cache-control': 'public, max-age=86400',
          });
          res.end(bytes);
        } catch (e) {
          reply(res, 404, { ok: false });
        }
        return;
      }
      return reply(res, 404, { ok: false, error: 'not-found' });
    },
  }));
}
