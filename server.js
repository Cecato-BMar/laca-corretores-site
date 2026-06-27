const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "content.json");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");

const PORT = Number(process.env.PORT || 3000);
const SITE_URL = normalizeSiteUrl(process.env.SITE_URL || `http://localhost:${PORT}`);
const ADMIN_PASSWORD = process.env.LACA_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "Laca@2026";
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 80) * 1024 * 1024;
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const ASSET_VERSION = "20260622-fit-gallery";
const BLOB_DB_PATH = process.env.LACA_BLOB_DB_PATH || "laca/data/content.json";
const BLOB_DB_ACCESS = process.env.LACA_BLOB_DB_ACCESS || "private";
const BLOB_UPLOAD_PREFIX = process.env.LACA_BLOB_UPLOAD_PREFIX || "laca/uploads";

const loginAttempts = new Map();
let blobSdkPromise = null;

const COMPANY = {
  name: "Laca Corretores Imobiliários",
  shortName: "Laca Corretores",
  city: "Praia Grande",
  state: "SP",
  region: "Baixada Santista",
  phoneDouglas: "+5513991802430",
  phoneMarcelo: "+5513996333069",
  whatsappDouglas: "https://wa.me/5513991802430",
  whatsappMarcelo: "https://wa.me/5513996333069",
  logo: "/assets/laca-logo.png",
  hero: "/assets/praia-grande-orla.jpg"
};

const SERVICES = [
  {
    title: "Compra e venda",
    text: "Intermediação completa para imóveis residenciais e comerciais em Praia Grande e Baixada Santista.",
    tag: "Negociação segura"
  },
  {
    title: "Avaliação de imóveis",
    text: "Leitura de mercado, bairro, liquidez, documentação e características do imóvel para orientar preço justo.",
    tag: "Preço com contexto"
  },
  {
    title: "Assessoria documental",
    text: "Acompanhamento de matrícula, certidões, financiamento, cartório e etapas burocráticas da negociação.",
    tag: "Do início ao fim"
  },
  {
    title: "Imóveis na praia",
    text: "Curadoria para moradia, veraneio e investimento em bairros estratégicos da orla de Praia Grande.",
    tag: "Especialistas locais"
  }
];

const NEIGHBORHOODS = [
  "Canto do Forte",
  "Boqueirão",
  "Guilhermina",
  "Aviação",
  "Tupi",
  "Ocian",
  "Caiçara",
  "Solemar"
];

const FAQS = [
  {
    q: "A Laca Corretores atende somente Praia Grande?",
    a: "A atuação principal é em Praia Grande SP, com leitura local dos bairros da orla e atendimento também para oportunidades na Baixada Santista."
  },
  {
    q: "Como saber se o preço de um imóvel está justo?",
    a: "A análise considera localização, documentação, conservação, posição solar, condomínio, liquidez do bairro e comparação com imóveis equivalentes."
  },
  {
    q: "O site permite divulgar vídeos de imóveis?",
    a: "Sim. O painel administrativo permite cadastrar vídeos por upload local ou por link do YouTube em cada postagem."
  },
  {
    q: "Por que publicar guias e posts melhora o SEO?",
    a: "Conteúdo local ajuda o Google a entender autoridade por tema e região, além de responder dúvidas reais de compradores e vendedores."
  }
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function normalizeSiteUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function absoluteUrl(urlPath) {
  if (!urlPath) return SITE_URL;
  if (/^https?:\/\//i.test(urlPath)) return urlPath;
  return `${SITE_URL}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function stripHtml(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value, max = 156) {
  const text = stripHtml(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || `post-${Date.now()}`;
}

function uniqueSlug(base, posts, selfId) {
  const cleanBase = slugify(base);
  let candidate = cleanBase;
  let index = 2;
  while (posts.some((post) => post.slug === candidate && post.id !== selfId)) {
    candidate = `${cleanBase}-${index}`;
    index += 1;
  }
  return candidate;
}

function nowIso() {
  return new Date().toISOString();
}

function formatDate(dateValue) {
  if (!dateValue) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date(dateValue));
}

function estimateReadTime(body = "") {
  const words = stripHtml(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

async function ensureRuntime() {
  if (usesBlobStorage()) {
    await ensureBlobDb();
    return;
  }

  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    await fsp.access(DB_PATH);
  } catch {
    await writeDb({ posts: [], properties: [] });
  }
}

async function readDb() {
  if (usesBlobStorage()) return readBlobDb();

  const raw = await fsp.readFile(DB_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return {
    posts: Array.isArray(parsed.posts) ? parsed.posts : [],
    properties: Array.isArray(parsed.properties) ? parsed.properties : []
  };
}

async function writeDb(data) {
  if (usesBlobStorage()) {
    await writeBlobDb(data);
    return;
  }

  const tmp = `${DB_PATH}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fsp.rename(tmp, DB_PATH);
}

function usesBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function getBlobSdk() {
  if (!blobSdkPromise) blobSdkPromise = import("@vercel/blob");
  return blobSdkPromise;
}

async function ensureBlobDb() {
  const existing = await getBlobDbResult();
  if (existing) return;

  await writeBlobDb(await readLocalSeedDb());
}

async function readLocalSeedDb() {
  try {
    const raw = await fsp.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      properties: Array.isArray(parsed.properties) ? parsed.properties : []
    };
  } catch {
    return { posts: [], properties: [] };
  }
}

async function getBlobDbResult() {
  const { get } = await getBlobSdk();
  try {
    const result = await get(BLOB_DB_PATH, { access: BLOB_DB_ACCESS });
    return result?.statusCode === 200 ? result : null;
  } catch (error) {
    if (error?.name === "BlobNotFoundError") return null;
    throw error;
  }
}

async function readBlobDb() {
  const result = await getBlobDbResult();
  if (!result?.stream) {
    const seed = await readLocalSeedDb();
    await writeBlobDb(seed);
    return seed;
  }

  const raw = await new Response(result.stream).text();
  const parsed = JSON.parse(raw);
  return {
    posts: Array.isArray(parsed.posts) ? parsed.posts : [],
    properties: Array.isArray(parsed.properties) ? parsed.properties : []
  };
}

async function writeBlobDb(data) {
  const { put } = await getBlobSdk();
  await put(BLOB_DB_PATH, `${JSON.stringify(data, null, 2)}\n`, {
    access: BLOB_DB_ACCESS,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json"
  });
}

function getPublishedPosts(db) {
  return db.posts
    .filter((post) => post.status === "published")
    .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));
}

function getPublishedProperties(db) {
  return db.properties
    .filter((property) => property.status === "published")
    .sort((a, b) => {
      if (Boolean(a.featured) !== Boolean(b.featured)) return b.featured ? 1 : -1;
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });
}

function parseJsonBody(req, maxBytes = 1024 * 1024) {
  return readRawBody(req, maxBytes).then((buffer) => {
    if (!buffer.length) return {};
    return JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, ""));
  });
}

function readRawBody(req, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error("Arquivo ou requisição acima do limite."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const cookie = req.headers.cookie || "";
  return Object.fromEntries(
    cookie
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
      })
  );
}

function safeTimingEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionSecret() {
  return process.env.LACA_SESSION_SECRET || crypto.createHash("sha256").update(`laca-session:${ADMIN_PASSWORD}`).digest("hex");
}

function signSessionPayload(payload) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function createSession() {
  const payload = Buffer.from(JSON.stringify({
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    nonce: crypto.randomBytes(16).toString("hex")
  })).toString("base64url");
  return `${payload}.${signSessionPayload(payload)}`;
}

function getSession(req) {
  const token = parseCookies(req).laca_session;
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeTimingEqual(signature, signSessionPayload(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isFinite(session.expiresAt) || session.expiresAt < Date.now()) return null;
    return { token, session };
  } catch {
    return null;
  }
}

