# MikuBot

Bot de WhatsApp con personalidad inspirada en **Hatsune Miku**, humor argentino y estilo conversacional informal, impulsado por un modelo local de **Ollama**. Participa en un grupo autorizado, puede incorporar noticias RSS y referencias de memes, y enviar imágenes almacenadas localmente a partir de búsquedas en Reddit.

> Proyecto personal/experimental. No es un bot oficial de Hatsune Miku ni está afiliado a WhatsApp, Reddit u Ollama.

## Características

- **WhatsApp:** conexión mediante `@whiskeysockets/baileys`, con lista de grupos autorizados.
- **IA local:** respuestas generadas por Ollama (configuración de ejemplo: `qwen3.5:4b-16k`).
- **Personalidad editable:** definida en `personality.md`; MikuBot es sarcástica, otaku, espontánea y habla en español argentino.
- **Contexto conversacional:** historial local para mantener continuidad en las respuestas.
- **Noticias:** RSS de actualidad argentina como contexto cuando corresponde.
- **Memes:** referencias obtenidas desde Reddit, sujetas a límites de acceso.
- **Imágenes:** catálogo local de memes argentinos e imágenes de Miku descargadas desde Reddit; envío como imágenes reales por WhatsApp.
- **Controles:** probabilidades, cooldowns y límites por hora para respuestas e imágenes.
- **Proceso persistente:** puede administrarse con PM2.

## Requisitos

- Node.js moderno con soporte para `fetch` nativo (recomendado Node.js 20 o superior).
- npm.
- Ollama instalado y ejecutándose.
- Modelo descargado en Ollama.
- Una sesión de WhatsApp para vincular mediante QR.
- Acceso a Internet para WhatsApp, noticias y consultas a Reddit.

**Hardware de referencia:** Windows con WSL Ubuntu, NVIDIA RTX 3070 de 8 GB y 32 GB de RAM. No es un requisito estricto: el rendimiento depende del modelo elegido.

## Instalación

Desde el directorio del proyecto:

```bash
npm install
ollama pull qwen3.5:4b-16k
```

Asegurate de que Ollama esté disponible:

```bash
curl http://127.0.0.1:11434/api/tags
```

Creá o editá `.env` en la raíz del proyecto. No publiques este archivo si contiene identificadores privados.

## Configuración (`.env`)

Ejemplo orientativo basado en la configuración actual. Algunas opciones dependen de la versión de `src/index.js` y `src/images.js` instalada.

```dotenv
BOT_NAME=MikuBot
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:4b-16k

# Solo procesa mensajes de los grupos indicados.
ALLOWED_GROUPS=TU_GRUPO@g.us
SEND_ENABLED=true

# Participación en conversaciones.
REPLY_PROBABILITY=0.80
COOLDOWN_SECONDS=10
MAX_REPLIES_PER_HOUR=60
MAX_CONTEXT_MESSAGES=30

# Mensajes no solicitados.
SPONTANEOUS_ENABLED=false
SPONTANEOUS_MIN_MINUTES=30
SPONTANEOUS_MAX_MINUTES=90

# Noticias RSS.
NEWS_ENABLED=true
NEWS_UPDATE_MINUTES=30
NEWS_MAX_AGE_DAYS=7
NEWS_MAX_ARTICLES=300
NEWS_CONTEXT_RESULTS=3
NEWS_REGION=AR

# Referencias de memes.
MEMES_ENABLED=true
MEMES_UPDATE_MINUTES=360

# Imágenes.
IMAGES_ENABLED=true
IMAGE_ONLY_ON_REQUEST=false
IMAGE_PROBABILITY=0.25
MAX_IMAGES_PER_HOUR=8
IMAGE_COOLDOWN_MINUTES=5
ARGENTINA_MEME_WEIGHT=0.35
MIKU_REACTION_WEIGHT=0.65
IMAGES_UPDATE_HOURS=12
IMAGES_MAX_TOTAL=120

# Recolector Reddit para imágenes.
REDDIT_IMAGES_MAX_PER_UPDATE=10
REDDIT_IMAGES_RESULTS_PER_QUERY=15
REDDIT_IMAGES_BACKOFF_HOURS=6
ARGENTINA_IMAGE_PROVIDER=reddit
MIKU_IMAGE_PROVIDER=reddit
```

### Notas sobre las variables

- `REPLY_PROBABILITY=1` significa intentar responder a todos los mensajes *elegibles*, sujeto a los demás controles.
- `IMAGE_ONLY_ON_REQUEST=false` permite intentar enviar imágenes sin un pedido explícito; la selección sigue dependiendo de que haya una coincidencia en el catálogo.
- `IMAGES_UPDATE_HOURS` es el nombre de variable usado por el temporizador del `index.js` revisado; **`REDDIT_IMAGES_UPDATE_HOURS` no lo reemplaza**.
- En la versión de `images.js` documentada, `REDDIT_IMAGES_MAX_PER_UPDATE` limita las descargas por ejecución y `IMAGES_MAX_TOTAL` limita el catálogo global. Las fuentes procesadas primero pueden agotar el cupo antes de llegar a las demás.
- `ARGENTINA_IMAGE_PROVIDER` y `MIKU_IMAGE_PROVIDER` expresan la fuente deseada, pero en el `images.js` que usa Reddit exclusivamente **no seleccionan proveedores dinámicamente**.
- El límite efectivo de `MAX_CONTEXT_MESSAGES` puede estar restringido en `index.js`, aunque `.env` tenga un número mayor.
- Evitá definir una misma variable dos veces en `.env`.

