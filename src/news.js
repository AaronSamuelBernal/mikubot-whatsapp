
import fs from 'node:fs/promises';
import Parser from 'rss-parser';

const parser = new Parser({ timeout: 10000 });

const CACHE_FILE = new URL('../news-cache.json', import.meta.url);

const FEEDS = [
  {
    name: 'Clarín - Últimas',
    url: 'https://www.clarin.com/rss/lo-ultimo/'
  },
  {
    name: 'Clarín - Tecnología',
    url: 'https://www.clarin.com/rss/tecnologia/'
  },
  {
    name: 'La derecha diario',
    url: 'https://derechadiario.com.ar/rss'
  },
  {
    name: 'Noticias Argentinas',
    url: 'https://noticiasargentinas.com/atom.xml'
  },
  {
    name: 'APFDigital - Nacionales',
    url: 'https://www.apfdigital.com.ar/rss/nacionales/'
  },
  {
    name: 'BBC - Mundo',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml'
  }
];

let articles = [];
let lastUpdated = null;

export async function updateNews() {
  const results = await Promise.allSettled(
    FEEDS.map(async source => {
      const feed = await parser.parseURL(source.url);

      return feed.items.map(item => ({
        title: item.title || '',
        summary: (item.contentSnippet || '')
          .slice(0, 350),
        date: item.isoDate || item.pubDate || '',
        url: item.link || '',
        source: source.name
      }));
    })
  );

  const combined = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      combined.push(...result.value);
    } else {
      console.error('Error RSS:', result.reason.message);
    }
  }

  const cutoff = Date.now() - 7 * 86400000;
  const seen = new Set();

  const fresh = combined
    .filter(item => {
      const timestamp = Date.parse(item.date);
      if (!Number.isFinite(timestamp)) return false;
      if (timestamp < cutoff || timestamp > Date.now()) {
        return false;
      }

      const key = item.url || item.title.toLowerCase();
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 200);

  if (fresh.length === 0) {
    console.warn('Sin noticias nuevas; se conserva el caché.');
    return articles.length;
  }

  articles = fresh;
  lastUpdated = new Date().toISOString();

  await fs.writeFile(
    CACHE_FILE,
    JSON.stringify({ lastUpdated, articles }, null, 2)
  );

  console.log(`RSS actualizado: ${articles.length} noticias`);
  return articles.length;
}

export async function loadNewsCache() {
  try {
    const data = JSON.parse(
      await fs.readFile(CACHE_FILE, 'utf8')
    );
    articles = data.articles || [];
    lastUpdated = data.lastUpdated || null;
  } catch {
    articles = [];
  }
}

export function searchCachedNews(query, limit = 3) {
  const stopwords = new Set([
    'para', 'como', 'pero', 'esta', 'este',
    'sobre', 'donde', 'cuando', 'miku',
    'que', 'los', 'las', 'una', 'con',
    'the', 'and', 'what', 'about'
  ]);

  const terms = query.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]{3,}/g)
    ?.filter(word => !stopwords.has(word)) || [];

  if (!terms.length) return [];

  return articles
    .map(article => {
      const text = (
        article.title + ' ' + article.summary
      ).toLowerCase();

      const score = terms.reduce(
        (total, term) => total + (
          text.includes(term) ? 1 : 0
        ),
        0
      );

      return { article, score };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(result => result.article);
}

export function getNewsStatus() {
  return {
    total: articles.length,
    lastUpdated
  };
}
