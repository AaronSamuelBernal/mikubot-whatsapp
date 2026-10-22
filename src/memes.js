
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'MikuBot/1.0 (RSS reader)'
  }
});

const SOURCES = [
  {
    name: 'ArgentinaBenderStyle',
    url: 'https://www.reddit.com/r/ArgentinaBenderStyle/hot/.rss'
  },
  {
    name: 'Argentina',
    url: 'https://www.reddit.com/r/argentina/hot/.rss'
  },
  {
    name: 'Animemes',
    url: 'https://www.reddit.com/r/Animemes/hot/.rss'
  }
];



// Fuentes temporalmente bloqueadas por Reddit
const blockedUntil = new Map();

// Esperar 6 horas después de un HTTP 429
const RETRY_AFTER_429 = 6 * 60 * 60 * 1000;

// Memes recopilados
let memes = [];

export async function updateMemes() {
const results = await Promise.allSettled(
  SOURCES.map(async source => {
    const retryAt = blockedUntil.get(source.url) || 0;

    if (Date.now() < retryAt) {
      console.log(
        `RSS omitido temporalmente: ${source.name}`
      );

      return [];
    }

    try {
      const feed = await parser.parseURL(source.url);

      blockedUntil.delete(source.url);

      return feed.items.map(item => ({
        title: item.title || '',
        date: item.isoDate || item.pubDate || '',
        url: item.link || '',
        source: source.name
      }));

    } catch (err) {
      if (
        err.message.includes('429') ||
        err.statusCode === 429
      ) {
        blockedUntil.set(
          source.url,
          Date.now() + RETRY_AFTER_429
        );

        console.warn(
          `Reddit limitó ${source.name}. ` +
          'Se reintentará en 6 horas.'
        );
      } else {
        console.error(
          `Error RSS ${source.name}:`,
          err.message
        );
      }

      return [];
    }
  })
);

  const collected = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      collected.push(...result.value);
    } else {
      console.error('Error obteniendo memes:',
        result.reason.message);
    }
  }

  if (collected.length > 0) {
    const unique = new Map(
      collected.map(meme => [meme.url, meme])
    );

    memes = [...unique.values()].slice(0, 100);
  }

  console.log(`Memes disponibles: ${memes.length}`);

  return memes.length;
}

export function searchMemes(query, limit = 3) {
  const terms = query.toLowerCase()
    .match(/[\p{L}\p{N}]{4,}/gu) || [];

  if (!terms.length) return [];

  return memes
    .map(meme => ({
      meme,
      score: terms.filter(term =>
        meme.title.toLowerCase().includes(term)
      ).length
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.meme);
}