## Personalidad: estilo Kohai, identidad Miku

La personalidad se configura en **`personality.md`**, sin modificar la lógica de WhatsApp. El enfoque combina la identidad de Hatsune Miku con una dinámica de grupo más natural, inspirada en el estilo conversacional de Kohai.

**Principios:**

- Hablar en español argentino, con respuestas generalmente breves.
- Ser sarcástica, competitiva, dramática y cariñosa según el contexto.
- Participar como una amiga del grupo, no como una asistente que ofrece ayuda.
- Usar humor absurdo, referencias otaku y memes argentinos **solo cuando encajen**.
- No forzar un remate ni un insulto en cada respuesta.
- Mostrar empatía ante problemas reales.
- No inventar recuerdos, noticias, acciones ni imágenes enviadas.
- No usar emojis, hashtags ni firmas si así se establece en `personality.md`.

Ejemplos de tono (no deben repetirse literalmente):

> **Usuario:** «Miku, sos hermosa».  
> **MikuBot:** «Ya sé. Pero seguí, no te interrumpo».

> **Usuario:** «Hoy tuve un día horrible».  
> **MikuBot:** «Uh, qué pasó? Contame».

> **Usuario:** «Tengo sueño».  
> **MikuBot:** «Y dormí, boludo».

Para experimentar con variedad de respuestas, si el código envía opciones a Ollama, se puede probar:

```javascript
options: {
  temperature: 0.85,
  top_p: 0.9,
  repeat_penalty: 1.12,
  num_predict: 300
}
```

Esto es **una sugerencia de ajuste**, no una configuración aplicada automáticamente. Temperaturas más altas pueden aumentar la creatividad y también los errores.

## Fuentes de imágenes de Reddit

El recolector `src/images.js` usa fuentes con una estructura uniforme:

```javascript
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
    tags: ['ricardo', 'fort', 'argentina']
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
    tags: ['miku', 'hatsune', 'meme']
  },
  {
    category: 'miku',
    subreddit: 'hatsune',
    query: 'Miku',
    tags: ['miku', 'hatsune', 'reaccion']
  }
];
```

Cada entrada tiene una **categoría**, un subreddit, una consulta y etiquetas. Buscar «Miku» dentro de un subreddit amplio es preferible a descargar indiscriminadamente `/hot/.rss`.

### Flujo

1. `updateImages()` consulta las fuentes RSS de Reddit.
2. Analiza las publicaciones y extrae URLs directas de imágenes compatibles.
3. Descarga JPG, PNG o WebP con controles de tamaño y firma de archivo.
4. Guarda archivos en `images/argentina/` o `images/miku/`.
5. Registra metadatos y etiquetas en `images/catalog.json`.
6. `findImage()` elige una imagen según el pedido, las categorías y los identificadores excluidos.
7. `index.js` la envía por WhatsApp si los controles del grupo lo permiten.

**Limitaciones conocidas:**

- Reddit puede responder con `429 Too Many Requests` o restringir los RSS; no se garantiza disponibilidad continua. El módulo guarda un período de espera en `images/reddit-state.json`.
- El recolector de referencias `memes.js` y el de imágenes pueden recibir límites de forma independiente.
- No todas las publicaciones incluyen imágenes directas; galerías, GIFs y videos pueden quedar fuera.
- Los títulos y etiquetas no prueban que la imagen represente realmente a Miku o que sea un meme de Ricardo Fort.
- El cupo global y el orden de fuentes pueden dejar una categoría sin descargas. Una mejora pendiente es reservar cupos separados por categoría.
- Las imágenes de Reddit pertenecen a sus respectivos autores; verificá permisos y condiciones de reutilización antes de redistribuirlas fuera de un contexto privado.

## Estructura del proyecto

```text
whatsapp-ollama-bot/
├── src/
│   ├── index.js          # WhatsApp, mensajes, Ollama y temporizadores
│   ├── news.js           # Noticias RSS
│   ├── memes.js          # Referencias de memes
│   └── images.js         # Descarga, catálogo y selección de imágenes
├── images/
│   ├── argentina/        # Memes e imágenes argentinas
│   ├── miku/             # Imágenes de Hatsune Miku
│   ├── catalog.json      # Índice local
│   └── reddit-state.json # Estado del backoff
├── session/              # Credenciales locales de WhatsApp
├── personality.md        # Identidad y estilo de MikuBot
├── history.json          # Historial local
├── news-cache.json       # Caché de noticias
├── .env                  # Configuración local
└── package.json
```

Algunos archivos y carpetas se crean durante la ejecución. No todos tienen que existir inicialmente.

## Ejecución

```bash
npm start
```

En el primer inicio, seguí las instrucciones para vincular WhatsApp. En los siguientes arranques debería reutilizarse la sesión local mientras siga siendo válida.

### Comprobar la biblioteca de imágenes

```bash
node --check src/images.js
node --check src/index.js

node --input-type=module <<'EOF'
import { updateImages, getImageCount, findImage } from './src/images.js';

await updateImages();
console.log('Imágenes disponibles:', getImageCount());
console.log('Fort:', findImage('mandame un meme de Ricardo Fort', { explicit: true }));
console.log('Miku:', findImage('mandame una imagen de Miku', { explicit: true }));