function isAdmin(req) {
  return Boolean(getSession(req));
}

function authGuard(req, res) {
  if (isAdmin(req)) return true;
  sendJson(res, 401, { error: "Sessão expirada. Faça login novamente." });
  return false;
}

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").toString().split(",")[0].trim();
}

function loginAllowed(req) {
  const ip = clientIp(req);
  const entry = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  if (entry.blockedUntil > Date.now()) return false;
  return true;
}

function recordLoginFailure(req) {
  const ip = clientIp(req);
  const entry = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= 8) {
    entry.blockedUntil = Date.now() + 1000 * 60 * 10;
  }
  loginAttempts.set(ip, entry);
}

function clearLoginFailures(req) {
  loginAttempts.delete(clientIp(req));
}

function send(res, statusCode, body, contentType = "text/html; charset=utf-8", headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    ...headers
  });
  res.end(body);
}

function sendJson(res, statusCode, payload, headers = {}) {
  send(res, statusCode, JSON.stringify(payload), "application/json; charset=utf-8", headers);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function normalizePostInput(input, db, existing = null) {
  const createdAt = existing?.createdAt || nowIso();
  const status = input.status === "published" ? "published" : "draft";
  const title = String(input.title || "").trim();
  const body = String(input.body || "").trim();
  const excerpt = String(input.excerpt || "").trim() || truncate(body, 150);

  if (!title) throw Object.assign(new Error("Informe um título."), { statusCode: 400 });
  if (!body) throw Object.assign(new Error("Informe o conteúdo da postagem."), { statusCode: 400 });

  const id = existing?.id || `post-${crypto.randomUUID()}`;
  const slugBase = input.slug ? input.slug : title;
  const slug = uniqueSlug(slugBase, db.posts, id);
  const publishedAt = status === "published" ? existing?.publishedAt || input.publishedAt || nowIso() : existing?.publishedAt || "";

  return {
    id,
    title,
    slug,
    excerpt,
    body,
    category: String(input.category || "Mercado imobiliário").trim(),
    neighborhood: String(input.neighborhood || "Praia Grande").trim(),
    tags: normalizeTags(input.tags),
    status,
    featured: Boolean(input.featured),
    coverImage: sanitizeMediaUrl(input.coverImage) || COMPANY.hero,
    mediaType: ["none", "youtube", "upload"].includes(input.mediaType) ? input.mediaType : "none",
    youtubeUrl: String(input.youtubeUrl || "").trim(),
    uploadUrl: sanitizeMediaUrl(input.uploadUrl),
    seoTitle: String(input.seoTitle || title).trim().slice(0, 80),
    seoDescription: String(input.seoDescription || excerpt).trim().slice(0, 180),
    author: String(input.author || COMPANY.shortName).trim(),
    createdAt,
    updatedAt: nowIso(),
    publishedAt
  };
}

function normalizePropertyInput(input, db, existing = null) {
  const createdAt = existing?.createdAt || nowIso();
  const status = input.status === "published" ? "published" : "draft";
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  const price = numberValue(input.price);

  if (!title) throw Object.assign(new Error("Informe o título do imóvel."), { statusCode: 400 });
  if (!description) throw Object.assign(new Error("Informe a descrição do imóvel."), { statusCode: 400 });
  if (!price || price < 1) throw Object.assign(new Error("Informe o valor de venda."), { statusCode: 400 });

  const id = existing?.id || `property-${crypto.randomUUID()}`;
  const slug = uniqueSlug(input.slug || title, db.properties, id);
  const publishedAt = status === "published" ? existing?.publishedAt || input.publishedAt || nowIso() : existing?.publishedAt || "";
  const images = normalizeImages(input.images, sanitizeMediaUrl(input.coverImage) || COMPANY.hero);
  const usableArea = numberValue(input.usableArea);
  const totalArea = numberValue(input.totalArea);
  const bedrooms = intValue(input.bedrooms);
  const suites = intValue(input.suites);
  const bathrooms = intValue(input.bathrooms);
  const parkingSpaces = intValue(input.parkingSpaces);
  const neighborhood = String(input.neighborhood || "Praia Grande").trim();
  const propertyType = String(input.propertyType || "Apartamento").trim();

  return {
    id,
    title,
    slug,
    reference: String(input.reference || "").trim() || `LACA-${String(Date.now()).slice(-5)}`,
    status,
    featured: Boolean(input.featured),
    saleStatus: ["available", "reserved", "sold"].includes(input.saleStatus) ? input.saleStatus : "available",
    propertyType,
    price,
    condoFee: numberValue(input.condoFee),
    iptu: numberValue(input.iptu),
    usableArea,
    totalArea,
    bedrooms,
    suites,
    bathrooms,
    parkingSpaces,
    floor: String(input.floor || "").trim(),
    furnished: Boolean(input.furnished),
    acceptsFinancing: Boolean(input.acceptsFinancing),
    acceptsExchange: Boolean(input.acceptsExchange),
    address: String(input.address || "").trim(),
    neighborhood,
    city: String(input.city || COMPANY.city).trim(),
    state: String(input.state || COMPANY.state).trim(),
    distanceToBeach: String(input.distanceToBeach || "").trim(),
    mapUrl: sanitizeExternalUrl(input.mapUrl),
    shortDescription: String(input.shortDescription || "").trim() || truncate(description, 150),
    description,
    highlights: normalizeList(input.highlights).slice(0, 8),
    features: normalizeList(input.features).slice(0, 30),
    nearby: normalizeList(input.nearby).slice(0, 18),
    coverImage: images[0] || COMPANY.hero,
    images,
    mediaType: ["none", "youtube", "upload"].includes(input.mediaType) ? input.mediaType : "none",
    youtubeUrl: String(input.youtubeUrl || "").trim(),
    uploadUrl: sanitizeMediaUrl(input.uploadUrl),
    seoTitle: String(input.seoTitle || `${propertyType} à venda em ${neighborhood}, Praia Grande`).trim().slice(0, 80),
    seoDescription: String(input.seoDescription || `${title}. ${formatCurrency(price)} em ${neighborhood}, Praia Grande SP, com ${bedrooms} dormitórios, ${parkingSpaces} vagas e atendimento da Laca Corretores.`).trim().slice(0, 180),
    createdAt,
    updatedAt: nowIso(),
    publishedAt
  };
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12);
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeImages(value, fallback = "") {
  const images = normalizeList(value)
    .map(sanitizeMediaUrl)
    .filter(Boolean);
  if (fallback && !images.includes(fallback)) images.unshift(fallback);
  return [...new Set(images)].slice(0, 16);
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function intValue(value) {
  return Math.max(0, Math.round(numberValue(value)));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatArea(value) {
  return value ? `${new Intl.NumberFormat("pt-BR").format(value)} m²` : "";
}

function sanitizeMediaUrl(value = "") {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("/uploads/") || url.startsWith("/assets/")) return url;
  if (/^https:\/\/[^\s]+$/i.test(url)) return url;
  return "";
}

function sanitizeExternalUrl(value = "") {
  const url = String(value || "").trim();
  if (!url) return "";
  return /^https:\/\/[^\s]+$/i.test(url) ? url : "";
}

function youtubeId(url = "") {
  const value = String(url || "").trim();
  if (!value) return "";
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/watch\?[^#]*v=([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function youtubeEmbed(url = "") {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : "";
}

function bodyToHtml(body = "") {
  const blocks = String(body)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      if (/^#{2,3}\s+/.test(block)) {
        const level = block.startsWith("###") ? "h3" : "h2";
        return `<${level}>${escapeHtml(block.replace(/^#{2,3}\s+/, ""))}</${level}>`;
      }
      const safe = escapeHtml(block).replace(/\n/g, "<br>");
      return `<p>${safe}</p>`;
    })
    .join("\n");
}

function layout({ title, description, canonical, image = COMPANY.hero, type = "website", body, schemas = [], admin = false }) {
  const fullTitle = title.includes(COMPANY.shortName) ? title : `${title} | ${COMPANY.shortName}`;
  const desc = truncate(description, 160);
  const canonicalUrl = absoluteUrl(canonical);
  const imageUrl = absoluteUrl(image || COMPANY.hero);
  const schemaTags = schemas
    .filter(Boolean)
    .map((schema) => `<script type="application/ld+json">${safeJson(schema)}</script>`)
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeAttr(desc)}">
  <meta name="robots" content="${admin ? "noindex,nofollow" : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"}">
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
  <link rel="icon" href="/assets/laca-logo.png">
  <meta name="theme-color" content="#0d1b2a">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:type" content="${escapeAttr(type)}">
  <meta property="og:site_name" content="${escapeAttr(COMPANY.name)}">
  <meta property="og:title" content="${escapeAttr(fullTitle)}">
  <meta property="og:description" content="${escapeAttr(desc)}">
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}">
  <meta property="og:image" content="${escapeAttr(imageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(fullTitle)}">
  <meta name="twitter:description" content="${escapeAttr(desc)}">
  <meta name="twitter:image" content="${escapeAttr(imageUrl)}">
  <link rel="preload" href="/assets/praia-grande-orla.jpg" as="image">
  <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}">
  ${schemaTags}
