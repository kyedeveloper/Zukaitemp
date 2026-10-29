// api/_lib.js
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const mem = new Map();

function json(res, code, data, cache) {
  res.status(code);
  if (cache) res.setHeader('cache-control', `public, s-maxage=${cache}, stale-while-revalidate=${cache * 2}`);
  else res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,range');
  res.setHeader('access-control-expose-headers', 'content-length,content-range,accept-ranges');
}

function preflight(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

async function fetchT(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { 'user-agent': UA, 'accept-language': 'id-ID,id;q=0.9,en;q=0.8', ...(opts.headers || {}) },
    });
  } finally { clearTimeout(t); }
}

async function fetchJson(url, opts, ms) {
  const r = await fetchT(url, opts, ms);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// cache in-memory singkat, aman untuk serverless
function cached(key, ttl, fn) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.v);
  return fn().then(v => {
    mem.set(key, { at: Date.now(), v });
    if (mem.size > 400) {
      const now = Date.now();
      for (const [k, v] of mem) if (now - v.at > 15 * 60e3) mem.delete(k);
    }
    return v;
  });
}

// coba banyak sumber, kembalikan yang pertama berhasil
async function firstOf(sources, label) {
  const errs = [];
  for (const s of sources) {
    try {
      const v = await s.fn();
      if (v && (Array.isArray(v) ? v.length : true)) return { via: s.name, data: v };
      errs.push(s.name + ': kosong');
    } catch (e) { errs.push(s.name + ': ' + e.message); }
  }
  throw new Error(`${label} gagal — ${errs.join(' | ')}`);
}

const isVideoId = id => /^[\w-]{11}$/.test(String(id || ''));
const clamp = (s, n) => String(s || '').trim().slice(0, n);

function toSec(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

module.exports = { UA, json, cors, preflight, fetchT, fetchJson, cached, firstOf, isVideoId, clamp, toSec };
