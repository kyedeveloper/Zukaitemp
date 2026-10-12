const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const KEY = process.env.YT_API_KEY || '';
const YT = 'https://www.googleapis.com/youtube/v3';

app.get('/', async (req, res) => {
  const id = String(req.query.id || '').trim();
  if (!/^[\w-]{11}$/.test(id) || !KEY) return res.json({ views: null, likes: null, date: null });
  try {
    const r = await axios.get(`${YT}/videos`, {
      params: { part: 'statistics,snippet', id, key: KEY },
      timeout: 10000,
    });
    const v = (r.data.items || [])[0];
    if (!v) return res.json({ views: null, likes: null, date: null });
    const st = v.statistics || {}, sn = v.snippet || {};
    res.setHeader('cache-control', 'public, s-maxage=1800');
    res.json({
      views: +(st.viewCount || 0),
      likes: +(st.likeCount || 0),
      date: (sn.publishedAt || '').slice(0, 10),
      title: sn.title,
    });
  } catch {
    res.json({ views: null, likes: null, date: null });
  }
});

module.exports = app;