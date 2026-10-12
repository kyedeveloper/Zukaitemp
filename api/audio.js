const express = require('express');
const cors = require('cors');
const axios = require('axios');

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
  if (!/^[\w-]{11}$/.test(id)) return res.status(400).json({ error: 'bad id' });

  for (const base of PIPED) {
    try {
      const r = await axios.get(`${base}/streams/${id}`, {
        timeout: 8000, headers: { 'user-agent': UA },
      });
      const streams = (r.data?.audioStreams || [])
        .filter(s => s.mimeType && s.mimeType.includes('audio'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const pick = streams.find(s => s.mimeType.includes('mp4')) || streams[0];
      if (pick?.url) {
        res.setHeader('cache-control', 'public, s-maxage=1200');
        return res.redirect(302, pick.url);
      }
    } catch {}
  }

  for (const base of INVIDIOUS) {
    try {
      const r = await axios.get(`${base}/api/v1/videos/${id}`, {
        timeout: 8000, headers: { 'user-agent': UA },
      });
      const streams = (r.data?.adaptiveFormats || [])
        .filter(s => s.type && s.type.includes('audio'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const pick = streams.find(s => s.type.includes('mp4')) || streams[0];
      if (pick?.url) {
        res.setHeader('cache-control', 'public, s-maxage=1200');
        return res.redirect(302, pick.url);
      }
    } catch {}
  }

  try {
    const ytdl = require('@distube/ytdl-core');
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
    if (format?.url) {
      res.setHeader('cache-control', 'public, s-maxage=1200');
      return res.redirect(302, format.url);
    }
  } catch {}

  res.status(502).json({ error: 'no audio stream' });
});

module.exports = app;