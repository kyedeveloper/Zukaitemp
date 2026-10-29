// api/yt.js
const { Innertube } = require('youtubei.js');
const { json, preflight, cached, clamp } = require('./_lib');

let clientP;
function client() {
  clientP = clientP || Innertube.create({ lang: 'id', location: 'ID', retrieve_player: true });
  return clientP;
}

const thumb = (id, q = 'hq') => `https://i.ytimg.com/vi/${id}/${q}default.jpg`;

function norm(v) {
  return {
    id: v.id,
    title: v.title?.toString?.() || '',
    artist: v.author?.name || v.channel?.name || 'YouTube',
    artistId: v.author?.id || v.channel?.id || '',
    duration: v.duration?.seconds || v.duration_seconds || 0,
    cover: thumb(v.id),
    coverBig: thumb(v.id, 'maxres'),
    views: v.view_count || 0,
    src: 'yt',
  };
}

async function doSearch(q, limit = 25) {
  const c = await client();
  const s = await c.search(q, { type: 'video' });
  const list = (s.videos || []).slice(0, limit).map(norm).filter(t => t.id && t.duration > 0);
  return list;
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  const q = clamp(req.query.q, 90);
  if (!q) return json(res, 400, { error: 'q kosong' });
  try {
    const data = await cached('s:' + q.toLowerCase(), 4 * 60e3, () => doSearch(q));
    json(res, 200, { data }, 240);
  } catch (e) {
    json(res, 502, { error: String(e.message).slice(0, 200), data: [] });
  }
};
