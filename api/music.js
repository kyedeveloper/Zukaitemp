const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const KEY = process.env.YT_API_KEY || '';
const YT = 'https://www.googleapis.com/youtube/v3';

function isoToSec(d) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || '');
  if (!m) return 0;
  return (+m[1]||0)*3600 + (+m[2]||0)*60 + (+m[3]||0);
}

function mapVideo(v) {
  const sn = v.snippet || {}, cd = v.contentDetails || {}, st = v.statistics || {};
  const tn = sn.thumbnails || {};
  const cover = (tn.maxres && tn.maxres.url) || (tn.high && tn.high.url) || (tn.medium && tn.medium.url) || '';
  return {
    id: v.id,
    title: sn.title || '',
    artist: { name: sn.channelTitle || 'YouTube' },
    duration: isoToSec(cd.duration),
    album: { cover_big: cover, cover_medium: cover, title: '' },
    preview: '',
    _views: +(st.viewCount || 0),
    _likes: +(st.likeCount || 0),
    _date: (sn.publishedAt || '').slice(0, 10),
  };
}

async function details(ids) {
  if (!ids.length) return [];
  try {
    const r = await axios.get(`${YT}/videos`, {
      params: { part: 'snippet,contentDetails,statistics', id: ids.join(','), key: KEY },
      timeout: 12000,
    });
    return r.data.items || [];
  } catch { return []; }
}

app.get('/', async (req, res) => {
  const kind = String(req.query.kind || '').trim();
  const q = String(req.query.q || '').trim().slice(0, 100);
  const id = String(req.query.id || '').trim();

  if (!KEY) return res.json({ data: [], error: 'YT_API_KEY missing' });

  try {
    // Chart Indonesia (default)
    if (kind === 'chart' || (!q && !kind && !id)) {
      const r = await axios.get(`${YT}/videos`, {
        params: { part: 'snippet,contentDetails,statistics', chart: 'mostPopular', regionCode: 'ID', videoCategoryId: '10', maxResults: 50, key: KEY },
        timeout: 12000,
      });
      return res.json({ data: (r.data.items || []).map(mapVideo) });
    }
    // Chart global (US)
    if (kind === 'chartGlobal') {
      const r = await axios.get(`${YT}/videos`, {
        params: { part: 'snippet,contentDetails,statistics', chart: 'mostPopular', regionCode: 'US', videoCategoryId: '10', maxResults: 50, key: KEY },
        timeout: 12000,
      });
      return res.json({ data: (r.data.items || []).map(mapVideo) });
    }
    // Artis populer (channel unik dari chart)
    if (kind === 'artists') {
      const r = await axios.get(`${YT}/videos`, {
        params: { part: 'snippet', chart: 'mostPopular', regionCode: 'ID', videoCategoryId: '10', maxResults: 50, key: KEY },
        timeout: 12000,
      });
      const seen = new Set(), out = [];
      (r.data.items || []).forEach(v => {
        const ch = v.snippet.channelTitle, cid = v.snippet.channelId;
        const tn = v.snippet.thumbnails || {};
        if (!ch || seen.has(cid)) return;
        seen.add(cid);
        out.push({ id: cid, name: ch, picture_big: (tn.high && tn.high.url) || '', nb_fan: 0 });
      });
      return res.json({ data: out });
    }
    // Search artis
    if (kind === 'sartist' && q) {
      const r = await axios.get(`${YT}/search`, {
        params: { part: 'snippet', q, type: 'channel', maxResults: 20, key: KEY },
        timeout: 12000,
      });
      return res.json({
        data: (r.data.items || []).map(i => {
          const tn = i.snippet.thumbnails || {};
          return { id: i.id.channelId, name: i.snippet.title, picture_big: (tn.high && tn.high.url) || '', nb_fan: 0 };
        }),
      });
    }
    // Top lagu dari channel
    if (kind === 'top' && id) {
      const r = await axios.get(`${YT}/search`, {
        params: { part: 'snippet', channelId: id, type: 'video', maxResults: 50, key: KEY },
        timeout: 12000,
      });
      const ids = (r.data.items || []).map(i => i.id.videoId).filter(Boolean);
      const det = await details(ids);
      return res.json({ data: det.map(mapVideo) });
    }
    // Search lagu
    if (q) {
      const r = await axios.get(`${YT}/search`, {
        params: { part: 'snippet', q, type: 'video', videoCategoryId: '10', maxResults: 30, key: KEY },
        timeout: 12000,
      });
      const ids = (r.data.items || []).map(i => i.id.videoId).filter(Boolean);
      const det = await details(ids);
      return res.json({ data: det.map(mapVideo) });
    }
    res.json({ data: [] });
  } catch (e) {
    res.status(200).json({ data: [], error: String(e.message).slice(0, 200) });
  }
});

module.exports = app;