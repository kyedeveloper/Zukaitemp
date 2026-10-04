// Info video YouTube (jumlah ditonton dan suka) untuk lembar "Info musik".
// Urutan: 1) YouTube Data API (variabel YT_API_KEY di Vercel, paling stabil)
//         2) Piped / Invidious (instance publik, kadang mati atau menyembunyikan suka)
const UA = 'Mozilla/5.0 (compatible; ZukaiTemp)';
const getJ = async (u, ms = 4500) => {
  const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};
const n = v => { v = Number(v); return Number.isFinite(v) && v >= 0 ? v : null; };

async function official(id, key) {
  const j = await getJ('https://www.googleapis.com/youtube/v3/videos?' + new URLSearchParams({ part: 'statistics,snippet', id, key }));
  const x = (j.items || [])[0];
  if (!x) throw new Error('video tidak ada');
  const s = x.statistics || {}, sn = x.snippet || {};
  return { views: n(s.viewCount), likes: n(s.likeCount), date: sn.publishedAt || '', channel: sn.channelTitle || '' };
}

let pCache = { at: 0, list: ['https://pipedapi.kavin.rocks'] };
async function pipedList() {
  if (Date.now() - pCache.at < 30 * 60e3) return pCache.list;
  pCache.at = Date.now();
  try {
    const j = await getJ('https://piped-instances.kavin.rocks/', 2500);
    const l = (Array.isArray(j) ? j : []).map(x => x && x.api_url).filter(u => /^https:\/\//.test(u || ''));
    if (l.length) pCache.list = l;
  } catch {}
  return pCache.list;
}
async function piped(id) {
  const list = (await pipedList()).slice().sort(() => Math.random() - .5).slice(0, 4);
  return Promise.any(list.map(async b => {
    const j = await getJ(b.replace(/\/+$/, '') + '/streams/' + id);
    if (j.views == null && j.likes == null) throw new Error('kosong');
    return { views: n(j.views), likes: n(j.likes), date: j.uploadDate || '', channel: j.uploader || '' };
  }));
}

let iCache = { at: 0, list: [] };
async function invList() {
  if (Date.now() - iCache.at < 30 * 60e3) return iCache.list;
  iCache.at = Date.now();
  try {
    const j = await getJ('https://api.invidious.io/instances.json?sort_type=health', 2500);
    const l = (Array.isArray(j) ? j : []).filter(x => x && x[1] && x[1].api && x[1].type === 'https').map(x => 'https://' + x[0]).slice(0, 12);
    if (l.length) iCache.list = l;
  } catch {}
  return iCache.list;
}
async function invidious(id) {
  const list = (await invList()).slice().sort(() => Math.random() - .5).slice(0, 4);
  if (!list.length) throw new Error('tidak ada instance Invidious');
  return Promise.any(list.map(async b => {
    const j = await getJ(b + '/api/v1/videos/' + id + '?fields=viewCount,likeCount,published,author');
    if (j.viewCount == null && j.likeCount == null) throw new Error('kosong');
    return { views: n(j.viewCount), likes: n(j.likeCount), date: j.published ? new Date(j.published * 1000).toISOString() : '', channel: j.author || '' };
  }));
}

module.exports = async (req, res) => {
  const id = String(req.query.id || '');
  if (!/^[\w-]{11}$/.test(id)) return res.status(400).json({ error: 'id tidak valid' });
  const key = process.env.YT_API_KEY;
  const tries = [];
  if (key) tries.push(() => official(id, key));
  tries.push(() => Promise.any([piped(id), invidious(id)]));
  const errs = [];
  for (const f of tries) {
    try {
      const r = await f();
      res.setHeader('cache-control', 's-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).json(r);
    } catch (e) {
      errs.push(e && e.errors ? e.errors.map(x => x.message).join(' / ') : (e && e.message) || String(e));
    }
  }
  res.setHeader('cache-control', 'no-store');
  res.status(404).json({ error: 'Info tidak tersedia', detail: errs.slice(0, 3) });
};