</head>
<body>
${body}
<script src="/site.js?v=${ASSET_VERSION}" defer></script>
</body>
</html>`;
}

function publicHeader() {
  return `<header class="site-header" data-header>
  <a class="brand" href="/" aria-label="Laca Corretores">
    <img src="/assets/laca-logo.png" alt="Logo Laca Corretores" width="52" height="52">
    <span>
      <strong>Laca Corretores</strong>
      <small>Imobiliários em Praia Grande</small>
    </span>
  </a>
  <button class="nav-toggle" type="button" aria-label="Abrir menu" data-nav-toggle>
    <span></span><span></span><span></span>
  </button>
  <nav class="site-nav" data-nav>
    <a href="/#sobre">Quem somos</a>
    <a href="/#servicos">Serviços</a>
    <a href="/imoveis">Imóveis à venda</a>
    <a href="/blog">Guias e posts</a>
    <a href="/#bairros">Bairros</a>
    <a class="nav-pill" href="/#contato">Fale conosco</a>
  </nav>
</header>`;
}

function publicFooter() {
  return `<footer class="site-footer">
  <div class="footer-grid">
    <div>
      <img src="/assets/laca-logo.png" alt="" class="footer-logo">
      <h2>Laca Corretores Imobiliários</h2>
      <p>Douglas e Marcelo Lacalentola. Corretores registrados pelo CRECISP, com atuação local em Praia Grande SP.</p>
    </div>
    <div>
      <h3>Atendimento</h3>
      <a href="${COMPANY.whatsappDouglas}" target="_blank" rel="noopener">Douglas: (13) 99180-2430</a>
      <a href="${COMPANY.whatsappMarcelo}" target="_blank" rel="noopener">Marcelo: (13) 99633-3069</a>
      <a href="/imoveis">Imóveis à venda</a>
      <a href="/admin">Área administrativa</a>
    </div>
    <div>
      <h3>Especialidades</h3>
      <p>Compra, venda, avaliação, documentação e imóveis na praia em Praia Grande e Baixada Santista.</p>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© ${new Date().getFullYear()} Laca Corretores. Todos os direitos reservados.</span>
    <span>SEO local, conteúdo gerenciável e experiência premium.</span>
  </div>
</footer>
<div class="whatsapp-float" aria-label="Atalhos para WhatsApp">
  <a href="${COMPANY.whatsappDouglas}" target="_blank" rel="noopener">Douglas</a>
  <a href="${COMPANY.whatsappMarcelo}" target="_blank" rel="noopener">Marcelo</a>
</div>`;
}

function renderHome(posts, properties = []) {
  const featured = posts.filter((post) => post.featured).slice(0, 3);
  const recent = (featured.length ? featured : posts).slice(0, 3);
  const videoPosts = posts.filter((post) => post.mediaType !== "none").slice(0, 3);
  const featuredProperties = (properties.filter((property) => property.featured).length ? properties.filter((property) => property.featured) : properties).slice(0, 3);

  const body = `${publicHeader()}
<main>
  <section class="hero" id="inicio">
    <div class="hero-media" aria-hidden="true"></div>
    <div class="hero-overlay"></div>
    <div class="hero-content">
      <p class="eyebrow">CRECISP • Praia Grande SP • Baixada Santista</p>
      <h1>Imóveis em Praia Grande com orientação local, transparência e cuidado familiar.</h1>
      <p class="hero-lead">A família Lacalentola vive a cidade há décadas e acompanha cada detalhe da sua compra, venda ou avaliação de imóvel.</p>
      <div class="hero-actions">
        <a class="btn primary" href="#contato">Quero atendimento</a>
        <a class="btn ghost" href="/imoveis">Ver imóveis à venda</a>
      </div>
      <dl class="trust-strip" aria-label="Diferenciais">
        <div><dt>45+</dt><dd>anos de vivência local</dd></div>
        <div><dt>2</dt><dd>corretores Lacalentola</dd></div>
        <div><dt>SEO</dt><dd>conteúdo por bairro</dd></div>
      </dl>
    </div>
  </section>

  <section class="section split" id="sobre">
    <div>
      <p class="eyebrow dark">Quem somos</p>
      <h2>Uma imobiliária de Praia Grande feita para decisões importantes.</h2>
    </div>
    <div class="prose">
      <p>A Laca Corretores Imobiliários une experiência familiar, leitura de bairro e atendimento próximo para orientar compradores e vendedores com segurança.</p>
      <p>O novo site foi pensado para publicar guias, vídeos, análises de bairros e conteúdos que ajudam o cliente antes mesmo do primeiro contato.</p>
    </div>
  </section>

  <section class="section services" id="servicos">
    <div class="section-head">
      <p class="eyebrow dark">O que fazemos</p>
      <h2>Serviços para comprar, vender e avaliar com clareza.</h2>
    </div>
    <div class="service-grid">
      ${SERVICES.map((service, index) => `<article class="service-card">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(service.title)}</h3>
        <p>${escapeHtml(service.text)}</p>
        <small>${escapeHtml(service.tag)}</small>
      </article>`).join("")}
    </div>
  </section>

  <section class="section properties-preview">
    <div class="section-head inline">
      <div>
        <p class="eyebrow dark">Imóveis à venda</p>
        <h2>Imóveis à venda em Praia Grande com fotos, detalhes e atendimento direto.</h2>
        <p>Encontre apartamentos, casas e coberturas por bairro, preço, dormitórios, vagas e tipo de imóvel. Veja ficha técnica completa, galeria, vídeo, condomínio, IPTU e fale com a Laca Corretores para agendar sua visita com segurança.</p>
      </div>
    </div>
    <div class="property-grid">
      ${featuredProperties.map(renderPropertyCard).join("") || `<div class="empty-panel"><h3>Nenhum imóvel publicado ainda</h3><p>Cadastre apartamentos, casas e coberturas pelo painel administrativo.</p></div>`}
    </div>
    <div class="section-bottom-action">
      <a class="btn primary" href="/imoveis">Ver vitrine completa</a>
    </div>
  </section>

  <section class="section bairros" id="bairros">
    <div class="section-head">
      <p class="eyebrow dark">Imóveis em Praia Grande SP</p>
      <h2>Guias locais para comprar, vender ou avaliar imóveis com mais segurança.</h2>
      <p>A Laca Corretores publica conteúdos pensados para quem pesquisa apartamento à venda em Praia Grande, casas perto da praia, imóveis no Canto do Forte, Guilhermina, Boqueirão e outros bairros da cidade. Cada página ajuda o cliente a comparar regiões, entender preços, tirar dúvidas e solicitar uma avaliação imobiliária na Baixada Santista com atendimento direto.</p>
    </div>
    <div class="bairro-grid">
      ${NEIGHBORHOODS.map((name) => `<a href="/imoveis?bairro=${encodeURIComponent(name)}">${escapeHtml(name)}</a>`).join("")}
    </div>
  </section>

  <section class="section posts">
    <div class="section-head inline">
      <div>
        <p class="eyebrow dark">Guias e postagens</p>
        <h2>Publicações para atrair clientes pelo Google e pelo WhatsApp.</h2>
      </div>
      <a class="text-link" href="/blog">Ver todas</a>
    </div>
    <div class="post-grid">
      ${recent.map(renderPostCard).join("") || renderEmptyPosts()}
    </div>
  </section>

  <section class="section video-section">
    <div class="section-head inline">
      <div>
        <p class="eyebrow dark">Vídeos</p>
        <h2>Tour, bastidores e explicações em vídeo.</h2>
      </div>
      <a class="text-link" href="/admin">Adicionar vídeo</a>
    </div>
    <div class="video-grid">
      ${videoPosts.length ? videoPosts.map(renderVideoTeaser).join("") : `<div class="empty-panel">
        <h3>Pronto para vídeos por upload ou YouTube</h3>
        <p>Cadastre tours, análises de bairro ou explicações no painel administrativo. Cada vídeo ganha metadados próprios para SEO.</p>
      </div>`}
    </div>
  </section>

  <section class="section faq">
    <div class="section-head">
      <p class="eyebrow dark">Dúvidas frequentes</p>
      <h2>Respostas que ajudam pessoas e buscadores.</h2>
    </div>
    <div class="faq-list">
      ${FAQS.map((item) => `<details><summary>${escapeHtml(item.q)}</summary><p>${escapeHtml(item.a)}</p></details>`).join("")}
    </div>
  </section>

  <section class="section contact" id="contato">
    <div>
      <p class="eyebrow">Contato</p>
      <h2>Conte o que você procura. A resposta vai direto para o WhatsApp.</h2>
      <p>Atendimento humano para compra, venda, avaliação e documentação de imóveis em Praia Grande SP.</p>
    </div>
    <form class="contact-form" data-whatsapp-form>
      <label>Nome <input name="nome" required placeholder="Seu nome"></label>
      <label>Telefone <input name="telefone" placeholder="(13) 99999-9999"></label>
      <label>Interesse
        <select name="interesse">
          <option>Comprar imóvel</option>
          <option>Vender imóvel</option>
          <option>Avaliar imóvel</option>
          <option>Documentação</option>
        </select>
      </label>
      <label>Mensagem <textarea name="mensagem" rows="4" placeholder="Fale o bairro, tipo de imóvel ou dúvida principal"></textarea></label>
      <button class="btn primary" type="submit">Enviar pelo WhatsApp</button>
    </form>
  </section>
