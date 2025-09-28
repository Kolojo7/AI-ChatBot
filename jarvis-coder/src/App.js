// src/App.js
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  FaMicrophone, FaRobot, FaCode, FaCopy, FaChevronDown, FaChevronUp, FaSync,
  FaMoon, FaSun, FaDatabase, FaBolt, FaPlus, FaTrash,
  FaPaperclip, FaTimes
} from "react-icons/fa";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from 'react-markdown';
import "./Helix.css";
import HelixEditor from "./HelixEditor";
import NotesEditor from "./NotesEditor";

const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:4000";

/* ---------- Utilities for chat rendering ---------- */
function TypingDots() {
  return <span className="typing-dots"><span>.</span><span>.</span><span>.</span></span>;
}

function CollapsibleCode({ language = "text", code = "" }) {
  const [open, setOpen] = useState(true);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      const toast = document.querySelector(".helix-copy-toast");
      if (toast) { toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 900); }
    } catch {}
  };
  return (
    <div className="helix-code-wrap">
      <div className="helix-code-bar">
        <span className="helix-code-lang">{language}</span>
        <div className="helix-code-actions">
          <button type="button" className="helix-icon-btn" onClick={handleCopy} title="Copy"><FaCopy/></button>
          <button type="button" className="helix-icon-btn" onClick={() => setOpen(!open)} title={open ? "Collapse" : "Expand"}>
            {open ? <FaChevronUp/> : <FaChevronDown/>}
          </button>
        </div>
      </div>
      {open && <SyntaxHighlighter language={language} style={vscDarkPlus}>{code}</SyntaxHighlighter>}
    </div>
  );
}

function renderRichContent(text) {
  const fence = /```(\w+)?\n([\s\S]*?)```/g;
  const chunks = [];
  let last = 0;
  let m;
  while ((m = fence.exec(text)) !== null) {
    const [full, lang = "text", code] = m;
    if (m.index > last) {
      chunks.push({ kind: "text", data: text.slice(last, m.index) });
    }
    chunks.push({ kind: "code", data: { lang, code } });
    last = m.index + full.length;
  }
  if (last < text.length) chunks.push({ kind: "text", data: text.slice(last) });

  return (
    <div className="chat-rich">
      {chunks.map((c, idx) => {
        if (c.kind === "code") {
          return (
            <CollapsibleCode
              key={`code-${idx}`}
              language={c.data.lang}
              code={c.data.code}
            />
          );
        }
        return <ReactMarkdown key={`md-${idx}`}>{c.data}</ReactMarkdown>;
      })}
    </div>
  );
}

/* ---------- Model -> Visuals ---------- */
function parseModel(model = "") {
  const m = model.toLowerCase();
  const family =
    m.includes("deepseek") ? "code" :
    m.includes("qwen")     ? "reason" :
    m.includes("mistral")  ? "concise" :
    m.includes("gemma")    ? "light" :
    m.includes("llama")    ? "general" : "general";

  const sizeMatch = m.match(/(\d+)\s*b/);
  const sizeB = sizeMatch ? Number(sizeMatch[1]) : 7;
  let tier = "light";
  if (sizeB > 8 && sizeB <= 15) tier = "mid";
  else if (sizeB > 15 && sizeB <= 33) tier = "pro";
  else if (sizeB > 33) tier = "ultra";

  return { family, sizeB, tier };
}

function getModelVisual(model) {
  const { family, tier } = parseModel(model);
  const palettes = {
    code:   { a:"#50e3c2", b:"#d16ba5", ring:"#7dd6ff", glow:"rgba(80,227,194,.25)" },
    reason: { a:"#89a7ff", b:"#b3a1ff", ring:"#a8c1ff", glow:"rgba(137,167,255,.25)" },
    concise:{ a:"#ff9a5f", b:"#ffd66b", ring:"#ffcaa8", glow:"rgba(255,154,95,.25)" },
    light:  { a:"#9fffb3", b:"#63e6be", ring:"#b8ffd1", glow:"rgba(159,255,179,.22)" },
    general:{ a:"#ff6fa1", b:"#ff3d71", ring:"#ff9fc0", glow:"rgba(255,63,113,.22)" },
  };
  const p = palettes[family] || palettes.general;
  const speeds = { light: 14, mid: 11, pro: 8, ultra: 6 };
  const speed = speeds[tier] || 12;
  const label = { light: "Light", mid: "Mid", pro: "Ultra" }[tier] || (tier === "pro" ? "Pro" : "Light");
  const powerPercent = { light: 25, mid: 50, pro: 75, ultra: 100 }[tier] || 40;
  return { colors: p, speed, tierLabel: label, powerPercent };
}

