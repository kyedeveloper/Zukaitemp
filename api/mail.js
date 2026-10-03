// Proxy ke api.mail.tm supaya tidak kena blokir ISP / masalah CORS di browser
module.exports = async (req, res) => {
  res.setHeader('x-zt-proxy', '1');
  try {
    const p = String(req.query.p || '');
    if (!p.startsWith('/')) return res.status(400).json({ message: 'Parameter p tidak valid' });
    const headers = { accept: req.headers.accept || '*/*' };
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    const init = { method: req.method, headers };
    if (!['GET', 'HEAD', 'DELETE'].includes(req.method) && req.body !== undefined) {
      headers['content-type'] = req.headers['content-type'] || 'application/json';
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    const r = await fetch('https://api.mail.tm' + p, init);
    const ct = r.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);
    if (r.status === 204) return res.status(204).end();
    res.status(r.status).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ message: 'Proxy error: ' + e.message });
  }
};
