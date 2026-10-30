// api/mail.js — proxy tipis ke penyedia email sementara
// dipakai supaya bebas CORS dan tidak kena blokir ISP
const HOSTS = {
  tm: 'https://api.mail.tm',
  gw: 'https://api.mail.gw',
};

const PASS = ['content-type', 'accept', 'authorization', 'content-disposition'];

module.exports = async (req, res) => {
  res.setHeader('x-zt-proxy', '1');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,authorization,accept');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const p = String(req.query.p || '');
  const h = String(req.query.h || 'tm');
  const base = HOSTS[h];
  if (!base) return res.status(400).json({ message: 'server tidak dikenal' });
  if (!p.startsWith('/') || p.startsWith('//')) return res.status(400).json({ message: 'path tidak valid' });

  const headers = { accept: req.headers.accept || 'application/json' };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;

  const init = { method: req.method, headers };
  if (!['GET', 'HEAD', 'DELETE'].includes(req.method) && req.body !== undefined) {
    headers['content-type'] = req.headers['content-type'] || 'application/json';
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  init.signal = ctrl.signal;

  try {
    const r = await fetch(base + p, init);
    for (const k of PASS) {
      const v = r.headers.get(k);
      if (v) res.setHeader(k, v);
    }
    res.setHeader('cache-control', 'no-store');
    if (r.status === 204) return res.status(204).end();
    res.status(r.status).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ message: e.name === 'AbortError' ? 'server terlalu lama merespons' : 'proxy: ' + e.message });
  } finally {
    clearTimeout(timer);
  }
};
