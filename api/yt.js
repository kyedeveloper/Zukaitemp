// Cari video YouTube untuk satu lagu (artis + judul) supaya bisa diputar utuh lewat pemutar resmi YouTube.
// Urutan: 1) YouTube Data API (isi variabel YT_API_KEY di Vercel, paling stabil)
//         2) Piped / Invidious (instance publik, kadang mati)
const UA = 'Mozilla/5.0 (compatible; ZukaiTemp)';
const getJ = async (u, ms = 4000) => {
  const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};
const iso = s => {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s || '');
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
};

async function official(q, key) {
  const s = await getJ('https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true', videoCategoryId: '10', maxResults: '8', q, key
  }), 4000);
  const ids = (s.items || []).map(x => x.id && x.id.videoId).filter(Boolean);
  if (!ids.length) return [];
  const v = await getJ('https://www.googleapis.com/youtube/v3/videos?' + new URLSearchParams({ part: 'contentDetails', id: ids.join(','), key }), 2500).catch(() => ({ items: [] }));
  const d = {};
  (v.items || []).forEach(x => { d[x.id] = iso(x.contentDetails && x.contentDetails.duration); });
  return ids.map(id => ({ id, d: d[id] || 0 }));
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
async function piped(q) {
  const list = (await pipedList()).slice().sort(() => Math.random() - .5).slice(0, 4);
  return Promise.any(list.map(async b => {
    const j = await getJ(b.replace(/\/+$/, '') + '/search?filter=music_songs&q=' + encodeURIComponent(q), 4000);
    const r = (j.items || []).map(x => ({ id: ((/[?&]v=([\w-]{11})/.exec(x.url || '')) || [])[1], d: x.duration > 0 ? x.duration : 0 })).filter(x => x.id);
    if (!r.length) throw new Error('kosong');
    return r;
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
async function invidious(q) {
  const list = (await invList()).slice().sort(() => Math.random() - .5).slice(0, 4);
  if (!list.length) throw new Error('tidak ada instance Invidious');
  return Promise.any(list.map(async b => {
    const j = await getJ(b + '/api/v1/search?type=video&q=' + encodeURIComponent(q), 4000);
    const r = (Array.isArray(j) ? j : []).filter(x => x.type === 'video' && x.videoId).map(x => ({ id: x.videoId, d: x.lengthSeconds > 0 ? x.lengthSeconds : 0 }));
    if (!r.length) throw new Error('kosong');
    return r;
  }));
}

// Utamakan video yang durasinya paling mirip dengan lagunya (menghindari live, remix, atau loop 1 jam).
function pick(c, target) {
  if (!target) return c;
  for (const tol of [4, 12]) {
    const m = c.filter(x => x.d && Math.abs(x.d - target) <= tol);
    if (m.length) return m.concat(c.filter(x => !m.includes(x)));
  }
  return c;
}

module.exports = async (req, res) => {
  const q = String(req.query.q || '').replace(/\s+/g, ' ').trim().slice(0, 150);
  const target = Math.max(0, Math.min(1200, parseInt(req.query.d, 10) || 0));
  if (!q) return res.status(400).json({ error: 'q kosong' });
  const key = process.env.YT_API_KEY;
  const errs = [];
  const tries = [];
  if (key) tries.push(() => official(q, key));
  tries.push(() => Promise.any([piped(q), invidious(q)]));
  for (const f of tries) {
    try {
      const c = await f();
      if (c && c.length) {
        const ids = [...new Set(pick(c, target).map(x => x.id))].slice(0, 3);
        res.setHeader('cache-control', 's-maxage=604800, stale-while-revalidate=86400');
        return res.status(200).json({ ids });
      }
    } catch (e) {
      errs.push(e && e.errors ? e.errors.map(x => x.message).join(' / ') : (e && e.message) || String(e));
    }
  }
  res.setHeader('cache-control', 'no-store');
  res.status(404).json({ error: 'Video tidak ditemukan', detail: errs.slice(0, 3) });
};
