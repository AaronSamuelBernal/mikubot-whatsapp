
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const IMAGE_DIR = path.join(ROOT, 'images');
const CATALOG_FILE = path.join(IMAGE_DIR, 'catalog.json');
const STATE_FILE = path.join(IMAGE_DIR, 'reddit-state.json');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const USER_AGENT = process.env.REDDIT_USER_AGENT ||
  'MikuBot/1.0 (personal WhatsApp image cache)';

const REDDIT_SOURCES = [
  {
    category: 'argentina',
    subreddit: 'ArgentinaBenderStyle',
    query: '"Ricardo Fort"',
    tags: ['ricardo', 'fort', 'comandante', 'meme']
  },
  {
    category: 'argentina',
    subreddit: 'argentina',
    query: '"Ricardo Fort"',
    tags: ['ricardo', 'fort', 'comandante']
  },
  {
    category: 'argentina',
    subreddit: 'ArgentinaBenderStyle',
    query: 'meme',
    tags: ['argentina', 'meme', 'humor']
  },
  {
    category: 'miku',
    subreddit: 'Vocaloid',
    query: '"Hatsune Miku"',
    tags: ['miku', 'hatsune', 'vocaloid']
  },
  {
    category: 'miku',
    subreddit: 'Animemes',
    query: '"Hatsune Miku"',
    tags: ['miku', 'hatsune', 'anime', 'meme']
  },
  {
    category: 'miku',
    subreddit: 'hatsune',
    query: 'Miku',
    tags: ['miku', 'hatsune', 'reaccion']
  }
];

const STOPWORDS = new Set([
  'para', 'como', 'esta', 'este', 'esto',
  'algo', 'miku', 'mikubot', 'manda',
  'mandame', 'imagen', 'meme', 'foto',
  'reaccion', 'quiero', 'podes', 'puede',
  'hacer', 'sobre', 'unos', 'unas',
  'con', 'los', 'las', 'una', 'que',
  'del', 'por', 'los', 'las'
]);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function terms(text) {
  return (normalize(text).match(/[a-z0-9]{3,}/g) || [])
    .filter(word => !STOPWORDS.has(word));
}

function envNumber(name, fallback, min = 0, max = Infinity) {
  const raw = process.env[name];
  const value = raw === undefined || raw === ''
    ? fallback
    : Number(raw);

  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.floor(value)))
    : fallback;
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const temp = `${file}.tmp`;

  fs.writeFileSync(
    temp,
    JSON.stringify(data, null, 2),
    { mode: 0o600 }
  );

  fs.renameSync(temp, file);
}

function loadCatalog() {
  const data = readJSON(CATALOG_FILE, []);
  return Array.isArray(data) ? data : [];
}

function saveCatalog(entries) {
  writeJSON(CATALOG_FILE, entries);
}

function getFile(entry) {
  if (!entry || typeof entry.file !== 'string') {
    return null;
  }

  const file = path.resolve(IMAGE_DIR, entry.file);

  if (!file.startsWith(IMAGE_DIR + path.sep)) {
    return null;
  }

  if (!/\.(jpg|jpeg|png|webp)$/i.test(file)) {
    return null;
  }

  try {
    const stat = fs.statSync(file);

    if (
      !stat.isFile() ||
      stat.size === 0 ||
      stat.size > MAX_IMAGE_BYTES
    ) {
      return null;
    }

    return file;
  } catch {
    return null;
  }
}

export function getImageCount() {
  return loadCatalog().filter(entry => getFile(entry)).length;
}

export function isImageRequest(text) {
  const value = normalize(text);

  return [
    /\b(manda|mandame|envia|enviame|pasa|pasame|mostra|mostrame|tira|tirame|pone|poneme)\b.{0,80}\b(meme|imagen|foto|reaccion|sticker)\b/,
    /\b(meme|imagen|foto|reaccion)\b.{0,40}\b(de|sobre)\b/,
    /\breacciona\b.{0,40}\b(con|imagen|meme|foto)\b/
  ].some(pattern => pattern.test(value));
}

function requestedCategory(message) {
  const value = normalize(message);

  if (/\b(miku|hatsune|vocaloid)\b/.test(value)) {
    return 'miku';
  }

  if (
    /\b(ricardo|fort|comandante|argentino|argentina)\b/
      .test(value)
  ) {
    return 'argentina';
  }

  return null;
}

