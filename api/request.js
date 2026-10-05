// Request dari pengguna ke owner.
//   POST (siapa saja)        : kirim request baru
//   GET ?dev=ID              : request milik perangkat itu (status dan catatan owner)
//   GET ?all=1 (owner)       : seluruh inbox
//   POST {action} (owner)    : ubah status/catatan atau hapus
const L = require('./_lib');
const KINDS = ['fitur', 'bug', 'lagu', 'lain'], STAT = ['baru', 'dibaca', 'selesai'];
const pub = x => ({ id: x.id, kind: x.kind, msg: x.msg, ts: x.ts, status: x.status, note: x.note || '' });
module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (!L.dbReady()) return req.method === 'GET' ? res.status(200).json({ items: [], db: false }) : res.status(503).json({ error: 'Database belum diatur di server' });
  try {
    const me = await L.who(req);
    if (req.method === 'GET') {
      const all = await L.hall('req:items');
      if (String(req.query.all || '') === '1') {
        if (!me || !me.owner) return res.status(403).json({ error: 'Hanya owner' });
        return res.status(200).json({ db: true, items: all.sort((a, b) => b.ts - a.ts).slice(0, 200).map(x => ({ id: x.id, kind: x.kind, msg: x.msg, ts: x.ts, status: x.status, note: x.note || '', name: x.name, email: x.email || '', contact: x.contact || '' })) });
      }
      const dev = String(req.query.dev || '');
      if (!/^[\w-]{8,40}$/.test(dev)) return res.status(400).json({ error: 'ID perangkat tidak valid' });
      return res.status(200).json({ db: true, items: all.filter(x => x.dev === dev || (me && x.email && x.email === me.email)).sort((a, b) => b.ts - a.ts).slice(0, 20).map(pub) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak didukung' });
    const b = L.body(req);
    if (b.action) {
      if (!me || !me.owner) return res.status(403).json({ error: 'Hanya owner' });
      const id = String(b.id || '').slice(0, 40);
      if (b.action === 'delete') { await L.db('HDEL', 'req:items', id); return res.status(200).json({ ok: true }); }
      if (b.action === 'status') {
        const raw = await L.db('HGET', 'req:items', id);
        if (!raw) return res.status(404).json({ error: 'Request tidak ditemukan' });
        const x = JSON.parse(raw);
        if (STAT.includes(b.status)) x.status = b.status;
        if (typeof b.note === 'string') x.note = b.note.trim().slice(0, 200);
        await L.db('HSET', 'req:items', id, JSON.stringify(x));
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'Aksi tidak dikenal' });
    }
    const dev = String(b.dev || '');
    const msg = String(b.msg || '').trim().slice(0, 1000);
    if (!/^[\w-]{8,40}$/.test(dev)) return res.status(400).json({ error: 'ID perangkat tidak valid' });
    if (msg.length < 5) return res.status(400).json({ error: 'Pesan terlalu pendek' });
    if (!(await L.limit(req, 'req', 5, 3600))) return res.status(429).json({ error: 'Terlalu banyak request, coba lagi nanti' });
    const x = { id: L.rid(), kind: KINDS.includes(b.kind) ? b.kind : 'lain', msg, contact: String(b.contact || '').trim().slice(0, 120), name: String(b.name || '').trim().slice(0, 40) || 'Tamu', email: me ? me.email : '', dev, ts: Date.now(), status: 'baru', note: '' };
    await L.db('HSET', 'req:items', x.id, JSON.stringify(x));
    const all = await L.hall('req:items');
    if (all.length > 500) {
      const old = all.sort((a, c) => a.ts - c.ts).slice(0, 50).map(v => v.id);
      await L.db('HDEL', 'req:items', ...old);
    }
    return res.status(201).json({ ok: true, id: x.id });
  } catch (e) {
    res.status(500).json({ error: 'Server bermasalah, coba lagi' });
  }
};
