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
  const cover = (sn.thumbnails && (sn.thumbnails.high || sn.thumbnails.medium || sn.thumbnails.default) || {}).url || '';
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

async function detailsByIds(ids) {
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
  const kind = String(req.query.kind || '');
  const q = String(req.query.q || '').trim().slice(0, 100);

  if (!KEY) return res.json({ data: [], error: 'YT_API_KEY belum diset di Vercel' });

  try {
    // Chart Indonesia
    if (kind === 'chart' || (!q && !kind)) {
      const r = await axios.get(`${YT}/videos`, {
        params: { part: 'snippet,contentDetails,statistics', chart: 'mostPopular', regionCode: 'ID', videoCategoryId: '10', maxResults: 50, key: KEY },
        timeout: 12000,
      });
      return res.json({ data: (r.data.items || []).map(mapVideo) });
    }

    // Top video dari channel
    if (kind === 'top' && req.query.id) {
      const r = await axios.get(`${YT}/search`, {
        params: { part: 'snippet', channelId: req.query.id, type: 'video', maxResults: 50, key: KEY },
        timeout: 12000,
      });
      const ids = (r.data.items || []).map(i => i.id.videoId).filter(Boolean);
      const details = await detailsByIds(ids);
      return res.json({ data: details.map(mapVideo) });
    }

    // Search artis (channel)
    if (kind === 'sartist' && q) {
      const r = await axios.get(`${YT}/search`, {
        params: { part: 'snippet', q, type: 'channel', maxResults: 20, key: KEY },
        timeout: 12000,
      });
      return res.json({
        data: (r.data.items || []).map(i => ({
          id: i.id.channelId,
          name: i.snippet.title,
          picture_big: ((i.snippet.thumbnails || {}).high || (i.snippet.thumbnails || {}).default || {}).url || '',
          nb_fan: 0,
        })),
      });
    }

    // Chart artis (dari chart lagu, ambil channel unik)
    if (kind === 'artists') {
      const r = await axios.get(`${YT}/videos`, {
        params: { part: 'snippet', chart: 'mostPopular', regionCode: 'ID', videoCategoryId: '10', maxResults: 30, key: KEY },
        timeout: 12000,
      });
      const seen = new Set();
      const arts = [];
      (r.data.items || []).forEach(v => {
        const ch = v.snippet.channelTitle;
        if (!ch || seen.has(ch)) return;
        seen.add(ch);
        arts.push({
          id: v.snippet.channelId,
          name: ch,
          picture_big: ((v.snippet.thumbnails || {}).high || {}).url || '',
          nb_fan: 0,
        });
      });
      return res.json({ data: arts });
    }

    // Search lagu
    if (q) {
      const r = await axios.get(`${YT}/search`, {
        params: { part: 'snippet', q, type: 'video', videoCategoryId: '10', maxResults: 30, key: KEY },
        timeout: 12000,
      });
      const ids = (r.data.items || []).map(i => i.id.videoId).filter(Boolean);
      const details = await detailsByIds(ids);
      return res.json({ data: details.map(mapVideo) });
    }

    res.json({ data: [] });
  } catch (e) {
    res.status(200).json({ data: [], error: String(e.message).slice(0, 200) });
  }
});

module.exports = app;