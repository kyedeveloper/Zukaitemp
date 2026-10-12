const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const http = axios.create({
  timeout: 12000,
  headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
});

app.get('/', async (req, res) => {
  const kind = String(req.query.kind || '');
  const q = String(req.query.q || '').trim().slice(0, 100);
  const id = String(req.query.id || '').trim();

  let url;
  if (kind === 'sartist') url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=20`;
  else if (kind === 'artists') url = `https://api.deezer.com/chart/0/artists?limit=50`;
  else if (kind === 'chart') url = `https://api.deezer.com/chart/0/tracks?limit=50`;
  else if (kind === 'top') url = `https://api.deezer.com/artist/${encodeURIComponent(id)}/top?limit=50`;
  else if (q) url = `https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=40`;
  else return res.json({ data: [] });

  try {
    const r = await http.get(url);
    res.setHeader('cache-control', 'public, s-maxage=300');
    res.json(r.data);
  } catch (e) {
    res.status(502).json({ data: [], error: String(e.message).slice(0, 200) });
  }
});

module.exports = app;