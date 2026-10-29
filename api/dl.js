// api/dl.js
const { json, preflight, isVideoId, clamp } = require('./_lib');
const { Innertube } = require('youtubei.js');

let c;
module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  const id = String(req.query.id || '').trim();
  if (!isVideoId(id)) return json(res, 400, { error: 'id tidak valid' });
  try {
    c = c || Innertube.create({ lang: 'id', location: 'ID' });
    const info = await (await c).getBasicInfo(id);
    const fmt = info.chooseFormat({ type: 'audio', quality: 'best' });
    const url = fmt.decipher((await c).session.player);
    json(res, 200, {
      title: info.basic_info.title,
      artist: info.basic_info.author,
      seconds: info.basic_info.duration,
      thumb: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      audio: { url, mime: fmt.mime_type, bitrate: fmt.bitrate },
      proxy: `/api/stream?id=${id}`,
      yt: `https://youtu.be/${id}`,
      note: 'URL googlevideo expire ±6 jam. Pakai /api/stream untuk versi proxy.',
    }, 600);
  } catch (e) { json(res, 502, { error: String(e.message).slice(0, 200) }); }
};
