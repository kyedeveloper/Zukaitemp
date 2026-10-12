const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const KEY = process.env.YT_API_KEY || '';
const YT = 'https://www.googleapis.com/youtube/v3';

app.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q || !KEY) return res.json({ ids: [] });
  try {
    const r = await axios.get(`${YT}/search`, {
      params: { part: 'snippet', q, type: 'video', videoCategoryId: '10', maxResults: 3, key: KEY },
      timeout: 12000,
    });
    const ids = (r.data.items || []).map(i => i.id.videoId).filter(Boolean);
    res.setHeader('cache-control', 'public, s-maxage=3600');
    res.json({ ids });
  } catch (e) {
    res.status(200).json({ ids: [] });
  }
});

module.exports = app;