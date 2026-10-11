const ytdl = require('@distube/ytdl-core');

module.exports = async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Tidak ada ID lagu' });

  try {
    // 1. Vercel mengambil metadata rahasia dari YouTube
    const info = await ytdl.getInfo('https://www.youtube.com/watch?v=' + id);
    
    // 2. Vercel mencari link khusus format audio kualitas terbaik
    const format = ytdl.chooseFormat(info.formats, { 
      quality: 'highestaudio', 
      filter: 'audioonly' 
    });
    
    if (format && format.url) {
      // 3. Vercel melempar (redirect) browser HP kamu langsung ke server Google!
      res.redirect(302, format.url);
    } else {
      res.status(404).json({ error: 'Format audio tidak ditemukan' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Gagal memproses lagu: ' + e.message });
  }
};
