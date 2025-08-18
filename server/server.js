// server/server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------------- persistence ---------------- */
const DATA_DIR = path.join(__dirname, "data");
const CHAT_FILE = path.join(DATA_DIR, "chat_memory.json");
const FACTS_FILE = path.join(DATA_DIR, "facts_memory.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, JSON.stringify({}), "utf-8");
if (!fs.existsSync(FACTS_FILE)) {
  fs.writeFileSync(FACTS_FILE, JSON.stringify({}), "utf-8");
}

let chatMemory = JSON.parse(fs.readFileSync(CHAT_FILE, "utf-8"));
let factsMemory = JSON.parse(fs.readFileSync(FACTS_FILE, "utf-8"));

function saveSoon() {
  clearTimeout(saveSoon._id);
  saveSoon._id = setTimeout(() => {
    fs.writeFileSync(CHAT_FILE, JSON.stringify(chatMemory, null, 2));
    fs.writeFileSync(FACTS_FILE, JSON.stringify(factsMemory, null, 2));
  }, 250);
}

const pick = (o, k, d) => (o && k in o ? o[k] : d);
const normKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");

/* Ensure per-user structure: { user: {...}, ai: {...} } */
function ensureFacts(userId = "default") {
  if (!factsMemory[userId]) {
    factsMemory[userId] = {
      user: {},
      ai: { name: "Helix", role: "local coding assistant" }, // Helix self-identity (read-only)
    };
  } else {
    const f = factsMemory[userId];
    if (!f.user) f.user = {};
    if (!f.ai) f.ai = { name: "Helix", role: "local coding assistant" };
  }
  return factsMemory[userId];
}

function getFacts(userId = "default") {
  return ensureFacts(userId);
}

function upsertUserFacts(userId = "default", kv = {}) {
  const facts = ensureFacts(userId);
  for (const [k, v] of Object.entries(kv)) {
    const key = normKey(k);
    const val = typeof v === "string" ? v.trim() : v;
    if (!key || val === undefined || val === null || val === "") continue;
    facts.user[key] = val;
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

/* simple pattern-based extraction → only user facts */
function extractUserFacts(text = "") {
  const t = " " + String(text).trim() + " ";
  const out = {};
  let m;

  if ((m = t.match(/\b(?:my name is|call me|i am)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b/i))) {
    out.name = m[1].trim();
  }
  if ((m = t.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i))) {
    out.email = m[1].trim();
  }
  if ((m = t.match(/\bfav(?:ou)?rite color(?: is|:)?\s+([a-z]+)\b/i))) {
    out.favorite_color = m[1].trim();
  }
  if ((m = t.match(/\bfav(?:ou)?rite (?:language|lang)(?: is|:)?\s+([A-Za-z+#.\- ]+)\b/i))) {
    out.favorite_language = m[1].trim();
  }
  if ((m = t.match(/\b(?:i code in|i use|i write in)\s+([A-Za-z+#.\- ]+)\b/i))) {
    out.primary_stack = m[1].trim();
  }
  if ((m = t.match(/\b(?:i live in|i'm in|i am in)\s+([A-Za-z ]{3,})\b/i))) {
    out.location = m[1].trim();
  }
  if ((m = t.match(/\b(?:timezone|time zone)(?: is|:)?\s*([A-Za-z/_+\-0-9]+)\b/i))) {
    out.timezone = m[1].trim();
  }
  return out;
}

/* ---------------- server ---------------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

async function ollamaJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`ollama: ${r.status}`);
  return await r.json();
}
async function ollamaStream(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`ollama: ${r.status}`);
  return r;
}

/* health/models */
app.get("/api/health", async (_, res) => {
  res.json({ ok: true, model: "gemma:7b-instruct", ollama: OLLAMA });
});
app.get("/api/models", async (_, res) => {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`);
    const j = await r.json();
    const models = Array.isArray(j.models) ? j.models.map((m) => m.name) : [];
    res.json({ ok: true, models });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

/* memory APIs (segregated) */
app.get("/api/memory/facts", (req, res) => {
  const userId = req.query.userId || "default";
  res.json({ ok: true, facts: getFacts(userId) });
});

app.post("/api/memory/facts", (req, res) => {
  const userId = pick(req.body, "userId", "default");
  const facts = pick(req.body, "facts", {});
  upsertUserFacts(userId, facts);
  res.json({ ok: true, facts: getFacts(userId) });
});

app.delete("/api/memory/facts", (req, res) => {
  const userId = pick(req.body, "userId", "default");
  const bucket = pick(req.body, "bucket", "user"); // user | ai (ai deletion is disabled by default)
  const all = !!pick(req.body, "all", false);
  const key = pick(req.body, "key");

  if (bucket !== "user") {
    return res.json({ ok: false, error: "Only user bucket can be modified." });
  }
  if (all) {
    clearUserFacts(userId);
    return res.json({ ok: true, facts: getFacts(userId) });
  }
  if (!key) return res.json({ ok: false, error: "Provide 'key' or set 'all:true'." });
  const ok = deleteUserFact(userId, key);
  if (!ok) return res.json({ ok: false, error: "Key not found." });
  return res.json({ ok: true, facts: getFacts(userId) });
});

/* chat history helpers */
function pushTurn(cid = "default", role, content) {
  if (!chatMemory[cid]) chatMemory[cid] = [];
  chatMemory[cid].push({ role, content, ts: Date.now() });
  if (chatMemory[cid].length > 40) chatMemory[cid] = chatMemory[cid].slice(-40);
  saveSoon();
}
function lastTurns(cid = "default", n = 10) {
  const arr = chatMemory[cid] || [];
  return arr.slice(-n);
}

/* non-stream */
app.post("/api/generate", async (req, res) => {
  try {
    const model = pick(req.body, "model", "gemma:7b-instruct");
    const prompt = pick(req.body, "prompt", "");
    const userId = "default";
    const cid = "default";

    // auto-extract to USER bucket
    const auto = extractUserFacts(prompt);
    if (Object.keys(auto).length) upsertUserFacts(userId, auto);

    pushTurn(cid, "user", prompt);
    const history = lastTurns(cid, 8)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const facts = getFacts(userId);
    const userBlob = Object.keys(facts.user).length
      ? "USER FACTS (about the HUMAN):\n" +
        Object.entries(facts.user)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n") +
        "\n\n"
      : "";
    const aiBlob =
      "ASSISTANT FACTS (about YOU, the AI):\n" +
      Object.entries(facts.ai)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n") +
      "\n\n";

    const system = `You are Helix, a local coding assistant.
CRITICAL IDENTITY RULES:
- USER FACTS describe the HUMAN. Refer to them in second-person ("you").
- ASSISTANT FACTS describe YOU, Helix. Refer to yourself as "I".
- NEVER claim USER facts as your own and NEVER state assistant facts as the user's.`;

    const fullPrompt = `${system}\n${userBlob}${aiBlob}${history}\nUSER: ${prompt}\nASSISTANT:`;

    const j = await ollamaJSON(`${OLLAMA}/api/generate`, {
      model,
      prompt: fullPrompt,
      stream: false,
    });
    const reply = j?.response || "(no response)";
    pushTurn(cid, "assistant", reply);
    res.json({ ok: true, data: { model, response: reply } });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

/* stream */
app.post("/api/stream", async (req, res) => {
  try {
    const model = pick(req.body, "model", "gemma:7b-instruct");
    const message = pick(req.body, "message", "");
    const userId = "default";
    const cid = "default";

    const auto = extractUserFacts(message);
    if (Object.keys(auto).length) upsertUserFacts(userId, auto);

    pushTurn(cid, "user", message);
    const history = lastTurns(cid, 8)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const facts = getFacts(userId);
    const userBlob = Object.keys(facts.user).length
      ? "USER FACTS (about the HUMAN):\n" +
        Object.entries(facts.user)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n") +
        "\n\n"
      : "";
    const aiBlob =
      "ASSISTANT FACTS (about YOU, the AI):\n" +
      Object.entries(facts.ai)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n") +
      "\n\n";

    const system = `You are Helix, a local coding assistant.
CRITICAL IDENTITY RULES:
- USER FACTS describe the HUMAN. Use second-person ("you").
- ASSISTANT FACTS describe YOU. Use first-person ("I") for these.
- Do not conflate the two.`;

    const fullPrompt = `${system}\n${userBlob}${aiBlob}${history}\nUSER: ${message}\nASSISTANT:`;

    const upstream = await ollamaStream(`${OLLAMA}/api/generate`, {
      model,
      prompt: fullPrompt,
      stream: true,
    });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    res.write(`event: meta\ndata: ${JSON.stringify({ model })}\n\n`);

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(Boolean);
      for (const ln of lines) {
        try {
          const j = JSON.parse(ln);
          if (j.response) {
            acc += j.response;
            res.write(`data: ${JSON.stringify({ token: j.response })}\n\n`);
          }
          if (j.done) {
            pushTurn(cid, "assistant", acc || "(no response)");
            res.write("event: done\ndata: ok\n\n");
          }
        } catch {
          acc += ln;
          res.write(`data: ${JSON.stringify({ token: ln })}\n\n`);
        }
      }
    }
    res.end();
  } catch (e) {
    res.write(`event: error\ndata: ${JSON.stringify(String(e?.message || e))}\n\n`);
    res.end();
  }
});

/* misc clears (chat vs facts) */
app.post("/api/memory/clear", (req, res) => {
  const what = pick(req.body, "what");
  if (what === "chat") {
    const cid = pick(req.body, "conversationId", "default");
    delete chatMemory[cid];
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[helix-backend] listening on http://127.0.0.1:${PORT}`);
});