</main>
${publicFooter()}`;

  return layout({
    title: "Laca Corretores Imobiliários em Praia Grande SP",
    description: "Corretores de imóveis em Praia Grande SP para compra, venda, avaliação, documentação e imóveis na praia. Atendimento de Douglas e Marcelo Lacalentola.",
    canonical: "/",
    image: COMPANY.hero,
    body,
    schemas: [realEstateSchema(), websiteSchema(), faqSchema()]
  });
}

function renderBlog(posts, requestUrl) {
  const url = new URL(requestUrl, SITE_URL);
  const bairro = url.searchParams.get("bairro");
  const filtered = bairro ? posts.filter((post) => post.neighborhood.toLowerCase().includes(bairro.toLowerCase()) || post.tags.join(" ").toLowerCase().includes(bairro.toLowerCase())) : posts;
  const body = `${publicHeader()}
<main>
  <section class="page-hero compact">
    <p class="eyebrow">Conteúdo local</p>
    <h1>Guias imobiliários de Praia Grande</h1>
    <p>Posts, análises e vídeos publicados pela Laca Corretores para compradores, vendedores e investidores.</p>
  </section>
  <section class="section posts">
    ${bairro ? `<p class="filter-note">Filtro ativo: <strong>${escapeHtml(bairro)}</strong> <a href="/blog">limpar</a></p>` : ""}
    <div class="post-grid wide">
      ${filtered.map(renderPostCard).join("") || renderEmptyPosts()}
    </div>
  </section>
</main>
${publicFooter()}`;

  return layout({
    title: bairro ? `Imóveis e guias sobre ${bairro} em Praia Grande` : "Guias imobiliários de Praia Grande",
    description: "Conteúdos da Laca Corretores sobre compra, venda, avaliação, bairros e imóveis em Praia Grande SP.",
    canonical: bairro ? `/blog?bairro=${encodeURIComponent(bairro)}` : "/blog",
    image: COMPANY.hero,
    body,
    schemas: [realEstateSchema(), breadcrumbSchema([{ name: "Início", url: "/" }, { name: "Guias", url: "/blog" }])]
  });
}

function renderPropertiesPage(properties, requestUrl) {
  const url = new URL(requestUrl, SITE_URL);
  const filters = {
    q: String(url.searchParams.get("q") || "").trim().toLowerCase(),
    bairro: String(url.searchParams.get("bairro") || "").trim(),
    tipo: String(url.searchParams.get("tipo") || "").trim(),
    quartos: intValue(url.searchParams.get("quartos")),
    precoMax: numberValue(url.searchParams.get("precoMax")),
    ordenar: String(url.searchParams.get("ordenar") || "relevancia")
  };
  const filtered = filterProperties(properties, filters);
  const neighborhoods = [...new Set(properties.map((property) => property.neighborhood).filter(Boolean))].sort();
  const types = [...new Set(properties.map((property) => property.propertyType).filter(Boolean))].sort();
  const body = `${publicHeader()}
