// Proxy ke api.mail.tm supaya tidak kena blokir ISP / masalah CORS di browser
module.exports = async (req, res) => {
  res.setHeader('x-zt-proxy', '1');
  try {
    const p = String(req.query.p || '');
    if (!p.startsWith('/')) return res.status(400).json({ message: 'Parameter p tidak valid' });
    const headers = { accept: req.headers.accept || '*/*', 'user-agent': 'Mozilla/5.0 (compatible; ZukaiTemp)' };
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    const init = { method: req.method, headers };
    if (!['GET', 'HEAD', 'DELETE'].includes(req.method) && req.body !== undefined) {
      headers['content-type'] = req.headers['content-type'] || 'application/json';
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    let r, buf;
    for (let i = 0; i < 2; i++) {
      try {
        r = await fetch('https://api.mail.tm' + p, init);
        buf = Buffer.from(await r.arrayBuffer());
        if (r.status < 500) break;
      } catch (e) {
        if (i === 1) throw e;
      }
      await new Promise(t => setTimeout(t, 600));
    }
    if (r.status >= 500) {
      const snip = buf.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120);
      return res.status(r.status).json({ message: 'mail.tm membalas ' + r.status + (snip ? ': ' + snip : '') });
    }
    const ct = r.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);
    if (r.status === 204) return res.status(204).end();
    res.status(r.status).send(buf);
  } catch (e) {
    res.status(502).json({ message: 'Proxy gagal menghubungi mail.tm: ' + e.message });
  }
};
