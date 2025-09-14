# Helix — Local AI Coding Assistant (React + Node + Ollama) with RAG

Helix is a local, privacy‑friendly developer assistant. It pairs a modern React UI with a lightweight Node/Express backend that talks to **Ollama** for LLMs and embeddings. It supports **streaming chat**, **file uploads** (PDF/DOCX/TXT/HTML), **facts/role memory**, **a built‑in code editor and notes editor**, **web search**, and **Retrieval‑Augmented Generation (RAG)** so Helix can answer questions grounded in your own documents.

---

## ✨ Features

* **Streaming Chat (SSE)** with local Ollama models (default: `gemma:7b-instruct`)
* **File understanding**: upload PDFs/DOCX/TXT/HTML; content is extracted and added to your prompt automatically
* **RAG (Retrieval‑Augmented Generation)**:

  * Ingest & index files
  * Semantic search with local embeddings (`nomic-embed-text`)
  * Ask questions with top‑K context chunks streamed to the LLM
* **Facts & Role Memory**

  * Persist simple user facts (name/email/etc.) and a per‑conversation “AI role”
* **Web Search (no API key)** via DuckDuckGo HTML, with top results you can paste into chat
* **Modern UI**

  * Multiple neon themes
  * **HelixEditor**: code editor (JS/TS/Python/Markdown/HTML/JSON) with local persistence & export
  * **NotesEditor**: rich text notes with sanitization, import/export, and quick insert to chat
  * Collapsible code blocks, markdown rendering, and animated DNA helix
* **Local persistence** of chat/facts/roles and RAG index (JSON files)

---

## 🧱 Architecture

```
React (frontend)
  ├─ Chat UI (SSE streams)
  ├─ HelixEditor (CodeMirror)
  └─ NotesEditor (iframe-richtext)

Node/Express (backend)
  ├─ /api/stream (SSE chat)     ──▶ Ollama /api/generate
  ├─ /api/generate (non-stream) ──▶ Ollama /api/generate
  ├─ /api/models, /api/health   ──▶ Ollama /api/tags
  ├─ /api/search (DDG scraper)
  ├─ /api/memory/* (facts/roles persistence)
  └─ RAG endpoints
      • /api/rag/upload → parse + chunk + embed → JSON index
      • /api/rag/search → cosine similarity
      • /api/rag/ask (SSE) → prompt with sources → Ollama

Ollama (local)
  • LLM: gemma:7b-instruct (configurable)
  • Embeddings: nomic-embed-text
```

---

## ✅ Requirements

