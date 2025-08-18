// server/server.js
// Helix backend with memory + robust SSE streaming for Ollama

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

// --- Web Streams polyfill (helps Node 16/17 use undici cleanly)
import { ReadableStream, WritableStream, TransformStream } from 'stream/web';
globalThis.ReadableStream = globalThis.ReadableStream || ReadableStream;
globalThis.WritableStream = globalThis.WritableStream || WritableStream;
globalThis.TransformStream = globalThis.TransformStream || TransformStream;

// --- Fetch from undici (stable for Node 16–20)
import { fetch, Headers, Request, Response } from 'undici';
globalThis.fetch = fetch;
globalThis.Headers = Headers;
globalThis.Request = Request;
globalThis.Response = Response;

// ---------------------------- Config ----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '127.0.0.1';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

// ---------------------------- App ------------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// --- Memory UI state ---
const [facts, setFacts] = useState({});
const [factKey, setFactKey] = useState("");
const [factValue, setFactValue] = useState("");

const [noteText, setNoteText] = useState("");
const [noteQ, setNoteQ] = useState("");
const [noteResults, setNoteResults] = useState([]);

// You can change this if you later add real users:
const userId = "default";

// --- Memory API helpers ---
async function loadFacts() {
  try {
    const r = await fetch(`${API_BASE}/api/memory/facts?userId=${encodeURIComponent(userId)}`);
    const j = await r.json();
    if (j.ok) setFacts(j.facts || {});
  } catch (e) {
    console.error("loadFacts error", e);
  }
}

async function saveFact() {
  if (!factKey.trim()) return;
  try {
    const body = { userId, facts: { [factKey.trim()]: factValue } };
    const r = await fetch(`${API_BASE}/api/memory/facts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.ok) {
      setFacts(j.facts || {});
      setFactKey("");
      setFactValue("");
    }
  } catch (e) {
    console.error("saveFact error", e);
  }
}

async function rememberNote() {
  if (!noteText.trim()) return;
  try {
    const r = await fetch(`${API_BASE}/api/memory/remember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, text: noteText.trim() }),
    });
    await r.json(); // We don't need the id here
    setNoteText("");
  } catch (e) {
    console.error("rememberNote error", e);
  }
}

async function searchNotes() {
  try {
    const r = await fetch(`${API_BASE}/api/memory/search?userId=${encodeURIComponent(userId)}&q=${encodeURIComponent(noteQ)}&k=4`);
    const j = await r.json();
    if (j.ok) setNoteResults(j.results || []);
  } catch (e) {
    console.error("searchNotes error", e);
  }
}