export function findImage(message, options = {}) {
  const {
    explicit = false,
    argentinaWeight = 0.65,
    mikuWeight = 0.35,
    excludeIds = []
  } = options;

  const category = requestedCategory(message);
  const queryTerms = terms(message);
  const normalizedMessage = normalize(message);

  const candidates = [];

  for (const entry of loadCatalog()) {
    const file = getFile(entry);

    if (!file) continue;

    // Nunca mezclar Miku con memes argentinos
    // cuando el usuario pidió una categoría concreta.
    if (category && entry.category !== category) {
      continue;
    }

    const title = normalize(entry.title);
    const description = normalize(entry.description);
    const tags = Array.isArray(entry.tags)
      ? entry.tags.map(normalize)
      : [];

    let score = 0;

    for (const term of queryTerms) {
      if (tags.some(tag => tag.includes(term))) {
        score += 4;
      }

      if (title.includes(term)) {
        score += 3;
      }

      if (description.includes(term)) {
        score += 1;
      }
    }

    if (
      entry.category === 'miku' &&
      /\b(miku|hatsune)\b/.test(normalizedMessage)
    ) {
      score += 5;
    }

    if (
      entry.category === 'argentina' &&
      /\b(ricardo|fort|comandante)\b/
        .test(normalizedMessage) &&
      tags.some(tag =>
        ['ricardo', 'fort', 'comandante'].includes(tag)
      )
    ) {
      score += 5;
    }

    // Evitar mandar cualquier imagen ante un
    // pedido abstracto sin coincidencias.
    if (score <= 0) continue;

    const weight = entry.category === 'miku'
      ? mikuWeight
      : argentinaWeight;

    candidates.push({
      ...entry,
      file,
      score: score * (1 + weight)
    });
  }

  const available = candidates.filter(
    entry => !excludeIds.includes(entry.id)
  );

  // Si ya se usaron todas, permitir repetir.
  const pool = available.length ? available : candidates;

  if (!pool.length) return null;

  pool.sort((a, b) => b.score - a.score);

  const topScore = pool[0].score;
  const best = pool.filter(
    entry => entry.score >= topScore * 0.8
  );

  return best[Math.floor(Math.random() * best.length)];
}