<main>
  <section class="page-hero compact">
    <p class="eyebrow">Imóveis à venda</p>
    <h1>Encontre seu imóvel em Praia Grande com filtros claros e atendimento direto.</h1>
    <p>Compare preço, bairro, metragem, dormitórios, vagas, condomínio, IPTU e diferenciais antes de falar com a Laca Corretores.</p>
  </section>
  <section class="section property-listing">
    <form class="property-filters" method="get" action="/imoveis">
      <label>Busca
        <input name="q" value="${escapeAttr(url.searchParams.get("q") || "")}" placeholder="cobertura, vista mar, lazer...">
      </label>
      <label>Bairro
        <select name="bairro">
          <option value="">Todos</option>
          ${neighborhoods.map((name) => `<option value="${escapeAttr(name)}"${filters.bairro === name ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}
        </select>
      </label>
      <label>Tipo
        <select name="tipo">
          <option value="">Todos</option>
          ${types.map((name) => `<option value="${escapeAttr(name)}"${filters.tipo === name ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}
        </select>
      </label>
      <label>Dormitórios
        <select name="quartos">
          <option value="">Qualquer</option>
          ${[1, 2, 3, 4].map((n) => `<option value="${n}"${filters.quartos === n ? " selected" : ""}>${n}+</option>`).join("")}
        </select>
      </label>
      <label>Preço máximo
        <input name="precoMax" inputmode="numeric" value="${escapeAttr(url.searchParams.get("precoMax") || "")}" placeholder="Ex.: 650000">
      </label>
      <label>Ordenar
        <select name="ordenar">
          ${[
            ["relevancia", "Relevância"],
            ["menor-preco", "Menor preço"],
            ["maior-preco", "Maior preço"],
            ["maior-area", "Maior área"],
            ["recentes", "Mais recentes"]
          ].map(([value, label]) => `<option value="${value}"${filters.ordenar === value ? " selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
      <button class="btn primary" type="submit">Filtrar</button>
      <a class="text-link" href="/imoveis">Limpar</a>
    </form>
    <div class="listing-summary">
      <strong>${filtered.length}</strong>
      <span>${filtered.length === 1 ? "imóvel encontrado" : "imóveis encontrados"}</span>
    </div>
    <div class="property-grid listing">
      ${filtered.map(renderPropertyCard).join("") || `<div class="empty-panel"><h3>Nenhum imóvel encontrado</h3><p>Ajuste os filtros ou cadastre novos imóveis no painel administrativo.</p></div>`}
    </div>
  </section>
</main>
${publicFooter()}`;

  return layout({
    title: "Imóveis à venda em Praia Grande SP",
    description: "Apartamentos, casas e coberturas à venda em Praia Grande SP com fotos, ficha técnica, preço, condomínio, IPTU, filtros e atendimento da Laca Corretores.",
    canonical: url.pathname + url.search,
    image: COMPANY.hero,
    body,
    schemas: [
      realEstateSchema(),
      breadcrumbSchema([{ name: "Início", url: "/" }, { name: "Imóveis à venda", url: "/imoveis" }])
    ]
  });
}

function filterProperties(properties, filters) {
  const filtered = properties.filter((property) => {
    const text = [
      property.title,
      property.reference,
      property.propertyType,
      property.neighborhood,
      property.shortDescription,
      property.description,
      ...(property.highlights || []),
      ...(property.features || []),
      ...(property.nearby || [])
    ].join(" ").toLowerCase();
    if (filters.q && !text.includes(filters.q)) return false;
    if (filters.bairro && property.neighborhood !== filters.bairro) return false;
    if (filters.tipo && property.propertyType !== filters.tipo) return false;
    if (filters.quartos && Number(property.bedrooms || 0) < filters.quartos) return false;
    if (filters.precoMax && Number(property.price || 0) > filters.precoMax) return false;
    return property.saleStatus !== "sold";
  });

  return filtered.sort((a, b) => {
    if (filters.ordenar === "menor-preco") return Number(a.price || 0) - Number(b.price || 0);
    if (filters.ordenar === "maior-preco") return Number(b.price || 0) - Number(a.price || 0);
    if (filters.ordenar === "maior-area") return Number(b.usableArea || 0) - Number(a.usableArea || 0);
    if (filters.ordenar === "recentes") return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    if (Boolean(a.featured) !== Boolean(b.featured)) return b.featured ? 1 : -1;
    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
  });
}

function renderPropertyPage(property) {
  const gallery = property.images?.length ? property.images : [property.coverImage || COMPANY.hero];
  const galleryItems = gallery.map((image, index) => ({
    src: image,
    alt: `${property.title} - foto ${index + 1}`
  }));
  const body = `${publicHeader()}
<main>
  <article class="property-detail">
    <header class="property-hero-detail">
      <div>
        <a class="back-link" href="/imoveis">← Imóveis à venda</a>
        <p class="eyebrow dark">${escapeHtml(property.propertyType)} • Ref. ${escapeHtml(property.reference)}</p>
        <h1>${escapeHtml(property.title)}</h1>
        <p>${escapeHtml(property.shortDescription)}</p>
      </div>
      <aside class="price-panel">
        <span>${property.saleStatus === "reserved" ? "Reservado" : "À venda"}</span>
        <strong>${formatCurrency(property.price)}</strong>
        <small>${property.condoFee ? `Condomínio ${formatCurrency(property.condoFee)}` : "Consulte condomínio"}${property.iptu ? ` • IPTU ${formatCurrency(property.iptu)}` : ""}</small>
        <a class="btn primary" href="${whatsAppPropertyLink(property)}" target="_blank" rel="noopener">Tenho interesse</a>
      </aside>
    </header>

    <section class="property-gallery" data-property-gallery data-gallery-items="${escapeAttr(safeJson(galleryItems))}">
      ${gallery.slice(0, 5).map((image, index) => `<button class="gallery-thumb${index === 4 && gallery.length > 5 ? " has-more" : ""}" type="button" data-gallery-open="${index}" aria-label="Abrir foto ${index + 1} de ${gallery.length}">
        <img src="${escapeAttr(image)}" alt="${escapeAttr(`${property.title} - foto ${index + 1}`)}" loading="${index ? "lazy" : "eager"}">
        ${index === 4 && gallery.length > 5 ? `<span class="gallery-more">+${gallery.length - 5} fotos</span>` : ""}
      </button>`).join("")}
    </section>

    ${renderPropertyMedia(property)}

    <section class="property-detail-grid">
      <div class="property-main">
        <div class="spec-grid">
          ${property.usableArea ? renderSpec("Área útil", formatArea(property.usableArea)) : ""}
          ${property.totalArea ? renderSpec("Área total", formatArea(property.totalArea)) : ""}
          ${renderSpec("Dormitórios", property.bedrooms)}
          ${renderSpec("Suítes", property.suites)}
          ${renderSpec("Banheiros", property.bathrooms)}
          ${renderSpec("Vagas", property.parkingSpaces)}
        </div>

        <section class="detail-block">
          <h2>Descrição do imóvel</h2>
          <div class="article-body">${bodyToHtml(property.description)}</div>
        </section>

        ${renderListBlock("Destaques", property.highlights)}
        ${renderListBlock("Características e lazer", property.features)}
        ${renderListBlock("Próximo de", property.nearby)}
      </div>

      <aside class="property-sidebar">
        <section class="detail-card">
          <h2>Dados do imóvel</h2>
          <dl>
            <div><dt>Bairro</dt><dd>${escapeHtml(property.neighborhood)}</dd></div>
            <div><dt>Cidade</dt><dd>${escapeHtml(property.city)} - ${escapeHtml(property.state)}</dd></div>
            ${property.address ? `<div><dt>Endereço</dt><dd>${escapeHtml(property.address)}</dd></div>` : ""}
            ${property.distanceToBeach ? `<div><dt>Distância da praia</dt><dd>${escapeHtml(property.distanceToBeach)}</dd></div>` : ""}
            ${property.floor ? `<div><dt>Andar</dt><dd>${escapeHtml(property.floor)}</dd></div>` : ""}
            <div><dt>Financiamento</dt><dd>${property.acceptsFinancing ? "Aceita financiamento" : "Consultar condições"}</dd></div>
            <div><dt>Permuta</dt><dd>${property.acceptsExchange ? "Estuda permuta" : "Não informado"}</dd></div>
            <div><dt>Mobiliado</dt><dd>${property.furnished ? "Sim" : "Não informado"}</dd></div>
          </dl>
        </section>
        <section class="detail-card contact-card">
          <h2>Fale com a Laca</h2>
          <p>Receba localização, documentação disponível e agendamento de visita pelo WhatsApp.</p>
          <a class="btn primary" href="${whatsAppPropertyLink(property)}" target="_blank" rel="noopener">Chamar no WhatsApp</a>
        </section>
      </aside>
    </section>
  </article>
</main>
${publicFooter()}`;

  return layout({
    title: property.seoTitle || property.title,
    description: property.seoDescription || property.shortDescription,
    canonical: `/imovel/${property.slug}`,
    image: property.coverImage || COMPANY.hero,
    type: "product",
    body,
    schemas: [
      realEstateSchema(),
      propertySchema(property),
      videoSchema(property),
      breadcrumbSchema([{ name: "Início", url: "/" }, { name: "Imóveis à venda", url: "/imoveis" }, { name: property.title, url: `/imovel/${property.slug}` }])
    ]
  });
}

function renderPropertyCard(property) {
  const image = property.coverImage || COMPANY.hero;
  return `<article class="property-card">
    <a class="property-image" href="/imovel/${escapeAttr(property.slug)}">
      <img src="${escapeAttr(image)}" alt="${escapeAttr(property.title)}" loading="lazy">
      <span>${property.saleStatus === "reserved" ? "Reservado" : "À venda"}</span>
    </a>
    <div class="property-card-body">
      <p>${escapeHtml(property.propertyType)} • ${escapeHtml(property.neighborhood)}</p>
      <h3><a href="/imovel/${escapeAttr(property.slug)}">${escapeHtml(property.title)}</a></h3>
      <strong>${formatCurrency(property.price)}</strong>
      <div class="property-specs">
        ${property.usableArea ? `<span>${formatArea(property.usableArea)}</span>` : ""}
        <span>${Number(property.bedrooms || 0)} dorm.</span>
        <span>${Number(property.bathrooms || 0)} banh.</span>
        <span>${Number(property.parkingSpaces || 0)} vaga${Number(property.parkingSpaces || 0) === 1 ? "" : "s"}</span>
      </div>
      <small>${property.condoFee ? `Condomínio ${formatCurrency(property.condoFee)}` : "Condomínio sob consulta"}${property.iptu ? ` • IPTU ${formatCurrency(property.iptu)}` : ""}</small>
    </div>
  </article>`;
}

function renderSpec(label, value) {
  return `<div><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderListBlock(title, items = []) {
  if (!items.length) return "";
  return `<section class="detail-block">
    <h2>${escapeHtml(title)}</h2>
    <ul class="feature-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  </section>`;
}

function renderPropertyMedia(property) {
  if (property.mediaType === "youtube") {
    const embed = youtubeEmbed(property.youtubeUrl);
    if (embed) return `<section class="property-video article-media"><iframe src="${escapeAttr(embed)}" title="${escapeAttr(property.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></section>`;
  }
  if (property.mediaType === "upload" && property.uploadUrl) {
    return `<section class="property-video article-media"><video src="${escapeAttr(property.uploadUrl)}" controls preload="metadata" poster="${escapeAttr(property.coverImage || COMPANY.hero)}"></video></section>`;
  }
  return "";
}

function renderPostPage(post) {
  const media = renderPostMedia(post);
  const body = `${publicHeader()}
<main>
  <article class="article-shell">
    <header class="article-header">
      <a class="back-link" href="/blog">← Guias e posts</a>
      <p class="eyebrow dark">${escapeHtml(post.category)} • ${escapeHtml(post.neighborhood)}</p>
      <h1>${escapeHtml(post.title)}</h1>
      <p>${escapeHtml(post.excerpt)}</p>
      <div class="article-meta">
        <span>${escapeHtml(post.author || COMPANY.shortName)}</span>
        <span>${formatDate(post.publishedAt || post.createdAt)}</span>
        <span>${estimateReadTime(post.body)} min de leitura</span>
      </div>
    </header>
    ${media}
    <div class="article-body">
      ${bodyToHtml(post.body)}
    </div>
    <footer class="article-footer">
      <div class="tag-list">${post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <a class="btn primary" href="${whatsAppPostLink(post)}" target="_blank" rel="noopener">Falar sobre este assunto</a>
    </footer>
  </article>
</main>
${publicFooter()}`;

  return layout({
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    canonical: `/post/${post.slug}`,
    image: post.coverImage || COMPANY.hero,
    type: "article",
    body,
    schemas: [
      realEstateSchema(),
      articleSchema(post),
      videoSchema(post),
      breadcrumbSchema([{ name: "Início", url: "/" }, { name: "Guias", url: "/blog" }, { name: post.title, url: `/post/${post.slug}` }])
    ]
  });
}

function renderPostCard(post) {
  const image = sanitizeMediaUrl(post.coverImage) || COMPANY.hero;
  return `<article class="post-card">
    <a class="post-image" href="/post/${escapeAttr(post.slug)}" aria-label="${escapeAttr(post.title)}">
      <img src="${escapeAttr(image)}" alt="${escapeAttr(post.title)}" loading="lazy">
      ${post.mediaType !== "none" ? `<span class="media-badge">Vídeo</span>` : ""}
    </a>
    <div class="post-content">
      <p>${escapeHtml(post.category)} • ${escapeHtml(post.neighborhood)}</p>
      <h3><a href="/post/${escapeAttr(post.slug)}">${escapeHtml(post.title)}</a></h3>
      <span>${escapeHtml(post.excerpt)}</span>
    </div>
  </article>`;
}

function renderVideoTeaser(post) {
  return `<article class="video-teaser">
    ${renderPostMedia(post, true)}
    <h3><a href="/post/${escapeAttr(post.slug)}">${escapeHtml(post.title)}</a></h3>
    <p>${escapeHtml(post.excerpt)}</p>
  </article>`;
}

function renderPostMedia(post, compact = false) {
  const image = sanitizeMediaUrl(post.coverImage) || COMPANY.hero;
  if (post.mediaType === "youtube") {
    const embed = youtubeEmbed(post.youtubeUrl);
    if (embed) {
      return `<div class="${compact ? "media-frame compact" : "article-media"}"><iframe src="${escapeAttr(embed)}" title="${escapeAttr(post.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
    }
  }
  if (post.mediaType === "upload" && post.uploadUrl) {
    return `<div class="${compact ? "media-frame compact" : "article-media"}"><video src="${escapeAttr(post.uploadUrl)}" controls preload="metadata" poster="${escapeAttr(image)}"></video></div>`;
  }
  if (compact) {
    return `<img src="${escapeAttr(image)}" alt="${escapeAttr(post.title)}" loading="lazy">`;
  }
  return `<figure class="article-cover"><img src="${escapeAttr(image)}" alt="${escapeAttr(post.title)}"></figure>`;
}

function renderEmptyPosts() {
  return `<div class="empty-panel"><h3>Nenhuma postagem publicada ainda</h3><p>Use o painel administrativo para criar guias, novidades, vídeos e conteúdos por bairro.</p></div>`;
}

function whatsAppPostLink(post) {
  const text = `Olá! Vi o conteúdo "${post.title}" no site da Laca Corretores e gostaria de atendimento.`;
  return `${COMPANY.whatsappDouglas}?text=${encodeURIComponent(text)}`;
}

function whatsAppPropertyLink(property) {
  const text = `Olá! Tenho interesse no imóvel ${property.reference} - ${property.title} (${formatCurrency(property.price)}), publicado no site da Laca Corretores. Pode me enviar mais detalhes?`;
  return `${COMPANY.whatsappDouglas}?text=${encodeURIComponent(text)}`;
}

function realEstateSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "@id": `${SITE_URL}/#laca-corretores`,
    name: COMPANY.name,
    alternateName: COMPANY.shortName,
    url: SITE_URL,
    image: absoluteUrl(COMPANY.logo),
    logo: absoluteUrl(COMPANY.logo),
    telephone: COMPANY.phoneDouglas,
    priceRange: "R$",
    slogan: "Imóveis em Praia Grande com transparência, segurança e leitura local.",
    address: {
      "@type": "PostalAddress",
      addressLocality: COMPANY.city,
      addressRegion: COMPANY.state,
      addressCountry: "BR"
    },
    areaServed: [COMPANY.city, COMPANY.region, ...NEIGHBORHOODS],
    founder: [
      { "@type": "Person", name: "Douglas Lacalentola", jobTitle: "Corretor de Imóveis" },
      { "@type": "Person", name: "Marcelo Lacalentola", jobTitle: "Corretor de Imóveis" }
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: COMPANY.phoneDouglas,
        contactType: "customer service",
        areaServed: "BR",
        availableLanguage: "pt-BR"
      },
      {
        "@type": "ContactPoint",
        telephone: COMPANY.phoneMarcelo,
        contactType: "customer service",
        areaServed: "BR",
        availableLanguage: "pt-BR"
      }
    ]
  };
}

function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: COMPANY.name,
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#laca-corretores` },
    inLanguage: "pt-BR"
  };
}

function faqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a
      }
    }))
  };
}

