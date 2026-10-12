const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const KEY = process.env.YT_API_KEY || '';
const YT = 'https://www.googleapis.com/youtube/v3';

/* ============ UTIL ============ */
const isoToSec = d => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || '');
  if (!m) return 0;
  return (+m[1]||0)*3600 + (+m[2]||0)*60 + (+m[3]||0);
};
const mapVideo = v => {
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
};
const http = base => axios.create({
  timeout: 15000,
  headers: {
    'user-agent': UA,
    'accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'accept-language': 'id-ID,id;q=0.9,en;q=0.8',
    'referer': base + '/',
  },
});
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

/* ============ MUSIC / YT / INFO ============ */
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

async function musicHandler(req, res) {
  const kind = String(req.query.kind || '').trim();
  const q = String(req.query.q || '').trim().slice(0, 100);
  const id = String(req.query.id || '').trim();
  if (!KEY) return res.json({ data: [], error: 'YT_API_KEY missing' });
  try {
    if (kind === 'chart' || (!q && !kind && !id)) {
      const r = await axios.get(`${YT}/videos`, {
        params: { part: 'snippet,contentDetails,statistics', chart: 'mostPopular', regionCode: 'ID', videoCategoryId: '10', maxResults: 50, key: KEY },
        timeout: 12000,
      });
      return res.json({ data: (r.data.items || []).map(mapVideo) });
    }
    if (kind === 'chartGlobal') {
      const r = await axios.get(`${YT}/videos`, {
        params: { part: 'snippet,contentDetails,statistics', chart: 'mostPopular', regionCode: 'US', videoCategoryId: '10', maxResults: 50, key: KEY },
        timeout: 12000,
      });
      return res.json({ data: (r.data.items || []).map(mapVideo) });
    }
    if (kind === 'artists') {
      const r = await axios.get(`${YT}/videos`, {
        params: { part: 'snippet', chart: 'mostPopular', regionCode: 'ID', videoCategoryId: '10', maxResults: 50, key: KEY },
        timeout: 12000,
      });
      const seen = new Set(), out = [];
      (r.data.items || []).forEach(v => {
        const ch = v.snippet.channelTitle, cid = v.snippet.channelId, tn = v.snippet.thumbnails || {};
        if (!ch || seen.has(cid)) return;
        seen.add(cid);
        out.push({ id: cid, name: ch, picture_big: (tn.high && tn.high.url) || '', nb_fan: 0 });
      });
      return res.json({ data: out });
    }
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
    if (kind === 'top' && id) {
      const r = await axios.get(`${YT}/search`, {
        params: { part: 'snippet', channelId: id, type: 'video', maxResults: 50, key: KEY },
        timeout: 12000,
      });
      const ids = (r.data.items || []).map(i => i.id.videoId).filter(Boolean);
      const det = await details(ids);
      return res.json({ data: det.map(mapVideo) });
    }
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
}

async function ytHandler(req, res) {
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
  } catch { res.status(200).json({ ids: [] }); }
}

async function infoHandler(req, res) {
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
    res.json({ views: +(st.viewCount || 0), likes: +(st.likeCount || 0), date: (sn.publishedAt || '').slice(0, 10) });
  } catch { res.json({ views: null, likes: null, date: null }); }
}

/* ============ AUDIO STREAM ============ */
const PIPED = ['https://pipedapi.kavin.rocks','https://pipedapi.adminforge.de','https://api.piped.yt','https://pipedapi.reallyaweso.me','https://pipedapi.leptons.xyz'];
const INVIDIOUS = ['https://inv.tux.pizza','https://invidious.nerdvpn.de','https://iv.melmac.space','https://invidious.privacyredirect.com'];

