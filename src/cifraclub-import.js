// Cifra Club integration.
//
// Approach: user gives an artist name (and optionally a song title). We normalize
// the artist to a slug and fetch the artist page through a CORS proxy — Cifra Club
// artist pages are server-rendered and include the full song list with links.
// We parse those, rank matches against the song title, present them to the user,
// and on selection fetch the song page and extract the cifra.

const PROXY = 'https://api.allorigins.win/raw?url=';
const BASE = 'https://www.cifraclub.com.br';

const stripDiacritics = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

export function slugifyArtist(name) {
  return stripDiacritics(name).toLowerCase().replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function proxied(url) { return PROXY + encodeURIComponent(url); }

function normalizeText(text) {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function fetchHtml(url) {
  let response;
  try { response = await fetch(proxied(url), {redirect: 'follow'}); }
  catch (error) { const wrapped = Error('proxy_failed'); wrapped.cause = error; throw wrapped; }
  if (response.status === 404) throw Error('not_found');
  if (!response.ok) throw Error(`http_${response.status}`);
  return response.text();
}

export async function searchCifraClub({artist, query = ''}) {
  const slug = slugifyArtist(artist);
  if (!slug) throw Error('missing_artist');
  const html = await fetchHtml(`${BASE}/${slug}/`).catch(err => {
    if (err.message === 'not_found') throw Error('artist_not_found');
    throw err;
  });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const artistName = (doc.querySelector('h1')?.textContent || artist).trim();

  const hrefRe = new RegExp(`^/${slug}/[a-z0-9-]+/$`);
  const bannedSubpaths = /\/(discografia|videos|videoaulas|album|top-100|integrantes|fotos)\//;

  const seen = new Set();
  const results = [];
  for (const a of doc.querySelectorAll(`a[href^="/${slug}/"]`)) {
    const href = a.getAttribute('href') || '';
    if (!hrefRe.test(href) || bannedSubpaths.test(href) || seen.has(href)) continue;
    seen.add(href);
    const title = (a.textContent || '').trim();
    if (!title || title.length > 120) continue;
    results.push({url: `${BASE}${href}`, title, artist: artistName});
  }
  if (!results.length) throw Error('no_songs');

  const q = stripDiacritics(String(query || '').trim().toLowerCase());
  if (!q) return results;

  const scored = results.map(r => {
    const t = stripDiacritics(r.title.toLowerCase());
    let score = 0;
    if (t === q) score = 100;
    else if (t.startsWith(q)) score = 80;
    else if (t.includes(q)) score = 60;
    else {
      const words = q.split(/\s+/).filter(Boolean);
      const hits = words.filter(w => t.includes(w)).length;
      score = hits ? (30 * hits / words.length) : 0;
    }
    return {...r, score};
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export async function fetchCifraFromUrl(url) {
  const clean = String(url || '').trim();
  if (!/^https?:\/\/(www\.)?cifraclub\.com(\.br)?\//i.test(clean)) throw Error('invalid_url');
  const html = await fetchHtml(clean);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pre =
    doc.querySelector('pre.cifra_cnt') ||
    doc.querySelector('pre.js-cifra-content') ||
    doc.querySelector('pre[class*="cifra"]') ||
    doc.querySelector('main pre') ||
    doc.querySelector('article pre') ||
    doc.querySelector('pre');
  if (!pre) throw Error('no_content');
  const cifra = normalizeText(pre.textContent);
  if (!cifra) throw Error('empty_content');
  const title = (doc.querySelector('h1')?.textContent || '').trim();
  const artist =
    (doc.querySelector('.t3 a')?.textContent ||
      doc.querySelector('h2 a')?.textContent ||
      doc.querySelector('meta[name="music:musician"]')?.getAttribute('content') || '').trim();
  return {cifra, title, artist};
}

// Kept for backwards compat with earlier call sites.
export const importFromCifraClub = fetchCifraFromUrl;