function articleSchema(post) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seoDescription || post.excerpt,
    image: absoluteUrl(post.coverImage || COMPANY.hero),
    datePublished: post.publishedAt || post.createdAt,
    dateModified: post.updatedAt || post.createdAt,
    author: {
      "@type": "Organization",
      name: post.author || COMPANY.shortName
    },
    publisher: {
      "@type": "Organization",
      name: COMPANY.name,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl(COMPANY.logo)
      }
    },
    mainEntityOfPage: absoluteUrl(`/post/${post.slug}`),
    inLanguage: "pt-BR",
    about: [post.neighborhood, post.category, ...post.tags]
  };
}

function propertySchema(property) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: property.title,
    description: property.seoDescription || property.shortDescription || property.description,
    image: (property.images?.length ? property.images : [property.coverImage || COMPANY.hero]).map(absoluteUrl),
    sku: property.reference,
    brand: {
      "@type": "Brand",
      name: COMPANY.name
    },
    category: `${property.propertyType} à venda em ${property.neighborhood}, ${property.city}`,
    offers: {
      "@type": "Offer",
      price: Number(property.price || 0).toFixed(0),
      priceCurrency: "BRL",
      availability: property.saleStatus === "sold" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      url: absoluteUrl(`/imovel/${property.slug}`),
      offeredBy: { "@id": `${SITE_URL}/#laca-corretores` }
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Tipo", value: property.propertyType },
      { "@type": "PropertyValue", name: "Bairro", value: property.neighborhood },
      { "@type": "PropertyValue", name: "Área útil", value: property.usableArea ? `${property.usableArea} m²` : "" },
      { "@type": "PropertyValue", name: "Dormitórios", value: property.bedrooms },
      { "@type": "PropertyValue", name: "Suítes", value: property.suites },
      { "@type": "PropertyValue", name: "Banheiros", value: property.bathrooms },
      { "@type": "PropertyValue", name: "Vagas", value: property.parkingSpaces }
    ].filter((item) => item.value !== "")
  };
}

