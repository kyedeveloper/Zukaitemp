const ytdl = require('@distube/ytdl-core');

module.exports = (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Tidak ada ID lagu' });

  // Beri tahu browser bahwa ini adalah aliran file audio (stream)
  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');

  // Streaming audio terbaik dari YT langsung di-pipe (dialirkan) ke response
  try {
    ytdl('https://www.youtube.com/watch?v=' + id, {
      filter: 'audioonly',
      quality: 'highestaudio'
    }).pipe(res);
  } catch (e) {
    res.status(500).json({ error: 'Gagal memutar lagu' });
  }
};