/* ---------- Animated DNA Helix ---------- */
function HelixCore({ spinning, colors, speed }) {
  const styleVars = {
    '--helixA': colors.a,
    '--helixB': colors.b,
    '--helixRing': colors.ring,
    '--helixGlow': colors.glow,
    '--spinSec': `${speed}s`
  };
  return (
    <div className={`helix-core ${spinning ? "spin" : ""}`} style={styleVars}>
      <svg viewBox="0 0 120 120" className="helix-svg" aria-hidden>
        <circle cx="60" cy="60" r="54" className="ring" />
        {[...Array(22)].map((_, i) => {
          const t = (i / 21) * Math.PI * 2;
          const xA = 60 + Math.sin(t) * 20;
          const xB = 60 - Math.sin(t) * 20;
          const y = 12 + i * (96 / 21);
          return (
            <g key={i}>
              <circle cx={xA} cy={y} r="2.1" className="node a" />
              <circle cx={xB} cy={y} r="2.1" className="node b" />
              <line x1={xA} y1={y} x2={xB} y2={y} className="rung" />
            </g>
          );
        })}
      </svg>
      <div className="helix-core-glow" />
    </div>
  );
}
function PowerBadge({ tierLabel }) {
  return <span className="helix-badge power"><FaBolt/> Power: <strong>{tierLabel}</strong></span>;
}