function videoSchema(post) {
  if (post.mediaType === "none") return null;
  const base = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: post.title,
    description: post.seoDescription || post.excerpt,
    thumbnailUrl: absoluteUrl(post.coverImage || COMPANY.hero),
    uploadDate: post.publishedAt || post.createdAt
  };
  if (post.mediaType === "youtube" && youtubeEmbed(post.youtubeUrl)) {
    base.embedUrl = youtubeEmbed(post.youtubeUrl);
  }
  if (post.mediaType === "upload" && post.uploadUrl) {
    base.contentUrl = absoluteUrl(post.uploadUrl);
  }
  return base;
}

function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url)
    }))
  };
}

async function renderSitemap() {
  const db = await readDb();
  const posts = getPublishedPosts(db);
  const properties = getPublishedProperties(db);
  const urls = [
    { loc: "/", priority: "1.0", changefreq: "weekly" },
    { loc: "/imoveis", priority: "0.95", changefreq: "daily" },
    { loc: "/blog", priority: "0.9", changefreq: "weekly" },
    ...properties.map((property) => ({
      loc: `/imovel/${property.slug}`,
      priority: property.featured ? "0.92" : "0.82",
      changefreq: "weekly",
      lastmod: property.updatedAt || property.publishedAt || property.createdAt
    })),
    ...posts.map((post) => ({
      loc: `/post/${post.slug}`,
      priority: post.featured ? "0.85" : "0.75",
      changefreq: "monthly",
      lastmod: post.updatedAt || post.publishedAt || post.createdAt
    }))
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((item) => `  <url>
    <loc>${escapeHtml(absoluteUrl(item.loc))}</loc>
    ${item.lastmod ? `<lastmod>${escapeHtml(item.lastmod)}</lastmod>` : ""}
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`).join("\n")}
</urlset>`;
}

function robotsTxt() {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/login") {
    if (!loginAllowed(req)) {
      sendJson(res, 429, { error: "Muitas tentativas. Tente novamente em alguns minutos." });
      return;
    }
    const input = await parseJsonBody(req);
    const password = String(input.password || "");
    const ok = crypto.timingSafeEqual(
      Buffer.from(crypto.createHash("sha256").update(password).digest("hex")),
      Buffer.from(crypto.createHash("sha256").update(ADMIN_PASSWORD).digest("hex"))
    );
    if (!ok) {
      recordLoginFailure(req);
      sendJson(res, 401, { error: "Senha inválida." });
      return;
    }
    clearLoginFailures(req);
    const token = createSession();
    sendJson(res, 200, { ok: true }, {
      "Set-Cookie": `laca_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    sendJson(res, 200, { ok: true }, {
      "Set-Cookie": "laca_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    sendJson(res, 200, { authenticated: isAdmin(req) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/public/posts") {
    const db = await readDb();
    sendJson(res, 200, { posts: getPublishedPosts(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/public/properties") {
    const db = await readDb();
    sendJson(res, 200, { properties: getPublishedProperties(db) });
    return;
  }

  if (!authGuard(req, res)) return;

  if (req.method === "GET" && url.pathname === "/api/admin/posts") {
    const db = await readDb();
    sendJson(res, 200, {
      posts: db.posts.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/properties") {
    const db = await readDb();
    sendJson(res, 200, {
      properties: db.properties.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/posts") {
    const db = await readDb();
    const input = await parseJsonBody(req);
    const post = normalizePostInput(input, db);
    db.posts.push(post);
    await writeDb(db);
    sendJson(res, 201, { post });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/properties") {
    const db = await readDb();
    const input = await parseJsonBody(req);
    const property = normalizePropertyInput(input, db);
    db.properties.push(property);
    await writeDb(db);
    sendJson(res, 201, { property });
    return;
  }

  const postMatch = url.pathname.match(/^\/api\/admin\/posts\/([^/]+)$/);
  if (postMatch && req.method === "PUT") {
    const db = await readDb();
    const id = decodeURIComponent(postMatch[1]);
    const index = db.posts.findIndex((post) => post.id === id);
    if (index === -1) {
      sendJson(res, 404, { error: "Postagem não encontrada." });
      return;
    }
    const input = await parseJsonBody(req);
    const post = normalizePostInput(input, db, db.posts[index]);
    db.posts[index] = post;
    await writeDb(db);
    sendJson(res, 200, { post });
    return;
  }

  if (postMatch && req.method === "DELETE") {
    const db = await readDb();
    const id = decodeURIComponent(postMatch[1]);
    const next = db.posts.filter((post) => post.id !== id);
    if (next.length === db.posts.length) {
      sendJson(res, 404, { error: "Postagem não encontrada." });
      return;
    }
    db.posts = next;
    await writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  const propertyMatch = url.pathname.match(/^\/api\/admin\/properties\/([^/]+)$/);
  if (propertyMatch && req.method === "PUT") {
    const db = await readDb();
    const id = decodeURIComponent(propertyMatch[1]);
    const index = db.properties.findIndex((property) => property.id === id);
    if (index === -1) {
      sendJson(res, 404, { error: "Imóvel não encontrado." });
      return;
    }
    const input = await parseJsonBody(req);
    const property = normalizePropertyInput(input, db, db.properties[index]);
    db.properties[index] = property;
    await writeDb(db);
    sendJson(res, 200, { property });
    return;
  }

  if (propertyMatch && req.method === "DELETE") {
    const db = await readDb();
    const id = decodeURIComponent(propertyMatch[1]);
    const next = db.properties.filter((property) => property.id !== id);
    if (next.length === db.properties.length) {
      sendJson(res, 404, { error: "Imóvel não encontrado." });
      return;
    }
    db.properties = next;
    await writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/upload") {
    const uploaded = await handleUpload(req);
    sendJson(res, 201, uploaded);
    return;
  }

  sendJson(res, 404, { error: "Endpoint não encontrado." });
}

async function handleUpload(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw Object.assign(new Error("Upload multipart inválido."), { statusCode: 400 });

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await readRawBody(req, MAX_UPLOAD_BYTES);
  const parts = splitBuffer(body, boundary);

  for (const rawPart of parts) {
    let part = rawPart;
    if (part.length < 8) continue;
    if (part.slice(0, 2).toString() === "\r\n") part = part.slice(2);
    if (part.slice(-2).toString() === "\r\n") part = part.slice(0, -2);
    if (part.slice(-2).toString() === "--") part = part.slice(0, -2);

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    const headerText = part.slice(0, headerEnd).toString("utf8");
    const content = trimCrlf(part.slice(headerEnd + 4));
    const disposition = headerText.match(/content-disposition:\s*form-data;[^\r\n]+/i)?.[0] || "";
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    if (!filenameMatch || !filenameMatch[1]) continue;

    const original = path.basename(filenameMatch[1]).replace(/[^\w.\- ]+/g, "").trim();
    const ext = path.extname(original).toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".mov", ".m4v"];
    if (!allowed.includes(ext)) {
      throw Object.assign(new Error("Formato não permitido. Use imagem ou vídeo."), { statusCode: 400 });
    }
    const type = [".mp4", ".webm", ".mov", ".m4v"].includes(ext) ? "video" : "image";
    const fileName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${slugify(path.basename(original, ext))}${ext}`;
    const partContentType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim();
    if (usesBlobStorage()) {
      const blob = await uploadBlobFile(fileName, content, partContentType || MIME_TYPES[ext] || "application/octet-stream");
      return {
        url: blob.url,
        type,
        name: original,
        size: content.length
      };
    }

    const target = path.join(UPLOAD_DIR, fileName);
    await fsp.writeFile(target, content);
    return {
      url: `/uploads/${fileName}`,
      type,
      name: original,
      size: content.length
    };
  }

  throw Object.assign(new Error("Nenhum arquivo encontrado no upload."), { statusCode: 400 });
}

async function uploadBlobFile(fileName, content, contentType) {
  const { put } = await getBlobSdk();
  return put(`${BLOB_UPLOAD_PREFIX}/${fileName}`, content, {
    access: "public",
    addRandomSuffix: false,
    contentType,
    multipart: content.length > 4 * 1024 * 1024
  });
}

function splitBuffer(buffer, separator) {
  const result = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);
  while (index !== -1) {
    if (index > start) result.push(buffer.slice(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }
  if (start < buffer.length) result.push(buffer.slice(start));
  return result;
}

function trimCrlf(buffer) {
  let start = 0;
  let end = buffer.length;
  while (buffer[start] === 13 || buffer[start] === 10) start += 1;
  while (buffer[end - 1] === 13 || buffer[end - 1] === 10) end -= 1;
  return buffer.slice(start, end);
}

async function serveStatic(req, res, pathname) {
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(PUBLIC_DIR, safePath);
  if (pathname === "/admin" || pathname === "/admin/") filePath = path.join(PUBLIC_DIR, "admin.html");
  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, "Acesso negado.", "text/plain; charset=utf-8");
    return true;
  }
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return false;
    const ext = path.extname(filePath).toLowerCase();
    const headers = {};
    if (pathname.startsWith("/assets/") || pathname.startsWith("/uploads/")) {
      headers["Cache-Control"] = "public, max-age=604800";
    }
    send(res, 200, await fsp.readFile(filePath), MIME_TYPES[ext] || "application/octet-stream", headers);
    return true;
  } catch {
    return false;
  }
}

async function router(req, res) {
  const url = new URL(req.url, SITE_URL);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (req.method === "GET" && pathname === "/") {
      const db = await readDb();
      send(res, 200, renderHome(getPublishedPosts(db), getPublishedProperties(db)));
      return;
    }

    if (req.method === "GET" && pathname === "/imoveis") {
      const db = await readDb();
      send(res, 200, renderPropertiesPage(getPublishedProperties(db), req.url));
      return;
    }

    if (req.method === "GET" && pathname === "/blog") {
      const db = await readDb();
      send(res, 200, renderBlog(getPublishedPosts(db), req.url));
      return;
    }

    const propertyMatch = pathname.match(/^\/imovel\/([^/]+)$/);
    if (req.method === "GET" && propertyMatch) {
      const db = await readDb();
      const property = getPublishedProperties(db).find((item) => item.slug === propertyMatch[1]);
      if (!property) {
        send(res, 404, renderNotFound());
        return;
      }
      send(res, 200, renderPropertyPage(property));
      return;
    }

    const postMatch = pathname.match(/^\/post\/([^/]+)$/);
    if (req.method === "GET" && postMatch) {
      const db = await readDb();
      const post = getPublishedPosts(db).find((item) => item.slug === postMatch[1]);
      if (!post) {
        send(res, 404, renderNotFound());
        return;
      }
      send(res, 200, renderPostPage(post));
      return;
    }

    if (req.method === "GET" && pathname === "/sitemap.xml") {
      send(res, 200, await renderSitemap(), "application/xml; charset=utf-8");
      return;
    }

    if (req.method === "GET" && pathname === "/robots.txt") {
      send(res, 200, robotsTxt(), "text/plain; charset=utf-8");
      return;
    }

    if (req.method === "GET" && await serveStatic(req, res, pathname)) return;

    send(res, 404, renderNotFound());
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (pathname.startsWith("/api/")) {
      sendJson(res, statusCode, { error: error.message || "Erro interno." });
      return;
    }
    send(res, statusCode, renderError(statusCode, error));
  }
}

function renderNotFound() {
  return layout({
    title: "Página não encontrada",
    description: "A página solicitada não foi encontrada no site da Laca Corretores.",
    canonical: "/404",
    body: `${publicHeader()}<main><section class="page-hero compact"><p class="eyebrow">404</p><h1>Página não encontrada</h1><p>O endereço pode ter mudado. Volte aos guias ou fale com a Laca Corretores.</p><a class="btn primary" href="/">Voltar ao início</a></section></main>${publicFooter()}`,
    schemas: [realEstateSchema()]
  });
}

function renderError(statusCode, error) {
  return layout({
    title: "Erro no site",
    description: "Ocorreu um erro ao carregar a página.",
    canonical: "/erro",
    body: `${publicHeader()}<main><section class="page-hero compact"><p class="eyebrow">${statusCode}</p><h1>Algo saiu do lugar</h1><p>${escapeHtml(error.message || "Tente novamente em instantes.")}</p><a class="btn primary" href="/">Voltar ao início</a></section></main>${publicFooter()}`,
    schemas: [realEstateSchema()]
  });
}

async function startServer() {
  await ensureRuntime();
  const server = http.createServer(router);
  server.listen(PORT, () => {
    console.log(`Laca Corretores rodando em ${SITE_URL}`);
    console.log(`Admin: ${SITE_URL}/admin`);
  });
}

async function vercelHandler(req, res) {
  await ensureRuntime();
  return router(req, res);
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = vercelHandler;
module.exports.router = router;
module.exports.ensureRuntime = ensureRuntime;
