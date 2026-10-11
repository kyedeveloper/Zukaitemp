const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

const ANIME_BASE = process.env.ANIME_BASE || 'https://anoboy.be';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const animeHttp = axios.create({
    timeout: 15000,
    headers: {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'id-ID,id;q=0.9,en;q=0.8',
        'referer': ANIME_BASE + '/',
    },
});

const cache = new Map();
function cached(key, ttl, fn) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.v);
    return fn().then(v => {
        cache.set(key, { at: Date.now(), v });
        if (cache.size > 200) {
            const now = Date.now();
            for (const [k, v] of cache) if (now - v.at > 10 * 60e3) cache.delete(k);
        }
        return v;
    });
}

app.get('/anime/search', async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.status(400).json({ ok: false, error: 'q kosong' });
    try {
        const data = await cached('s:' + q, 5 * 60e3, async () => {
            for (const type of ['anime', 'posts']) {
                try {
                    const r = await animeHttp.get(`${ANIME_BASE}/wp-json/wp/v2/${type}`, {
                        params: { search: q, per_page: 12, _fields: 'id,title,slug,link' },
                        headers: { accept: 'application/json' },
                    });
                    if (Array.isArray(r.data) && r.data.length) {
                        return r.data.map(x => ({
                            id: x.id,
                            title: (x.title && (x.title.rendered || x.title)) || '',
                            slug: x.slug,
                            link: x.link,
                        }));
                    }
                } catch {}
            }
            return [];
        });
        res.json({ ok: true, data });
    } catch (e) {
        res.status(502).json({ ok: false, error: String(e.message || e).slice(0, 200) });
    }
});

app.get('/anime/episodes', async (req, res) => {
    let targetUrl = '';
    const url = String(req.query.url || '').trim();
    const slug = String(req.query.slug || '').trim();
    if (url && url.startsWith('http')) targetUrl = url;
    else if (slug) targetUrl = `${ANIME_BASE}/anime/${slug}/`;
    else return res.status(400).json({ ok: false, error: 'butuh url atau slug' });

    try {
        const data = await cached('e:' + targetUrl, 10 * 60e3, async () => {
            const candidates = [targetUrl];
            if (slug && !targetUrl.includes('/anime/')) candidates.push(`${ANIME_BASE}/anime/${slug}/`);

            let html = '';
            for (const u of candidates) {
                try {
                    const r = await animeHttp.get(u);
                    if (r.data && r.data.length > 500) { html = r.data; break; }
                } catch {}
            }
            if (!html) throw new Error('Halaman anime tidak bisa dibuka');

            const $ = cheerio.load(html);
            const eps = [];
            const seen = new Set();

            $('a').each((_, el) => {
                const href = $(el).attr('href') || '';
                const text = $(el).text().replace(/\s+/g, ' ').trim();
                if (!href) return;
                if (!/episode|ep[-_\s]?\d/i.test(href) && !/episode|ep[-_\s]?\d/i.test(text)) return;

                const full = href.startsWith('http') ? href : (href.startsWith('/') ? ANIME_BASE + href : `${ANIME_BASE}/${href}`);
                if (!full.includes(ANIME_BASE.replace(/^https?:\/\//, ''))) return;
                if (seen.has(full)) return;
                seen.add(full);

                const m = /(?:episode|ep|eps)\s*[-_.]?\s*(\d+)/i.exec(text) || /(?:episode|ep|eps)\s*[-_.]?\s*(\d+)/i.exec(href) || /(\d+)/.exec(text);
                eps.push({
                    title: text || 'Episode',
                    url: full,
                    num: m ? +m[1] : null,
                });
            });

            if (eps.length > 1 && eps.filter(e => e.num != null).length >= eps.length * 0.5) {
                eps.sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
            }
            return eps;
        });
        res.json({ ok: true, data });
    } catch (e) {
        res.status(502).json({ ok: false, error: String(e.message || e).slice(0, 200) });
    }
});

app.get('/anime/watch', async (req, res) => {
    const url = String(req.query.url || '').trim();
    if (!url || !url.startsWith('http')) return res.status(400).json({ ok: false, error: 'url tidak valid' });

    try {
        const data = await cached('w:' + url, 15 * 60e3, async () => {
            const r = await animeHttp.get(url);
            const html = r.data;
            const $ = cheerio.load(html);

            let embed = null;

            const p = $('#pembed iframe').attr('src');
            if (p) embed = p;

            if (!embed) {
                $('iframe').each((_, el) => {
                    const s = $(el).attr('src') || '';
                    if (/blogger\.com\/video\.g/i.test(s)) { embed = s; return false; }
                });
            }

            if (!embed) {
                $('iframe').each((_, el) => {
                    const s = $(el).attr('src') || '';
                    if (/(embed|player|video)/i.test(s) && !/google|facebook|twitter|disqus/i.test(s)) {
                        embed = s; return false;
                    }
                });
            }

            if (!embed) throw new Error('Embed video tidak ditemukan di halaman ini');
            if (embed.startsWith('//')) embed = 'https:' + embed;

            return { embed, isBlogger: /blogger\.com\/video\.g/i.test(embed) };
        });
        res.json({ ok: true, data });
    } catch (e) {
        res.status(502).json({ ok: false, error: String(e.message || e).slice(0, 200) });
    }
});

app.get('/api/anime', (req, res) => {
    res.json({
        ok: true,
        service: 'Zukai Anime API',
        endpoints: ['/api/anime/anime/search?q=', '/api/anime/anime/episodes?slug=', '/api/anime/anime/watch?url='],
    });
});

module.exports = app;
