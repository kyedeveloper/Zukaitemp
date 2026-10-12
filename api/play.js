const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Cache sederhana
const cache = new Map();
function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.v);
  return fn().then(v => {
    cache.set(key, { at: Date.now(), v });
    if (cache.size > 300) {
      const now = Date.now();
      for (const [k, v] of cache) if (now - v.at > 10 * 60e3) cache.delete(k);
    }
    return v;
  });
}

/* ============================================================
   DAFTAR INSTANCE (round-robin fallback)
   ============================================================ */
const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.leptons.xyz',
];

const INVIDIOUS = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://iv.melmac.space',
  'https://invidious.privacyredirect.com',
];

/* ============================================================
   SEARCH
   ============================================================ */
async function searchPiped(q) {
  for (const base of PIPED) {
    try {
      const r = await axios.get(`${base}/search`, {
        params: { q, filter: 'music_songs' },
        timeout: 8000,
        headers: { 'user-agent': UA },
      });
      const items = r.data?.items || [];
      if (items.length) {
        return items
          .filter(i => i.url && i.url.startsWith('/watch?v='))
          .map(i => ({
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

async function searchInvidious(q) {
  for (const base of INVIDIOUS) {
    try {
      const r = await axios.get(`${base}/api/v1/search`, {
        params: { q, type: 'video' },
        timeout: 8000,
        headers: { 'user-agent': UA },
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

/* ============================================================
   STREAM URL EXTRACTION
   ============================================================ */
async function streamPiped(id) {
  for (const base of PIPED) {
    try {
      const r = await axios.get(`${base}/streams/${id}`, {
        timeout: 8000,
        headers: { 'user-agent': UA },
      });
      const streams = (r.data?.audioStreams || [])
        .filter(s => s.mimeType && s.mimeType.includes('audio'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const pick = streams.find(s => s.mimeType.includes('mp4')) || streams[0];
      if (pick?.url) return pick.url;
    } catch {}
  }
  return null;
}

async function streamInvidious(id) {
  for (const base of INVIDIOUS) {
    try {
      const r = await axios.get(`${base}/api/v1/videos/${id}`, {
        timeout: 8000,
        headers: { 'user-agent': UA },
      });
      const streams = (r.data?.adaptiveFormats || [])
        .filter(s => s.type && s.type.includes('audio'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const pick = streams.find(s => s.type.includes('mp4')) || streams[0];
      if (pick?.url) return pick.url;
    } catch {}
  }
  return null;
}

async function streamYtdl(id) {
  try {
    const ytdl = require('@distube/ytdl-core');
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });
    return format.url;
  } catch {
    return null;
  }
}

/* ============================================================
   ROUTES
   ============================================================ */
app.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) return res.status(400).json({ ok: false, error: 'q kosong' });
  try {
    const data = await cached('s:' + q, 5 * 60e3, async () => {
      let r = await searchPiped(q);
      if (!r.length) r = await searchInvidious(q);
      return r;
    });
    res.json({ ok: true, count: data.length, data });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message).slice(0, 300) });
  }
});

app.get('/stream', async (req, res) => {
  const id = String(req.query.id || '').trim();
  if (!id || !/^[\w-]{5,20}$/.test(id)) {
    return res.status(400).json({ ok: false, error: 'id tidak valid' });
  }
  try {
    const url = await cached('st:' + id, 20 * 60e3, async () => {
      let u = await streamPiped(id);
      if (!u) u = await streamInvidious(id);
      if (!u) u = await streamYtdl(id);
      return u;
    });
    if (!url) throw new Error('Stream tidak ditemukan di semua sumber');
    // Redirect ke URL audio langsung
    res.setHeader('cache-control', 'public, s-maxage=1200');
    res.redirect(302, url);
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message).slice(0, 300) });
  }
});

app.get('/api/play', (req, res) => {
  res.json({
    ok: true,
    service: 'Zukai Music API',
    endpoints: ['/api/play/search?q=', '/api/play/stream?id='],
  });
});

module.exports = app;
