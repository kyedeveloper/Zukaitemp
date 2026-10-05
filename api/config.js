// Konfigurasi publik untuk aplikasi: client ID Google, status database, dan peran pengguna (bila membawa token).
const L = require('./_lib');
module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const me = await L.who(req).catch(() => null);
  res.status(200).json({
    googleClientId: L.CID,
    db: L.dbReady(),
    ownerSet: L.OWNERS.length > 0,
    me: me ? { email: me.email, owner: me.owner } : null
  });
};
