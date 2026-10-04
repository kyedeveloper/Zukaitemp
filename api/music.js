// Proxy Deezer (API-nya tidak mengizinkan CORS dari browser).
const UA = 'Mozilla/5.0 (compatible; ZukaiTemp)';
module.exports = async (req, res) => {
  res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=600');
  try {
    const q = String(req.query.q || '').slice(0, 100);
    const url = req.query.kind === 'chart'
      ? 'https://api.deezer.com/chart/0/tracks?limit=30'
      : 'https://api.deezer.com/search?limit=30&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(7000) });
    res.status(r.ok ? 200 : r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
