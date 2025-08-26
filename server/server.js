// server/server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

// Sanity routes (so you can verify you’re on the right server file)
const ROUTES = [];
const addRoute = (method, path, handler) => {
  ROUTES.push(`${method.toUpperCase()} ${path}`);
  app[method](path, handler);
};
addRoute("get", "/__ping", (req, res) => res.json({ ok: true, server: "helix-backend" }));
addRoute("get", "/__routes", (req, res) => res.json({ ok: true, routes: ROUTES }));

const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

// Ollama helpers
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
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, { stream: true });
    for (const line of chunk.split("\n").filter(Boolean)) yield line;
  }
}

// Health & models
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

// -------- FACTS endpoints --------
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

// -------- AI ROLE endpoints (per conversation) --------
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

// -------- generation (non-stream) --------
addRoute("post", "/api/generate", async (req, res) => {
  try {
    const model  = pick(req.body, "model", "gemma:7b-instruct");
    const prompt = pick(req.body, "prompt", "");
    const userId = "default";
    const cid    = "default";

    const auto = extractUserFacts(prompt);
    if (Object.keys(auto).length) upsertUserFacts(userId, auto);

    pushTurn(cid, "user", prompt);
    const history = lastTurns(cid, 8).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

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

    const fullPrompt = `${system}\n${roleLine}${userBlob}${aiBlob}${history}\nUSER: ${prompt}\nASSISTANT:`;

    const j = await ollamaJSON(`${OLLAMA}/api/generate`, { model, prompt: fullPrompt, stream: false });
    const reply = j?.response || "(no response)";
    pushTurn(cid, "assistant", reply);
    res.json({ ok: true, data: { model, response: reply } });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

// -------- generation (stream) --------
addRoute("post", "/api/stream", async (req, res) => {
  try {
    const model   = pick(req.body, "model", "gemma:7b-instruct");
    const message = pick(req.body, "message", "");
    const userId  = "default";
    const cid     = "default";

    const auto = extractUserFacts(message);
    if (Object.keys(auto).length) upsertUserFacts(userId, auto);

    pushTurn(cid, "user", message);
    const history = lastTurns(cid, 8).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

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

    const fullPrompt = `${system}\n${roleLine}${userBlob}${aiBlob}${history}\nUSER: ${message}\nASSISTANT:`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`event: meta\ndata: ${JSON.stringify({ model })}\n\n`);

    let acc = "";
    for await (const line of ollamaStream(`${OLLAMA}/api/generate`, { model, prompt: fullPrompt, stream: true })) {
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
});

// Clear memories
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

// JSON 404 (so you never see the HTML "Cannot POST" page)
app.all("*", (req, res) => {
  res.status(404).json({ ok: false, error: `No route for ${req.method} ${req.path}` });
});

// ------------------------------ Start ------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[helix-backend] listening on http://127.0.0.1:${PORT}`);
  console.log("[helix-backend] Routes:");
  for (const r of ROUTES) console.log("  -", r);
});
