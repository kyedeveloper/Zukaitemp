// Pustaka bersama untuk endpoint akun, pengumuman, dan request.
// Diawali garis bawah, jadi Vercel tidak menjadikannya endpoint.
//
// Variabel lingkungan (Vercel → Settings → Environment Variables):
//   GOOGLE_CLIENT_ID   ID klien OAuth "Web application" dari Google Cloud
//   OWNER_EMAIL        email Google owner (boleh lebih dari satu, pisahkan dengan koma)
//   UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN
//                      (atau KV_REST_API_URL dan KV_REST_API_TOKEN dari integrasi Upstash/KV di Vercel)
const DB_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const DB_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const CID = process.env.GOOGLE_CLIENT_ID || '';
const OWNERS = (process.env.OWNER_EMAIL || '').toLowerCase().split(/[,\s]+/).filter(Boolean);

const dbReady = () => !!(DB_URL && DB_TOKEN);

async function db(...cmd) {
  const r = await fetch(DB_URL, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + DB_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(5000)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

// HGETALL dari Upstash datang sebagai array datar [kunci, nilai, kunci, nilai, ...]
async function hall(key) {
  const a = (await db('HGETALL', key)) || [];
  const o = [];
  for (let i = 0; i < a.length; i += 2) { try { o.push(JSON.parse(a[i + 1])); } catch {} }
  return o;
}

// Verifikasi token akses Google: audiens harus klien kita, email harus terverifikasi.
const tcache = new Map();
async function who(req) {
  const h = String(req.headers.authorization || '');
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!t || !CID) return null;
  const hit = tcache.get(t);
  if (hit && hit.exp > Date.now()) return hit.u;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(t), { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.aud !== CID && j.azp !== CID) return null;
    if (!j.email || String(j.email_verified) !== 'true') return null;
    const email = String(j.email).toLowerCase();
    const u = { email, sub: j.sub, owner: OWNERS.includes(email) };
    tcache.set(t, { u, exp: Date.now() + 5 * 60e3 });
    if (tcache.size > 200) tcache.delete(tcache.keys().next().value);
    return u;
  } catch { return null; }
}

const ipOf = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '?';
// batas sederhana per IP: true = boleh lanjut
async function limit(req, name, max, secs) {
  if (!dbReady()) return true;
  try {
    const k = 'rl:' + name + ':' + ipOf(req);
    const n = await db('INCR', k);
    if (n === 1) await db('EXPIRE', k, secs);
    return n <= max;
  } catch { return true; }
}
const body = req => {
  try { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch { return {}; }
};
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

module.exports = { dbReady, db, hall, who, limit, body, rid, CID, OWNERS };
