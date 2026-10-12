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
const INVIDIOUS = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://iv.melmac.space',
];

app.get('/', async (req, res) => {
  const id = String(req.query.id || '').trim();
  if (!/^[\w-]{11}$/.test(id)) return res.json({ views: null, likes: null, date: null });

  for (const base of PIPED) {
    try {
      const r = await axios.get(`${base}/streams/${id}`, {
        timeout: 8000, headers: { 'user-agent': UA },
      });
      const d = r.data;
      return res.json({
        views: d.views ?? null,
        likes: d.likes ?? null,
        date: d.uploadDate || null,
        title: d.title || null,
        duration: d.duration || null,
      });
    } catch {}
  }

  for (const base of INVIDIOUS) {
    try {
      const r = await axios.get(`${base}/api/v1/videos/${id}`, {
        timeout: 8000, headers: { 'user-agent': UA },
      });
      const d = r.data;
      return res.json({
        views: d.viewCount ?? null,
        likes: d.likeCount ?? null,
        date: d.published ? String(d.published).slice(0, 10) : null,
        title: d.title || null,
        duration: d.lengthSeconds || null,
      });
    } catch {}
  }

  res.json({ views: null, likes: null, date: null });
});

module.exports = app;