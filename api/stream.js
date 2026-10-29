// api/stream.js
const { UA, json, preflight, fetchT, cached, isVideoId } = require('./_lib');

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi.drgns.space',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee',
  'https://pipedapi.ducks.party',
];

const INVIDIOUS = [
  'https://yt.chocolatemoo53.com',
  'https://invidious.nerdvpn.de',
  'https://inv.nadeko.net',
  'https://invidious.tiekoetter.com',
];

function best(audio) {
  return audio
    .filter(s => /audio/i.test(s.mimeType || s.type || ''))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
    .find(s => /mp4|m4a/i.test(s.mimeType || s.type || '')) || audio[0];
}

async function viaPiped(base, id) {
  const r = await fetchT(`${base}/streams/${id}`, {}, 6500);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  const pick = best(d.audioStreams || []);
  if (!pick?.url) throw new Error('tanpa audio');
  return pick.url;
}

async function viaInvidious(base, id) {
  const r = await fetchT(`${base}/api/v1/videos/${id}?fields=adaptiveFormats`, {}, 6500);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  const pick = best((d.adaptiveFormats || []).map(f => ({ ...f, mimeType: f.type })));
  if (!pick?.url) throw new Error('tanpa audio');
  return pick.url;
}

async function viaInnerTube(id) {
  const { Innertube } = require('youtubei.js');
  const c = await Innertube.create({ lang: 'id', location: 'ID' });
  const info = await c.getInfo(id);
  const fmt = info.chooseFormat({ type: 'audio', quality: 'best' });
  const url = fmt.decipher(c.session.player);
  if (!url) throw new Error('decipher kosong');
  return url;
}

async function viaYtdl(id) {
  const ytdl = require('@distube/ytdl-core');
  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
  const f = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
  if (!f?.url) throw new Error('format kosong');
  return f.url;
}

async function resolve(id) {
  return cached('u:' + id, 3 * 60 * 60e3, async () => {
    const layers = [
      ...PIPED.map(b => ({ name: 'piped:' + b, fn: () => viaPiped(b, id) })),
      ...INVIDIOUS.map(b => ({ name: 'inv:' + b, fn: () => viaInvidious(b, id) })),
      { name: 'innertube', fn: () => viaInnerTube(id) },
      { name: 'ytdl', fn: () => viaYtdl(id) },
    ];
    const errs = [];
    for (const l of layers) {
      try { const u = await l.fn(); if (u) return u; }
      catch (e) { errs.push(l.name + ': ' + e.message); }
    }
    throw new Error(errs.join(' | '));
  });
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  const id = String(req.query.id || '').trim();
  if (!isVideoId(id)) return json(res, 400, { error: 'id tidak valid' });

  // mode json: kembalikan URL saja
  if (req.query.json) {
    try { return json(res, 200, { url: await resolve(id) }, 900); }
    catch (e) { return json(res, 502, { error: String(e.message).slice(0, 300) }); }
  }

  let url;
  try { url = await resolve(id); }
  catch (e) { return json(res, 502, { error: String(e.message).slice(0, 300) }); }

  // proxy dengan dukungan Range supaya seek & background play jalan
  const range = req.headers.range;
  let up;
  try {
    up = await fetchT(url, { headers: range ? { range } : {} }, 15000);
  } catch (e) {
    return json(res, 502, { error: 'upstream mati: ' + e.message });
  }
  if (!up.ok && up.status !== 206) return json(res, 502, { error: 'upstream ' + up.status });

  res.status(up.status);
  res.setHeader('content-type', up.headers.get('content-type') || 'audio/mp4');
  res.setHeader('accept-ranges', 'bytes');
  for (const h of ['content-length', 'content-range']) {
    const v = up.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  res.setHeader('cache-control', 'public, max-age=86400');
  res.setHeader('access-control-allow-origin', '*');

  const { Readable } = require('stream');
  Readable.fromWeb(up.body).on('error', () => res.end()).pipe(res);
};