async function clearChatMemory() {
  try {
    await fetch(`${API_BASE}/api/memory/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ what: "chat", conversationId: "default" }),
    });
  } catch (e) {
    console.error("clearChatMemory error", e);
  }
}

// ------------------------ Health & Models -----------------------
app.get('/api/health', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    const j = await r.json();
    const first = (j.models && j.models[0] && j.models[0].name) || null;
    res.json({ ok: true, model: first, ollama: OLLAMA_URL });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    const j = await r.json();
    const models = Array.isArray(j.models) ? j.models.map(m => m.name) : [];
    res.json({ ok: true, models });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ------------------------- Memory APIs -------------------------
app.post('/api/memory/facts', (req, res) => {
  const { userId = 'default', facts = {} } = req.body || {};
  const prev = profileFacts.get(userId) || {};
  const next = { ...prev, ...facts };
  profileFacts.set(userId, next);
  res.json({ ok: true, facts: next });
});
app.get('/api/memory/facts', (req, res) => {
  const userId = req.query.userId || 'default';
  res.json({ ok: true, facts: profileFacts.get(userId) || {} });
});
app.post('/api/memory/remember', async (req, res) => {
  const { userId = 'default', text } = req.body || {};
  if (!text) return res.status(400).json({ ok: false, error: 'text required' });
  try {
    const emb = await embedText(text);
    const item = { id: randomUUID(), userId, text, embedding: emb, ts: Date.now() };
    vectorMemory.push(item);
    res.json({ ok: true, id: item.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});
app.get('/api/memory/search', async (req, res) => {
  const { userId = 'default', q = '', k = 4 } = req.query || {};
  try {
    const hits = await searchSemantic(userId, q, Number(k));
    res.json({ ok: true, results: hits.map(h => ({ id: h.id, text: h.text, score: h.score })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});
app.post('/api/memory/clear', (req, res) => {
  const { conversationId, userId = 'default', what = 'chat' } = req.body || {};
  if (what === 'chat' && conversationId) chatMemory.delete(conversationId);
  if (what === 'facts') profileFacts.set(userId, {});
  if (what === 'semantic') vectorMemory = vectorMemory.filter(v => v.userId !== userId);
  res.json({ ok: true });
});

// -------------------- SSE helpers ------------------
function setSSEHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

// ------------------- Non-stream (JSON) -------------------
app.post('/api/generate', async (req, res) => {
  try {
    let {
      prompt = '',
      model = 'llama3.1:8b',
      options = {},
      system = '',
      conversationId = 'default',
      userId = 'default'
    } = req.body || {};

    const hist = getHistory(conversationId, 8);
    const facts = profileFacts.get(userId) || {};
    const sem = await searchSemantic(userId, prompt, 4);

    const preamble = [
      system || 'You are Helix, a helpful local coding assistant.',
      factsPreamble(facts),
      semPreamble(sem),
      'When answering, you may refer back to these facts/notes.'
    ].filter(Boolean).join('\n\n');

    const fullPrompt =
      `${preamble}\n\n### Conversation Snippets\n` +
      `${hist.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}\n\n` +
      `### User\n${prompt}`;

    pushHistory(conversationId, { role: 'user', content: prompt });

    const upstream = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        options,
        stream: false
      })
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    const reply = data.response || data.message || text;
    if (reply) pushHistory(conversationId, { role: 'assistant', content: reply });

    res.json({ ok: true, data });
  } catch (e) {
    console.error('[generate] error:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ------------------- Stream (SSE) -------------------
app.post('/api/stream', async (req, res) => {
  try {
    let {
      // accept either "message" or "prompt" from client
      message = '',
      prompt = '',
      messages = null,
      system = '',
      model = 'llama3.1:8b',
      temperature,
      options = {},
      conversationId = 'default',
      userId = 'default'
    } = req.body || {};
    if (!message && prompt) message = prompt;

    setSSEHeaders(res);
    const usedModel = model;

    // Build memory context
    const hist = getHistory(conversationId, 16);
    const facts = profileFacts.get(userId) || {};
    const queryForSem = message || (Array.isArray(messages) ? (messages[messages.length - 1]?.content || '') : '');
    const sem = await searchSemantic(userId, queryForSem, 4);

    const preamble = [
      system || 'You are Helix, a helpful local coding assistant.',
      factsPreamble(facts),
      semPreamble(sem),
      'When answering, you may refer back to these facts/notes.'
    ].filter(Boolean).join('\n\n');

    // let the UI know which model is actually used
    res.write(`event: meta\ndata: ${JSON.stringify({ model: usedModel })}\n\n`);

    // Decide chat vs prompt
    let upstream;
    if (Array.isArray(messages)) {
      const withSys = [{ role: 'system', content: preamble }, ...hist, ...messages];
      upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: usedModel,
          messages: withSys,
          stream: true,
          options: {
            ...(temperature != null ? { temperature } : {}),
            ...options
          }
        })
      });
    } else {
      pushHistory(conversationId, { role: 'user', content: message });
      const fullPrompt =
        `${preamble}\n\n### Conversation Snippets\n` +
        `${hist.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}\n\n` +
        `### User\n${message}`;

      upstream = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: usedModel,
          prompt: fullPrompt,
          stream: true,
          options: {
            ...(temperature != null ? { temperature } : {}),
            ...options
          }
        })
      });
    }

    if (!upstream.ok || !upstream.body) {
      const errTxt = await upstream.text().catch(() => String(upstream.status));
      res.write(`event: error\ndata: ${JSON.stringify(errTxt)}\n\n`);
      return res.end();
    }

    // Read upstream NDJSON and convert to SSE tokens the UI expects
    const reader = upstream.body.getReader ? upstream.body.getReader() : null;
    const decoder = new TextDecoder();
    let finalText = '';

    async function handleChunk(s) {
      // Ollama sends NDJSON lines; each may contain {response:"…"} and eventually {done:true}
      const lines = s.split('\n');
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        try {
          const j = JSON.parse(line);
          if (typeof j.response === 'string' && j.response.length) {
            finalText += j.response;
            res.write(`data: ${JSON.stringify({ token: j.response })}\n\n`);
          }
          if (j.done) {
            if (finalText) pushHistory(conversationId, { role: 'assistant', content: finalText });
            res.write('event: done\ndata: {}\n\n');
            return true; // signal done
          }
        } catch {
          // non-JSON—still forward as plain text
          res.write(`data: ${JSON.stringify(line)}\n\n`);
        }
      }
      return false;
    }

    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const finished = await handleChunk(chunk);
        if (finished) break;
      }
    } else if (upstream.body && Symbol.asyncIterator in upstream.body) {
      for await (const chunk of upstream.body) {
        const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        const finished = await handleChunk(str);
        if (finished) break;
      }
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      await handleChunk(buf.toString('utf8'));
    }

    try { res.end(); } catch {}
  } catch (e) {
    console.error('[stream] error:', e);
    try {
      res.write(`event: error\ndata: ${JSON.stringify(String(e))}\n\n`);
      res.end();
    } catch {}
  }
});

// --------------------------- Start -----------------------------
app.listen(PORT, HOST, () => {
  console.log(`[helix-backend] listening on http://${HOST}:${PORT}`);
});
