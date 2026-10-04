// Proxy Deezer (API-nya tidak mengizinkan CORS dari browser).
const UA = 'Mozilla/5.0 (compatible; ZukaiTemp)';
module.exports = async (req, res) => {
  res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=600');
  try {
    const q = String(req.query.q || '').slice(0, 100);
    const kind = String(req.query.kind || '');
    const id = String(req.query.id || '');
    let url;
    if (kind === 'chart') url = 'https://api.deezer.com/chart/0/tracks?limit=30';
    else if (kind === 'artists') url = 'https://api.deezer.com/chart/0/artists?limit=20';
    else if (kind === 'sartist') url = 'https://api.deezer.com/search/artist?limit=12&q=' + encodeURIComponent(q);
    else if (kind === 'top') {
      if (!/^\d{1,12}$/.test(id)) return res.status(400).json({ error: 'id tidak valid' });
      url = 'https://api.deezer.com/artist/' + id + '/top?limit=50';
    } else url = 'https://api.deezer.com/search?limit=30&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(7000) });
    const j = await r.json();
    if (j && j.error) res.setHeader('cache-control', 'no-store');
    res.status(r.ok ? 200 : r.status).json(j);
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ error: e.message });
  }
};
