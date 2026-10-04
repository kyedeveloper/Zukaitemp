// Proxy downloader. TikTok lewat tikwm; platform lain lewat server Cobalt milikmu
// (isi variabel lingkungan COBALT_API di Vercel, dan COBALT_KEY kalau instance-nya pakai API key).
const UA = 'Mozilla/5.0 (compatible; ZukaiTemp)';
const host = u => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

async function tiktok(u) {
  const r = await fetch('https://www.tikwm.com/api/?hd=1&url=' + encodeURIComponent(u), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  if (j.code !== 0 || !j.data) throw new Error(j.msg || 'TikTok menolak permintaan, coba lagi sebentar');
  const d = j.data, items = [];
  const abs = p => (p && p.startsWith('/') ? 'https://www.tikwm.com' + p : p);
  if (d.hdplay) items.push({ label: 'Video HD tanpa watermark', url: abs(d.hdplay), type: 'video' });
  if (d.play) items.push({ label: 'Video tanpa watermark', url: abs(d.play), type: 'video' });
  if (d.music) items.push({ label: 'Audio / musik (MP3)', url: abs(d.music), type: 'audio' });
  (d.images || []).forEach((im, i) => items.push({ label: 'Foto ' + (i + 1), url: im, type: 'image' }));
  if (!items.length) throw new Error('Tidak ada file yang bisa diunduh dari link ini');
  return { title: d.title, author: d.author && (d.author.nickname || d.author.unique_id), cover: abs(d.cover), items };
}

async function cobalt(u) {
  const base = (process.env.COBALT_API || '').replace(/\/+$/, '');
  if (!base) throw new Error('Platform ini butuh server Cobalt. Atur variabel COBALT_API di Vercel (Settings > Environment Variables), lalu deploy ulang.');
  const headers = { accept: 'application/json', 'content-type': 'application/json', 'user-agent': UA };
  if (process.env.COBALT_KEY) headers.authorization = 'Api-Key ' + process.env.COBALT_KEY;
  const r = await fetch(base + '/', { method: 'POST', headers, body: JSON.stringify({ url: u, videoQuality: '720', filenameStyle: 'basic' }), signal: AbortSignal.timeout(9000) });
  const j = await r.json().catch(() => ({}));
  if (j.status === 'error' || (r.status === 400 && j.error)) {
    const code = (j.error && j.error.code) || 'gagal memproses link';
    if (/auth/.test(code)) throw new Error('Cobalt menolak: API key kurang/salah. Isi COBALT_KEY di Vercel dengan key dari instance kamu.');
    throw new Error('Cobalt: ' + code);
  }
  if (j.status === 'tunnel' || j.status === 'redirect') return { title: j.filename || 'Video', items: [{ label: 'Unduh file', url: j.url, type: /\.(mp3|m4a|opus|ogg|wav)$/i.test(j.filename || '') ? 'audio' : 'video' }] };
  if (j.status === 'picker') return { title: 'Beberapa file ditemukan', items: (j.picker || []).map((p, i) => ({ label: (p.type === 'photo' ? 'Foto ' : 'Video ') + (i + 1), url: p.url, type: p.type === 'photo' ? 'image' : 'video' })).concat(j.audio ? [{ label: 'Audio', url: j.audio, type: 'audio' }] : []) };
  throw new Error('Balasan Cobalt tidak dikenal (HTTP ' + r.status + ')');
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  try {
    const u = String(req.query.u || '');
    if (!/^https?:\/\//i.test(u)) return res.status(400).json({ error: 'Link tidak valid' });
    const h = host(u);
    const out = /(^|\.)tiktok\.com$/.test(h) ? await tiktok(u) : await cobalt(u);
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
