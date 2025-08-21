import React, {
  useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle
} from "react";
import {
  FaPlus, FaCopy, FaPaperPlane, FaMagic, FaDownload, FaBold, FaItalic, FaUnderline,
  FaStrikethrough, FaListUl, FaListOl, FaQuoteRight, FaUndo, FaRedo, FaEraser,
  FaLink, FaAlignLeft, FaAlignCenter, FaAlignRight, FaHeading
} from "react-icons/fa";

const LS_KEY = "helix:notes";

/* ---------- simple local storage ---------- */
function loadNotes() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
function saveNotes(notes) {
  localStorage.setItem(LS_KEY, JSON.stringify(notes));
}

/* ---------- paste cleaner (keeps structure, removes scripts/styles) ---------- */
function cleanHTML(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("script, style").forEach(n => n.remove());
    const walk = (el) => {
      // strip unsafe attrs, keep safe link attrs
      [...el.attributes || []].forEach(attr => {
        const n = attr.name.toLowerCase();
        if (n.startsWith("on")) el.removeAttribute(attr.name);
        if (n === "style") el.removeAttribute("style");
        if (el.tagName !== "A" && ["href","rel","target"].includes(n)) el.removeAttribute(n);
        if (n === "dir") el.removeAttribute("dir");
      });
      [...el.childNodes].forEach(ch => {
        if (ch.nodeType === Node.ELEMENT_NODE) walk(ch);
        else if (ch.nodeType === Node.TEXT_NODE) {
          // strip bidi control chars
          ch.nodeValue = (ch.nodeValue || "").replace(/[\u202A-\u202E\u2066-\u2069\u200F]/g, "");
        }
      });
    };
    walk(doc.body);
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

/* ---------- iframe document skeleton (always LTR) ---------- */
function iframeHTML(initialBody = "<p>Start typing…</p>") {
  return `
<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8"/>
<style>
  html, body { height:100%; }
  body {
    margin: 0;
    padding: 16px 18px;
    color: #e9e6ee;
    background: transparent;
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    direction: ltr !important;
    unicode-bidi: normal !important;
    text-align: left !important;
  }
  p, h1, h2, h3, h4, h5, h6, blockquote { margin: 0 0 .6em 0; }
  ol, ul { margin: 0 0 .8em 1.25em; padding: 0; }
  blockquote { border-left: 3px solid rgba(255,255,255,.25); padding-left: 10px; color: #c9c4d3; }
  a { color: #89a7ff; text-decoration: underline; }
  /* Make selection visible on dark bg */
  ::selection { background: rgba(137,167,255,.35); }
</style>
</head>
<body contenteditable="true">${initialBody}</body>
</html>`;
}

/* ---------- component (iframe-based rich editor) ---------- */
const NotesEditor = forwardRef(function NotesEditor({ onInsertToChat, onAskAI }, ref) {
  const [notes, setNotes] = useState(() => {
    const n = loadNotes();
    return n.length ? n : [{
      id: crypto.randomUUID(), title: "Untitled Note", html: "<p>Start typing…</p>"
    }];
  });
  const [activeId, setActiveId] = useState(notes[0]?.id);

  const frameRef = useRef(null);          // <iframe> node
  const docRef = useRef(null);            // iframe document
  const bodyRef = useRef(null);           // iframe body (editable)

  const active = useMemo(() => notes.find(n => n.id === activeId) || notes[0], [notes, activeId]);

  useEffect(() => saveNotes(notes), [notes]);
  useEffect(() => {
    if (!notes.find(n => n.id === activeId) && notes[0]) setActiveId(notes[0].id);
  }, [notes, activeId]);

  // Initialize iframe when it mounts or when switching notes
  useEffect(() => {
    const iframe = frameRef.current;
    if (!iframe) return;

    // Write isolated document
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(iframeHTML(active?.html || "<p></p>"));
    doc.close();

    // Cache refs
    docRef.current = doc;
    bodyRef.current = doc.body;

    // Ensure designMode & LTR bias
    try { doc.designMode = "on"; } catch {}
    doc.documentElement.setAttribute("dir", "ltr");
    bodyRef.current.setAttribute("dir", "ltr");
    bodyRef.current.style.direction = "ltr";
    bodyRef.current.style.unicodeBidi = "normal";
    bodyRef.current.style.textAlign = "left";

    // Sync: input/keyup/blur
    const sync = () => {
      const html = doc.body.innerHTML || "";
      setNotes(ns => ns.map(n => n.id === activeId ? { ...n, html } : n));
    };
    const onPaste = (e) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const html = dt.getData("text/html");
      const text = dt.getData("text/plain");
      e.preventDefault();
      if (html) {
        doc.execCommand("insertHTML", false, cleanHTML(html));
      } else if (text) {
        const cleaned = text.replace(/[\u202A-\u202E\u2066-\u2069\u200F]/g, "");
        doc.execCommand("insertText", false, cleaned);
      }
      sync();
    };

    doc.addEventListener("input", sync);
    doc.addEventListener("keyup", sync);
    doc.addEventListener("blur", sync);
    doc.addEventListener("paste", onPaste);

    // Focus cursor at end
    setTimeout(() => {
      iframe.contentWindow?.focus();
      const sel = doc.getSelection();
      const r = doc.createRange();
      r.selectNodeContents(doc.body);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }, 0);

    return () => {
      doc.removeEventListener("input", sync);
      doc.removeEventListener("keyup", sync);
      doc.removeEventListener("blur", sync);
      doc.removeEventListener("paste", onPaste);
    };
  }, [activeId]); // re-init when switching notes

  /* ---------- toolbar commands (operate inside iframe doc) ---------- */
  const run = (cmd, val = null) => {
    const d = docRef.current;
    if (!d) return;
    d.execCommand(cmd, false, val);
    d.body.focus();
  };
  const applyHeading = (level) => run("formatBlock", `h${level}`);
  const applyParagraph = () => run("formatBlock", "p");
  const makeLink = () => {
    const d = docRef.current; if (!d) return;
    const url = prompt("Enter URL:");
    if (url) run("createLink", url);
  };

  // Expose API for /notes
  useImperativeHandle(ref, () => ({
    createNote: (title) => addNote(title || "Untitled Note"),
    focus: () => frameRef.current?.contentWindow?.focus()
  }), []);

  /* ---------- note ops ---------- */
  const addNote = (title = "Untitled Note") => {
    const nn = { id: crypto.randomUUID(), title, html: "<p>Start typing…</p>" };
    setNotes(ns => [...ns, nn]);
    setActiveId(nn.id);
  };
  const deleteNote = (id) => setNotes(ns => ns.filter(n => n.id !== id));
  const rename = (id, title) => setNotes(ns => ns.map(n => n.id === id ? { ...n, title } : n));

  /* ---------- copy / download / chat / AI ---------- */
  const copy = async () => {
    const d = docRef.current;
    if (!d) return;
    const html = d.body.innerHTML || "";
    const text = d.body.innerText || "";
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" })
        });
        await navigator.clipboard.write([item]);
      } else {
        const sel = d.getSelection();
        const r = d.createRange();
        r.selectNodeContents(d.body);
        sel.removeAllRanges(); sel.addRange(r);
        d.execCommand("copy");
        sel.removeAllRanges();
      }
      const t = document.querySelector(".helix-copy-toast");
      if (t) { t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 900); }
    } catch {}
  };

  const download = () => {
    const d = docRef.current; if (!d) return;
    const blob = new Blob([
      `<!doctype html><meta charset="utf-8"><title>${active?.title || "Note"}</title>${d.body.innerHTML || ""}`
    ], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(active?.title || "Note").replace(/\s+/g, "_")}.html`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const insertToChat = () => {
    const d = docRef.current; if (!d) return;
    onInsertToChat?.(`**${active?.title || "Note"}**\n\n${d.body.innerText || ""}`);
  };

  const askAI = () => {
    const d = docRef.current; if (!d) return;
    const prompt =
`Please review and improve these notes titled "${active?.title || "Note"}".
- Fix grammar/clarity
- Preserve headings/lists
- Return improved notes as Markdown

CONTENT:
${d.body.innerText || ""}`;
    onAskAI?.(prompt);
  };

  return (
    <div className="helix-notes" style={{height:"100%", display:"flex", flexDirection:"column"}}>
      {/* Tabs + actions */}
      <div className="helix-editor-header compact">
        <div className="helix-tabs">
          {notes.map(n => (
            <div
              key={n.id}
              className={`helix-tab ${n.id === activeId ? "active" : ""}`}
              onClick={() => setActiveId(n.id)}
              title={n.title}
            >
              <input
                className="helix-tab-name"
                value={n.title}
                onChange={e => rename(n.id, e.target.value)}
              />
              <button
                className="chip-x"
                aria-label="Close note"
                onClick={(e)=>{e.stopPropagation(); deleteNote(n.id);}}
              >×</button>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={()=>addNote()} title="New note">
            <FaPlus /> <span className="btn-text">New</span>
          </button>
        </div>

        <div className="btn-group">
          <button className="btn" onClick={copy} title="Copy (keeps formatting)">
            <FaCopy /> <span className="btn-text">Copy</span>
          </button>
          <button className="btn" onClick={insertToChat} title="Insert to Chat">
            <FaPaperPlane /> <span className="btn-text">Insert to Chat</span>
          </button>
          <button className="btn btn-primary" onClick={askAI} title="Ask Helix">
            <FaMagic /> <span className="btn-text">Ask Helix</span>
          </button>
          <button className="btn" onClick={download} title="Download .html">
            <FaDownload /> <span className="btn-text">Download</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="notes-toolbar">
        <button className="nt-btn" onClick={() => run("bold")} title="Bold"><FaBold/></button>
        <button className="nt-btn" onClick={() => run("italic")} title="Italic"><FaItalic/></button>
        <button className="nt-btn" onClick={() => run("underline")} title="Underline"><FaUnderline/></button>
        <button className="nt-btn" onClick={() => run("strikeThrough")} title="Strikethrough"><FaStrikethrough/></button>
        <span className="nt-sep"/>
        <button className="nt-btn" onClick={()=>applyHeading(1)} title="Heading 1"><FaHeading/><span className="nt-small">1</span></button>
        <button className="nt-btn" onClick={()=>applyHeading(2)} title="Heading 2"><FaHeading/><span className="nt-small">2</span></button>
        <button className="nt-btn" onClick={()=>applyParagraph()} title="Paragraph">¶</button>
        <span className="nt-sep"/>
        <button className="nt-btn" onClick={()=>run("insertUnorderedList")} title="Bulleted list"><FaListUl/></button>
        <button className="nt-btn" onClick={()=>run("insertOrderedList")} title="Numbered list"><FaListOl/></button>
        <button className="nt-btn" onClick={()=>run("formatBlock","blockquote")} title="Quote"><FaQuoteRight/></button>
        <span className="nt-sep"/>
        <button className="nt-btn" onClick={()=>run("justifyLeft")} title="Align left"><FaAlignLeft/></button>
        <button className="nt-btn" onClick={()=>run("justifyCenter")} title="Align center"><FaAlignCenter/></button>
        <button className="nt-btn" onClick={()=>run("justifyRight")} title="Align right"><FaAlignRight/></button>
        <span className="nt-sep"/>
        <button className="nt-btn" onClick={makeLink} title="Insert link"><FaLink/></button>
        <button className="nt-btn" onClick={()=>run("undo")} title="Undo"><FaUndo/></button>
        <button className="nt-btn" onClick={()=>run("redo")} title="Redo"><FaRedo/></button>
        <button className="nt-btn" onClick={()=>run("removeFormat")} title="Clear formatting"><FaEraser/></button>
      </div>

      {/* Iframe editing surface (isolated, LTR) */}
      <div className="notes-surface-wrap" style={{padding:0}}>
        <iframe
          ref={frameRef}
          title="Notes Editor"
          style={{
            width: "100%",
            height: "calc(70vh - 180px)",
            minHeight: 300,
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 12,
            background: "linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.10))",
            boxSizing: "border-box"
          }}
          sandbox="allow-same-origin allow-scripts allow-modals allow-popups allow-forms"
        />
      </div>
    </div>
  );
});

export default NotesEditor;
