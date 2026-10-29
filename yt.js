const YTMusic = require("ytmusic-api").default;
const ytmusic = new YTMusic();

module.exports = async (req, res) => {
  // Cache hasil pencarian selama 5 menit agar Vercel tidak kelebihan beban
  res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=600');
  try {
    await ytmusic.initialize();
    const q = req.query.q || "";
    const results = await ytmusic.searchSongs(q);
    res.status(200).json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
