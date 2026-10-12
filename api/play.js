const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const cache = new Map();
function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.v);
  return fn().then(v => {
    cache.set(key, { at: Date.now(), v });
    if (cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of cache) if (now - v.at > 10 * 60e3) cache.delete(k);
    }
    return v;
  });
}

/* ===== Sumber 1: Bot Telegram ikyyxd ===== */
async function botSearch(q) {
  try {
    const r = await axios.get('https://api.ikyyxd.my.id/search/ytplayv2', {
      params: { q }, timeout: 15000, headers: { 'user-agent': UA },
    });
    const d = r.data;
    if (d.status && d.result && d.result.audio && d.result.audio.url) {
      return [{
        id: 'bot:' + encodeURIComponent(q).slice(0, 40),
        title: d.result.title || q,
        artist: d.result.artist || 'YouTube',
        duration: d.result.duration || 0,
        thumbnail: d.result.thumbnail || '',
        url: d.result.audio.url,
        source: 'bot',
      }];
    }
  } catch {}
  return [];
}

/* ===== Sumber 2: Piped ===== */
const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.reallyaweso.me',
];

async function pipedSearch(q) {
  for (const base of PIPED) {
    try {
      const r = await axios.get(`${base}/search`, {
        params: { q, filter: 'music_songs' }, timeout: 8000, headers: { 'user-agent': UA },
      });
      const items = r.data?.items || [];
      if (items.length) {
        return items.filter(i => i.url && i.url.startsWith('/watch?v=')).slice(0, 20).map(i => ({
          id: i.url.replace('/watch?v=', ''),
          title: i.title,
          artist: i.uploaderName || '',
          duration: i.duration || 0,
          thumbnail: i.thumbnail || '',
          source: 'piped',
        }));
      }
    } catch {}
  }
  return [];
}

async function pipedStream(id) {
  for (const base of PIPED) {
    try {
      const r = await axios.get(`${base}/streams/${id}`, { timeout: 8000, headers: { 'user-agent': UA } });
      const streams = (r.data?.audioStreams || []).filter(s => s.mimeType && s.mimeType.includes('audio'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const pick = streams.find(s => s.mimeType.includes('mp4')) || streams[0];
      if (pick?.url) return pick.url;
    } catch {}
  }
  return null;
}

/* ===== Sumber 3: Invidious ===== */
const INVIDIOUS = ['https://inv.tux.pizza', 'https://invidious.nerdvpn.de', 'https://iv.melmac.space'];

async function invSearch(q) {
  for (const base of INVIDIOUS) {
    try {
      const r = await axios.get(`${base}/api/v1/search`, {
        params: { q, type: 'video' }, timeout: 8000, headers: { 'user-agent': UA },
      });
      const items = r.data || [];
      if (items.length) {
        return items.slice(0, 20).map(i => ({
          id: i.videoId,
          title: i.title,
          artist: i.author || '',
          duration: i.lengthSeconds || 0,
          thumbnail: i.videoThumbnails?.[0]?.url || '',
          source: 'invidious',
        }));
      }
    } catch {}
  }
  return [];
}

async function invStream(id) {
  for (const base of INVIDIOUS) {
    try {
      const r = await axios.get(`${base}/api/v1/videos/${id}`, { timeout: 8000, headers: { 'user-agent': UA } });
      const streams = (r.data?.adaptiveFormats || []).filter(s => s.type && s.type.includes('audio'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const pick = streams.find(s => s.type.includes('mp4')) || streams[0];
      if (pick?.url) return pick.url;
    } catch {}
  }
  return null;
}

/* ===== Sumber 4: ytdl-core ===== */
async function ytdlStream(id) {
  try {
    const ytdl = require('@distube/ytdl-core');
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
    return format.url;
  } catch { return null; }
}

/* ===== ROUTER — semua via ?a= ===== */
app.get('/', async (req, res) => {
  const a = String(req.query.a || 'health');

  if (a === 'search') {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.status(400).json({ ok: false, error: 'q kosong' });
    try {
      const data = await cached('s:' + q, 5 * 60e3, async () => {
        const bot = await botSearch(q);
        const [piped, inv] = await Promise.all([
          pipedSearch(q).catch(() => []),
          invSearch(q).catch(() => []),
        ]);
        return [...bot, ...piped, ...inv].filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i);
      });
      res.setHeader('cache-control', 'public, s-maxage=300');
      return res.json({ ok: true, count: data.length, data });
    } catch (e) {
      return res.status(502).json({ ok: false, error: String(e.message).slice(0, 300) });
    }
  }

  if (a === 'stream') {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id kosong' });
    try {
      if (id.startsWith('bot:')) {
        const q = decodeURIComponent(id.slice(4));
        const bot = await botSearch(q);
        if (bot[0]?.url) {
          res.setHeader('cache-control', 'public, s-maxage=1200');
          return res.redirect(302, bot[0].url);
        }
        throw new Error('Bot gagal resolve ulang');
      }
      const url = await cached('st:' + id, 20 * 60e3, async () => {
        let u = await pipedStream(id);
        if (!u) u = await invStream(id);
        if (!u) u = await ytdlStream(id);
        return u;
      });
      if (!url) throw new Error('Stream tidak ditemukan');
      res.setHeader('cache-control', 'public, s-maxage=1200');
      return res.redirect(302, url);
    } catch (e) {
      return res.status(502).json({ ok: false, error: String(e.message).slice(0, 300) });
    }
  }

  return res.json({
    ok: true,
    service: 'Zukai Music API',
    use: '?a=search&q=judul atau ?a=stream&id=xxx',
  });
});

module.exports = app;
