const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const http = (base) => axios.create({
  timeout: 15000,
  headers: {
    'user-agent': UA,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

/* ===== PROVIDER 1: ANOBOY ===== */
const ANOBOY = 'https://anoboy.be';
const anoboyHttp = http(ANOBOY);

async function anoboySearch(q) {
  for (const type of ['anime', 'posts']) {
    try {
      const r = await anoboyHttp.get(`${ANOBOY}/wp-json/wp/v2/${type}`, {
        params: { search: q, per_page: 12, _fields: 'id,title,slug,link' },
        headers: { accept: 'application/json' },
      });
      if (Array.isArray(r.data) && r.data.length) {
        return r.data.map(x => ({
          id: x.id, slug: x.slug,
          title: (x.title && (x.title.rendered || x.title)) || '',
          url: x.link,
        }));
      }
    } catch {}
  }
  return [];
}

async function anoboyEpisodes(slug) {
  const r = await anoboyHttp.get(`${ANOBOY}/anime/${slug}/`);
  const $ = cheerio.load(r.data);
  const eps = [], seen = new Set();
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!href || (!/episode|ep[-_\s]?\d/i.test(href) && !/episode|ep[-_\s]?\d/i.test(text))) return;
    const full = href.startsWith('http') ? href : (href.startsWith('/') ? ANOBOY + href : `${ANOBOY}/${href}`);
    if (!full.includes('anoboy') || seen.has(full)) return;
    seen.add(full);
    const m = /(?:episode|ep|eps)\s*[-_.]?\s*(\d+)/i.exec(text) || /(\d+)/.exec(text);
    eps.push({ title: text || 'Episode', url: full, num: m ? +m[1] : null });
  });
  if (eps.length > 1 && eps.filter(e => e.num != null).length >= eps.length * 0.5) {
    eps.sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  }
  return eps;
}

async function anoboyWatch(url) {
  const r = await anoboyHttp.get(url);
  const $ = cheerio.load(r.data);
  let embed = $('#pembed iframe').attr('src');
  if (!embed) {
    $('iframe').each((_, el) => {
      const s = $(el).attr('src') || '';
      if (/blogger\.com\/video\.g/i.test(s)) { embed = s; return false; }
    });
  }
  if (!embed) {
    $('iframe').each((_, el) => {
      const s = $(el).attr('src') || '';
      if (/(embed|player|video)/i.test(s) && !/google|facebook|twitter|disqus/i.test(s)) { embed = s; return false; }
    });
  }
  if (!embed) throw new Error('Embed tidak ditemukan');
  if (embed.startsWith('//')) embed = 'https:' + embed;
  return { embed, isBlogger: /blogger\.com\/video\.g/i.test(embed) };
}

/* ===== PROVIDER 2: ANIMEAPI ===== */
const ANIMEAPI = 'https://api-anime-rouge.vercel.app';
const animeApiHttp = axios.create({
  timeout: 15000,
  headers: { 'user-agent': UA, 'accept': 'application/json' },
});

async function animeApiSearch(q) {
  const r = await animeApiHttp.get(`${ANIMEAPI}/aniwatch/search`, {
    params: { keyword: q, page: 1 },
  });
  return (r.data.animes || []).map(a => ({
    id: a.id, slug: a.id, title: a.name, url: '',
    img: a.poster, type: a.type, episodes: a.episodes,
  }));
}

async function animeApiEpisodes(slug) {
  const r = await animeApiHttp.get(`${ANIMEAPI}/aniwatch/episodes/${slug}`);
  return (r.data.episodes || []).map(e => ({
    title: 'Episode ' + e.number,
    url: e.episodeId,
    num: e.number,
  }));
}

async function animeApiWatch(id) {
  const servers = ['vidstreaming', 'gogocdn', 'streamsb'];
  let lastErr;
  for (const server of servers) {
    try {
      const r = await animeApiHttp.get(`${ANIMEAPI}/aniwatch/episode-srcs`, {
        params: { id, category: 'sub', server },
      });
      const src = (r.data.sources || [])[0]?.url;
      if (src) return { embed: src, isBlogger: false };
    } catch (e) { lastErr = e; }
  }
  throw new Error('Semua server AnimeAPI gagal' + (lastErr ? ': ' + lastErr.message : ''));
}

/* ===== PROVIDER 3: OTAKUDESU ===== */
const OTAKU = 'https://otakudesu.bid';
const otakuHttp = http(OTAKU);

async function otakuSearch(q) {
  const r = await otakuHttp.get(`${OTAKU}/?s=${encodeURIComponent(q)}&post_type=anime`);
  const $ = cheerio.load(r.data);
  const out = [];
  $('.chivsrc li').each((_, el) => {
    const a = $(el).find('h2 a');
    const href = a.attr('href') || '';
    const title = a.text().trim();
    if (!href || !title) return;
    const slug = href.replace(/\/$/, '').split('/').pop();
    out.push({ id: slug, slug, title, url: href });
  });
  return out;
}

async function otakuEpisodes(slug) {
  const r = await otakuHttp.get(`${OTAKU}/anime/${slug}/`);
  const $ = cheerio.load(r.data);
  const eps = [];
  $('.episodelist ul li a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    const m = /episode\s*(\d+)/i.exec(text) || /(\d+)/.exec(text);
    eps.push({ title: text, url: href, num: m ? +m[1] : null });
  });
  if (eps.length > 1 && eps.filter(e => e.num != null).length >= eps.length * 0.5) {
    eps.sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  }
  return eps;
}

