// Mencari episode anime di kanal YouTube resmi (yang menayangkan gratis dan sah).
//   GET ?t=judul1|judul2|...   cari playlist yang cocok + daftar episode playlist terbaik
//   GET ?pl=PLAYLIST_ID        daftar episode dari playlist tertentu
//   GET ?s=judul               cari manual video di kanal resmi (boros kuota: 100 unit per kanal)
//
// Variabel Vercel:
//   YT_API_KEY       (WAJIB)  – API key YouTube Data v3
//   ANIME_CHANNELS   (opsional, default di bawah) – daftar handle / channel ID dipisah koma.
//                      Contoh: "@MuseIndonesia,@MuseAsia,@AniOneAsia,UCxxxxxxxxxxxxxxxxxxxxxx"
//
// Catatan kuota YouTube API harian gratis = 10.000 unit.
//   channels.list    : 1 unit  (cached 7 hari)
//   playlists.list   : 1 unit / 50 playlist / halaman (cached 24 jam)
//   playlistItems.list: 1 unit / 50 video / halaman
//   search.list      : 100 unit (!) – hanya dipakai untuk tombol "Cari di kanal resmi".

const KEY = process.env.YT_API_KEY || '';
const HANDLES = (
  process.env.ANIME_CHANNELS ||
  '@MuseIndonesia,@MuseAsia,@AniOneAsia,@AniOneIndonesia,@bilibiliAnime'
).split(',').map(s => s.trim()).filter(Boolean);

const getJ = async (u, ms = 6000) => {
  const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
  return j;
};
const yt = (path, p) =>
  getJ('https://www.googleapis.com/youtube/v3/' + path + '?' + new URLSearchParams({ ...p, key: KEY }));

/* ---------- Channel resolution (cached 7 hari) ---------- */
let chCache = { at: 0, list: null };
async function channels() {
  if (chCache.list && Date.now() - chCache.at < 7 * 24 * 3600e3) return chCache.list;
  const out = [];
  for (const h of HANDLES) {
    try {
      const p = /^UC[\w-]{20,}$/.test(h)
        ? { part: 'snippet', id: h }
        : { part: 'snippet', forHandle: h.startsWith('@') ? h : '@' + h };
      const c = ((await yt('channels', p)).items || [])[0];
      if (c) out.push({ id: c.id, title: c.snippet.title });
    } catch { /* skip kalau handle salah */ }
  }
  if (out.length) chCache = { at: Date.now(), list: out };
  return out;
}

/* ---------- Playlists (cached 24 jam) ---------- */
const plCache = new Map();
async function playlists(ch) {
  const hit = plCache.get(ch.id);
  if (hit && Date.now() - hit.at < 24 * 3600e3) return hit.list;
  let tok = '', list = [];
  for (let i = 0; i < 10; i++) {
    const j = await yt('playlists', {
      part: 'snippet,contentDetails',
      channelId: ch.id,
      maxResults: '50',
      ...(tok ? { pageToken: tok } : {}),
    });
    (j.items || []).forEach(p =>
      list.push({ id: p.id, title: p.snippet.title, count: p.contentDetails.itemCount, ch: ch.title })
    );
    tok = j.nextPageToken;
    if (!tok) break;
  }
  plCache.set(ch.id, { at: Date.now(), list });
  return list;
}

/* ---------- Pencocokan judul ---------- */
const STOP = new Set([
  'full','episode','episodes','eps','ep','sub','subtitle','subbed','indo','indonesia','indonesian',
  'english','eng','official','playlist','anime','season','bahasa','resmi','all','musim','dub',
  'dubbed','hd','free','gratis','streaming','nonton','multi','the','tv','simulcast','premiere','part',
]);
const ORD = {
  '1st':'1', first:'1', '2nd':'2', second:'2', ii:'2',
  '3rd':'3', third:'3', iii:'3', '4th':'4', fourth:'4', iv:'4',
  '5th':'5', fifth:'5', '6th':'6', '7th':'7', '8th':'8',
};
const norm = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\[\(【「『].*?[\]\)】」』]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const toks = s =>
  norm(s).split(' ').map(t => ORD[t] || t).filter(t => t && !STOP.has(t));

function score(titles, plTitle) {
  const B = new Set(toks(plTitle));
  if (!B.size) return 0;
  let best = 0;
  for (const t of titles) {
    const A = new Set(toks(t));
    if (!A.size) continue;
    let inter = 0;
    A.forEach(x => { if (B.has(x)) inter++; });
    const cover = inter / A.size;
    const jac = inter / (A.size + B.size - inter);
    // butuh minimal 60% judul muncul di judul playlist
    if (cover >= 0.6) {
      const sc = 0.55 * cover + 0.45 * jac;
      if (sc > best) best = sc;
    }
  }
  return best;
}

