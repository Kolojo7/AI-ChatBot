// server/server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import multer from "multer";
import mammoth from "mammoth";
import { createRequire } from "module";

// Use CJS import for pdf-parse to avoid ESM/entry quirks
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse"); // usage: await pdf(buffer)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------ Persistence ------------------------------
const DATA_DIR   = path.join(__dirname, "data");
const CHAT_FILE  = path.join(DATA_DIR, "chat_memory.json");
const FACTS_FILE = path.join(DATA_DIR, "facts_memory.json");
const ROLES_FILE = path.join(DATA_DIR, "roles_memory.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CHAT_FILE))  fs.writeFileSync(CHAT_FILE,  JSON.stringify({}), "utf-8");
if (!fs.existsSync(FACTS_FILE)) fs.writeFileSync(FACTS_FILE, JSON.stringify({}), "utf-8");
if (!fs.existsSync(ROLES_FILE)) fs.writeFileSync(ROLES_FILE, JSON.stringify({}), "utf-8");

let chatMemory  = JSON.parse(fs.readFileSync(CHAT_FILE,  "utf-8"));
let factsMemory = JSON.parse(fs.readFileSync(FACTS_FILE, "utf-8"));
let rolesMemory = JSON.parse(fs.readFileSync(ROLES_FILE, "utf-8")); // { [conversationId]: "role text" }

function saveSoon() {
  clearTimeout(saveSoon._id);
  saveSoon._id = setTimeout(() => {
    fs.writeFileSync(CHAT_FILE,  JSON.stringify(chatMemory,  null, 2));
    fs.writeFileSync(FACTS_FILE, JSON.stringify(factsMemory, null, 2));
    fs.writeFileSync(ROLES_FILE, JSON.stringify(rolesMemory, null, 2));
  }, 150);
}

// ------------------------------ Helpers ------------------------------
const pick = (o, k, d) => (o && k in o ? o[k] : d);
const normKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");

// Chat turns
function turns(cid = "default") {
  if (!chatMemory[cid]) chatMemory[cid] = [];
  return chatMemory[cid];
}
function pushTurn(cid, role, content) {
  turns(cid).push({ role, content, t: Date.now() });
  if (turns(cid).length > 50) turns(cid).splice(0, turns(cid).length - 50);
  saveSoon();
}
function lastTurns(cid, n = 8) {
  const all = turns(cid);
  return all.slice(Math.max(0, all.length - n));
}

// Facts (segregated: user vs assistant)
function ensureFacts(userId = "default") {
  if (!factsMemory[userId]) {
    factsMemory[userId] = {
      user: {},
      ai: { name: "Helix", role: "local coding assistant" },
    };
  }
  return factsMemory[userId];
}
function getFacts(userId = "default") {
  return ensureFacts(userId);
}
function upsertUserFacts(userId = "default", kv = {}) {
  const f = ensureFacts(userId);
  for (const [k, v] of Object.entries(kv)) {
    const key = normKey(k);
    const val = typeof v === "string" ? v.trim() : v;
    if (!key || val === undefined || val === null || val === "") continue;
    f.user[key] = val;
  }
  saveSoon();
}
function deleteUserFact(userId = "default", key) {
  const f = ensureFacts(userId);
  const k = normKey(key);
  if (!k || !(k in f.user)) return false;
  delete f.user[k];
  saveSoon();
  return true;
}
function clearUserFacts(userId = "default") {
  const f = ensureFacts(userId);
  f.user = {};
  saveSoon();
}

// AI Role (per conversation)
function getRole(conversationId = "default") {
  return rolesMemory[conversationId] || "";
}
function setRole(conversationId = "default", role = "") {
  rolesMemory[conversationId] = String(role || "").trim();
  saveSoon();
}
function clearRole(conversationId = "default") {
  delete rolesMemory[conversationId];
  saveSoon();
}

// Tiny user-fact extractor
const NAME_RX   = /\b(?:i am|i'm|my name is)\s+([a-z][a-z0-9 _-]{1,30})\b/i;
const AGE_RX    = /\b(?:i am|i'm)\s*([1-9][0-9]?)\s*(?:yo|years?\s*old)\b/i;
const EMAIL_RX  = /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i;

function extractUserFacts(text) {
  const out = {};
  const name = NAME_RX.exec(text)?.[1];
  if (name) out.name = name.trim();
  const age = AGE_RX.exec(text)?.[1];
  if (age) out.age = Number(age);
  const email = EMAIL_RX.exec(text)?.[1];
  if (email) out.email = email.trim();
  return out;
}

// ------------------------------ HTTP ------------------------------
const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json());

// Multer (memory) for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

// Sanity routes registry + helper
const ROUTES = [];
const addRoute = (method, routePath, handler, middleware = []) => {
  ROUTES.push(`${method.toUpperCase()} ${routePath}`);
  if (middleware.length) {
    app[method](routePath, ...middleware, handler);
  } else {
    app[method](routePath, handler);
  }
};

addRoute("get", "/__ping", (req, res) => res.json({ ok: true, server: "helix-backend" }));
addRoute("get", "/__routes", (req, res) => res.json({ ok: true, routes: ROUTES }));

const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

// Ollama helpers (Node 18+ has global fetch)
async function ollamaJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await r.json();
}
async function* ollamaStream(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) throw new Error(`upstream error ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines.filter(Boolean)) yield line;
  }
  if (buf.trim()) yield buf.trim();
}

// ------------------------------ Health & models ------------------------------
addRoute("get", "/api/health", async (_, res) => {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`);
    const j = await r.json();
    const models = Array.isArray(j.models) ? j.models.map(m => m.name) : [];
    res.json({ ok: true, model: models[0] || "gemma:7b-instruct", ollama: OLLAMA });
  } catch {
    res.json({ ok: true, model: "gemma:7b-instruct", ollama: OLLAMA });
  }
});
addRoute("get", "/api/models", async (_, res) => {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`);
    const j = await r.json();
    const models = Array.isArray(j.models) ? j.models.map(m => m.name) : [];
    res.json({ ok: true, models });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

/* ---------- Install / Uninstall models ---------- */
// Stream install (pull) progress via SSE
addRoute("get", "/api/models/pull", async (req, res) => {
  try {
    const name = String(req.query.name || "").trim();
    if (!name) {
      res.status(400).json({ ok: false, error: "name required" });
      return;
    }
    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Kick off Ollama pull with stream=true
    const r = await fetch(`${OLLAMA}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, stream: true }),
    });
    if (!r.ok || !r.body) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: `upstream ${r.status}` })}\n\n`);
      res.end();
      return;
    }

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let doneFlag = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines.filter(Boolean)) {
        try {
          const j = JSON.parse(line);
          const payload = {
            status: j.status || "",
            percent: typeof j.percent === "number" ? Math.max(0, Math.min(100, j.percent)) : undefined,
            total: j.total,
            completed: j.completed,
            digest: j.digest,
            done: !!j.done,
          };
          if (payload.done) doneFlag = true;
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        } catch {
          res.write(`data: ${JSON.stringify({ status: line })}\n\n`);
        }
      }
    }
    if (!doneFlag) {
      res.write(`data: ${JSON.stringify({ status: "finished", done: true, percent: 100 })}\n\n`);
    }
    res.end();
  } catch (e) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: String(e?.message || e) })}\n\n`);
    res.end();
  }
});