async function otakuWatch(url) {
  const r = await otakuHttp.get(url);
  const $ = cheerio.load(r.data);
  let embed = null;
  $('iframe').each((_, el) => {
    const s = $(el).attr('src') || '';
    if (/blogger\.com\/video\.g|desustream|embed/i.test(s) && !/google|facebook|twitter|disqus/i.test(s)) {
      embed = s; return false;
    }
  });
  if (!embed) throw new Error('Embed tidak ditemukan');
  if (embed.startsWith('//')) embed = 'https:' + embed;
  return { embed, isBlogger: /blogger\.com\/video\.g/i.test(embed) };
}

/* ===== PROVIDER 4: SAMEHADAKU ===== */
const SAME = 'https://samehadaku.site';
const sameHttp = http(SAME);

async function sameSearch(q) {
  const r = await sameHttp.get(`${SAME}/?s=${encodeURIComponent(q)}`);
  const $ = cheerio.load(r.data);
  const out = [];
  $('.animpost .animepost, .bs .bsx a').each((_, el) => {
    const a = $(el).is('a') ? $(el) : $(el).find('a').first();
    const href = a.attr('href') || '';
    const title = a.find('.tt, .title').text().trim() || a.attr('title') || '';
    if (!href || !title) return;
    const slug = href.replace(/\/$/, '').split('/').pop();
    out.push({ id: slug, slug, title, url: href });
  });
  return out;
}

async function sameEpisodes(slug) {
  const r = await sameHttp.get(`${SAME}/anime/${slug}/`);
  const $ = cheerio.load(r.data);
  const eps = [];
  $('#episodelist ul li a, .lstepsiode ul li a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    const m = /episode\s*(\d+)/i.exec(text) || /(\d+)/.exec(text);
    eps.push({ title: text, url: href, num: m ? +m[1] : null });
  });
  if (eps.length > 1 && eps.filter(e => e.num != null).length >= eps.length * 0.5) {
    eps.sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  }
  return eps;
}

async function sameWatch(url) {
  const r = await sameHttp.get(url);
  const $ = cheerio.load(r.data);
  let embed = null;
  $('.player-embed iframe, iframe').each((_, el) => {
    const s = $(el).attr('src') || '';
    if (/blogger|embed|player/i.test(s) && !/google|facebook|twitter|disqus/i.test(s)) {
      embed = s; return false;
    }
  });
  if (!embed) throw new Error('Embed tidak ditemukan');
  if (embed.startsWith('//')) embed = 'https:' + embed;
  return { embed, isBlogger: /blogger\.com\/video\.g/i.test(embed) };
}

/* ===== REGISTRY ===== */
const PROVIDERS = [
  { name: 'Anoboy',     search: anoboySearch,   episodes: anoboyEpisodes,   watch: anoboyWatch },
  { name: 'AnimeAPI',   search: animeApiSearch, episodes: animeApiEpisodes, watch: animeApiWatch },
  { name: 'Otakudesu',  search: otakuSearch,    episodes: otakuEpisodes,    watch: otakuWatch  },
  { name: 'Samehadaku', search: sameSearch,     episodes: sameEpisodes,     watch: sameWatch   },
];

async function tryAll(method, ...args) {
  const errors = [];
  for (const p of PROVIDERS) {
    try {
      const result = await p[method](...args);
      if (result && (Array.isArray(result) ? result.length : true)) {
        return { provider: p.name, data: result };
      }
      errors.push(`${p.name}: kosong`);
    } catch (e) {
      errors.push(`${p.name}: ${e.message}`);
    }
  }
  throw new Error('Semua sumber gagal — ' + errors.join(' | '));
}

/* ===== ROUTER — semua via ?a= ===== */
app.get('/', async (req, res) => {
  const a = String(req.query.a || 'health');

  if (a === 'search') {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.status(400).json({ ok: false, error: 'q kosong' });
    try {
      const r = await cached('s:' + q, 5 * 60e3, () => tryAll('search', q));
      return res.json({ ok: true, provider: r.provider, data: r.data });
    } catch (e) {
      return res.status(502).json({ ok: false, error: String(e.message).slice(0, 400) });
    }
  }

  if (a === 'episodes') {
    const slug = String(req.query.slug || '').trim().slice(0, 200);
    const provider = String(req.query.provider || '').trim();
    if (!slug) return res.status(400).json({ ok: false, error: 'slug kosong' });
    try {
      const r = await cached('e:' + provider + ':' + slug, 10 * 60e3, async () => {
        if (provider) {
          const p = PROVIDERS.find(x => x.name === provider);
          if (p) return { provider: p.name, data: await p.episodes(slug) };
        }
        return tryAll('episodes', slug);
      });
      return res.json({ ok: true, provider: r.provider, data: r.data });
    } catch (e) {
      return res.status(502).json({ ok: false, error: String(e.message).slice(0, 400) });
    }
  }

  if (a === 'watch') {
    const url = String(req.query.url || '').trim();
    const provider = String(req.query.provider || '').trim();
    if (!url) return res.status(400).json({ ok: false, error: 'url kosong' });
    try {
      const r = await cached('w:' + provider + ':' + url, 15 * 60e3, async () => {
        if (provider) {
          const p = PROVIDERS.find(x => x.name === provider);
          if (p) return { provider: p.name, data: await p.watch(url) };
        }
        return tryAll('watch', url);
      });
      return res.json({ ok: true, provider: r.provider, data: r.data });
    } catch (e) {
      return res.status(502).json({ ok: false, error: String(e.message).slice(0, 400) });
    }
  }

  return res.json({ ok: true, service: 'Zukai Anime API', providers: PROVIDERS.map(p => p.name) });
});

module.exports = app;