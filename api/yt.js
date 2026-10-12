const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
];

async function searchPiped(q) {
  for (const base of PIPED) {
    try {
      const r = await axios.get(`${base}/search`, {
        params: { q, filter: 'music_songs' },
        timeout: 8000,
        headers: { 'user-agent': UA },
      });
      const items = r.data?.items || [];
      if (items.length) return items;
    } catch {}
  }
  return [];
}

async function searchBot(q) {
  try {
    const r = await axios.get('https://api.ikyyxd.my.id/search/ytplayv2', {
      params: { q }, timeout: 12000, headers: { 'user-agent': UA },
    });
    const d = r.data;
    if (d.status && d.result) {
      const vid = d.result.videoId
        || (String(d.result.audio?.url || '').match(/[?&]id=([\w-]{11})/) || [])[1]
        || (String(d.result.audio?.url || '').match(/\/([\w-]{11})/) || [])[1];
      if (vid) return [{ url: `/watch?v=${vid}`, title: d.result.title || q }];
    }
  } catch {}
  return [];
}

app.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) return res.json({ ids: [] });
  try {
    let items = await searchPiped(q);
    if (!items.length) items = await searchBot(q);
    const ids = items
      .map(i => {
        const m = String(i.url || '').match(/[?&]v=([\w-]{11})/);
        return m ? m[1] : null;
      })
      .filter(Boolean)
      .slice(0, 3);
    res.setHeader('cache-control', 'public, s-maxage=3600');
    res.json({ ids });
  } catch (e) {
    res.status(502).json({ ids: [], error: String(e.message).slice(0, 200) });
  }
});

module.exports = app;