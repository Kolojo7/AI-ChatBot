import React, { useState, useRef, useEffect, useMemo } from "react";
import { FaMicrophone, FaRobot, FaCode, FaCopy, FaChevronDown, FaChevronUp, FaSync } from "react-icons/fa";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./Helix.css";

/* >>> API base for the backend */
const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:4000";

function TypingDots() {
  return (
    <span className="typing-dots">
      <span>.</span><span>.</span><span>.</span>
    </span>
  );
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

export default function App() {
  const DEFAULT_GREETING = "Hello, I am Helix. How can I assist you with your code today?";
  const bottomRef = useRef(null);

  // Curated descriptions
  const MODEL_INFO = useMemo(() => ({
    "deepseek-coder:33b": "Best for code generation, refactors, debugging.",
    "qwen2.5:14b-instruct": "Great for STEM, step-by-step reasoning.",
    "llama3.1:8b": "Small generalist for brainstorming and Q&A.",
    "mistral:7b-instruct": "Concise writing and clean explanations.",
    "gemma:7b-instruct": "Fast, lightweight assistant.",
    "llama3.1:70b": "High quality but hardware heavy."
  }), []);

  // Installed models list + errors
  const [installed, setInstalled] = useState([]);
  const [modelsErr, setModelsErr] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);

  // Selected model & confirmed (from backend)
  const savedModel = typeof window !== "undefined" ? localStorage.getItem("helix:model") : null;
  const [model, setModel] = useState(savedModel || "deepseek-coder:33b");
  const [confirmedModel, setConfirmedModel] = useState(null);

  // Chat state
  const [messages, setMessages] = useState([{ type: "ai", content: DEFAULT_GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const currentPurpose = MODEL_INFO[model] || "Local Ollama model";

  useEffect(() => { localStorage.setItem("helix:model", model); }, [model]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Load installed models
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

  const installedSet = new Set(installed.map(n => n.trim().toLowerCase()));
  const isInstalled = (name) => installedSet.has((name || "").trim().toLowerCase());

  // Send prompt (SSE with meta "model")
  async function sendPrompt(prompt) {
    setLoading(true);
    setConfirmedModel(null);
    setMessages((prev) => [...prev, { type: "user", content: prompt }, { type: "ai", content: "" }]);

    try {
      const res = await fetch(`${API_BASE}/api/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model })
      });

      if (!res.ok || !res.body) {
        // Fallback non-stream
        const nr = await fetch(`${API_BASE}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, model })
        });
        const nd = await nr.json();
        if (nd.model) setConfirmedModel(nd.model);
        setMessages((prev) => { const c=[...prev]; c[c.length-1]={ type:"ai", content: nd.response || "(no response)" }; return c; });
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let aiText = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          for (const raw of chunk.split("\n\n")) {
            const line = raw.trim();
            if (!line) continue;

            if (line.startsWith("event: meta")) {
              const dataLine = raw.split("\n").find(l => l.startsWith("data:"));
              if (dataLine) {
                try {
                  const meta = JSON.parse(dataLine.slice(5));
                  if (meta?.model) setConfirmedModel(meta.model);
                } catch {}
              }
              continue;
            }

            if (line.startsWith("data:")) {
              try {
                const payload = JSON.parse(line.slice(5));
                if (payload.token) {
                  aiText += payload.token;
                  setMessages((prev) => { const c=[...prev]; c[c.length-1]={ type:"ai", content: aiText }; return c; });
                }
              } catch {}
            }
          }
        }
      }
    } catch (e) {
      setMessages((prev) => { const c=[...prev]; c[c.length-1]={ type:"ai", content: "Error: " + String(e) }; return c; });
    } finally {
      setLoading(false);
    }
  }

  const handleSend = (e) => { e.preventDefault(); if (!input.trim()) return; sendPrompt(input.trim()); setInput(""); };

  return (
    <div className={`helix-root ${loading ? "is-thinking" : ""}`}>
      <div className="helix-copy-toast">Copied!</div>

      <aside className="helix-sidebar">
        <div className="helix-avatar-wrap">
          <span className={`helix-avatar-pulse ${loading ? "active" : ""}`}></span>
          <FaRobot className="helix-avatar" />
        </div>
        <div className="helix-sidebar-btns">
          <button className="helix-btn" title="Code"><FaCode /></button>
          <button className="helix-btn" title="Voice (coming soon)"><FaMicrophone /></button>
        </div>
      </aside>

      <main className="helix-main">
        <div className="helix-core-outer"><div className="helix-core"><FaRobot /></div></div>

        {/* Model picker + status */}
        <div className="helix-model-row">
          <div className="helix-model-top">
            <select
              className="helix-model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              title={currentPurpose}
            >
              {/* Installed first */}
              {installed.map((m) => (
                <option key={`i-${m}`} value={m}>{m}</option>
              ))}
              {/* Suggestions not installed */}
              {Object.keys(MODEL_INFO)
                .filter(m => !installedSet.has(m.trim().toLowerCase()))
                .map(m => (<option key={`s-${m}`} value={m}>{m} — (not installed)</option>))}
            </select>

            <button className="helix-mini-btn" onClick={refreshModels} disabled={loadingModels} title="Refresh installed models">
              <FaSync /> {loadingModels ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {/* Badges */}
          <div className="helix-model-purpose">
            <span className={`helix-badge ${isInstalled(model) ? "ok" : "warn"}`}>
              {isInstalled(model) ? "Installed" : "Not installed"}
            </span>
            {confirmedModel && (
              <span className="helix-badge now">
                Using: <strong>{confirmedModel}</strong>
              </span>
            )}
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

        <form className="helix-input-row" onSubmit={handleSend}>
          <input
            type="text"
            className="helix-input"
            placeholder="Type your prompt for Helix..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        <button className="helix-send-btn" type="submit">Send</button>
        </form>

        <p className="helix-status">
          <span className={`helix-status-dot ${loading ? "on" : ""}`} /> Helix AI is running offline on your device.
        </p>
      </main>
    </div>
  );
}
