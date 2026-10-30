// api/stream.js
const { json, preflight, fetchT, cached, isVideoId } = require('./_lib');

const PIPED = [
  'https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru', 'https://pipedapi.drgns.space', 'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee', 'https://pipedapi.ducks.party', 'https://piped-api.privacy.com.de',
];
const INV = ['https://yt.chocolatemoo53.com', 'https://invidious.nerdvpn.de', 'https://inv.nadeko.net'];

const pick = a => a
  .filter(s => /audio/i.test(s.mimeType || s.type || ''))
  .sort((x, y) => (y.bitrate || 0) - (x.bitrate || 0))
  .find(s => /mp4|m4a/i.test(s.mimeType || s.type || '')) || a[0];

async function viaPiped(b, id) {
  const d = await (await fetchT(`${b}/streams/${id}`, {}, 6000)).json();
  const p = pick(d.audioStreams || []);
  if (!p?.url) throw new Error('kosong');
  return p.url;
}
async function viaInv(b, id) {
  const d = await (await fetchT(`${b}/api/v1/videos/${id}?fields=adaptiveFormats`, {}, 6000)).json();
  const p = pick((d.adaptiveFormats || []).map(f => ({ ...f, mimeType: f.type })));
  if (!p?.url) throw new Error('kosong');
  return p.url;
}
async function viaInner(id, client) {
  const { Innertube } = require('youtubei.js');
  const c = await Innertube.create({ lang: 'id', location: 'ID', player_client: client });
  const info = await c.getInfo(id);
  const f = info.chooseFormat({ type: 'audio', quality: 'best' });
  const u = f.decipher(c.session.player);
  if (!u) throw new Error('decipher kosong');
  return u;
}
async function viaYtdl(id) {
  const ytdl = require('@distube/ytdl-core');
  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
  const f = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
  if (!f?.url) throw new Error('format kosong');
  return f.url;
}

async function resolve(id) {
  return cached('u:' + id, 2.5 * 3600e3, async () => {
    const layers = [
      ...PIPED.map(b => ({ n: 'p:' + b, f: () => viaPiped(b, id) })),
      ...INV.map(b => ({ n: 'i:' + b, f: () => viaInv(b, id) })),
      { n: 'it:android_vr', f: () => viaInner(id, 'ANDROID_VR') },
      { n: 'it:tv', f: () => viaInner(id, 'TV') },
      { n: 'ytdl', f: () => viaYtdl(id) },
    ];
    const errs = [];
    for (const l of layers) {
      try { const u = await l.f(); if (u) return u; } catch (e) { errs.push(l.n + ':' + e.message); }
    }
    throw new Error(errs.join(' | '));
  });
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  const id = String(req.query.id || '').trim();
  if (!isVideoId(id)) return json(res, 400, { error: 'id tidak valid' });

  let url;
  try { url = await resolve(id); }
  catch (e) { return json(res, 502, { error: String(e.message).slice(0, 300) }); }

  if (req.query.json) return json(res, 200, { url }, 600);
  if (req.query.redir) { res.setHeader('cache-control', 'no-store'); return res.redirect(302, url); }

  const range = req.headers.range;
  let up;
  try { up = await fetchT(url, { headers: range ? { range } : {} }, 14000); }
  catch (e) { return json(res, 502, { error: 'upstream: ' + e.message }); }
  if (!up.ok && up.status !== 206) return json(res, 502, { error: 'upstream ' + up.status });

  res.status(up.status);
  res.setHeader('content-type', up.headers.get('content-type') || 'audio/mp4');
  res.setHeader('accept-ranges', 'bytes');
  for (const h of ['content-length', 'content-range']) {
    const v = up.headers.get(h); if (v) res.setHeader(h, v);
  }
  res.setHeader('cache-control', 'public, max-age=86400');
  const { Readable } = require('stream');
  Readable.fromWeb(up.body).on('error', () => res.end()).pipe(res);
};
