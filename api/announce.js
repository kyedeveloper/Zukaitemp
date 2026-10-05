// Pengumuman global. GET: siapa saja. POST: hanya owner (kirim atau hapus).
const L = require('./_lib');
module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (!L.dbReady()) return res.status(200).json({ items: [], db: false });
  try {
    if (req.method === 'GET') {
      const now = Date.now();
      const items = (await L.hall('ann:items')).filter(a => !a.exp || a.exp > now).sort((a, b) => b.ts - a.ts).slice(0, 10);
      return res.status(200).json({ items, db: true });
    }
    if (req.method === 'POST') {
      const me = await L.who(req);
      if (!me || !me.owner) return res.status(403).json({ error: 'Hanya owner yang boleh mengirim pengumuman' });
      const b = L.body(req);
      if (b.action === 'delete') {
        await L.db('HDEL', 'ann:items', String(b.id || '').slice(0, 40));
        return res.status(200).json({ ok: true });
      }
      const title = String(b.title || '').trim().slice(0, 80);
      const text = String(b.body || '').trim().slice(0, 600);
      if (!title || !text) return res.status(400).json({ error: 'Judul dan isi wajib diisi' });
      const hours = Math.max(0, Math.min(24 * 30, Number(b.hours) || 0));
      const ts = Date.now(), id = L.rid();
      const item = { id, title, body: text, kind: b.kind === 'penting' ? 'penting' : 'info', ts, exp: hours ? ts + hours * 3600e3 : 0 };
      await L.db('HSET', 'ann:items', id, JSON.stringify(item));
      // jaga agar tidak menumpuk: simpan 60 terbaru saja
      const all = await L.hall('ann:items');
      if (all.length > 60) {
        const old = all.sort((a, c) => a.ts - c.ts).slice(0, all.length - 60).map(x => x.id);
        if (old.length) await L.db('HDEL', 'ann:items', ...old);
      }
      return res.status(201).json({ ok: true, item });
    }
    res.status(405).json({ error: 'Metode tidak didukung' });
  } catch (e) {
    res.status(500).json({ error: 'Server bermasalah, coba lagi' });
  }
};
