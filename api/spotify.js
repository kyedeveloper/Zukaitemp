// api/spotify.js
const { json, preflight, fetchJson, cached, clamp } = require('./_lib');
const { Innertube } = require('youtubei.js');

const ID = process.env.SPOTIFY_ID;
const SECRET = process.env.SPOTIFY_SECRET;

async function token() {
  return cached('sp', 50 * 60e3, async () => {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from(ID + ':' + SECRET).toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!r.ok) throw new Error('token gagal ' + r.status);
    return (await r.json()).access_token;
  });
}

let clientP;
const ytClient = () => (clientP = clientP || Innertube.create({ lang: 'id', location: 'ID', retrieve_player: true }));

const thumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// cocokkan metadata spotify ke video youtube
async function match(track) {
  const q = `${track.name} ${track.artists.map(a => a.name).join(' ')}`;
  const c = await ytClient();
  const s = await c.search(q, { type: 'video' });
  const v = (s.videos || []).find(x => x.duration?.seconds > 20 && x.duration?.seconds < 900);
  if (!v) return null;
  return {
    id: v.id,
    title: track.name,
    artist: track.artists.map(a => a.name).join(', '),
    album: track.album?.name || '',
    duration: Math.round((track.duration_ms || 0) / 1000),
    cover: track.album?.images?.[1]?.url || thumb(v.id),
    coverBig: track.album?.images?.[0]?.url || thumb(v.id),
    src: 'spotify',
    spotifyUrl: track.external_urls?.spotify || '',
  };
}

async function sp(path) {
  const t = await token();
  return fetchJson('https://api.spotify.com/v1' + path, { headers: { authorization: 'Bearer ' + t } }, 9000);
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!ID || !SECRET) return json(res, 200, { data: [], error: 'SPOTIFY_ID / SPOTIFY_SECRET belum diset' });

  const mode = String(req.query.a || 'search');
  try {
    if (mode === 'playlist' || mode === 'album') {
      const id = clamp(req.query.id, 60);
      const raw = await sp(`/${mode}s/${id}`);
      const items = (raw.tracks?.items || []).map(x => x.track || x).filter(t => t && t.name);
      const out = [];
      for (const t of items.slice(0, 25)) {
        const m = await match(t);
        if (m) out.push(m);
      }
      return json(res, 200, { name: raw.name, data: out }, 600);
    }
    if (mode === 'track') {
      const t = await sp('/tracks/' + clamp(req.query.id, 60));
      const m = await match(t);
      return json(res, 200, { data: m ? [m] : [] }, 600);
    }
    const q = clamp(req.query.q, 90);
    if (!q) return json(res, 400, { error: 'q kosong' });
    const r = await sp(`/search?q=${encodeURIComponent(q)}&type=track&limit=15`);
    const out = [];
    for (const t of r.tracks.items) {
      const m = await match(t);
      if (m) out.push(m);
    }
    json(res, 200, { data: out }, 300);
  } catch (e) {
    json(res, 502, { error: String(e.message).slice(0, 200), data: [] });
  }
};
