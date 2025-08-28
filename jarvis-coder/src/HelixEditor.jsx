// src/HelixEditor.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { html as htmlLang } from "@codemirror/lang-html";
import { json as jsonLang } from "@codemirror/lang-json";
import {
  FaPlus, FaCopy, FaPaperPlane, FaMagic, FaDownload,
  FaFolderOpen, FaSave
} from "react-icons/fa";

const LS_KEY = "helix:files";

const LANGS = {
  javascript: { label: "JavaScript", ext: "js", extFn: javascript },
  typescript: { label: "TypeScript", ext: "ts", extFn: () => javascript({ typescript: true }) },
  python:     { label: "Python",     ext: "py", extFn: python },
  markdown:   { label: "Markdown",   ext: "md", extFn: markdown },
  html:       { label: "HTML",       ext: "html", extFn: htmlLang },
  json:       { label: "JSON",       ext: "json", extFn: jsonLang },
};

// infer language from filename
function guessLangByName(name = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = { js:"javascript", mjs:"javascript", cjs:"javascript", ts:"typescript",
                py:"python", md:"markdown", html:"html", htm:"html", json:"json" };
  return map[ext] || "javascript";
}

function loadFiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY)) || [];
    return Array.isArray(raw) && raw.length ? raw : [{
      id: crypto.randomUUID(), name: "untitled.js", lang: "javascript",
      content: "console.log('Hello from Helix Editor');"
    }];
  } catch {
    return [{
      id: crypto.randomUUID(), name: "untitled.js", lang: "javascript",
      content: "console.log('Hello from Helix Editor');"
    }];
  }
}
function saveFiles(files) {
  const skinny = files.map(({ handle, ...rest }) => rest); // never persist file handles
  localStorage.setItem(LS_KEY, JSON.stringify(skinny));
}

