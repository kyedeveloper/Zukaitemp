// ZukaiTemp proxy: satu pintu untuk banyak server temp mail.
// Semua server dibungkus supaya balasannya berformat sama (gaya mail.tm).
const crypto = require('crypto');
const UA = 'Mozilla/5.0 (compatible; ZukaiTemp)';
const HYDRA = { tm: 'https://api.mail.tm', gw: 'https://api.mail.gw' };

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const unb = s => { try { return JSON.parse(Buffer.from(s, 'base64url').toString()); } catch { return null; } };
const split = a => { const i = a.lastIndexOf('@'); return [a.slice(0, i), a.slice(i + 1)]; };
const q = encodeURIComponent;
const iso = x => {
  const n = Number(x);
  const d = !isNaN(n) && x !== '' && x != null ? new Date(n < 1e12 ? n * 1000 : n) : new Date(x);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
};
const addr = a => {
  a = String(a || '');
  const m = a.match(/<([^>]+)>/);
  return { address: (m ? m[1] : a).trim(), name: m ? a.replace(/<[^>]+>/, '').replace(/["']/g, '').trim() : '' };
};
const msg = (id, from, subject, intro, seen, date) => ({
  id: String(id), from: addr(from), subject: subject || '', intro: String(intro || '').slice(0, 120),
  seen: !!seen, createdAt: iso(date)
});
const full = (m, to, text, html) => ({ ...m, to: [{ address: to }], text: text || '', html: html ? [html] : [], attachments: [] });
const fromTP = j => (j.from_name ? `${j.from_name} <${j.from_mail}>` : j.from_mail);

async function jget(url, opt = {}) {
  const r = await fetch(url, {
    ...opt, signal: AbortSignal.timeout(8000),
    headers: { 'user-agent': UA, accept: 'application/json', ...(opt.headers || {}) }
  });
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status + (t ? ': ' + t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 80) : '')), { status: r.status });
  try { return JSON.parse(t); } catch { throw new Error('Balasan bukan JSON'); }
}

/* ---------- Adapter tiap server ---------- */
const TP = 'https://tempmail.plus/api/mails';
const G = 'https://api.guerrillamail.com/ajax.php';
const TL = 'https://api.tempmail.lol/v2';
const SM = 'https://www.1secmail.com/api/v1/';

const mapLol = e => msg(
  crypto.createHash('sha1').update(String(e.from) + e.subject + e.date).digest('hex').slice(0, 12),
  e.from, e.subject, e.body, false, e.date);
const lolList = async t => {
  const j = await jget(TL + '/inbox?token=' + q(t.t));
  if (j.expired || !j.emails) throw Object.assign(new Error('Inbox kedaluwarsa'), { status: 401 });
  return j.emails;
};

