import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/192\.168\.\d+\.\d+:\d+$/],
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

const PORT = process.env.PORT || 4000;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'deepseek-coder:33b';

app.get('/api/health', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    res.json({ ok: r.ok, model: DEFAULT_MODEL });
  } catch (e) {
    console.error('[health] cannot reach ollama:', e?.message || e);
    res.status(503).json({ ok: false, error: 'Cannot reach Ollama' });
  }
});

/** FIXED: list installed models (exact names) */
app.get('/api/models', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!r.ok) {
      const txt = await r.text();
      console.error('[models] ollama error:', txt);
      return res.status(502).json({ ok: false, error: 'Ollama error', details: txt });
    }
    const data = await r.json(); // { models: [{name, ...}] }
    const names = (data.models || []).map(m => m.name).sort();
    res.json({ ok: true, models: names });
  } catch (e) {
    console.error('[models] backend error:', e?.message || e);
    res.status(500).json({ ok: false, error: 'Backend error', details: String(e) });
  }
});

/** Non-streaming generation — returns the model used */
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, model, system, options } = req.body || {};
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

    const usedModel = model || DEFAULT_MODEL;
    const body = {
      model: usedModel,
      prompt,
      system: system || 'You are Helix, a local assistant. Be concise and correct.',
      stream: false,
      options: { temperature: 0.2, ...options }
    };

    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) return res.status(502).json({ error: 'Ollama error', details: await r.text() });

    const data = await r.json();
    res.setHeader('X-Helix-Model', usedModel);
    res.json({ response: data.response || '', model: usedModel });
  } catch (err) {
    console.error('[generate] error:', err);
    res.status(500).json({ error: 'Backend error', details: String(err) });
  }
});

/** Streaming via SSE — emits a meta event first with the model name */
app.post('/api/stream', async (req, res) => {
  try {
    const { prompt, model, system, options } = req.body || {};
    if (!prompt || !prompt.trim()) { res.writeHead(400); return res.end('Missing prompt'); }

    const usedModel = model || DEFAULT_MODEL;

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    // Tell the client which model is in use (authoritative)
    res.write(`event: meta\ndata: ${JSON.stringify({ model: usedModel })}\n\n`);

    const upstream = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: usedModel,
        prompt,
        system: system || 'You are Helix, a local assistant. Be concise and correct.',
        stream: true,
        options: { temperature: 0.2, ...options }
      })
    });

    if (!upstream.ok || !upstream.body) {
      res.write(`event: error\ndata: ${JSON.stringify(await upstream.text())}\n\n`);
      return res.end();
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // Ollama streams NDJSON lines
      for (const line of chunk.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          const json = JSON.parse(t);
          if (json.response) res.write(`data: ${JSON.stringify({ token: json.response })}\n\n`);
          if (json.done) {
            res.write('event: done\ndata: {}\n\n');
            return res.end();
          }
        } catch {/* ignore partials */}
      }
    }
  } catch (err) {
    console.error('[stream] error:', err);
    res.write(`event: error\ndata: ${JSON.stringify(String(err))}\n\n`);
    res.end();
  }
});

/** Chat endpoint (kept) */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model, options } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages' });
    }
    const usedModel = model || DEFAULT_MODEL;

    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: usedModel,
        stream: false,
        options: { temperature: 0.2, ...options },
        messages
      })
    });
    if (!r.ok) return res.status(502).json({ error: 'Ollama error', details: await r.text() });

    const data = await r.json();
    res.setHeader('X-Helix-Model', usedModel);
    res.json({ message: data.message?.content || '', model: usedModel });
  } catch (err) {
    console.error('[chat] error:', err);
    res.status(500).json({ error: 'Backend error', details: String(err) });
  }
});

/** Pull with progress (unchanged) */
app.post('/api/pull', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) { res.writeHead(400); return res.end('Missing model name'); }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const upstream = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stream: true })
    });

    if (!upstream.ok || !upstream.body) {
      res.write(`event: error\ndata: ${JSON.stringify(await upstream.text())}\n\n`);
      return res.end();
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          const json = JSON.parse(t);
          res.write(`data: ${JSON.stringify(json)}\n\n`);
          if (json.completed) {
            res.write('event: done\ndata: {}\n\n');
            return res.end();
          }
        } catch {}
      }
    }
  } catch (err) {
    console.error('[pull] error:', err);
    res.write(`event: error\ndata: ${JSON.stringify(String(err))}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`[helix-backend] listening on http://127.0.0.1:${PORT}`);
});