/* ---------- App ---------- */
export default function App() {
  const DEFAULT_GREETING = "Hello, I am Helix. How can I assist you with your code today?";
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  /* Theme */
  const [theme, setTheme] = useState(() => localStorage.getItem("helix:theme") || "deep");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("helix:theme", theme);
  }, [theme]);

  /* Descriptions (also used as model descriptions) */
  const MODEL_INFO = useMemo(() => ({
    "deepseek-coder:33b": "Code-heavy tasks: generation, refactors, debugging.",
    "qwen2.5:14b-instruct": "Great for math/logic and step-by-step reasoning.",
    "llama3.1:8b": "Fast generalist for brainstorming and Q&A.",
    "mistral:7b-instruct": "Short, clean writing and explanations.",
    "gemma:7b-instruct": "Lightweight assistant, quick replies.",
    "llama3.1:70b": "High quality/general knowledge (needs strong hardware)."
  }), []);

  /* Installed models */
  const [installed, setInstalled] = useState([]);
  const [modelsErr, setModelsErr] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);

  /* Model selection */
  const savedModel = typeof window !== "undefined" ? localStorage.getItem("helix:model") : null;
  const [model, setModel] = useState(savedModel || "deepseek-coder:33b");
  const [confirmedModel, setConfirmedModel] = useState(null);

  /* Chat state with local history */
  const LS_CHATS = "helix:chats";
  function createChat() {
    return {
      id: crypto.randomUUID(),
      title: "New Chat",
      messages: [{ type: "ai", content: DEFAULT_GREETING }],
    };
  }
  function loadChats() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_CHATS));
      return Array.isArray(raw) && raw.length ? raw : [createChat()];
    } catch {
      return [createChat()];
    }
  }
  const [chats, setChats] = useState(loadChats);
  const [conversationId, setConversationId] = useState(chats[0].id);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [file, setFile] = useState(null);

  const messages = useMemo(() => {
    return (chats.find(c => c.id === conversationId) || chats[0] || {messages: []}).messages;
  }, [chats, conversationId]);

  const setMessages = (updater) => {
    setChats(currentChats => {
      return currentChats.map(chat => {
        if (chat.id === conversationId) {
          const newMessages = typeof updater === 'function' ? updater(chat.messages) : updater;
          return { ...chat, messages: newMessages };
        }
        return chat;
      });
    });
  };

  /* Memory, facts, and role states */
  const [showMemory, setShowMemory] = useState(false);
  const [facts, setFacts] = useState({ user: {}, ai: {} });
  const [factKV, setFactKV] = useState("");
  const [roleInput, setRoleInput] = useState("");
  const [roleSaved, setRoleSaved] = useState("");
  const [roleStatus, setRoleStatus] = useState("");
  const visuals = useMemo(() => getModelVisual(model), [model]);

  useEffect(() => { localStorage.setItem("helix:model", model); }, [model]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { localStorage.setItem(LS_CHATS, JSON.stringify(chats)); }, [chats]);

  function newChat() {
    const c = createChat();
    setChats(cs => [...cs, c]);
    setConversationId(c.id);
  }
  function deleteChat(id) {
    setChats(cs => {
      const filtered = cs.filter(c => c.id !== id);
      if (!filtered.length) {
        const nc = createChat();
        setConversationId(nc.id);
        return [nc];
      }
      if (id === conversationId) setConversationId(filtered[0].id);
      return filtered;
    });
  }

  /* Models list refresh */
  async function refreshModels() {
    setLoadingModels(true); setModelsErr("");
    try {
      const resp = await fetch(`${API_BASE}/api/models`);
      const text = await resp.text();
      if (text.trim().startsWith("<")) throw new Error("Got HTML from server. Check REACT_APP_API_BASE.");
      const data = JSON.parse(text);
      if (!data.ok) throw new Error(data.error || "Failed to load");
      setInstalled(Array.isArray(data.models) ? data.models : []);
    } catch (e) {
      setInstalled([]);
      setModelsErr(String(e?.message || e));
    } finally {
           setLoadingModels(false);
    }
  }
  useEffect(() => { refreshModels(); }, []);
  const installedSet = useMemo(() => new Set(installed.map(n => n.trim().toLowerCase())), [installed]);
  const isInstalled = (name) => installedSet.has((name || "").trim().toLowerCase());

  /* Facts APIs */
  async function loadFacts() {
    try {
      const r = await fetch(`${API_BASE}/api/memory/facts?userId=default`);
      const j = await r.json();
      if (j.ok) setFacts(j.facts || { user: {}, ai: {} });
    } catch {}
  }
  async function saveFactKV() {
    const raw = String(factKV || "");
    const [k, ...rest] = raw.split("=");
    const v = rest.join("=");
    if (!k || !v) return;
    await fetch(`${API_BASE}/api/memory/facts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "default", facts: { [k.trim()]: v.trim() } })
    });
    setFactKV("");
    await loadFacts();
  }
  async function deleteFact(key) {
    await fetch(`${API_BASE}/api/memory/facts`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "default", key })
    });
    await loadFacts();
  }
  async function clearUserFacts() {
    await fetch(`${API_BASE}/api/memory/facts`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "default", all: true })
    });
    await loadFacts();
  }

  /* Role APIs */
  const loadRole = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/memory/ai-role?conversationId=${encodeURIComponent(conversationId)}`);
      const text = await res.text();
      let j = {};
      try { j = JSON.parse(text); } catch { j = {}; }
      const role = j?.role || "";
      setRoleSaved(role);
      setRoleInput(role);
    } catch (e) {}
  }, [conversationId]);
  async function saveRole() {
    if (!roleInput.trim()) return clearRole();
    setRoleStatus("saving");
    try {
      const res = await fetch(`${API_BASE}/api/memory/ai-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, role: roleInput })
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || res.statusText);
      let j = {};
      try { j = JSON.parse(text); } catch { j = {}; }
      const role = j?.role ?? j?.data?.role ?? "";
      if (typeof role !== "string") throw new Error("Bad server response");
      setRoleSaved(role);
      setRoleStatus("saved");
    } catch (e) {
      setRoleStatus("error");
    } finally {
      setTimeout(() => setRoleStatus(""), 1200);
    }
  }
  async function clearRole() {
    setRoleStatus("saving");
    try {
      const res = await fetch(`${API_BASE}/api/memory/ai-role`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId })
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || res.statusText);
      setRoleSaved("");
      setRoleInput("");
      setRoleStatus("cleared");
    } catch (e) {
      setRoleStatus("error");
    } finally {
      setTimeout(() => setRoleStatus(""), 1200);
    }
  }
  useEffect(() => { loadFacts(); }, []);
  useEffect(() => { loadRole(); }, [conversationId, loadRole]);

  /* -------- Install / Uninstall model -------- */
  const [installing, setInstalling] = useState(false);
  const [installModelName, setInstallModelName] = useState("");
  const [installPercent, setInstallPercent] = useState(0);
  const [installStatus, setInstallStatus] = useState("");

  // NEW: free-typed install box
  const [customModel, setCustomModel] = useState("");

  function closeInstaller() {
    setInstalling(false);
    setInstallModelName("");
    setInstallPercent(0);
    setInstallStatus("");
  }
  async function uninstallModel(name) {
    if (!name) return;
    try {
      const r = await fetch(`${API_BASE}/api/models/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Uninstall failed");
      await refreshModels();
    } catch (e) {
      alert(`Uninstall error: ${e.message}`);
    }
  }
  function installModel(name) {
    if (!name) return;
    setInstalling(true);
    setInstallModelName(name);
    setInstallPercent(0);
    setInstallStatus("Starting…");

    const url = `${API_BASE}/api/models/pull?name=${encodeURIComponent(name)}`;
    const es = new EventSource(url);

    es.onmessage = (evt) => {
      try {
        const j = JSON.parse(evt.data || "{}");
        if (typeof j.percent === "number") setInstallPercent(Math.max(0, Math.min(100, j.percent)));
        if (j.status) setInstallStatus(j.status);
        if (j.done) {
          setInstallStatus("Done");
          setInstallPercent(100);
          es.close();
          refreshModels();
          setTimeout(() => closeInstaller(), 700);
        }
      } catch {
        if (evt.data) setInstallStatus(String(evt.data));
      }
    };
    es.addEventListener("error", () => {
      setInstallStatus("Error");
      es.close();
      setTimeout(() => closeInstaller(), 1200);
    });
  }
  // NEW: install any model typed by the user
  async function installCustom() {
    const name = customModel.trim();
    if (!name) return;
    installModel(name);
    // optional: clear after starting
    // setCustomModel("");
  }

  /* ---------------- send prompt & search ---------------- */
  async function streamResponse(requestBody) {
    setLoading(true);
    try {
      const isFormData = requestBody instanceof FormData;
      const res = await fetch(`${API_BASE}/api/stream`, {
        method: "POST",
        headers: isFormData ? {} : { "Content-Type": "application/json" },
        body: isFormData ? requestBody : JSON.stringify(requestBody),
      });

      if (!res.ok || !res.body) throw new Error("Streaming not available.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiText = "";
      let buf = "";

      const updateLastMessage = (s) => {
        aiText += s;
        setMessages((prev) => {
          const c = [...prev];
          if (c.length > 0) c[c.length - 1] = { type: "ai", content: aiText };
          return c;
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop();

        for (const frame of frames) {
          const lines = frame.split("\n");
          const first = (lines[0] || "").trim();
          if (first.startsWith("event: meta")) {
            const dataLine = lines.find(l => l.startsWith("data:"));
            if (dataLine) try { setConfirmedModel(JSON.parse(dataLine.slice(5)).model); } catch {}
            continue;
          }
          if (first.startsWith("event: error")) {
            const dataLine = lines.find(l => l.startsWith("data:"));
            updateLastMessage(`\n[error] ${dataLine ? dataLine.slice(5).trim() : "Stream error"}`);
            continue;
          }
          for (const l of lines) {
            if (!l.startsWith("data:")) continue;
            const payload = l.slice(5).trim();
            try {
              const json = JSON.parse(payload);
              if (json?.token) updateLastMessage(json.token);
            } catch {
              if (payload) updateLastMessage(payload);
            }
          }
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const c = [...prev];
        if (c.length > 0) c[c.length - 1] = { type: "ai", content: "Error: " + String(e.message) };
        return c;
      });
    } finally {
      setLoading(false);
    }
  }

  async function sendPrompt(userPrompt, attachedFile = null) {
    let displayPrompt = userPrompt;
    if (attachedFile) {
      displayPrompt = `${userPrompt}\n\n*Attached file: ${attachedFile.name}*`;
    }

    setMessages((prev) => [...prev, { type: "user", content: displayPrompt }, { type: "ai", content: "" }]);
    if (chats.find(c => c.id === conversationId)?.title === "New Chat") {
      setChats(cs => cs.map(c => c.id === conversationId ? { ...c, title: userPrompt.slice(0, 30) } : c));
    }

    let requestBody;
    if (attachedFile) {
      const formData = new FormData();
      formData.append('message', userPrompt);
      formData.append('model', model);
      formData.append('conversationId', conversationId);
      formData.append('file', attachedFile);
      requestBody = formData;
    } else {
      requestBody = { message: userPrompt, model, conversationId };
    }
    await streamResponse(requestBody);
  }

  /* Mic handler */
  const handleMicClick = async () => {
    if (listening) { setListening(false); return; }
    setListening(true);
    try {
      const res = await fetch("http://localhost:8000/transcribe", { method: "POST" });
      const data = await res.json();
      if (data.text) setInput(prev => (prev ? prev + " " + data.text : data.text));
    } catch (err) { console.error(err); }
    setListening(false);
  };

  const [activePanel, setActivePanel] = useState("code");
  const notesRef = useRef(null);

  /* Send handler (with slash commands + file) */
  const handleSend = async (e) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt && !file) return;

    setInput("");
    const fileToSend = file;
    setFile(null);

    // /search
    if (prompt.toLowerCase().startsWith("/search ")) {
      const query = prompt.substring(8).trim();
      setMessages(prev => [...prev, { type: 'user', content: prompt }, { type: 'ai', content: `*Searching for: ${query}...*` }]);
      setLoading(true);

      try {
        const searchRes = await fetch(`${API_BASE}/api/search`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query })
        });
        const searchData = await searchRes.json();

        if (!searchData.ok || !searchData.results?.length) {
          throw new Error(searchData.error || "No web results found.");
        }

        setMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1].content = `*Found ${searchData.results.length} results. Synthesizing answer...*`;
          return msgs;
        });

        const context = searchData.results
          .map((r, i) => `[${i + 1}] ${r.title}\nSnippet: ${r.snippet}\nURL: ${r.link}`)
          .join("\n\n");

        const augmentedPrompt = `Please provide a comprehensive answer to the user's question based on the following search results. You must cite the most relevant sources using markdown links, like [Source 1](URL). Synthesize the information into a coherent response. Do not list the sources at the end; integrate them naturally into your answer.\n\nUser Question: ${query}\n\nSearch Results:\n${context}`;

        await streamResponse({ message: augmentedPrompt, model, conversationId });
      } catch (err) {
        setMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1].content = `Search failed: ${err.message}`;
          return msgs;
        });
        setLoading(false);
      }
      return;
    }

    // /notes
    if (prompt.toLowerCase().startsWith("/notes")) {
      const title = prompt.replace(/^\/notes\s*/i, "").trim();
      setActivePanel("notes");
      setTimeout(() => {
        notesRef.current?.createNote(title || "New Note");
        notesRef.current?.focus();
      }, 0);
      return;
    }

    // default
    sendPrompt(prompt, fileToSend);
  };

  /* File attach */
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) setFile(selectedFile);
    e.target.value = null;
  };
  const triggerFileInput = () => fileInputRef.current?.click();
  const removeFile = () => setFile(null);

  /* Suggestions & split pane */
  const DEFAULT_SUGGESTIONS = [
    "deepseek-coder:33b",
    "qwen2.5:14b-instruct",
    "llama3.1:8b",
    "mistral:7b-instruct",
    "gemma:7b-instruct",
    "llama3.1:70b"
  ];
  const suggestedFromInfo = Object.keys(MODEL_INFO || {});
  let suggestionModels = suggestedFromInfo.length ? suggestedFromInfo : DEFAULT_SUGGESTIONS;
  suggestionModels = suggestionModels.filter(m => !installedSet.has(m.trim().toLowerCase()));
  const ensureCurrentModelOption =
    !isInstalled(model) &&
    !suggestionModels.map(s => s.toLowerCase()).includes((model || "").toLowerCase());

  const [leftPct, setLeftPct] = useState(() => {
    const v = Number(localStorage.getItem("helix:leftPct"));
    return Number.isFinite(v) && v >= 20 && v <= 80 ? v : 58;
  });
  const draggingRef = useRef(false);
  useEffect(() => { localStorage.setItem("helix:leftPct", String(leftPct)); }, [leftPct]);
  function onDragStart(e) {
    e.preventDefault();
    draggingRef.current = true;
    document.body.classList.add("helix-noselect");
  }
  function onDragMove(e) {
    if (!draggingRef.current) return;
    const container = document.querySelector(".helix-workspace");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    let pct = (x / rect.width) * 100;
    pct = Math.max(25, Math.min(75, pct));
    setLeftPct(pct);
  }
  function onDragEnd() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.classList.remove("helix-noselect");
  }
  useEffect(() => {
    const move = (e) => onDragMove(e);
    const up   = () => onDragEnd();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, []);

  return (
    <div className={`helix-root ${loading ? "is-thinking" : ""}`}>
      <div className="helix-bg-glow" />
      <div className="helix-noise" />
      <div className="helix-copy-toast">Copied!</div>

      {/* Sidebar */}
      <aside className="helix-sidebar">
        <div className="helix-avatar-wrap">
          <span className={`helix-avatar-pulse ${loading ? "active" : ""}`}></span>
          <FaRobot className="helix-avatar" />
        </div>
        <div className="helix-sidebar-btns">
          <button className="helix-btn" title="Code"><FaCode /></button>
        </div>
        <div className="helix-chat-list">
          <button className="helix-mini-btn helix-new-chat" onClick={newChat}><FaPlus/> New Chat</button>
          <ul>
            {chats.map(c => (
              <li key={c.id} className={`helix-chat-item ${c.id === conversationId ? "active" : ""}`}>
                <button onClick={() => setConversationId(c.id)}>{c.title || "New Chat"}</button>
                <span className="helix-chat-del" onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }}><FaTrash/></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="helix-theme-toggle">
          <button
            className="helix-mini-btn"
            onClick={() => setTheme(prev => prev === "crimson" ? "deep" : "crimson")}
            title="Toggle Theme"
          >
            {theme === "crimson" ? <FaMoon/> : <FaSun/>} {theme === "crimson" ? "Deep Space" : "Crimson"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="helix-main">
        <div className="helix-core-outer">
          <HelixCore spinning={loading} colors={visuals.colors} speed={visuals.speed} />
        </div>

        {/* Model Picker + Install/Uninstall */}
        <div className="helix-model-row">
          <div className="helix-model-top">
            <select
              className="helix-model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              title={MODEL_INFO[model] || "Local Ollama model"}
            >
              {ensureCurrentModelOption && (
                <option value={model}>{model || "(no model selected)"}</option>
              )}
              <optgroup label="Installed">
                {installed.length === 0 && <option value="" disabled>(none)</option>}
                {installed.map((m) => (
                  <option key={`i-${m}`} value={m}>{m}</option>
                ))}
              </optgroup>
              <optgroup label="Suggestions">
                {suggestionModels.length === 0 && <option value="" disabled>(none)</option>}
                {suggestionModels.map(m => (
                  <option key={`s-${m}`} value={m}>
                    {m}{MODEL_INFO[m] ? ` — ${MODEL_INFO[m]}` : " — (not installed)"}
                  </option>
                ))}
              </optgroup>
            </select>

            <button className="helix-mini-btn" onClick={refreshModels} disabled={loadingModels} title="Refresh installed models">
              <FaSync /> {loadingModels ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {/* NEW: Free-typed model search/install */}
          <div className="helix-model-top" style={{ marginTop: 8, gap: 8, alignItems: "stretch" }}>
            <input
              type="text"
              className="helix-input"
              placeholder="Type any Ollama model (e.g. qwen2.5:7b, llama3.1:8b, mistral:7b-instruct)…"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") installCustom();
              }}
            />
            <button
              className="helix-mini-btn"
              onClick={installCustom}
              disabled={installing || !customModel.trim()}
              title="Install a model by name"
            >
              Install by name
            </button>
          </div>

          <div className="helix-model-purpose">
            <span className={`helix-badge ${isInstalled(model) ? "ok" : "warn"}`}>
              {isInstalled(model) ? "Installed" : "Not installed"}
            </span>
            {confirmedModel && (
              <span className="helix-badge now">Using: <strong>{confirmedModel}</strong></span>
            )}
            <PowerBadge tierLabel={visuals.tierLabel} />
          </div>

          <div className="powerbar-wrap" title={`Approx power for ${model}`}>
            <div className="powerbar-track">
              <div className="powerbar-fill" style={{width: `${visuals.powerPercent}%`}} />
            </div>
            <span className="powerbar-label">{visuals.tierLabel}</span>
          </div>

          <div className="model-desc">
            <em>{MODEL_INFO[model] || "Local Ollama model"}</em>
          </div>

          {/* Install / Uninstall controls + progress */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            {!isInstalled(model) ? (
              <button
                className="helix-mini-btn"
                onClick={() => installModel(model)}
                title={`Install ${model} via Ollama`}
                disabled={installing}
              >
                Install
              </button>
            ) : (
              <button
                className="helix-mini-btn warn"
                onClick={() => uninstallModel(model)}
                title={`Uninstall ${model}`}
                disabled={installing}
              >
                Uninstall
              </button>
            )}

            {installing && installModelName === model && (
              <div className="powerbar-wrap" style={{ minWidth: 200 }} title={installStatus || "Installing…"}>
                <div className="powerbar-track">
                  <div
                    className="powerbar-fill"
                    style={{ width: `${Math.max(0, Math.min(100, installPercent))}%` }}
                  />
                </div>
                <span className="powerbar-label">
                  {Math.round(installPercent)}% — {installStatus || "Installing…"}
                </span>
              </div>
            )}
          </div>

          {modelsErr && <div className="helix-warning">Couldn’t read installed models. {modelsErr}</div>}
        </div>

        {/* Workspace */}
        <div className="helix-workspace">
          <section
            className="helix-pane pane-chat"
            style={{ width: `${leftPct}%` }}
            onMouseMove={onDragMove}
            onTouchMove={onDragMove}
          >
            <div className="helix-pane-header">
              <strong>Chat</strong>
              <span className="pane-subtle">{MODEL_INFO[model] || "Local Ollama model"}</span>
            </div>

            <div className="helix-chat-area pane-scroll">
              {messages.map((msg, idx) => (
                <div key={idx} className={`helix-msg ${msg.type}`}>
                  <div className={`helix-msg-bubble ${msg.type}`}>
                    {renderRichContent(msg.content)}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="helix-msg ai">
                  <div className="helix-msg-bubble ai">
                    <span>Helix is thinking</span> <TypingDots />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="tools-toggle-row slim">
              <button
                className={`mem-pill ${showMemory ? "on" : ""}`}
                onClick={() => setShowMemory(s => !s)}
                title="Toggle Memory & Role"
              >
                <FaDatabase/> Memory {showMemory ? "Hide" : "Show"}
                {roleSaved ? <span className="chip-inline">role: {roleSaved}</span> : <span className="chip-inline dim">no role</span>}
              </button>
            </div>

            {showMemory && (
              <div className="mem-dock minimalist">
                <div className="mem-row">
                  <strong>Memory</strong>
                  <span className="mem-dim">user fact (e.g., <code>name=Vedansh</code>)</span>
                  <input className="mem-input" value={factKV} onChange={e=>setFactKV(e.target.value)} placeholder="key=value" />
                  <button className="mem-btn" onClick={saveFactKV}>Save</button>
                  <button className="mem-btn ghost" onClick={loadFacts}>Reload</button>
                  <button className="mem-btn warn" onClick={clearUserFacts}>Clear</button>
                </div>
                <div className="mem-panel">
                  <div className="mem-section">
                    <strong>User Facts</strong>
                    <div className="mem-chips" style={{marginTop:6}}>
                      {Object.keys(facts.user || {}).length === 0 && <span className="mem-dim">(none)</span>}
                      {Object.entries(facts.user || {}).map(([k,v])=>(
                        <span key={k} className="mem-chip">
                          <code>{k}</code>: {String(v)}
                          <button className="mem-chip-x" onClick={()=>deleteFact(k)}>✕</button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mem-section">
                    <strong>AI Role (this chat)</strong>{" "}
                    <span className="mem-dim">override instructions</span>
                    <div className="mem-row" style={{marginTop:6}}>
                      <input className="mem-input" placeholder="e.g., Be a strict DSA tutor" value={roleInput} onChange={e=>setRoleInput(e.target.value)} />
                      <button className="mem-btn" onClick={saveRole}>Save</button>
                      <button className="mem-btn" onClick={clearRole}>Clear</button>
                      {roleStatus === "saving" && <span className="mem-chip dim">saving…</span>}
                      {roleStatus === "saved" && <span className="mem-chip ok">saved</span>}
                      {roleStatus === "cleared" && <span className="mem-chip">cleared</span>}
                      {roleStatus === "error" && <span className="mem-chip warn">error</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* File chip */}
            {file && (
              <div className="file-chip">
                <FaPaperclip />
                <span className="file-chip-name">{file.name}</span>
                <button className="file-chip-del" onClick={removeFile} title="Remove file">
                  <FaTimes />
                </button>
              </div>
            )}

            {/* Input row */}
            <form className="helix-input-row tight" onSubmit={handleSend}>
              <div className="helix-input-wrapper">
                <input
                  type="text"
                  className="helix-input"
                  placeholder="Type your prompt... (tip: /search or /notes)"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  accept=".pdf,.doc,.docx,.txt"
                />
                <button
                  type="button"
                  className="helix-icon-btn helix-attach-btn"
                  title="Attach File"
                  onClick={triggerFileInput}
                >
                  <FaPaperclip />
                </button>
                <button
                  type="button"
                  className={`helix-mic-btn ${listening ? "mic-on" : ""}`}
                  title="Voice"
                  onClick={handleMicClick}
                >
                  <FaMicrophone />
                </button>
              </div>
              <button className="helix-send-btn" type="submit" disabled={loading}>Send</button>
            </form>
          </section>

          {/* Resizer + Right Pane */}
          <div
            className="helix-resizer"
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setLeftPct(p => Math.max(25, p - 2));
              if (e.key === "ArrowRight") setLeftPct(p => Math.min(75, p + 2));
            }}
          />
          <aside
            className="helix-pane pane-editor"
            style={{ width: `${100 - leftPct}%` }}
            onMouseMove={onDragMove}
            onTouchMove={onDragMove}
          >
            <div className="helix-pane-header">
              <div>
                <strong>Workspace</strong>
                <span className="pane-subtle"> — switch views</span>
              </div>
              <div style={{marginLeft:"auto", display:"flex", gap:"6px"}}>
                <button className={`mem-btn ${activePanel === "code" ? "" : "ghost"}`} onClick={()=>setActivePanel("code")}>Code</button>
                <button className={`mem-btn ${activePanel === "notes" ? "" : "ghost"}`} onClick={()=>setActivePanel("notes")}>Notes</button>
                <button className="mem-btn ghost" onClick={()=>setActivePanel("hidden")}>Hide</button>
              </div>
            </div>
            <div className="pane-scroll" style={{padding:0}}>
              {activePanel === "code" && (
                <HelixEditor
                  onInsertToChat={(codeFence) => {
                    sendPrompt(`Please consider this code:\n\n${codeFence}`);
                  }}
                  onAskAI={(prompt) => {
                    sendPrompt(prompt);
                  }}
                />
              )}
              {activePanel === "notes" && (
                <NotesEditor
                  ref={notesRef}
                  onInsertToChat={(text) => {
                    sendPrompt(text);
                  }}
                  onAskAI={(prompt) => {
                    sendPrompt(prompt);
                  }}
                />
              )}
              {activePanel === "hidden" && (
                <div className="mem-dim" style={{padding:12}}>
                  Workspace hidden. Choose <em>Code</em> or <em>Notes</em> above.
                </div>
              )}
            </div>
          </aside>
        </div>

        <p className="helix-status">Helix AI is running offline on your device.</p>
      </main>
    </div>
  );
}