/* ---------- Deteksi nomor episode ---------- */
const epNum = t => {
  if (!t) return null;
  const s = String(t);
  // "Episode 1" / "Ep 1" / "EP.1" / "E1"
  let m = /\b(?:episode|eps?|e)\s*[.#:]?\s*(\d{1,4})\b/i.exec(s);
  if (m) return +m[1];
  // "[01]" / "(01)" / "【01】"
  m = /[\[\(【]\s*(\d{1,4})\s*[\]\)】]/.exec(s);
  if (m) return +m[1];
  return null;
};

/* ---------- Episodes dari playlist ---------- */
async function episodes(pid) {
  let tok = '', out = [];
  for (let i = 0; i < 4; i++) {
    const j = await yt('playlistItems', {
      part: 'snippet,contentDetails',
      playlistId: pid,
      maxResults: '50',
      ...(tok ? { pageToken: tok } : {}),
    });
    for (const it of j.items || []) {
      const sn = it.snippet || {};
      const v = (it.contentDetails || {}).videoId || (sn.resourceId || {}).videoId;
      if (!v || /^(private|deleted) video$/i.test(sn.title || '')) continue;
      out.push({
        v,
        t: sn.title || '',
        th: ((sn.thumbnails || {}).medium || (sn.thumbnails || {}).default || {}).url || '',
        n: epNum(sn.title),
      });
    }
    tok = j.nextPageToken;
    if (!tok) break;
  }
  // urutkan hanya kalau mayoritas episode punya nomor yang valid
  if (out.length > 1 && out.filter(e => e.n != null).length >= out.length * 0.7) {
    out.sort((a, b) => (a.n ?? 1e9) - (b.n ?? 1e9));
  }
  return out;
}

/* ---------- Handler ---------- */
module.exports = async (req, res) => {
  const ok = (j, cache) => {
    res.setHeader('cache-control', cache || 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(j);
  };
  if (!KEY) {
    res.setHeader('cache-control', 'no-store');
    return res.status(200).json({ ok: false, reason: 'no_key' });
  }
  try {
    // 1) Ambil episode dari playlist ID tertentu
    const pl = String(req.query.pl || '');
    if (pl) {
      if (!/^[\w-]{10,60}$/.test(pl)) return res.status(400).json({ ok: false, reason: 'bad_id' });
      return ok({ ok: true, eps: await episodes(pl) });
    }

    const chs = await channels();
    if (!chs.length) {
      res.setHeader('cache-control', 'no-store');
      return res.status(200).json({ ok: false, reason: 'no_channel' });
    }

    // 2) Pencarian manual (pakai YouTube Search – mahal, hanya untuk fallback)
    const s = String(req.query.s || '').trim().slice(0, 100);
    if (s) {
      const vids = [];
      for (const c of chs) {
        try {
          const j = await yt('search', {
            part: 'snippet',
            channelId: c.id,
            q: s,
            type: 'video',
            maxResults: '15',
          });
          (j.items || []).forEach(i =>
            vids.push({
              v: i.id.videoId,
              t: i.snippet.title,
              th: ((i.snippet.thumbnails || {}).medium || {}).url || '',
              n: epNum(i.snippet.title),
              ch: c.title,
            })
          );
        } catch { /* skip channel yang gagal */ }
      }
      // urutkan supaya rapi
      if (vids.filter(v => v.n != null).length >= vids.length * 0.6) {
        vids.sort((a, b) => (a.n ?? 1e9) - (b.n ?? 1e9));
      }
      return ok({ ok: true, eps: vids }, 'public, s-maxage=86400, stale-while-revalidate=86400');
    }

    // 3) Cari playlist yang cocok dengan judul anime
    const titles = String(req.query.t || '')
      .split('|').map(x => x.trim()).filter(Boolean).slice(0, 6);
    if (!titles.length) return res.status(400).json({ ok: false, reason: 'no_title' });

    const all = (await Promise.all(chs.map(c => playlists(c).catch(() => [])))).flat();
    const cands = all
      .map(p => ({ ...p, score: score(titles, p.title) }))
      .filter(p => p.score >= 0.55 && p.count > 0)
      .sort((a, b) => b.score - a.score || b.count - a.count)
      .slice(0, 4);

    const eps = cands.length ? await episodes(cands[0].id) : [];
    return ok({ ok: true, cands, eps, channels: chs.map(c => c.title) });
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ ok: false, reason: 'upstream', message: String(e.message || e).slice(0, 160) });
  }
};