* **Node.js 18+** (tested on Node 20)
* **npm** (or pnpm/yarn if you prefer)
* **Ollama** installed and running: [https://ollama.com](https://ollama.com)
* macOS / Linux / Windows (WSL2 recommended on Windows)

> Default ports: backend **4000**, frontend (React dev server) **3000**.

---

## 🚀 First‑Time Setup (from scratch)

1. **Install & start Ollama**

```bash
ollama serve
```

2. **Pull the models**

```bash
ollama pull gemma:7b-instruct
ollama pull nomic-embed-text
```

3. **Install project dependencies** (at the project root where `server.js`, `App.js` live)

```bash
npm install
```

> This installs the backend & frontend deps (e.g., `express`, `cors`, `multer`, `mammoth`, `pdf-parse`, `cheerio`, React, etc.). If you keep frontend and backend in separate folders with their own `package.json`, install in each.

4. **(Optional) Configure environment**

| Variable      | Default                  | Purpose                           |
| ------------- | ------------------------ | --------------------------------- |
| `OLLAMA_URL`  | `http://127.0.0.1:11434` | Where the backend talks to Ollama |
| `EMBED_MODEL` | `nomic-embed-text`       | Embedding model used for RAG      |

5. **Run the backend**

```bash
node server.js
# or, if package.json has a script:
# npm run server
```

You should see something like:

```
[helix-backend] listening on http://127.0.0.1:4000
[helix-backend] Routes:
  - GET /__ping
  - GET /__routes
  - GET /api/health
  - GET /api/models
  - POST /api/search
  - ...
  - POST /api/rag/ask
```

6. **Run the frontend (React)**

If the React app is at the root (Create React App / Vite):

```bash
npm start
```

If the React app is in a subfolder (e.g., `client/`):

```bash
cd client
npm install
npm start
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## ▶️ Daily Use (not first time)

1. Start **Ollama** in a terminal:

```bash
ollama serve
```

2. Start the **backend**:

```bash
node server.js
# (or npm run server)
```

3. Start the **frontend** (another terminal):

```bash
npm start
# or (cd client && npm start)
```

---

## 🗣️ Using the Chat

* Type a prompt and choose a model (default configured in `/api/health`).
* Responses stream token‑by‑token.
* **Upload a file** (PDF/DOCX/TXT/HTML) with your message to include its extracted text in the prompt.
* **Facts/Role Memory** panel lets you pre‑seed user facts or define an AI role for the current conversation.

**cURL test (non‑stream):**

```bash
curl -X POST http://127.0.0.1:4000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma:7b-instruct","prompt":"Say hi in one short sentence."}'
```

**cURL test (stream, with file):**

```bash
curl -N -X POST http://127.0.0.1:4000/api/stream \
  -F "message=Summarize this document." \
  -F "file=@/path/to/your.pdf"
```

---

## 📚 RAG — Retrieval‑Augmented Generation

RAG lets Helix index your documents and then answer questions grounded by those sources.

### Ingest a file (index it)

```bash
curl -F "file=@/path/to/notes.pdf" http://127.0.0.1:4000/api/rag/upload
```

Response includes `docId`, `title`, `chunks`.

### List indexed documents

```bash
curl http://127.0.0.1:4000/api/rag/list
```

### Semantic search (top‑K chunks)

```bash
curl -X POST http://127.0.0.1:4000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query":"main conclusions about X","topK":5}'
```

### Ask with RAG (SSE stream)

```bash
curl -N -X POST http://127.0.0.1:4000/api/rag/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What does the document say about X?","topK":5,"model":"gemma:7b-instruct"}'
```

### Clear the index

```bash
# clear one
curl -X DELETE "http://127.0.0.1:4000/api/rag/clear?docId=<docId>"

# clear all
curl -X DELETE "http://127.0.0.1:4000/api/rag/clear?docId=all"
```

**How it works (quick):**

* Files are parsed (PDF via `pdf-parse`, DOCX via `mammoth`, HTML via `cheerio`, TXT directly)
* Text is split into overlapping chunks (default 1200 chars, 200 overlap)
* Each chunk is embedded with `EMBED_MODEL` via `Ollama /api/embeddings`
* Vectors and metadata are stored in `data/rag/rag_index.json`
* `/api/rag/search` ranks by cosine similarity
* `/api/rag/ask` builds a prompt containing the top‑K chunks

---

## 🧰 Other Endpoints

* **Health**: `GET /api/health` → current model & Ollama URL
* **Models**: `GET /api/models` → installed model names
* **Search**: `POST /api/search` `{ query }` → top DDG results (no key)
* **Facts**:

  * `GET /api/memory/facts?userId=default`
  * `POST /api/memory/facts` `{ userId, facts: { key: value } }`
  * `DELETE /api/memory/facts` `{ userId, key }` or `{ userId, all: true }`
* **AI Role** (per conversation):

  * `GET /api/memory/ai-role?conversationId=default`
  * `POST /api/memory/ai-role` `{ conversationId, role }`
  * `DELETE /api/memory/ai-role` `{ conversationId }`

---

## 🧪 Quick Smoke Tests

```bash
# server up
curl http://127.0.0.1:4000/__routes

# ollama reachable
curl -s http://127.0.0.1:11434/api/tags | jq .models[0]

# simple gen
curl -s -X POST http://127.0.0.1:4000/api/generate -H 'Content-Type: application/json' \
  -d '{"prompt":"1+1?","model":"gemma:7b-instruct"}' | jq .data.response
```

---

## 🛠️ Troubleshooting

* **Embeddings fail / RAG errors**: ensure `ollama serve` is running and `ollama pull nomic-embed-text` is done.
* **No streaming tokens in curl**: include `-N` (no buffering) and check server logs.
* **Port conflicts**: change the React dev server port or backend `PORT` env var.
* **PDF parse errors**: we import `pdf-parse` safely (CJS) and only call it at request time.
* **Windows**: prefer WSL2 for better tooling compatibility.

---

## 📦 Project Layout (typical)

```
.
├── App.js / App.css / index.js / index.css / Helix.css
├── HelixEditor.jsx / NotesEditor.jsx
├── server.js
├── package.json
└── data/
    ├── chat_memory.json
    ├── facts_memory.json
    ├── roles_memory.json
    └── rag/
        └── rag_index.json
```

> If you split frontend/backend into separate folders later (e.g., `client/` and `server/`), update this README and scripts accordingly.

---

## 🔒 Privacy

Everything runs locally. Documents you ingest for RAG are embedded on your machine; the index is stored as JSON under `data/rag/`.

---

## 🗺️ Roadmap Ideas

* Vector DB backend (SQLite‑VSS / pgvector / HNSW)
* Multi‑file RAG uploads with background indexing
* Source‑aware citations in UI
* Image understanding (vision models) for diagrams/screenshots
* Model profiles per theme/task

---

## 📝 License

MIT (or your preferred license) — update this section to match your choice.