async function audioHandler(req, res) {
  const id = String(req.query.id || '').trim();
  if (!/^[\w-]{11}$/.test(id)) return res.status(400).json({ error: 'bad id' });
  for (const base of PIPED) {
    try {
      const r = await axios.get(`${base}/streams/${id}`, { timeout: 8000, headers: { 'user-agent': UA } });
      const streams = (r.data?.audioStreams || []).filter(s => s.mimeType && s.mimeType.includes('audio')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const pick = streams.find(s => s.mimeType.includes('mp4')) || streams[0];
      if (pick?.url) {
        res.setHeader('cache-control', 'public, s-maxage=1200');
        return res.redirect(302, pick.url);
      }
    } catch {}
  }
  for (const base of INVIDIOUS) {
    try {
      const r = await axios.get(`${base}/api/v1/videos/${id}`, { timeout: 8000, headers: { 'user-agent': UA } });
      const streams = (r.data?.adaptiveFormats || []).filter(s => s.type && s.type.includes('audio')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
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
}

/* ============ ANIME (dari anime.js lama) ============ */
const ANOBOY = 'https://anoboy.be';
const anoboyHttp = http(ANOBOY);
const ANIMEAPI = 'https://api-anime-rouge.vercel.app';
const animeApiHttp = axios.create({ timeout: 15000, headers: { 'user-agent': UA, 'accept': 'application/json' } });
const OTAKU = 'https://otakudesu.bid';
const otakuHttp = http(OTAKU);
const SAME = 'https://samehadaku.site';
const sameHttp = http(SAME);

async function anoboySearch(q) {
  for (const type of ['anime', 'posts']) {
    try {
      const r = await anoboyHttp.get(`${ANOBOY}/wp-json/wp/v2/${type}`, {
        params: { search: q, per_page: 12, _fields: 'id,title,slug,link' },
        headers: { accept: 'application/json' },
      });
      if (Array.isArray(r.data) && r.data.length) return r.data.map(x => ({ id: x.id, slug: x.slug, title: (x.title && (x.title.rendered || x.title)) || '', url: x.link }));
    } catch {}
  }
  return [];
}
async function anoboyEpisodes(slug) {
  const r = await anoboyHttp.get(`${ANOBOY}/anime/${slug}/`);
  const $ = cheerio.load(r.data);
  const eps = [], seen = new Set();
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '', text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!href || (!/episode|ep[-_\s]?\d/i.test(href) && !/episode|ep[-_\s]?\d/i.test(text))) return;
    const full = href.startsWith('http') ? href : (href.startsWith('/') ? ANOBOY + href : `${ANOBOY}/${href}`);
    if (!full.includes('anoboy') || seen.has(full)) return;
    seen.add(full);
    const m = /(?:episode|ep|eps)\s*[-_.]?\s*(\d+)/i.exec(text) || /(\d+)/.exec(text);
    eps.push({ title: text || 'Episode', url: full, num: m ? +m[1] : null });
  });
  if (eps.length > 1 && eps.filter(e => e.num != null).length >= eps.length * 0.5) eps.sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  return eps;
}
async function anoboyWatch(url) {
  const r = await anoboyHttp.get(url);
  const $ = cheerio.load(r.data);
  let embed = $('#pembed iframe').attr('src');
  if (!embed) $('iframe').each((_, el) => { const s = $(el).attr('src') || ''; if (/blogger\.com\/video\.g/i.test(s)) { embed = s; return false; } });
  if (!embed) $('iframe').each((_, el) => { const s = $(el).attr('src') || ''; if (/(embed|player|video)/i.test(s) && !/google|facebook|twitter|disqus/i.test(s)) { embed = s; return false; } });
  if (!embed) throw new Error('Embed tidak ditemukan');
  if (embed.startsWith('//')) embed = 'https:' + embed;
  return { embed, isBlogger: /blogger\.com\/video\.g/i.test(embed) };
}
async function animeApiSearch(q) {
  const r = await animeApiHttp.get(`${ANIMEAPI}/aniwatch/search`, { params: { keyword: q, page: 1 } });
  return (r.data.animes || []).map(a => ({ id: a.id, slug: a.id, title: a.name, url: '' }));
}
async function animeApiEpisodes(slug) {
  const r = await animeApiHttp.get(`${ANIMEAPI}/aniwatch/episodes/${slug}`);
  return (r.data.episodes || []).map(e => ({ title: 'Episode ' + e.number, url: e.episodeId, num: e.number }));
}
async function animeApiWatch(id) {
  for (const server of ['vidstreaming', 'gogocdn', 'streamsb']) {
    try {
      const r = await animeApiHttp.get(`${ANIMEAPI}/aniwatch/episode-srcs`, { params: { id, category: 'sub', server } });
      const src = (r.data.sources || [])[0]?.url;
      if (src) return { embed: src, isBlogger: false };
    } catch {}
  }
  throw new Error('AnimeAPI gagal');
}
async function otakuSearch(q) {
  const r = await otakuHttp.get(`${OTAKU}/?s=${encodeURIComponent(q)}&post_type=anime`);
  const $ = cheerio.load(r.data);
  const out = [];
  $('.chivsrc li').each((_, el) => {
    const a = $(el).find('h2 a'), href = a.attr('href') || '', title = a.text().trim();
    if (!href || !title) return;
    out.push({ id: href.replace(/\/$/, '').split('/').pop(), slug: href.replace(/\/$/, '').split('/').pop(), title, url: href });
  });
  return out;
}
async function otakuEpisodes(slug) {
  const r = await otakuHttp.get(`${OTAKU}/anime/${slug}/`);
  const $ = cheerio.load(r.data);
  const eps = [];
  $('.episodelist ul li a').each((_, el) => {
    const href = $(el).attr('href') || '', text = $(el).text().trim();
    const m = /episode\s*(\d+)/i.exec(text) || /(\d+)/.exec(text);
    eps.push({ title: text, url: href, num: m ? +m[1] : null });
  });
  if (eps.length > 1 && eps.filter(e => e.num != null).length >= eps.length * 0.5) eps.sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  return eps;
}
async function otakuWatch(url) {
  const r = await otakuHttp.get(url);
  const $ = cheerio.load(r.data);
  let embed = null;
  $('iframe').each((_, el) => { const s = $(el).attr('src') || ''; if (/blogger\.com\/video\.g|desustream|embed/i.test(s) && !/google|facebook|twitter|disqus/i.test(s)) { embed = s; return false; } });
  if (!embed) throw new Error('Embed tidak ditemukan');
  if (embed.startsWith('//')) embed = 'https:' + embed;
  return { embed, isBlogger: /blogger\.com\/video\.g/i.test(embed) };
}
async function sameSearch(q) {
  const r = await sameHttp.get(`${SAME}/?s=${encodeURIComponent(q)}`);
  const $ = cheerio.load(r.data);
  const out = [];
  $('.animpost .animepost, .bs .bsx a').each((_, el) => {
    const a = $(el).is('a') ? $(el) : $(el).find('a').first(), href = a.attr('href') || '', title = a.find('.tt, .title').text().trim() || a.attr('title') || '';
    if (!href || !title) return;
    out.push({ id: href.replace(/\/$/, '').split('/').pop(), slug: href.replace(/\/$/, '').split('/').pop(), title, url: href });
  });
  return out;
}
async function sameEpisodes(slug) {
  const r = await sameHttp.get(`${SAME}/anime/${slug}/`);
  const $ = cheerio.load(r.data);
  const eps = [];
  $('#episodelist ul li a, .lstepsiode ul li a').each((_, el) => {
    const href = $(el).attr('href') || '', text = $(el).text().trim();
    const m = /episode\s*(\d+)/i.exec(text) || /(\d+)/.exec(text);
    eps.push({ title: text, url: href, num: m ? +m[1] : null });
  });
  if (eps.length > 1 && eps.filter(e => e.num != null).length >= eps.length * 0.5) eps.sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  return eps;
}
async function sameWatch(url) {
  const r = await sameHttp.get(url);
  const $ = cheerio.load(r.data);
  let embed = null;
  $('.player-embed iframe, iframe').each((_, el) => { const s = $(el).attr('src') || ''; if (/blogger|embed|player/i.test(s) && !/google|facebook|twitter|disqus/i.test(s)) { embed = s; return false; } });
  if (!embed) throw new Error('Embed tidak ditemukan');
  if (embed.startsWith('//')) embed = 'https:' + embed;
  return { embed, isBlogger: /blogger\.com\/video\.g/i.test(embed) };
}
const PROVIDERS = [
  { name: 'Anoboy', search: anoboySearch, episodes: anoboyEpisodes, watch: anoboyWatch },
  { name: 'AnimeAPI', search: animeApiSearch, episodes: animeApiEpisodes, watch: animeApiWatch },
  { name: 'Otakudesu', search: otakuSearch, episodes: otakuEpisodes, watch: otakuWatch },
  { name: 'Samehadaku', search: sameSearch, episodes: sameEpisodes, watch: sameWatch },
];
async function tryAll(method, ...args) {
  const errors = [];
  for (const p of PROVIDERS) {
    try {
      const result = await p[method](...args);
      if (result && (Array.isArray(result) ? result.length : true)) return { provider: p.name, data: result };
      errors.push(`${p.name}: kosong`);
    } catch (e) { errors.push(`${p.name}: ${e.message}`); }
  }
  throw new Error('Semua sumber gagal — ' + errors.join(' | '));
}
async function animeHandler(req, res) {
  const a = String(req.query.a || 'health');
  if (a === 'search') {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.status(400).json({ ok: false, error: 'q kosong' });
    try { const r = await cached('s:' + q, 5 * 60e3, () => tryAll('search', q)); return res.json({ ok: true, provider: r.provider, data: r.data }); }
    catch (e) { return res.status(502).json({ ok: false, error: String(e.message).slice(0, 400) }); }
  }
  if (a === 'episodes') {
    const slug = String(req.query.slug || '').trim().slice(0, 200);
    const provider = String(req.query.provider || '').trim();
    if (!slug) return res.status(400).json({ ok: false, error: 'slug kosong' });
    try {
      const r = await cached('e:' + provider + ':' + slug, 10 * 60e3, async () => {
        if (provider) { const p = PROVIDERS.find(x => x.name === provider); if (p) return { provider: p.name, data: await p.episodes(slug) }; }
        return tryAll('episodes', slug);
      });
      return res.json({ ok: true, provider: r.provider, data: r.data });
    } catch (e) { return res.status(502).json({ ok: false, error: String(e.message).slice(0, 400) }); }
  }
  if (a === 'watch') {
    const url = String(req.query.url || '').trim();
    const provider = String(req.query.provider || '').trim();
    if (!url) return res.status(400).json({ ok: false, error: 'url kosong' });
    try {
      const r = await cached('w:' + provider + ':' + url, 15 * 60e3, async () => {
        if (provider) { const p = PROVIDERS.find(x => x.name === provider); if (p) return { provider: p.name, data: await p.watch(url) }; }
        return tryAll('watch', url);
      });
      return res.json({ ok: true, provider: r.provider, data: r.data });
    } catch (e) { return res.status(502).json({ ok: false, error: String(e.message).slice(0, 400) }); }
  }
  return res.json({ ok: true, service: 'Zukai Media API', providers: PROVIDERS.map(p => p.name) });
}

/* ============ ROUTER UTAMA ============ */
app.get('/', async (req, res) => {
  const route = String(req.query.r || '').trim();
  if (route === 'music') return musicHandler(req, res);
  if (route === 'yt') return ytHandler(req, res);
  if (route === 'info') return infoHandler(req, res);
  if (route === 'audio') return audioHandler(req, res);
  if (route === 'anime') return animeHandler(req, res);
  res.json({ ok: true, service: 'Zukai Media API', routes: ['music', 'yt', 'info', 'audio', 'anime'] });
});

module.exports = app;
