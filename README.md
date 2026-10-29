# ZukaiTemp

Portal ringan: musik, anime, downloader, tools, email sementara. Tanpa framework, tanpa popup iklan.

## Isi

| Halaman | Fungsi |
| --- | --- |
| `index.html` | Beranda |
| `music.html` | Pemutar musik, antrian, latar belakang, impor Spotify |
| `anime.html` | Jelajah anime, jadwal, daftar, pemilih server |
| `download.html` | Ambil audio dari YouTube |
| `tools.html` | QR, base64, JSON, warna, timestamp |
| `email.html` | Kotak masuk sekali pakai |
| `me.html` | Profil dan preferensi |

## API

| Endpoint | Keterangan |
| --- | --- |
| `GET /api/yt?q=` | Pencarian video, tanpa API key |
| `GET /api/stream?id=` | Proxy audio dengan dukungan Range |
| `GET /api/stream?id=&json=1` | URL audio mentah |
| `GET /api/dl?id=` | Info unduhan |
| `GET /api/anime?a=health` | Status domain sumber |
| `GET /api/anime?a=search&q=` | Cari judul |
| `GET /api/anime?a=episodes&slug=&provider=` | Daftar episode |
| `GET /api/anime?a=watch&url=` | Daftar server embed |
| `GET /api/spotify?q=` | Metadata Spotify, dicocokkan ke YouTube |
| `GET /api/mail?a=create` | Alamat email sementara |

## Env

| Nama | Wajib | Fungsi |
| --- | --- | --- |
| `SPOTIFY_ID` | tidak | Mode Spotify |
| `SPOTIFY_SECRET` | tidak | Mode Spotify |

## Deploy

1. Impor repo ke Vercel.
2. Set env bila memakai mode Spotify.
3. Deploy.

## Catatan

- Respons fungsi dibatasi sekitar 4,5 MB di paket gratis. Lagu panjang bisa terpotong saat diunduh sekaligus; pemutaran normal pakai Range sehingga tetap aman.
- Domain sumber anime sering pindah. Cek `/api/anime?a=health` bila ada yang gagal.

## Lisensi

MIT
