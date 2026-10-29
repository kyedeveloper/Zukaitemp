// api/mail.js
const { json, preflight, fetchJson, fetchT, clamp } = require('./_lib');

const BASE = 'https://api.mail.tm';
const HEAD = { 'content-type': 'application/json', accept: 'application/json' };

async function domain() {
  const d = await fetchJson(`${BASE}/domains?page=1`, { headers: HEAD }, 8000);
  const ok = (d['hydra:member'] || []).find(x => x.isActive);
  if (!ok) throw new Error('tidak ada domain aktif');
  return ok.domain;
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  const a = String(req.query.a || 'create');

  try {
    if (a === 'create') {
      const dom = await domain();
      const user = Math.random().toString(36).slice(2, 10);
      const pass = Math.random().toString(36).slice(2, 14);
      const address = `${user}@${dom}`;
      await fetchJson(`${BASE}/accounts`, {
        method: 'POST', headers: HEAD,
        body: JSON.stringify({ address, password: pass }),
      }, 9000);
      const t = await fetchJson(`${BASE}/token`, {
        method: 'POST', headers: HEAD,
        body: JSON.stringify({ address, password: pass }),
      }, 9000);
      return json(res, 200, { ok: true, address, token: t.token, expires: t.expires });
    }

    const token = clamp(req.query.token, 400);
    if (!token) return json(res, 400, { ok: false, error: 'token kosong' });
    const auth = { ...HEAD, authorization: 'Bearer ' + token };

    if (a === 'inbox') {
      const d = await fetchJson(`${BASE}/messages?page=1`, { headers: auth }, 9000);
      const list = (d['hydra:member'] || []).map(m => ({
        id: m.id,
        from: m.from?.address || '',
        subject: m.subject || '(tanpa subjek)',
        intro: m.intro || '',
        at: m.createdAt,
        seen: !!m.seen,
      }));
      return json(res, 200, { ok: true, data: list });
    }

    if (a === 'read') {
      const id = clamp(req.query.id, 80);
      if (!id) return json(res, 400, { ok: false, error: 'id kosong' });
      const m = await fetchJson(`${BASE}/messages/${id}`, { headers: auth }, 9000);
      return json(res, 200, {
        ok: true,
        from: m.from?.address || '',
        subject: m.subject || '',
        at: m.createdAt,
        html: (m.html || []).join('\n'),
        text: m.text || '',
      });
    }

    if (a === 'delete') {
      const id = clamp(req.query.id, 80);
      const r = await fetchT(`${BASE}/messages/${id}`, { method: 'DELETE', headers: auth }, 9000);
      return json(res, r.ok ? 200 : 502, { ok: r.ok });
    }

    json(res, 400, { ok: false, error: 'aksi tidak dikenal' });
  } catch (e) {
    json(res, 502, { ok: false, error: String(e.message).slice(0, 200) });
  }
};