// Uninstall (delete) a model — NOTE: Ollama expects { name }, not { model }
// ---- replace your existing uninstall route with this ----
addRoute("post", "/api/models/delete", async (req, res) => {
  const name = (pick(req.body, "name", "") || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "name required" });

  async function tryDelete(body, method = "DELETE") {
    const r = await fetch(`${OLLAMA}/api/delete`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r;
  }

  try {
    // 1) Preferred: DELETE with { name }
    let r = await tryDelete({ name }, "DELETE");

    // 2) Some builds want { model } instead of { name }
    if (!r.ok && (r.status === 400 || r.status === 404)) {
      r = await tryDelete({ model: name }, "DELETE");
    }

    // 3) Older proxies sometimes only allow POST to /api/delete
    if (!r.ok && (r.status === 405 || r.status === 501)) {
      r = await tryDelete({ name }, "POST");
    }

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(500).json({ ok: false, error: `upstream ${r.status}: ${txt || "delete failed"}` });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});


// ------------------------------ Web Search (DuckDuckGo HTML) ------------------------------
async function searchDDG(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`DDG status ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];
    $("div.result").each((i, el) => {
      if (results.length >= 5) return;
      const title = $(el).find("h2.result__title > a.result__a").text().trim();
      const link = $(el).find("a.result__url").attr("href");
      const snippet = $(el).find("a.result__snippet").text().trim();
      if (title && link && snippet) results.push({ title, link, snippet });
    });
    return results;
  } catch (e) {
    console.error(`[searchDDG] failed for query "${query}":`, e);
    return [];
  }
}
addRoute("post", "/api/search", async (req, res) => {
  try {
    const query = pick(req.body, "query", "");
    if (!query) return res.json({ ok: false, error: "query required" });
    const results = await searchDDG(query);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ------------------------------ FACTS endpoints ------------------------------
addRoute("get", "/api/memory/facts", (req, res) => {
  const userId = req.query.userId || "default";
  res.json({ ok: true, facts: getFacts(userId) });
});
addRoute("post", "/api/memory/facts", (req, res) => {
  const userId = pick(req.body, "userId", "default");
  const facts = pick(req.body, "facts", {});
  upsertUserFacts(userId, facts);
  res.json({ ok: true, facts: getFacts(userId) });
});
addRoute("delete", "/api/memory/facts", (req, res) => {
  const userId = pick(req.body, "userId", "default");
  const all    = !!pick(req.body, "all", false);
  const key    = pick(req.body, "key");
  if (all) {
    clearUserFacts(userId);
    return res.json({ ok: true });
  }
  if (!key) return res.json({ ok: false, error: "key required" });
  const ok = deleteUserFact(userId, key);
  res.json({ ok });
});

// ------------------------------ AI ROLE endpoints ------------------------------
addRoute("get", "/api/memory/ai-role", (req, res) => {
  const conversationId = req.query.conversationId || "default";
  res.json({ ok: true, role: getRole(conversationId) });
});
addRoute("post", "/api/memory/ai-role", (req, res) => {
  const conversationId = pick(req.body, "conversationId", "default");
  const role = pick(req.body, "role", "");
  setRole(conversationId, role);
  res.json({ ok: true, role: getRole(conversationId) });
});
addRoute("delete", "/api/memory/ai-role", (req, res) => {
  const conversationId = pick(req.body, "conversationId", "default");
  clearRole(conversationId);
  res.json({ ok: true, role: "" });
});

// ------------------------------ Generation (non-stream) ------------------------------
addRoute("post", "/api/generate", async (req, res) => {
  try {
    const model  = pick(req.body, "model", "gemma:7b-instruct");
    const prompt = pick(req.body, "prompt", "");
    const userId = "default";
    const cid    = pick(req.body, "conversationId", "default");

    const auto = extractUserFacts(prompt);
    if (Object.keys(auto).length) upsertUserFacts(userId, auto);

    pushTurn(cid, "user", prompt);
    const chatHistory = lastTurns(cid, 8)
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const facts = getFacts(userId);
    const userBlob = Object.keys(facts.user).length
      ? "USER FACTS (about the HUMAN):\n" +
        Object.entries(facts.user).map(([k, v]) => `- ${k}: ${v}`).join("\n") + "\n\n"
      : "";
    const aiBlob =
      "ASSISTANT FACTS (about YOU, the AI):\n" +
      Object.entries(facts.ai).map(([k, v]) => `- ${k}: ${v}`).join("\n") + "\n\n";

    const role = getRole(cid);
    const roleLine = role ? `ASSISTANT ROLE (chat-scoped): ${role}\n\n` : "";

    const system = `You are Helix, a local coding assistant.
CRITICAL IDENTITY RULES:
- USER FACTS describe the HUMAN. Refer to them as "you".
- ASSISTANT FACTS describe YOU, Helix. Refer to yourself as "I".
- Never claim USER facts as your own, and never state assistant facts as the user's.`;

    const fullPrompt =
      `${system}\n${roleLine}${userBlob}${aiBlob}${chatHistory}\nUSER: ${prompt}\nASSISTANT:`;

    const j = await ollamaJSON(`${OLLAMA}/api/generate`, { model, prompt: fullPrompt, stream: false });
    const reply = j?.response || "(no response)";
    pushTurn(cid, "assistant", reply);
    res.json({ ok: true, data: { model, response: reply } });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

// ------------------------------ Generation (stream, optional file) ------------------------------
addRoute(
  "post",
  "/api/stream",
  async (req, res) => {
    try {
      const model   = pick(req.body, "model", "gemma:7b-instruct");
      const message = pick(req.body, "message", "");
      const userId  = "default";
      const cid     = pick(req.body, "conversationId", "default");

      // Optional file context (handled by multer)
      let fileContext = "";
      if (req.file) {
        try {
          let text = "";
          if (req.file.mimetype === "application/pdf") {
            const { text: parsedText } = await pdf(req.file.buffer);
            text = parsedText || "";
          } else if (req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            const { value } = await mammoth.extractRawText({ buffer: req.file.buffer });
            text = value || "";
          } else if (req.file.mimetype === "text/plain") {
            text = req.file.buffer.toString("utf8");
          }
          fileContext = text
            ? `The user has uploaded a file named "${req.file.originalname}". Its content is provided below for context.\n\n--- FILE CONTENT ---\n${text}\n--- END FILE CONTENT ---\n\n`
            : `[System note: User uploaded a file "${req.file.originalname}", but it was of an unsupported type or empty.]\n\n`;
        } catch (e) {
          console.error("File parsing error:", e);
          fileContext = `[System note: An error occurred while trying to read the uploaded file "${req.file.originalname}".]\n\n`;
        }
      }

      // Extract simple facts, save
      const auto = extractUserFacts(message);
      if (Object.keys(auto).length) upsertUserFacts(userId, auto);

      // Persist user turn
      const userTurnContent = fileContext ? `${fileContext}User's message: ${message}` : message;
      pushTurn(cid, "user", userTurnContent);

      // Build short chat history
      const chatHistory = lastTurns(cid, 8)
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");

      const facts = getFacts(userId);
      const userBlob = Object.keys(facts.user).length
        ? "USER FACTS (about the HUMAN):\n" +
          Object.entries(facts.user).map(([k, v]) => `- ${k}: ${v}`).join("\n") + "\n\n"
        : "";
      const aiBlob =
        "ASSISTANT FACTS (about YOU, the AI):\n" +
        Object.entries(facts.ai).map(([k, v]) => `- ${k}: ${v}`).join("\n") + "\n\n";

      const role = getRole(cid);
      const roleLine = role ? `ASSISTANT ROLE (chat-scoped): ${role}\n\n` : "";

      const system = `You are Helix, a local coding assistant.
CRITICAL IDENTITY RULES:
- USER FACTS describe the HUMAN. Use second-person ("you").
- ASSISTANT FACTS describe YOU. Use first-person ("I").
- Do not conflate the two.`;

      const fullPrompt =
        `${system}\n${roleLine}${userBlob}${aiBlob}${chatHistory}\n` +
        `USER: ${userTurnContent}\nASSISTANT:`;

      // SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      res.write(`event: meta\ndata: ${JSON.stringify({ model })}\n\n`);

      let acc = "";
      for await (const line of ollamaStream(`${OLLAMA}/api/generate`, {
        model, prompt: fullPrompt, stream: true
      })) {
        try {
          const j = JSON.parse(line);
          if (j.response) {
            acc += j.response;
            res.write(`data: ${JSON.stringify({ token: j.response })}\n\n`);
          }
          if (j.done) {
            pushTurn(cid, "assistant", acc || "(no response)");
            res.write("event: done\ndata: ok\n\n");
          }
        } catch {
          acc += line;
          res.write(`data: ${JSON.stringify({ token: line })}\n\n`);
        }
      }
      res.end();
    } catch (e) {
      res.write(`event: error\ndata: ${String(e?.message || e)}\n\n`);
      res.end();
    }
  },
  [upload.single("file")]   // attach multer via addRoute helper
);

// ------------------------------ RAG (Retrieval-Augmented Generation) ------------------------------
const EMBED_MODEL = process.env.EMBED_MODEL || "nomic-embed-text"; // run: `ollama pull nomic-embed-text`

const RAG_DIR = path.join(DATA_DIR, "rag");
const RAG_INDEX_FILE = path.join(RAG_DIR, "rag_index.json");
if (!fs.existsSync(RAG_DIR)) fs.mkdirSync(RAG_DIR, { recursive: true });

// In-memory index: { vectors: Array<ChunkRecord>, docs: { [docId]: DocMeta } }
let ragIndex = loadRagIndex();

function loadRagIndex() {
  try {
    if (fs.existsSync(RAG_INDEX_FILE)) {
      const j = JSON.parse(fs.readFileSync(RAG_INDEX_FILE, "utf-8"));
      j.vectors ||= [];
      j.docs ||= {};
      return j;
    }
  } catch (e) {
    console.error("[RAG] failed loading index:", e);
  }
  return { vectors: [], docs: {} };
}
function saveRagIndexSoon() {
  clearTimeout(saveRagIndexSoon._id);
  saveRagIndexSoon._id = setTimeout(() => {
    try {
      fs.writeFileSync(RAG_INDEX_FILE, JSON.stringify(ragIndex, null, 2));
    } catch (e) {
      console.error("[RAG] failed saving index:", e);
    }
  }, 100);
}

function cosine(a = [], b = []) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    const x = a[i], y = b[i];
    dot += x * y; na += x * x; nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function chunkText(text, chunkSize = 1200, overlap = 200) {
  const out = [];
  text = (text || "").replace(/\r/g, "");
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + chunkSize);
    const slice = text.slice(i, end).trim();
    if (slice) out.push({ start: i, end, text: slice });
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return out;
}
async function embedText(str) {
  const j = await ollamaJSON(`${OLLAMA}/api/embeddings`, { model: EMBED_MODEL, prompt: str });
  const emb = j?.embedding;
  if (!emb || !Array.isArray(emb)) throw new Error("embedding failed (check EMBED_MODEL & ollama)");
  return emb;
}

async function extractTextFromUpload(file) {
  const mime = file.mimetype;
  if (mime === "application/pdf") {
    const { text } = await pdf(file.buffer);
    return text || "";
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value || "";
  }
  if (mime === "text/plain" || mime === "text/markdown") {
    return file.buffer.toString("utf8");
  }
  if (mime === "text/html") {
    const $ = cheerio.load(file.buffer.toString("utf8"));
    return $("body").text();
  }
  return file.buffer?.toString?.("utf8") || "";
}

function newDocId() {
  return "doc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

async function indexDocument({ title, mime, text }) {
  const docId = newDocId();
  const chunks = chunkText(text);
  let added = 0;

  for (let idx = 0; idx < chunks.length; idx++) {
    const c = chunks[idx];
    const emb = await embedText(c.text);
    ragIndex.vectors.push({
      id: `${docId}#${idx + 1}`,
      docId,
      title,
      mime,
      charStart: c.start,
      charEnd: c.end,
      chunk: c.text,
      embedding: emb,
    });
    added++;
    if ((idx + 1) % 8 === 0) saveRagIndexSoon();
  }

  ragIndex.docs[docId] = {
    docId,
    title,
    mime,
    chunks: added,
    chars: text.length,
    addedAt: Date.now(),
  };
  saveRagIndexSoon();
  return ragIndex.docs[docId];
}

function removeDoc(docId) {
  const before = ragIndex.vectors.length;
  ragIndex.vectors = ragIndex.vectors.filter(v => v.docId !== docId);
  delete ragIndex.docs[docId];
  saveRagIndexSoon();
  return before - ragIndex.vectors.length;
}

async function searchRag(query, topK = 5) {
  const qEmb = await embedText(query);
  const scored = ragIndex.vectors.map(v => ({
    ...v,
    score: cosine(qEmb, v.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(topK, 50)));
}

// Ingest & index a file
addRoute(
  "post",
  "/api/rag/upload",
  async (req, res) => {
    try {
      if (!req.file) return res.json({ ok: false, error: "file required (multipart field: 'file')" });
      const text = await extractTextFromUpload(req.file);
      if (!text?.trim()) return res.json({ ok: false, error: "file had no extractable text" });
      const meta = await indexDocument({
        title: req.file.originalname,
        mime: req.file.mimetype,
        text,
      });
      res.json({ ok: true, doc: meta });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  },
  [upload.single("file")]
);

// List docs
addRoute("get", "/api/rag/list", (req, res) => {
  res.json({
    ok: true,
    docs: Object.values(ragIndex.docs).sort((a, b) => b.addedAt - a.addedAt),
    count: ragIndex.vectors.length,
    embedModel: EMBED_MODEL,
  });
});

// Clear one doc or all
addRoute("delete", "/api/rag/clear", (req, res) => {
  const docId = req.query.docId || req.body?.docId;
  if (!docId || docId === "all") {
    ragIndex = { vectors: [], docs: {} };
    saveRagIndexSoon();
    return res.json({ ok: true, cleared: "all" });
  }
  const removed = removeDoc(docId);
  res.json({ ok: true, cleared: docId, removed });
});

// Semantic search
addRoute("post", "/api/rag/search", async (req, res) => {
  try {
    const query = (req.body?.query || "").trim();
    const topK = Math.max(1, Math.min(Number(req.body?.topK) || 5, 50));
    if (!query) return res.json({ ok: false, error: "query required" });

    const hits = await searchRag(query, topK);
    res.json({
      ok: true,
      hits: hits.map((h, i) => ({
        rank: i + 1,
        id: h.id,
        docId: h.docId,
        title: h.title,
        score: Number(h.score.toFixed(4)),
        preview: h.chunk.slice(0, 280),
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Ask with RAG (SSE)
addRoute("post", "/api/rag/ask", async (req, res) => {
  try {
    const question = (req.body?.question || "").trim();
    const model = req.body?.model || "gemma:7b-instruct";
    const topK = Math.max(1, Math.min(Number(req.body?.topK) || 5, 20));
    if (!question) {
      return res.status(400).json({ ok: false, error: "question required" });
    }

    const hits = await searchRag(question, topK);
    const sourcesBlock = hits.map((h, i) => {
      const tag = `[${i + 1} • ${h.title} • ${h.docId} • score ${h.score.toFixed(3)}]`;
      return `${tag}\n${h.chunk}`;
    }).join("\n\n---\n\n");

    const system = `You are Helix with Retrieval-Augmented Generation.
You MUST answer using ONLY the information from the "SOURCES" below. If the sources don't contain the answer, say you don't know.
When relevant, reference source tags like [1], [2], etc. Keep answers concise and technical.`;

    const prompt =
`${system}

SOURCES:
${sourcesBlock}

QUESTION:
${question}

FINAL ANSWER (with inline [source] tags):`;

    // SSE setup
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`event: meta\ndata: ${JSON.stringify({ model, topK, sources: hits.map((h,i)=>({i:i+1,title:h.title,docId:h.docId})) })}\n\n`);

    let acc = "";
    for await (const line of ollamaStream(`${OLLAMA}/api/generate`, { model, prompt, stream: true })) {
      try {
        const j = JSON.parse(line);
        if (j.response) {
          acc += j.response;
          res.write(`data: ${JSON.stringify({ token: j.response })}\n\n`);
        }
        if (j.done) {
          res.write("event: done\ndata: ok\n\n");
        }
      } catch {
        acc += line;
        res.write(`data: ${JSON.stringify({ token: line })}\n\n`);
      }
    }
    res.end();
  } catch (e) {
    res.write(`event: error\ndata: ${String(e?.message || e)}\n\n`);
    res.end();
  }
});

// ------------------------------ Clear memories ------------------------------
addRoute("post", "/api/memory/clear", (req, res) => {
  const what = pick(req.body, "what", "chat"); // "chat" | "facts"
  if (what === "chat") {
    chatMemory = {};
    saveSoon();
    return res.json({ ok: true });
  }
  if (what === "facts") {
    const userId = pick(req.body, "userId", "default");
    clearUserFacts(userId);
    return res.json({ ok: true });
  }
  res.json({ ok: false, error: "unknown 'what'" });
});

// ------------------------------ JSON 404 ------------------------------
addRoute("all", "*", (req, res) => {
  res.status(404).json({ ok: false, error: `No route for ${req.method} ${req.path}` });
});

// ------------------------------ Start ------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[helix-backend] listening on http://127.0.0.1:${PORT}`);
  console.log("[helix-backend] Routes:");
  for (const r of ROUTES) console.log("  -", r);
});