function buildRedditURL(source) {
  const params = new URLSearchParams({
    q: source.query,
    restrict_sr: '1',
    sort: 'top',
    t: 'year',
    limit: String(envNumber(
      'REDDIT_IMAGES_RESULTS_PER_QUERY', 15, 1, 25
    ))
  });

  return (
    `https://www.reddit.com/r/` +
    `${encodeURIComponent(source.subreddit)}/search.rss?` +
    params.toString()
  );
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/atom+xml, application/xml, image/*'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, num) =>
      String.fromCodePoint(Number(num))
    );
}

function xmlValue(xml, tag) {
  const match = xml.match(
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      'i'
    )
  );

  if (!match) return '';

  return decodeEntities(
    match[1]
      .replace(/^<!\[CDATA\[/, '')
      .replace(/\]\]>$/, '')
      .trim()
  );
}

function extractImageURL(entry) {
  const content = xmlValue(entry, 'content');

  // Reddit RSS suele incluir HTML escapado
  // con enlaces a las imágenes.
  const urls = [];

  const imageMatches = content.matchAll(
    /(?:src|href)=["'](https?:\/\/[^"']+)["']/gi
  );

  for (const match of imageMatches) {
    urls.push(decodeEntities(match[1]));
  }

  // También contemplar URLs directas.
  const directMatches = content.matchAll(
    /https?:\/\/[^\s"'<>]+/gi
  );

  for (const match of directMatches) {
    urls.push(decodeEntities(match[0]));
  }

  for (const raw of urls) {
    try {
      const url = new URL(raw);

      const hostname = url.hostname.toLowerCase();

      const allowed =
        hostname === 'i.redd.it' ||
        hostname === 'preview.redd.it' ||
        hostname === 'external-preview.redd.it';

      if (!allowed) continue;

      // Excluir videos, GIFs y galerías sin
      // una imagen directa utilizable.
      if (!/\.(jpg|jpeg|png|webp)$/i.test(url.pathname)) {
        continue;
      }

      return url.toString();
    } catch {
      continue;
    }
  }

  return null;
}

function parseFeed(xml, source) {
  const entries = [
    ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)
  ];

  return entries.flatMap(match => {
    const entry = match[1];
    const title = xmlValue(entry, 'title');
    const content = xmlValue(entry, 'content');
    const id = xmlValue(entry, 'id');

    const linkMatch = entry.match(
      /<link\b[^>]*href=["']([^"']+)["']/i
    );

    const permalink = linkMatch
      ? decodeEntities(linkMatch[1])
      : '';

    const imageURL = extractImageURL(entry);

    if (!imageURL) return [];

    // No importar contenido marcado NSFW.
    if (
      /\bnsfw\b/i.test(title) ||
      /over_18|over18/i.test(content)
    ) {
      return [];
    }

    // Para Miku, exigir referencia a Miku
    // o Hatsune en el título.
    if (
      source.category === 'miku' &&
      !/\b(miku|hatsune)\b/i.test(title)
    ) {
      return [];
    }

    return [{
      id,
      title,
      permalink,
      imageURL,
      category: source.category,
      tags: [
        ...new Set([
          ...source.tags,
          ...terms(title)
        ])
      ]
    }];
  });
}

function imageExtension(mime) {
  return {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  }[mime] || null;
}

function validImageSignature(buffer, mime) {
  if (mime === 'image/jpeg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (mime === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      )
    );
  }

  if (mime === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }

  return false;
}

async function downloadImage(url, destination) {
  const response = await fetchWithTimeout(url, 20000);

  if (!response.ok) {
    throw new Error(`Imagen HTTP ${response.status}`);
  }

  const mime = (
    response.headers.get('content-type') || ''
  ).split(';')[0].trim().toLowerCase();

  const ext = imageExtension(mime);

  if (!ext) {
    throw new Error(`Formato no admitido: ${mime}`);
  }

  const length = Number(
    response.headers.get('content-length') || 0
  );

  if (length > MAX_IMAGE_BYTES) {
    throw new Error('Imagen mayor a 5 MB');
  }

  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('Respuesta sin contenido');
  }

  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.length;

      if (total > MAX_IMAGE_BYTES) {
        throw new Error('Imagen mayor a 5 MB');
      }

      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const buffer = Buffer.concat(chunks);

  if (!validImageSignature(buffer, mime)) {
    throw new Error('Archivo de imagen inválido');
  }

  const filename = destination + ext;

  fs.mkdirSync(
    path.dirname(filename),
    { recursive: true }
  );

  fs.writeFileSync(filename, buffer, {
    flag: 'wx'
  });

  return filename;
}

let updating = false;

export async function updateImages() {
  if (updating) return getImageCount();

  updating = true;

  try {
    const now = Date.now();

    const state = readJSON(STATE_FILE, {
      blockedUntil: 0
    });

    if (now < (state.blockedUntil || 0)) {
      console.log(
        'Reddit imágenes en espera por límite HTTP 429.'
      );

      return getImageCount();
    }

    const maxPerUpdate = envNumber(
      'REDDIT_IMAGES_MAX_PER_UPDATE', 10, 1, 50
    );

    const maxTotal = envNumber(
      'IMAGES_MAX_TOTAL', 120, 1, 1000
    );

    const backoffHours = envNumber(
      'REDDIT_IMAGES_BACKOFF_HOURS', 6, 1, 48
    );

    const catalog = loadCatalog();
    const knownIds = new Set(
      catalog.map(entry => entry.id)
    );

    let downloaded = 0;
    let rateLimited = false;

    for (const source of REDDIT_SOURCES) {
      if (
        downloaded >= maxPerUpdate ||
        catalog.length >= maxTotal
      ) {
        break;
      }

      const url = buildRedditURL(source);

      console.log(
        `Buscando imágenes en r/${source.subreddit}: ` +
        source.query
      );

      try {
        const response = await fetchWithTimeout(url);

        if (response.status === 429) {
          const retryAfter = Number(
            response.headers.get('retry-after') || 0
          );

          const waitMs = Math.max(
            backoffHours * 3600000,
            retryAfter * 1000
          );

          state.blockedUntil = Date.now() + waitMs;
          writeJSON(STATE_FILE, state);

          console.warn(
            `Reddit HTTP 429. Esperando ${Math.ceil(waitMs / 3600000)} horas.`
          );

          rateLimited = true;
          break;
        }

        if (!response.ok) {
          throw new Error(
            `RSS HTTP ${response.status}`
          );
        }

        const xml = await response.text();

        if (
          !xml.includes('<feed') &&
          !xml.includes('<entry')
        ) {
          throw new Error(
            'La respuesta no parece un feed Atom'
          );
        }

        const posts = parseFeed(xml, source);

        console.log(
          `Publicaciones con imagen: ${posts.length}`
        );

        for (const post of posts) {
          if (
            downloaded >= maxPerUpdate ||
            catalog.length >= maxTotal
          ) {
            break;
          }

          const id = crypto
            .createHash('sha256')
            .update(post.id || post.permalink || post.imageURL)
            .digest('hex')
            .slice(0, 20);

          if (knownIds.has(id)) continue;

          const relativeBase = path.join(
            source.category,
            `reddit-${id}`
          );

          const absoluteBase = path.join(
            IMAGE_DIR,
            relativeBase
          );

          try {
            const savedFile = await downloadImage(
              post.imageURL,
              absoluteBase
            );

            const relativeFile = path.relative(
              IMAGE_DIR,
              savedFile
            );

            catalog.push({
              id,
              file: relativeFile,
              category: post.category,
              title: post.title,
              description:
                `Imagen de Reddit r/${source.subreddit}`,
              tags: post.tags,
              source: post.permalink,
              imageURL: post.imageURL
            });

            knownIds.add(id);
            saveCatalog(catalog);

            downloaded++;

            console.log(
              `Imagen guardada: ${relativeFile}`
            );

          } catch (err) {
            console.warn(
              `No se pudo descargar ${post.title}: ${err.message}`
            );
          }
        }

      } catch (err) {
        console.warn(
          `Error r/${source.subreddit}: ${err.message}`
        );
      }

      if (rateLimited) break;

      // Espaciar solicitudes entre fuentes.
      await new Promise(resolve =>
        setTimeout(resolve, 2500)
      );
    }

    console.log(
      `Imágenes descargadas: ${downloaded}. ` +
      `Disponibles: ${getImageCount()}`
    );

    return getImageCount();

  } finally {
    updating = false;
  }
}
