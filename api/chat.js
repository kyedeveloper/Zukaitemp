// Chat global. GET: 60 pesan terbaru (di-cache 2 detik di CDN agar hemat database).
// POST: kirim pesan (siapa saja; tautan hanya untuk yang masuk Google). POST {action:'delete'}: hanya owner.
const L = require('./_lib');
const KEY = 'chat:msgs';
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const parse = x => { try { return JSON.parse(x); } catch { return null; } };
module.exports = async (req, res) => {
  if (!L.dbReady()) {
    res.setHeader('cache-control', 'no-store');
    return req.method === 'GET' ? res.status(200).json({ items: [], db: false }) : res.status(503).json({ error: 'Database belum diatur di server' });
  }
  try {
    if (req.method === 'GET') {
      const raw = (await L.db('LRANGE', KEY, 0, 59)) || [];
      res.setHeader('cache-control', 'public, s-maxage=2, stale-while-revalidate=4');
      return res.status(200).json({ db: true, items: raw.map(parse).filter(Boolean).reverse() });
    }
    res.setHeader('cache-control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak didukung' });
    const me = await L.who(req), b = L.body(req);
    if (b.action === 'delete') {
      if (!me || !me.owner) return res.status(403).json({ error: 'Hanya owner' });
      const id = clean(b.id, 40);
      const raw = (await L.db('LRANGE', KEY, 0, 199)) || [];
      const hit = raw.find(x => { const m = parse(x); return m && m.id === id; });
      if (hit) await L.db('LREM', KEY, 1, hit);
      return res.status(200).json({ ok: true });
    }
    const text = clean(b.text, 300);
    const dev = String(b.dev || '');
    if (!text) return res.status(400).json({ error: 'Pesan kosong' });
    if (!/^[\w-]{8,40}$/.test(dev)) return res.status(400).json({ error: 'ID perangkat tidak valid' });
    if (!me && /https?:\/\/|www\./i.test(text)) return res.status(403).json({ error: 'Tautan hanya untuk yang sudah masuk dengan Google' });
    if (!(await L.limit(req, 'chat', 12, 60))) return res.status(429).json({ error: 'Terlalu cepat, tunggu sebentar' });
    let name = clean(b.name, 20) || 'Tamu';
    if (!(me && me.owner) && /owner|admin/i.test(name)) name = 'Tamu';
    const u = require('crypto').createHash('sha256').update('zt:' + dev).digest('hex').slice(0, 12);
    const item = { id: L.rid(), ts: Date.now(), name, text, u, v: !!me, o: !!(me && me.owner) };
    await L.db('LPUSH', KEY, JSON.stringify(item));
    await L.db('LTRIM', KEY, 0, 199);
    return res.status(201).json({ ok: true, item, u });
  } catch (e) {
    res.status(500).json({ error: 'Server bermasalah, coba lagi' });
  }
};