const ADAPTERS = {
  // tempmail.plus: tanpa akun, alamat bebas
  tp: {
    stateless: true,
    domains: async () => ['mailto.plus', 'fexpost.com', 'fexbox.org', 'mailbox.in.ua', 'rover.info', 'chitthi.in', 'fextemp.com', 'any.pink', 'merepost.com', 'inpwa.com', 'intopwa.com', 'tofeat.com'],
    create: async (u, d) => ({ address: u + '@' + d }),
    list: async t => ((await jget(`${TP}?email=${q(t.a)}&limit=20&epin=`)).mail_list || [])
      .map(m => msg(m.mail_id, fromTP(m), m.subject, '', !m.is_new, m.time)),
    read: async (t, id) => {
      const j = await jget(`${TP}/${q(id)}?email=${q(t.a)}&epin=`);
      return full(msg(id, fromTP(j), j.subject, j.text, true, j.date), t.a, j.text, j.html);
    }
  },
  // Guerrilla Mail: banyak domain alias, satu inbox
  gm: {
    domains: async () => ['guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'guerrillamail.info', 'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org', 'pokemail.net', 'spam4.me'],
    create: async (u, d, c) => {
      const a = await jget(`${G}?f=get_email_address&lang=en&ip=${q(c.ip)}&agent=ZukaiTemp`);
      const b = await jget(`${G}?f=set_email_user&email_user=${q(u)}&lang=en&sid_token=${q(a.sid_token)}`);
      return { address: u + '@' + d, state: { s: b.sid_token || a.sid_token } };
    },
    list: async t => ((await jget(`${G}?f=check_email&seq=0&sid_token=${q(t.s)}`)).list || [])
      .map(m => msg(m.mail_id, m.mail_from, m.mail_subject, m.mail_excerpt, Number(m.mail_read), m.mail_timestamp)),
    read: async (t, id) => {
      const j = await jget(`${G}?f=fetch_email&email_id=${q(id)}&sid_token=${q(t.s)}`);
      return full(msg(id, j.mail_from, j.mail_subject, '', true, j.mail_timestamp), t.a, '', j.mail_body);
    },
    del: async (t, id) => { await jget(`${G}?f=del_email&email_ids[]=${q(id)}&sid_token=${q(t.s)}`); }
  },
  // tempmail.lol: domain dipilihkan server, inbox hidup sekitar 1 jam
  tl: {
    domains: async () => ['acak-otomatis'],
    create: async u => {
      const post = body => jget(TL + '/inbox/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      let j;
      try { j = await post({ prefix: u }); } catch { j = await post({}); }
      return { address: j.address, state: { t: j.token } };
    },
    list: async t => (await lolList(t)).map(mapLol),
    read: async (t, id) => {
      const e = (await lolList(t)).find(x => mapLol(x).id === id);
      if (!e) throw Object.assign(new Error('Pesan tidak ditemukan'), { status: 404 });
      return full(mapLol(e), t.a, e.body, e.html);
    }
  },
  // 1secmail: tanpa akun
  sm: {
    stateless: true,
    domains: async () => jget(SM + '?action=getDomainList'),
    create: async (u, d) => ({ address: u + '@' + d }),
    list: async t => {
      const [l, d] = split(t.a);
      return (await jget(`${SM}?action=getMessages&login=${q(l)}&domain=${q(d)}`))
        .map(m => msg(m.id, m.from, m.subject, '', false, String(m.date).replace(' ', 'T') + 'Z'));
    },
    read: async (t, id) => {
      const [l, d] = split(t.a);
      const j = await jget(`${SM}?action=readMessage&login=${q(l)}&domain=${q(d)}&id=${q(id)}`);
      return full(msg(id, j.from, j.subject, j.textBody, true, String(j.date).replace(' ', 'T') + 'Z'), t.a, j.textBody, j.htmlBody);
    }
  }
};

async function route(ad, ctx) {
  const { method, body, tok } = ctx;
  const seg = ctx.path.split('/').filter(Boolean);
  if (seg[0] === 'domains') return [200, { 'hydra:member': (await ad.domains()).map(domain => ({ domain, isActive: true })) }];
  if (seg[0] === 'accounts' && method === 'POST') {
    const [u, d] = split(String(body.address || ''));
    const r = await ad.create(u, d, ctx);
    return [201, { id: r.address, address: r.address, token: b64({ ...(r.state || {}), a: r.address }) }];
  }
  if (seg[0] === 'accounts' && method === 'DELETE') return [204];
  if (seg[0] === 'token') {
    return ad.stateless ? [200, { id: body.address, token: b64({ a: body.address }) }]
      : [401, { message: 'Sesi server ini tidak bisa dipulihkan, buat alamat baru' }];
  }
  if (!tok) return [401, { message: 'Token tidak valid' }];
  if (seg[0] === 'messages' && method === 'GET' && !seg[1]) return [200, { 'hydra:member': await ad.list(tok) }];
  if (seg[0] === 'messages' && method === 'GET') return [200, await ad.read(tok, seg[1])];
  if (seg[0] === 'messages' && method === 'DELETE') { if (ad.del) await ad.del(tok, seg[1]); return [204]; }
  return [404, { message: 'Endpoint tidak ditemukan' }];
}

/* ---------- mail.tm & mail.gw (API sama, tinggal diteruskan) ---------- */
async function passthrough(req, res, base, p) {
  const headers = { accept: req.headers.accept || '*/*', 'user-agent': UA };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  const init = { method: req.method, headers };
  if (!['GET', 'HEAD', 'DELETE'].includes(req.method) && req.body !== undefined) {
    headers['content-type'] = req.headers['content-type'] || 'application/json';
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  let r, buf;
  for (let i = 0; i < 2; i++) {
    try {
      r = await fetch(base + p, { ...init, signal: AbortSignal.timeout(8000) });
      buf = Buffer.from(await r.arrayBuffer());
      if (r.status < 500) break;
    } catch (e) { if (i === 1) throw e; }
    await new Promise(t => setTimeout(t, 500));
  }
  if (r.status >= 500) {
    const snip = buf.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
    return res.status(r.status).json({ message: 'Server membalas ' + r.status + (snip ? ': ' + snip : '') });
  }
  const ct = r.headers.get('content-type');
  if (ct) res.setHeader('content-type', ct);
  if (r.status === 204) return res.status(204).end();
  res.status(r.status).send(buf);
}

module.exports = async (req, res) => {
  res.setHeader('x-zt-proxy', '1');
  try {
    const p = String(req.query.p || '');
    const h = String(req.query.h || 'tm');
    if (!p.startsWith('/')) return res.status(400).json({ message: 'Parameter p tidak valid' });
    if (HYDRA[h]) return await passthrough(req, res, HYDRA[h], p);
    const ad = ADAPTERS[h];
    if (!ad) return res.status(400).json({ message: 'Server tidak dikenal: ' + h });
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const auth = (req.headers.authorization || '').replace(/^Bearer /i, '');
    const ctx = {
      method: req.method, path: new URL(p, 'http://x').pathname, body: body || {},
      tok: auth ? unb(auth) : null,
      ip: String(req.headers['x-forwarded-for'] || '127.0.0.1').split(',')[0].trim()
    };
    const [status, json] = await route(ad, ctx);
    if (status === 204) return res.status(204).end();
    res.status(status).json(json);
  } catch (e) {
    res.status(e.status === 401 ? 401 : 502).json({ message: 'Server gagal: ' + e.message });
  }
};
