/**
 * dsh-netease-panel — browser half.
 *
 * A remote for the local NetEase Cloud Music desktop client. The host half
 * talks to the client through the Windows media session, so this panel carries
 * no web player, no private API and no streaming: it shows what the client is
 * playing and asks the client to play one of your playlists.
 */
window.__ModuleLoader__.load({
  id: 'dsh-netease-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const CSS = `
.ntp-pill, .ntp-card, .ntp-card * { box-sizing: border-box; }
.ntp-pill {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 10px 28px rgba(0, 0, 0, .28);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
  padding: 0;
  transition: transform .15s ease;
}
.ntp-pill:hover { transform: translateY(-1px) scale(1.03); }
.ntp-pill:active { transform: scale(.97); }
.ntp-card {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: min(380px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 18px 50px rgba(0, 0, 0, .38);
  pointer-events: auto;
  font: 13px/1.4 ui-sans-serif, system-ui, "Segoe UI", sans-serif;
}
.ntp-card[hidden] { display: none; }
.ntp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.ntp-title { font-weight: 600; font-size: 13px; flex: 1; }
.ntp-btn {
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font: inherit;
  padding: 2px 6px;
  border-radius: 6px;
}
.ntp-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); }
.ntp-now { padding: 12px 12px 8px; }
.ntp-song { font-size: 15px; font-weight: 600; line-height: 1.3; word-break: break-word; }
.ntp-artist { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
.ntp-status { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 6px; }
.ntp-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; }
.ntp-dot.on { background: #1db954; }
.ntp-dot.off { background: var(--dsw-alias-state-idle-primary); }
.ntp-vol { display: flex; align-items: center; gap: 8px; padding: 0 12px 10px; }
.ntp-vol-hint { display: flex; align-items: center; gap: 8px; padding: 0 12px 8px; }
.ntp-vol input { flex: 1; min-width: 0; accent-color: #e60026; }
.ntp-vol-val { font-size: 11px; color: var(--dsw-alias-label-secondary); width: 34px; text-align: right; }
.ntp-controls { display: flex; gap: 8px; padding: 4px 12px 10px; align-items: center; }
.ntp-ctrl {
  width: 36px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  padding: 0;
}
.ntp-ctrl:hover { border-color: var(--dsw-alias-border-l2); }
.ntp-ctrl:disabled { opacity: .45; cursor: default; }
.ntp-sep { flex: 1; }
.ntp-tools { display: flex; align-items: center; gap: 8px; padding: 0 12px 10px; }
.ntp-tool {
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.ntp-tool:hover { border-color: var(--dsw-alias-border-l2); }
.ntp-logo { display: block; border-radius: 6px; flex: none; }
.ntp-modes { display: flex; gap: 6px; padding: 0 0 8px; }
.ntp-mode {
  flex: 1;
  height: 26px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.ntp-mode.on { border-color: #d8a523; color: #fffeef; background: rgba(216, 165, 35, .16); }
.ntp-lists { border-top: 1px solid var(--dsw-alias-border-l1); padding: 8px 12px 12px; display: flex; flex-direction: column; min-height: 0; }
.ntp-lists-head { display: flex; align-items: center; gap: 6px; padding-bottom: 6px; }
.ntp-lists-title { font-size: 12px; font-weight: 600; flex: 1; }
.ntp-src { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.ntp-list { overflow: auto; max-height: 220px; display: flex; flex-direction: column; gap: 2px; }
.ntp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.ntp-row:hover { background: var(--dsw-alias-bg-layer-1); }
.ntp-row[disabled] { opacity: .5; cursor: default; }
.ntp-row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.ntp-row-meta { font-size: 11px; color: var(--dsw-alias-label-secondary); flex: none; }
.ntp-note { font-size: 11px; color: var(--dsw-alias-label-secondary); padding: 6px 0 0; }
.ntp-error { font-size: 12px; color: var(--dsw-alias-state-error-primary); padding: 0 12px 8px; }
.ntp-tool.on { border-color: #d8a523; color: #fffeef; background: rgba(216, 165, 35, .18); }
.ntp-lyric-stage {
  position: fixed;
  inset: 0;
  z-index: 2147483200;
  pointer-events: none;
  overflow: hidden;
  user-select: none;
  font-family: "Microsoft YaHei", "PingFang SC", ui-sans-serif, system-ui, sans-serif;
  color: #fffeef;
}
.ntp-lyric-line {
  position: absolute;
  width: max-content;
  max-width: min(560px, 40vw);
  text-align: center;
  line-height: 1.45;
  overflow-wrap: anywhere;
  transition: opacity .6s ease;
  will-change: opacity;
}
.ntp-lyric-line.current {
  font-size: 26px;
  font-weight: 700;
  font-style: italic;
  letter-spacing: .04em;
  text-shadow:
    -1px -1px 0 #d8a523, 1px -1px 0 #d8a523,
    -1px 1px 0 #d8a523, 1px 1px 0 #d8a523,
    -2px 0 0 #d8a523, 2px 0 0 #d8a523,
    0 4px 16px rgba(0, 0, 0, .92);
  animation: ntp-lyric-in .4s ease both;
}
.ntp-lyric-line.past {
  font-size: 26px;
  font-weight: 700;
  font-style: italic;
  letter-spacing: .04em;
  text-shadow:
    -1px -1px 0 rgba(216, 165, 35, .7), 1px -1px 0 rgba(216, 165, 35, .7),
    -1px 1px 0 rgba(216, 165, 35, .7), 1px 1px 0 rgba(216, 165, 35, .7),
    0 3px 12px rgba(0, 0, 0, .9);
}
.ntp-char {
  display: inline-block;
  opacity: 0;
  transition: opacity .2s ease;
}
.ntp-char.on { opacity: 1; }
.ntp-lyric-tr {
  font-size: 15px;
  line-height: 1.5;
  opacity: .82;
  margin-top: 4px;
  text-shadow:
    -1px -1px 0 rgba(216, 165, 35, .85), 1px -1px 0 rgba(216, 165, 35, .85),
    -1px 1px 0 rgba(216, 165, 35, .85), 1px 1px 0 rgba(216, 165, 35, .85),
    0 3px 12px rgba(0, 0, 0, .9);
}
.ntp-lyric-line.past .ntp-lyric-tr { font-size: 15px; opacity: .78; }
@keyframes ntp-lyric-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

`;

    async function getJson(url) {
      const res = await fetch(url, { cache: 'no-store' });
      return res.json();
    }

    function rand(seed) {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    }

    function Logo(props) {
      const size = props.size || 24;
      return h('img', {
        className: 'ntp-logo',
        src: '/netease/icon',
        width: size,
        height: size,
        alt: '',
        'aria-hidden': 'true',
      });
    }

    function CtrlIcon(props) {
      const paths = {
        prev: h('path', { d: 'M7 6h2v12H7zM20 6l-9 6 9 6z', fill: 'currentColor' }),
        next: h('path', { d: 'M17 6h-2v12h2zM4 6l9 6-9 6z', fill: 'currentColor' }),
        play: h('path', { d: 'M8 5v14l11-7z', fill: 'currentColor' }),
        pause: h('path', { d: 'M7 5h4v14H7zM14 5h4v14h-4z', fill: 'currentColor' }),
      };
      return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': 'true' }, paths[props.name]);
    }

    function statusText(state) {
      if (!state || state.session === false) return '客户端未在播放';
      if (state.status === 'Playing') return '播放中';
      if (state.status === 'Paused') return '已暂停';
      return state.status || '空闲';
    }

    function Panel() {
      const [open, setOpen] = React.useState(false);
      const [remote, setRemote] = React.useState(null);
      const [lists, setLists] = React.useState([]);
      const [source, setSource] = React.useState('none');
      const [busyId, setBusyId] = React.useState('');
      const [note, setNote] = React.useState('');
      const [error, setError] = React.useState('');
      const [volume, setVolume] = React.useState(100);
      const volTouchRef = React.useRef(0);
      const volTimerRef = React.useRef(null);
      const [view, setView] = React.useState('lists');
      const [currentList, setCurrentList] = React.useState(null);
      const [tracks, setTracks] = React.useState([]);
      const [loadingTracks, setLoadingTracks] = React.useState(false);
      const [queue, setQueue] = React.useState(null);
      const [mode, setMode] = React.useState(() => {
        try { return localStorage.getItem('dsh-netease-mode') || 'order'; } catch (e) { return 'order'; }
      });
      const firedRef = React.useRef('');
      const queueRef = React.useRef(null);

      React.useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        const tick = async () => {
          try {
            const data = await getJson('/netease/state');
            if (alive) setRemote(data);
          } catch (e) { /* host offline: keep the last frame */ }
        };
        tick();
        const timer = setInterval(tick, 2000);
        return () => { alive = false; clearInterval(timer); };
      }, [open]);

      React.useEffect(() => {
        if (!open || lists.length) return;
        (async () => {
          try {
            const data = await getJson('/netease/playlists');
            if (data && Array.isArray(data.items)) {
              setLists(data.items);
              setSource(data.source || 'none');
            }
          } catch (e) {
            setError('读取歌单失败：Host 没有响应。');
          }
        })();
      }, [open, lists.length]);

      const act = async (action) => {
        try {
          await getJson('/netease/action?do=' + action);
          setTimeout(async () => {
            try { setRemote(await getJson('/netease/state')); } catch (e) { /* ignore */ }
          }, 400);
        } catch (e) { /* ignore */ }
      };

      React.useEffect(() => {
        if (remote && typeof remote.volume === 'number' && Date.now() - volTouchRef.current > 1500) {
          setVolume(Math.round(remote.volume));
        }
      }, [remote]);

      const changeVolume = (value) => {
        const n = Math.max(0, Math.min(100, Math.round(Number(value))));
        setVolume(n);
        volTouchRef.current = Date.now();
        if (volTimerRef.current) clearTimeout(volTimerRef.current);
        volTimerRef.current = setTimeout(async () => {
          try {
            await getJson('/netease/volume?v=' + n);
          } catch (e) { /* ignore */ }
        }, 120);
      };

      const openList = async (item) => {
        setBusyId(item.id);
        setView('tracks');
        setCurrentList(item);
        setTracks([]);
        setLoadingTracks(true);
        setNote('');
        try {
          const data = await getJson('/netease/playlist?id=' + encodeURIComponent(item.id));
          if (data && Array.isArray(data.tracks)) setTracks(data.tracks);
          else setError('这个歌单没有读到歌曲。');
        } catch (e) {
          setError('读取歌单歌曲失败。');
        }
        setLoadingTracks(false);
        setBusyId('');
      };

      const playTrack = async (track, index) => {
        const ids = tracks.map((t) => t.id);
        setQueue({ ids, index, name: currentList ? currentList.name : '' });
        setNote('已发送到客户端：' + track.name);
        try {
          await getJson('/netease/play-song?id=' + encodeURIComponent(track.id));
        } catch (e) {
          setNote('播放失败。');
        }
        setTimeout(() => setNote(''), 3000);
      };

      const setModeAndStore = (next) => {
        setMode(next);
        try { localStorage.setItem('dsh-netease-mode', next); } catch (e) { /* ignore */ }
      };

      const openApp = async () => {
        try { await getJson('/netease/app'); } catch (e) { /* ignore */ }
      };

      const [lyricOn, setLyricOn] = React.useState(() => {
        try { return localStorage.getItem('dsh-netease-lyrics') === '1'; } catch (e) { return false; }
      });
      const [play, setPlay] = React.useState(null);
      const [lyric, setLyric] = React.useState({ id: 0, lines: [] });
      const [clock, setClock] = React.useState(0);
      const [externalOn, setExternalOn] = React.useState(false);
      const [offset, setOffset] = React.useState(() => {
        try { return Number(localStorage.getItem('dsh-netease-offset')) || 0; } catch (e) { return 0; }
      });

      const changeOffset = async (delta) => {
        const next = Math.max(-3, Math.min(3, Math.round((offset + delta) * 10) / 10));
        setOffset(next);
        try { localStorage.setItem('dsh-netease-offset', String(next)); } catch (e) { /* ignore */ }
        try { await getJson('/netease/offset?v=' + next); } catch (e) { /* ignore */ }
      };

      const toggleExternal = async () => {
        try {
          const data = await getJson('/netease/overlay?on=' + (externalOn ? '0' : '1'));
          const on = Boolean(data && data.on);
          setExternalOn(on);
          setNote(on ? '外部歌词已开启' : '外部歌词已关闭');
        } catch (e) {
          setNote('外部歌词切换失败');
        }
        setTimeout(() => setNote(''), 3000);
      };

      React.useEffect(() => {
        let alive = true;
        const check = async () => {
          try {
            const data = await getJson('/netease/overlay');
            if (alive) setExternalOn(Boolean(data && data.on));
          } catch (e) { /* ignore */ }
        };
        check();
        const timer = setInterval(check, 5000);
        return () => { alive = false; clearInterval(timer); };
      }, []);

      const toggleLyric = () => {
        setLyricOn((on) => {
          const next = !on;
          try { localStorage.setItem('dsh-netease-lyrics', next ? '1' : '0'); } catch (e) { /* ignore */ }
          return next;
        });
      };

      React.useEffect(() => {
        let alive = true;
        const tick = async () => {
          try {
            const data = await getJson('/netease/play');
            if (alive && data) setPlay({ ...data, at: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
          } catch (e) { /* host offline */ }
        };
        tick();
        const timer = setInterval(tick, 600);
        const beat = setInterval(() => setClock((n) => n + 1), 70);
        return () => { alive = false; clearInterval(timer); clearInterval(beat); };
      }, []);

      React.useEffect(() => {
        queueRef.current = queue;
      }, [queue]);

      const songId = play && play.song ? play.song.id : 0;
      React.useEffect(() => {
        if (!lyricOn || !songId) return undefined;
        let alive = true;
        (async () => {
          try {
            const data = await getJson('/netease/lyric?id=' + encodeURIComponent(songId));
            if (alive && data) setLyric({ id: songId, lines: Array.isArray(data.lines) ? data.lines : [] });
          } catch (e) {
            if (alive) setLyric({ id: songId, lines: [] });
          }
        })();
        return () => { alive = false; };
      }, [lyricOn, songId]);

      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const position = play
        ? Math.max(0, play.position + (play.playing ? (now - play.at) / 1000 : 0))
        : 0;

      React.useEffect(() => {
        const q = queueRef.current;
        if (!q || !q.ids || !q.ids.length) return;
        if (!play || !play.song || !play.playing) return;
        const dur = play.song.duration || 0;
        if (dur < 10) return;
        const pos = play.position + (play.playing ? (now - play.at) / 1000 : 0);
        if (pos < dur - 0.45) return;
        const key = String(play.song.id);
        if (firedRef.current === key) return;
        firedRef.current = key;
        const idx = q.ids.indexOf(key);
        let next = idx >= 0 ? idx : q.index;
        if (mode === 'shuffle') next = Math.floor(Math.random() * q.ids.length);
        else if (mode === 'single') next = idx >= 0 ? idx : q.index;
        else next = ((idx >= 0 ? idx : q.index) + 1) % q.ids.length;
        if (next >= q.ids.length || next < 0) next = 0;
        const nid = q.ids[next];
        if (nid) getJson('/netease/play-song?id=' + encodeURIComponent(nid)).catch(() => {});
        setTimeout(() => { firedRef.current = ''; }, 2500);
      }, [play, mode, now]);
      let currentIndex = -1;
      if (lyric.id === songId && lyric.lines.length) {
        for (let i = 0; i < lyric.lines.length; i++) {
          if (lyric.lines[i].t <= position + 0.15) currentIndex = i;
          else break;
        }
      }
      const cur = currentIndex >= 0 ? lyric.lines[currentIndex] : null;
      const prev = currentIndex > 0 ? lyric.lines[currentIndex - 1] : null;
      const next = currentIndex >= 0 && currentIndex + 1 < lyric.lines.length ? lyric.lines[currentIndex + 1] : null;

      const chars = cur ? Array.from(cur.text) : [];
      const trChars = cur && cur.tr ? Array.from(cur.tr) : [];
      const lineEnd = next
        ? next.t
        : (play && play.song && play.song.duration ? play.song.duration : (cur ? cur.t + 6 : 6));
      const lineSpan = cur ? Math.max(0.8, lineEnd - cur.t) : 1;
      const elapsed = cur ? Math.max(0, position - cur.t) : 0;
      const perChar = Math.min(0.2, lineSpan / Math.max(1, chars.length));
      const shown = Math.max(0, Math.min(chars.length, Math.floor(elapsed / perChar) + 1));
      const frac = chars.length ? shown / chars.length : 1;
      const trShown = Math.floor(trChars.length * frac);

      const KEEP_LINE = 9.5;
      const FADE_START = 8.0;
      const FADE_LEN = 1.5;
      const visible = [];
      const atEnd = !!(play && play.song && play.song.duration > 0 && position >= play.song.duration - 1);
      if (currentIndex >= 0 && !atEnd) {
        for (let i = Math.max(0, currentIndex - 4); i <= currentIndex; i++) {
          const line = lyric.lines[i];
          const age = position - line.t;
          if (age < 0 || age > KEEP_LINE) continue;
          visible.push({ line, i, age, isCurrent: i === currentIndex });
        }
      }

      const playing = remote && remote.session && remote.status === 'Playing';

      return h(React.Fragment, null,
        h('style', { key: 'style' }, CSS),
        lyricOn && visible.length
          ? h('div', { key: 'lyric', className: 'ntp-lyric-stage', 'aria-hidden': 'true' },
              visible.map(({ line, i, age, isCurrent }) => {
                const seed = i * 137 + (songId || 1);
                const x = 30 + rand(seed) * 40;
                const y = 16 + rand(seed + 17) * 54;
                const rot = -6 + rand(seed + 31) * 12;
                const fade = age <= FADE_START ? 1 : Math.max(0, 1 - (age - FADE_START) / FADE_LEN);
                const pastChars = Array.from(line.text);
                const pastTr = line.tr ? Array.from(line.tr) : [];
                return h('div', {
                  key: 'line-' + songId + '-' + i,
                  className: 'ntp-lyric-line ' + (isCurrent ? 'current' : 'past'),
                  style: {
                    left: x.toFixed(2) + '%',
                    top: y.toFixed(2) + '%',
                    transform: 'translate(-50%, -50%) rotate(' + rot.toFixed(1) + 'deg)',
                    opacity: isCurrent ? 1 : Number((fade * 0.9).toFixed(3)),
                  },
                },
                  isCurrent
                    ? h('div', null,
                        chars.map((ch, k) => h('span', {
                          key: k,
                          className: 'ntp-char' + (k < shown ? ' on' : ''),
                          style: { transform: 'rotate(' + (((k * 37) % 7) - 3) + 'deg)' },
                        }, ch === ' ' ? '\u00a0' : ch)),
                        trChars.length
                          ? h('div', { className: 'ntp-lyric-tr' },
                              trChars.map((ch, k) => h('span', {
                                key: k,
                                className: 'ntp-char' + (k < trShown ? ' on' : ''),
                              }, ch === ' ' ? '\u00a0' : ch)))
                          : null,
                      )
                    : h('div', null,
                        pastChars.map((ch, k) => h('span', { key: k, className: 'ntp-char on' }, ch === ' ' ? '\u00a0' : ch)),
                        pastTr.length
                          ? h('div', { className: 'ntp-lyric-tr' },
                              pastTr.map((ch, k) => h('span', { key: k, className: 'ntp-char on' }, ch === ' ' ? '\u00a0' : ch)))
                          : null,
                      ),
                );
              }))
          : null,
        h('button', {
          key: 'pill',
          type: 'button',
          className: 'ntp-pill',
          title: '网易云音乐',
          'aria-label': '打开网易云音乐控制面板',
          onClick: () => setOpen(true),
          style: open ? { display: 'none' } : undefined,
        }, h(Logo, { size: 30 })),

        h('section', { key: 'card', className: 'ntp-card', hidden: !open, 'aria-label': '网易云音乐' },
          h('div', { className: 'ntp-head' },
            h(Logo, { size: 18 }),
            h('span', { className: 'ntp-title' }, '网易云音乐'),
            h('button', { type: 'button', className: 'ntp-btn', onClick: openApp, title: '打开网易云客户端' }, '打开客户端'),
            h('button', { type: 'button', className: 'ntp-btn', onClick: () => setOpen(false), title: '收起' }, '收起'),
          ),

          h('div', { className: 'ntp-now' },
            h('div', { className: 'ntp-song' }, (remote && remote.title) || '没有正在播放的歌曲'),
            h('div', { className: 'ntp-artist' }, (remote && remote.artist) || '在网易云客户端里选一首歌开始'),
            h('div', { className: 'ntp-status' },
              h('span', { className: 'ntp-dot ' + (playing ? 'on' : 'off') }),
              statusText(remote),
            ),
          ),

          h('div', { className: 'ntp-controls' },
            h('button', { type: 'button', className: 'ntp-ctrl', onClick: () => act('prev'), title: '上一首', 'aria-label': '上一首' }, h(CtrlIcon, { name: 'prev' })),
            h('button', { type: 'button', className: 'ntp-ctrl', onClick: () => act('toggle'), title: playing ? '暂停' : '播放', 'aria-label': playing ? '暂停' : '播放' }, h(CtrlIcon, { name: playing ? 'pause' : 'play' })),
            h('button', { type: 'button', className: 'ntp-ctrl', onClick: () => act('next'), title: '下一首', 'aria-label': '下一首' }, h(CtrlIcon, { name: 'next' })),
            h('span', { className: 'ntp-sep' }),
            h('button', {
              type: 'button',
              className: 'ntp-btn',
              onClick: async () => {
                try {
                  const data = await getJson('/netease/playlists');
                  setLists(data.items || []);
                  setSource(data.source || 'none');
                } catch (e) { /* ignore */ }
              },
            }, '刷新'),
          ),

          h('div', { className: 'ntp-vol' },
            h('span', { className: 'ntp-src' }, '音量'),
            h('input', {
              type: 'range',
              min: 0,
              max: 100,
              step: 1,
              value: volume,
              'aria-label': '音量',
              onChange: (e) => changeVolume(e.target.value),
            }),
            h('span', { className: 'ntp-vol-val' }, volume + '%'),
          ),

          h('div', { className: 'ntp-tools' },
            h('button', {
              type: 'button',
              className: 'ntp-tool' + (lyricOn ? ' on' : ''),
              onClick: toggleLyric,
              title: '在页面里显示同步歌词',
            }, lyricOn ? '歌词 · 开' : '歌词 · 关'),
            h('button', {
              type: 'button',
              className: 'ntp-tool' + (externalOn ? ' on' : ''),
              onClick: toggleExternal,
              title: '在 DSH 之外显示歌词（独立置顶小窗）',
            }, externalOn ? '外部歌词 · 开' : '外部歌词'),
          ),

          h('div', { className: 'ntp-vol' },
            h('span', { className: 'ntp-src' }, '歌词偏移'),
            h('button', { type: 'button', className: 'ntp-btn', onClick: () => changeOffset(-0.5), title: '歌词延后（如果歌词来得早）' }, '−0.5s'),
            h('span', { className: 'ntp-vol-val' }, (offset > 0 ? '+' : '') + offset + 's'),
            h('button', { type: 'button', className: 'ntp-btn', onClick: () => changeOffset(0.5), title: '歌词提前（如果歌词来得晚）' }, '+0.5s'),
          ),

          h('div', { className: 'ntp-lists' },
            view === 'tracks'
              ? h(React.Fragment, null,
                  h('div', { className: 'ntp-lists-head' },
                    h('button', {
                      type: 'button',
                      className: 'ntp-btn',
                      onClick: () => { setView('lists'); setTracks([]); setCurrentList(null); },
                    }, '← 返回'),
                    h('span', { className: 'ntp-lists-title' }, currentList ? currentList.name : '歌单'),
                    h('button', {
                      type: 'button',
                      className: 'ntp-btn',
                      onClick: () => { if (tracks.length) playTrack(tracks[0], 0); },
                    }, '播放全部'),
                  ),
                  h('div', { className: 'ntp-modes' },
                    [['order', '顺序'], ['shuffle', '随机'], ['single', '单曲']].map(([k, label]) =>
                      h('button', {
                        key: k,
                        type: 'button',
                        className: 'ntp-mode' + (mode === k ? ' on' : ''),
                        onClick: () => setModeAndStore(k),
                      }, label)),
                  ),
                  h('div', { className: 'ntp-list' },
                    loadingTracks ? h('div', { className: 'ntp-note' }, '正在读取歌曲…') : null,
                    tracks.map((t, i) => h('button', {
                      key: t.id,
                      type: 'button',
                      className: 'ntp-row',
                      title: '播放这首歌',
                      onClick: () => playTrack(t, i),
                    },
                      h('span', { className: 'ntp-row-name' }, t.name),
                      h('span', { className: 'ntp-row-meta' }, t.artist || ''),
                    )),
                    !loadingTracks && tracks.length === 0
                      ? h('div', { className: 'ntp-note' }, '没有读到歌曲。')
                      : null,
                  ),
                )
              : h(React.Fragment, null,
                  h('div', { className: 'ntp-lists-head' },
                    h('span', { className: 'ntp-lists-title' }, '我的歌单'),
                    h('span', { className: 'ntp-src' },
                      source === 'account' ? '来自账号' : source === 'history' ? '最近播放' : ''),
                  ),
                  h('div', { className: 'ntp-list' },
                    lists.map((item) => h('button', {
                      key: item.id,
                      type: 'button',
                      className: 'ntp-row',
                      disabled: busyId === item.id,
                      title: '查看歌单歌曲',
                      onClick: () => openList(item),
                    },
                      h('span', { className: 'ntp-row-name' }, item.name),
                      h('span', { className: 'ntp-row-meta' }, item.tracks ? item.tracks + ' 首' : ''),
                    )),
                    lists.length === 0
                      ? h('div', { className: 'ntp-note' }, '还没有读到歌单，点「刷新」再试一次。')
                      : null,
                  ),
                ),
            note ? h('div', { className: 'ntp-note' }, note) : null,
            error ? h('div', { className: 'ntp-note' }, error) : null,
            h('div', { className: 'ntp-note' },
              view === 'tracks'
                ? '点歌曲会在客户端里播放；模式决定一首结束后下一首放什么。'
                : '点歌单查看歌曲；播放控制走系统媒体会话。'),
          ),
        ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'netease-panel',
          order: 900,
        }, Panel));
      },
    };
  },
});
