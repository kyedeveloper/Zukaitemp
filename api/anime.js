// api/anime.js
const { json, preflight, fetchT, cached, clamp, firstOf } = require('./_lib');
const cheerio = require('cheerio');

// kandidat domain, dicoba berurutan karena situs ini sering pindah
const SITES = {
  samehadaku: ['https://samehadaku.email', 'https://samehadaku.site', 'https://samehadaku.care', 'https://v2.samehadaku.how'],
  otakudesu: ['https://otakudesu.cloud', 'https://otakudesu.bid', 'https://otakudesu.lol', 'https://otakudesu.vip'],
  anoboy: ['https://anoboy.be', 'https://anoboy.bid', 'https://anoboy.cyou'],
};

const H = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'id-ID,id;q=0.9,en;q=0.8',
};

async function html(url) {
  const r = await fetchT(url, { headers: H }, 9000);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

async function firstSite(list, build) {
  return firstOf(list.map(base => ({ name: base, fn: () => build(base) })), 'situs');
}

const epsFrom = ($) => {
  const out = [], seen = new Set();
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!href || !text) return;
    if (!/episode|ep\s*\d|eps\s*\d|batch/i.test(href + ' ' + text)) return;
    if (seen.has(href)) return;
    seen.add(href);
    const m = /(?:episode|ep|eps)\s*[-_.]?\s*(\d+)/i.exec(text) || /(\d+)/.exec(text);
    out.push({ title: text, url: href, num: m ? +m[1] : null });
  });
  out.sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  return out;
};

async function searchSamehadaku(q) {
  const { data, via } = await firstSite(SITES.samehadaku, async base => {
    const $ = cheerio.load(await html(`${base}/?s=${encodeURIComponent(q)}`));
    const out = [];
    $('.bs .bsx a, .animpost .animepost a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const title = $(el).find('.tt, .title').text().trim() || $(el).attr('title') || '';
      if (href && title) out.push({ title, url: href, slug: href.replace(/\/$/, '').split('/').pop(), provider: 'samehadaku' });
    });
    return out;
  });
  return data.map(x => ({ ...x, provider: 'samehadaku', base: via }));
}

async function searchOtakudesu(q) {
  const { data } = await firstSite(SITES.otakudesu, async base => {
    const $ = cheerio.load(await html(`${base}/?s=${encodeURIComponent(q)}&post_type=anime`));
    const out = [];
    $('.chivsrc li h2 a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const title = $(el).text().trim();
      if (href && title) out.push({ title, url: href, slug: href.replace(/\/$/, '').split('/').pop(), provider: 'otakudesu' });
    });
    return out;
  });
  return data;
}

async function searchAnoboy(q) {
  const { via, data } = await firstSite(SITES.anoboy, async base => {
    const r = await fetchT(`${base}/wp-json/wp/v2/posts?search=${encodeURIComponent(q)}&per_page=12`, { headers: { ...H, accept: 'application/json' } }, 8000);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const arr = await r.json();
    return arr.map(x => ({ title: x.title?.rendered || '', url: x.link, slug: x.slug, provider: 'anoboy' })).filter(x => x.url);
  });
  return data.map(x => ({ ...x, base: via }));
}

async function episodes(slug, provider, base) {
  const target = base || (SITES[provider] || [])[0];
  const url = provider === 'anoboy' ? `${target}/anime/${slug}/` : `${target}/anime/${slug}/`;
  const $ = cheerio.load(await html(url));
  return epsFrom($).map(e => ({ ...e, url: e.url.startsWith('http') ? e.url : target + e.url }));
}

async function watch(url) {
  const $ = cheerio.load(await html(url));
  const servers = [];
  $('iframe').each((_, el) => {
    let src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (!src) return;
    if (/google|facebook|twitter|disqus|doubleclick/i.test(src)) return;
    if (src.startsWith('//')) src = 'https:' + src;
    servers.push(src);
  });
  $('select option').each((_, el) => {
    const v = $(el).attr('value') || '';
    if (/^https?:\/\//.test(v) && !servers.includes(v)) servers.push(v);
  });
  if (!servers.length) throw new Error('server tidak ditemukan');
  return servers;
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  const a = String(req.query.a || 'health');

  if (a === 'health') {
    const out = {};
    for (const [name, list] of Object.entries(SITES)) {
      out[name] = [];
      for (const base of list) {
        try {
          const r = await fetchT(base, { headers: H }, 5000);
          out[name].push({ base, up: r.ok, code: r.status });
        } catch (e) { out[name].push({ base, up: false, code: 0 }); }
      }
    }
    return json(res, 200, { ok: true, sites: out });
  }

  if (a === 'search') {
    const q = clamp(req.query.q, 80);
    if (!q) return json(res, 400, { ok: false, error: 'q kosong' });
    try {
      const r = await cached('as:' + q.toLowerCase(), 6 * 60e3, () =>
        firstOf([
          { name: 'samehadaku', fn: () => searchSamehadaku(q) },
          { name: 'otakudesu', fn: () => searchOtakudesu(q) },
          { name: 'anoboy', fn: () => searchAnoboy(q) },
        ], 'pencarian'));
      json(res, 200, { ok: true, via: r.via, data: r.data }, 300);
    } catch (e) { json(res, 502, { ok: false, error: String(e.message).slice(0, 300) }); }
  }

  if (a === 'episodes') {
    const slug = clamp(req.query.slug, 160);
    const provider = clamp(req.query.provider, 20);
    const base = clamp(req.query.base, 120);
    if (!slug) return json(res, 400, { ok: false, error: 'slug kosong' });
    try {
      const data = await cached(`ae:${provider}:${slug}`, 8 * 60e3, () => episodes(slug, provider, base));
      json(res, 200, { ok: true, data }, 300);
    } catch (e) { json(res, 502, { ok: false, error: String(e.message).slice(0, 300) }); }
  }

  if (a === 'watch') {
    const url = clamp(req.query.url, 300);
    if (!url) return json(res, 400, { ok: false, error: 'url kosong' });
    try {
      const data = await cached('aw:' + url, 12 * 60e3, () => watch(url));
      json(res, 200, { ok: true, data }, 300);
    } catch (e) { json(res, 502, { ok: false, error: String(e.message).slice(0, 300) }); }
  }

  json(res, 400, { ok: false, error: 'aksi tidak dikenal' });
};
