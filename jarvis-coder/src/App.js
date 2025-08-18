import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  FaMicrophone, FaRobot, FaCode, FaCopy, FaChevronDown, FaChevronUp, FaSync, FaMoon, FaSun, FaTimes
} from "react-icons/fa";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./Helix.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:4000";

/* ---------- UI bits ---------- */
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
  const parts = []; let last = 0; let m;
  while ((m = fence.exec(text)) !== null) {
    const [full, lang = "text", code] = m;
    if (m.index > last) parts.push(<span key={`t${last}`}>{text.slice(last, m.index)}</span>);
    parts.push(<CollapsibleCode key={`c${m.index}`} language={lang} code={code} />);
    last = m.index + full.length;
  }
  if (last < text.length) parts.push(<span key={`tail${last}`}>{text.slice(last)}</span>);
  return parts.length ? <>{parts}</> : <span>{text}</span>;
}

/* ---------- Model visuals ---------- */
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
  const label = { light: "Light", mid: "Mid", pro: "Pro", ultra: "Ultra" }[tier];
  return { colors: p, speed, tierLabel: label };
}

/* ---------- Helix animation ---------- */
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
  return <span className="helix-badge power">Power: <strong>{tierLabel}</strong></span>;
}

/* ---------- Facts Dock (segregated) ---------- */
function FactsDock({ facts, onReloadFacts, onSaveUserFact, onDeleteUserFact, onClearUserFacts }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const userFacts = facts?.user || {};
  const aiFacts = facts?.ai || {};
  const hasUser = Object.keys(userFacts).length > 0;

  return (
    <div className={`mem-dock ${open ? "open" : ""}`}>
      <div className="mem-row">
        <button className="mem-pill" onClick={() => setOpen(o => !o)}>Memory</button>
        <input
          className="mem-input"
          placeholder='user fact (e.g., name=Vedansh)'
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { onSaveUserFact(draft); setDraft(""); } }}
        />
        <button className="mem-btn" onClick={() => { onSaveUserFact(draft); setDraft(""); }}>Save</button>
        <button className="mem-btn ghost" onClick={onReloadFacts} title="Reload facts">↻</button>
        <button
          className="mem-btn"
          onClick={() => { if (hasUser && window.confirm("Delete ALL user facts?")) onClearUserFacts(); }}
          title="Delete all user facts"
          disabled={!hasUser}
          style={{ background: hasUser ? "rgba(255,80,80,.2)" : "rgba(255,255,255,.08)" }}
        >
          Clear User Facts
        </button>
      </div>

      {open && (
        <div className="mem-panel">
          <div className="mem-section">
            <strong>User Facts</strong>
            <div className="mem-chips">
              {hasUser ? (
                Object.entries(userFacts).map(([k, v]) => (
                  <span className="mem-chip" key={k}>
                    <code>{k}</code>: {String(v)}
                    <button className="mem-chip-x" onClick={() => onDeleteUserFact(k)} title={`Delete ${k}`}><FaTimes/></button>
                  </span>
                ))
              ) : (
                <span className="mem-dim">(none yet — say “my name is …”, or save above)</span>
              )}
            </div>
          </div>

          <div className="mem-section">
            <strong>Assistant Facts</strong> <span className="mem-dim">(read-only)</span>
            <div className="mem-chips">
              {Object.entries(aiFacts).map(([k, v]) => (
                <span className="mem-chip" key={k}><code>{k}</code>: {String(v)}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- App ---------- */
export default function App() {
  const DEFAULT_GREETING = "Hello, I am Helix. How can I assist you with your code today?";
  const bottomRef = useRef(null);

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem("helix:theme") || "deep");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("helix:theme", theme);
  }, [theme]);

  // Model info
  const MODEL_INFO = useMemo(() => ({
    "deepseek-coder:33b": "Best for code generation, refactors, debugging.",
    "qwen2.5:14b-instruct": "Great for STEM, step-by-step reasoning.",
    "llama3.1:8b": "Small generalist for brainstorming and Q&A.",
    "mistral:7b-instruct": "Concise writing and clean explanations.",
    "gemma:7b-instruct": "Fast, lightweight assistant.",
    "llama3.1:70b": "High quality but hardware heavy."
  }), []);

  // Installed models
  const [installed, setInstalled] = useState([]);
  const [modelsErr, setModelsErr] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);

  const savedModel = typeof window !== "undefined" ? localStorage.getItem("helix:model") : null;
  const [model, setModel] = useState(savedModel || "qwen2.5:14b-instruct");
  const [confirmedModel, setConfirmedModel] = useState(null);

  // Chat/state
  const [messages, setMessages] = useState([{ type: "ai", content: DEFAULT_GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);

  // Facts (segregated)
  const [facts, setFacts] = useState({ user: {}, ai: {} });
  const userId = "default";

  const visuals = useMemo(() => getModelVisual(model), [model]);
  useEffect(() => { localStorage.setItem("helix:model", model); }, [model]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  /* models */
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
      setInstalled([]); setModelsErr(String(e?.message || e));
    } finally {
      setLoadingModels(false);
    }
  }
  useEffect(() => { refreshModels(); }, []);
  const installedSet = useMemo(() => new Set(installed.map(n => n.trim().toLowerCase())), [installed]);
  const isInstalled = (name) => installedSet.has((name || "").trim().toLowerCase());

  /* facts CRUD */
  async function loadFacts() {
    try {
      const r = await fetch(`${API_BASE}/api/memory/facts?userId=${encodeURIComponent(userId)}`);
      const j = await r.json();
      if (j.ok) setFacts(j.facts || { user: {}, ai: {} });
    } catch (e) { console.error("loadFacts error", e); }
  }
  useEffect(() => { loadFacts(); }, []);

  async function saveUserFactQuick(raw) {
    const s = String(raw || "").trim();
    if (!s) return;
    let k = "", v = "";
    if (s.includes("=")) [k, v] = s.split("=").map(x => x.trim());
    else { const parts = s.split(/\s+/); k = parts.shift(); v = parts.join(" "); }
    if (!k) return;
    try {
      const body = { userId: "default", facts: { [k]: v } };
      const r = await fetch(`${API_BASE}/api/memory/facts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (j.ok) setFacts(j.facts || { user: {}, ai: {} });
    } catch (e) { console.error(e); }
  }

  async function deleteUserFact(key) {
    try {
      const r = await fetch(`${API_BASE}/api/memory/facts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "default", bucket: "user", key })
      });
      const j = await r.json();
      if (j.ok) setFacts(j.facts || { user: {}, ai: {} });
    } catch (e) { console.error(e); }
  }

  async function clearUserFacts() {
    try {
      const r = await fetch(`${API_BASE}/api/memory/facts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "default", bucket: "user", all: true })
      });
      const j = await r.json();
      if (j.ok) setFacts(j.facts || { user: {}, ai: {} });
    } catch (e) { console.error(e); }
  }

  /* chat send */
  async function sendPrompt(userPrompt) {
    setLoading(true);
    setConfirmedModel(null);
    setMessages(prev => [...prev, { type: "user", content: userPrompt }, { type: "ai", content: "" }]);
    try {
      const res = await fetch(`${API_BASE}/api/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userPrompt, model })
      });

      if (!res.ok || !res.body) {
        const nr = await fetch(`${API_BASE}/api/generate`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userPrompt, model })
        });
        const nd = await nr.json();
        if (nd?.data?.model) setConfirmedModel(nd.data.model);
        const reply = nd?.data?.response || nd?.data?.message || "(no response)";
        setMessages(prev => { const c=[...prev]; c[c.length-1]={ type:"ai", content: reply }; return c; });
        loadFacts();
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let aiText = "";
        let buf = "";

        const putAI = (s) => {
          aiText += s;
          setMessages(prev => { const c=[...prev]; c[c.length-1]={ type:"ai", content: aiText }; return c; });
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
              if (dataLine) {
                try {
                  const meta = JSON.parse(dataLine.slice(5));
                  if (meta?.model) setConfirmedModel(meta.model);
                } catch {}
              }
              continue;
            }
            if (first.startsWith("event: error")) {
              const dataLine = lines.find(l => l.startsWith("data:"));
              const msg = dataLine ? dataLine.slice(5).trim() : "Unknown stream error";
              putAI(`\n[error] ${msg}`);
              continue;
            }
            if (first.startsWith("event: done")) continue;

            for (const l of lines) {
              if (!l.startsWith("data:")) continue;
              const payload = l.slice(5).trim();
              try {
                const json = JSON.parse(payload);
                if (json && typeof json.token === "string") { putAI(json.token); continue; }
              } catch {}
              if (payload) putAI(payload);
            }
          }
        }
        loadFacts();
      }
    } catch (e) {
      setMessages(prev => { const c=[...prev]; c[c.length-1]={ type:"ai", content: "Error: " + String(e) }; return c; });
    } finally {
      setLoading(false);
    }
  }

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

  const handleSend = (e) => { e.preventDefault(); if (!input.trim()) return; sendPrompt(input.trim()); setInput(""); };
  const currentPurpose = (useMemo(() => MODEL_INFO[model], [MODEL_INFO, model])) || "Local Ollama model";

  const DEFAULT_SUGGESTIONS = ["deepseek-coder:33b","qwen2.5:14b-instruct","llama3.1:8b","mistral:7b-instruct","gemma:7b-instruct","llama3.1:70b"];
  const suggestedFromInfo = Object.keys(MODEL_INFO || {});
  let suggestionModels = suggestedFromInfo.length ? suggestedFromInfo : DEFAULT_SUGGESTIONS;
  suggestionModels = suggestionModels.filter(m => !installedSet.has(m.trim().toLowerCase()));
  const ensureCurrentModelOption = !isInstalled(model) && !suggestionModels.map(s => s.toLowerCase()).includes((model || "").toLowerCase());

  return (
    <div className={`helix-root ${loading ? "is-thinking" : ""}`}>
      <div className="helix-bg-glow" />
      <div className="helix-noise" />
      <div className="helix-copy-toast">Copied!</div>

      <aside className="helix-sidebar">
        <div className="helix-avatar-wrap">
          <span className={`helix-avatar-pulse ${loading ? "active" : ""}`}></span>
          <FaRobot className="helix-avatar" />
        </div>
        <div className="helix-sidebar-btns">
          <button className="helix-btn" title="Code"><FaCode /></button>
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

      <main className="helix-main">
        <div className="helix-core-outer">
          <HelixCore spinning={loading} colors={getModelVisual(model).colors} speed={getModelVisual(model).speed} />
        </div>

        {/* Model picker */}
        <div className="helix-model-row">
          <div className="helix-model-top">
            <select className="helix-model-select" value={model} onChange={(e) => setModel(e.target.value)} title={currentPurpose}>
              {ensureCurrentModelOption && (<option value={model}>{model || "(no model selected)"}</option>)}
              <optgroup label="Installed">
                {installed.length === 0 && <option value="" disabled>(none)</option>}
                {installed.map((m) => (<option key={`i-${m}`} value={m}>{m}</option>))}
              </optgroup>
              <optgroup label="Suggestions">
                {suggestionModels.length === 0 && <option value="" disabled>(none)</option>}
                {suggestionModels.map(m => (<option key={`s-${m}`} value={m}>{m}{MODEL_INFO[m] ? ` — ${MODEL_INFO[m]}` : " — (not installed)"}</option>))}
              </optgroup>
            </select>
            <button className="helix-mini-btn" onClick={refreshModels} disabled={loadingModels} title="Refresh installed models">
              <FaSync /> {loadingModels ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="helix-model-purpose">
            <span className={`helix-badge ${isInstalled(model) ? "ok" : "warn"}`}>{isInstalled(model) ? "Installed" : "Not installed"}</span>
            {confirmedModel && (<span className="helix-badge now">Using: <strong>{confirmedModel}</strong></span>)}
            <PowerBadge tierLabel={getModelVisual(model).tierLabel} />
          </div>

          {modelsErr && <div className="helix-warning">Couldn’t read installed models. {modelsErr}</div>}
        </div>

        {/* Chat */}
        <div className="helix-chat-area">
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

        {/* Segregated facts UI */}
        <FactsDock
          facts={facts}
          onReloadFacts={loadFacts}
          onSaveUserFact={saveUserFactQuick}
          onDeleteUserFact={deleteUserFact}
          onClearUserFacts={clearUserFacts}
        />

        {/* Input */}
        <form className="helix-input-row" onSubmit={handleSend}>
          <div className="helix-input-wrapper">
            <input
              type="text" className="helix-input" placeholder="Type your prompt for Helix..."
              value={input} onChange={e => setInput(e.target.value)}
            />
            <button type="button" className={`helix-mic-btn ${listening ? "mic-on" : ""}`} title="Voice" onClick={handleMicClick}>
              <FaMicrophone />
            </button>
          </div>
          <button className="helix-send-btn" type="submit">Send</button>
        </form>
        <p className="helix-status">Helix AI is running offline on your device.</p>
      </main>
    </div>
  );
}
