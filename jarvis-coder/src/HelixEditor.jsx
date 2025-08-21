// src/HelixEditor.jsx
import React, { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
// ⟵ replace FaWandMagic with FaMagic
import { FaPlus, FaCopy, FaPaperPlane, FaMagic, FaDownload } from "react-icons/fa";

const LS_KEY = "helix:files";

const LANGS = {
  javascript: { label: "JavaScript", ext: "js", extFn: javascript },
  typescript: { label: "TypeScript", ext: "ts", extFn: () => javascript({ typescript: true }) },
  python: { label: "Python", ext: "py", extFn: python },
  markdown: { label: "Markdown", ext: "md", extFn: markdown },
};

function loadFiles() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
function saveFiles(files) {
  localStorage.setItem(LS_KEY, JSON.stringify(files));
}

export default function HelixEditor({ onInsertToChat, onAskAI }) {
  const [files, setFiles] = useState(() => {
    const f = loadFiles();
    return f.length ? f : [{
      id: crypto.randomUUID(), name: "scratch.js", lang: "javascript", content: "// Hello from Helix Editor\n"
    }];
  });
  const [activeId, setActiveId] = useState(files[0]?.id);

  useEffect(() => { saveFiles(files); }, [files]);
  useEffect(() => {
    if (!files.find(f => f.id === activeId) && files[0]) setActiveId(files[0].id);
  }, [files, activeId]);

  const active = files.find(f => f.id === activeId) || files[0];
  const extensions = useMemo(() => active ? [LANGS[active.lang]?.extFn?.()] : [], [active]);

  const rename = (id, name) => setFiles(fs => fs.map(f => f.id === id ? { ...f, name } : f));
  const setLang = (id, lang) => setFiles(fs => fs.map(f => f.id === id ? { ...f, lang } : f));
  const updateContent = (id, content) => setFiles(fs => fs.map(f => f.id === id ? { ...f, content } : f));

  const addFile = () => {
    const lang = "javascript";
    const nf = { id: crypto.randomUUID(), name: `untitled.${LANGS[lang].ext}`, lang, content: "" };
    setFiles(fs => [...fs, nf]);
    setActiveId(nf.id);
  };
  const deleteFile = (id) => setFiles(fs => fs.filter(f => f.id !== id));

  const copy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(active.content || "");
    const t = document.querySelector(".helix-copy-toast");
    if (t) { t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 900); }
  };
  const download = () => {
    if (!active) return;
    const blob = new Blob([active.content || ""], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = active.name || `file.${LANGS[active.lang]?.ext || "txt"}`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const insertToChat = () => {
    if (!active) return;
    const fenceLang = active.lang === "typescript" ? "ts"
                    : active.lang === "javascript" ? "js"
                    : active.lang === "python" ? "python"
                    : active.lang === "markdown" ? "md" : "";
    onInsertToChat?.(`\`\`\`${fenceLang}\n${active.content}\n\`\`\``);
  };
  const askAI = () => {
    if (!active) return;
    const prompt =
`Review and improve this ${active.lang} file \`${active.name}\`. Explain changes, then provide the revised full file.

\`\`\`${active.lang === "typescript" ? "ts" : active.lang}
${active.content}
\`\`\``;
    onAskAI?.(prompt);
  };

  return (
    <div className="helix-editor" style={{height: "100%", display:"flex", flexDirection:"column"}}>
      <div className="helix-editor-header compact">
        <div className="helix-tabs">
          {files.map(f => (
            <div
              key={f.id}
              className={`helix-tab ${f.id === activeId ? "active" : ""}`}
              onClick={() => setActiveId(f.id)}
              title={f.name}
            >
              <input
                className="helix-tab-name"
                value={f.name}
                onChange={e => rename(f.id, e.target.value)}
              />
              <button
                className="chip-x"
                aria-label="Close file"
                onClick={(e)=>{e.stopPropagation(); deleteFile(f.id);}}
              >×</button>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={addFile} title="New file">
            <FaPlus /> <span className="btn-text">New</span>
          </button>
        </div>

        {active && (
          <div className="btn-group">
            <select
              className="helix-select"
              value={active.lang}
              onChange={e => setLang(active.id, e.target.value)}
              aria-label="Language"
            >
              {Object.entries(LANGS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>

            <button className="btn" onClick={copy} title="Copy">
              <FaCopy /> <span className="btn-text">Copy</span>
            </button>
            <button className="btn" onClick={insertToChat} title="Insert to Chat">
              <FaPaperPlane /> <span className="btn-text">Insert to Chat</span>
            </button>
            {/* ⟵ use FaMagic here */}
            <button className="btn btn-primary" onClick={askAI} title="Ask Helix">
              <FaMagic /> <span className="btn-text">Ask Helix</span>
            </button>
            <button className="btn" onClick={download} title="Download">
              <FaDownload /> <span className="btn-text">Download</span>
            </button>
          </div>
        )}
      </div>

      <div style={{flex:1, minHeight:0}}>
        {active && (
          <CodeMirror
            key={active.id}
            value={active.content}
            height="100%"
            theme={vscodeDark}
            extensions={extensions}
            onChange={(v)=>updateContent(active.id, v)}
            basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
          />
        )}
      </div>
    </div>
  );
}