export default function HelixEditor({ onInsertToChat, onAskAI }) {
  const [files, setFiles] = useState(loadFiles);
  const [activeId, setActiveId] = useState(files[0]?.id);
  const fileInputRef = useRef(null);

  useEffect(() => { saveFiles(files); }, [files]);
  useEffect(() => { if (!files.find(f => f.id === activeId) && files[0]) setActiveId(files[0].id); }, [files, activeId]);

  const active = files.find(f => f.id === activeId) || files[0];
  const extensions = useMemo(() => active ? [LANGS[active.lang]?.extFn?.()] : [], [active]);

  const newFile = (lang = "javascript") => {
    const ext = LANGS[lang]?.ext || "txt";
    const nf = { id: crypto.randomUUID(), name: `untitled.${ext}`, lang, content: "" };
    setFiles(fs => [...fs, nf]); setActiveId(nf.id);
  };
  const closeFile     = (id) => setFiles(fs => fs.filter(f => f.id !== id));
  const rename        = (id, name) => setFiles(fs => fs.map(f => f.id === id ? { ...f, name } : f));
  const setLang       = (id, lang) => setFiles(fs => fs.map(f => f.id === id ? { ...f, lang } : f));
  const updateContent = (id, content) => setFiles(fs => fs.map(f => f.id === id ? { ...f, content } : f));

  const supportsFS = () => "showOpenFilePicker" in window && "showSaveFilePicker" in window;

  async function openFromDisk() {
    try {
      if (supportsFS()) {
        const [fh] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: "Code files", accept: { "text/plain": [".js",".ts",".py",".md",".html",".json",".txt"] } }]
        });
        const file = await fh.getFile();
        const text = await file.text();
        const lang = guessLangByName(file.name);
        const fobj = { id: crypto.randomUUID(), name: file.name, lang, content: text, handle: fh };
        setFiles(fs => [...fs, fobj]); setActiveId(fobj.id);
      } else {
        fileInputRef.current?.click();
      }
    } catch {}
  }
  async function onFileInputChange(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    const lang = guessLangByName(file.name);
    const fobj = { id: crypto.randomUUID(), name: file.name, lang, content: text };
    setFiles(fs => [...fs, fobj]); setActiveId(fobj.id);
    e.target.value = "";
  }

  function downloadFile(f) {
    const blob = new Blob([f.content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = f.name || "file.txt"; document.body.appendChild(a); a.click(); a.remove();
  }

  async function saveToDisk(id) {
    const f = files.find(x => x.id === id); if (!f) return;
    try {
      if (supportsFS()) {
        let handle = f.handle;
        if (!handle) {
          handle = await window.showSaveFilePicker({
            suggestedName: f.name,
            types: [{ description: "File", accept: { "text/plain": [`.${LANGS[f.lang]?.ext || "txt"}`] } }]
          });
          setFiles(fs => fs.map(x => x.id === id ? { ...x, handle } : x));
        }
        const writable = await handle.createWritable();
        await writable.write(f.content); await writable.close();
      } else {
        downloadFile(f);
      }
    } catch {}
  }
  async function saveAsToDisk(id) {
    const f = files.find(x => x.id === id); if (!f) return;
    if (!supportsFS()) return downloadFile(f);
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: f.name,
        types: [{ description: "File", accept: { "text/plain": [`.${LANGS[f.lang]?.ext || "txt"}`] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(f.content); await writable.close();
      setFiles(fs => fs.map(x => x.id === id ? { ...x, name: handle.name || f.name, handle } : x));
    } catch {}
  }

  const insertToChat = () => {
    if (!active) return;
    const langHint = active.lang === "typescript" ? "ts" : (LANGS[active.lang]?.ext || "txt");
    onInsertToChat?.("```" + langHint + "\n" + active.content + "\n```");
  };
  const askAI = () => {
    if (!active) return;
    const langHint = LANGS[active.lang]?.ext || "txt";
    const prompt = `Please review and improve this ${active.lang} file \`${active.name}\`.\n\n` +
      "Return suggestions and a revised version.\n\n" +
      "```" + langHint + "\n" + active.content + "\n```";
    onAskAI?.(prompt);
  };

  return (
    <div className="helix-editor">
      <div className="helix-editor-header compact">
        {/* Tabs */}
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
                onChange={(e) => {
                  const name = e.target.value;
                  rename(f.id, name);
                  const guessed = guessLangByName(name);
                  if (guessed !== f.lang) setLang(f.id, guessed);
                }}
              />
              <button className="chip-x" aria-label="Close file" onClick={(e)=>{e.stopPropagation(); closeFile(f.id);}}>×</button>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => newFile()} title="New file">
            <FaPlus /> <span className="btn-text">New</span>
          </button>
        </div>

        {/* Controls */}
        <div className="btn-group">
          <select
            className="helix-select"
            value={active?.lang || "javascript"}
            onChange={(e)=> setLang(active.id, e.target.value)}
          >
            {Object.entries(LANGS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <button className="btn" onClick={openFromDisk} title="Open from disk">
            <FaFolderOpen /> <span className="btn-text">Open</span>
          </button>
          <button className="btn" onClick={() => saveToDisk(active.id)} title="Save">
            <FaSave /> <span className="btn-text">Save</span>
          </button>
          <button className="btn" onClick={() => saveAsToDisk(active.id)} title="Save As">
            <FaSave /> <span className="btn-text">Save As</span>
          </button>
          <button className="btn" onClick={() => downloadFile(active)} title="Export">
            <FaDownload /> <span className="btn-text">Export</span>
          </button>
          <button className="btn" onClick={insertToChat} title="Insert to Chat">
            <FaPaperPlane /> <span className="btn-text">Insert</span>
          </button>
          <button className="btn btn-primary" onClick={askAI} title="Ask Helix">
            <FaMagic /> <span className="btn-text">Ask Helix</span>
          </button>
        </div>
      </div>

      {/* Hidden input for non-FS browsers */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={onFileInputChange}
        accept=".js,.ts,.py,.md,.html,.json,.txt"
      />

      <div className="pane-scroll" style={{ padding: 0 }}>
        {active && (
          <CodeMirror
            key={active.id}
            value={active.content}
            height="60vh"
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
