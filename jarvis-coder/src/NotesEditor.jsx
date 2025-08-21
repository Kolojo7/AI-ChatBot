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

/* ---------- very light cleaner for pasted HTML ---------- */
function cleanHTML(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // remove script/style
    doc.querySelectorAll("script, style").forEach(n => n.remove());

    // strip dangerous attrs, allow href/rel/target on <a>
    const walk = (el) => {
      [...el.attributes || []].forEach(attr => {
        const n = attr.name.toLowerCase();
        if (n.startsWith("on")) el.removeAttribute(attr.name); // onclick etc
        if (n === "style") el.removeAttribute("style");         // drop inline styles
        if (el.tagName !== "A" && ["href","rel","target"].includes(n)) el.removeAttribute(n);
      });
      [...el.children].forEach(walk);
    };
    walk(doc.body);
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

/* ---------- bidi/LTR normalizers ---------- */
function stripBidiControls(text) {
  // strip RLE/RLO/PDF/LRE/LRO/FSI/PDI/RTL mark etc; keep LRM if desired
  return text.replace(/[\u202A-\u202E\u2066-\u2069\u200F]/g, "");
}
function normalizeLTRDom(root) {
  if (!root) return;
  root.setAttribute("dir", "ltr");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n;
      if (el.hasAttribute("dir")) el.removeAttribute("dir");
      if (el.style && el.style.direction) el.style.direction = "";
      // also kill accidental CSS flips
      if (el.style && el.style.transform) el.style.transform = "";
    } else if (n.nodeType === Node.TEXT_NODE) {
      n.nodeValue = stripBidiControls(n.nodeValue || "");
    }
  }
}

/* ---------- component ---------- */
const NotesEditor = forwardRef(function NotesEditor({ onInsertToChat, onAskAI }, ref) {
  const [notes, setNotes] = useState(() => {
    const n = loadNotes();
    return n.length ? n : [{
      id: crypto.randomUUID(), title: "Untitled Note", html: "<p>Start typing…</p>"
    }];
  });
  const [activeId, setActiveId] = useState(notes[0]?.id);
  const editorRef = useRef(null);

  useEffect(() => saveNotes(notes), [notes]);
  useEffect(() => {
    if (!notes.find(n => n.id === activeId) && notes[0]) setActiveId(notes[0].id);
  }, [notes, activeId]);

  const active = useMemo(() => notes.find(n => n.id === activeId) || notes[0], [notes, activeId]);

  const addNote = (title = "Untitled Note") => {
    const nn = { id: crypto.randomUUID(), title, html: "<p></p>" };
    setNotes(ns => [...ns, nn]);
    setActiveId(nn.id);
    setTimeout(() => editorRef.current?.focus(), 0);
  };
  const deleteNote = (id) => setNotes(ns => ns.filter(n => n.id !== id));
  const rename = (id, title) => setNotes(ns => ns.map(n => n.id === id ? { ...n, title } : n));
  const setHtml = (id, html) => setNotes(ns => ns.map(n => n.id === id ? { ...n, html } : n));

  // Expose API for /notes
  useImperativeHandle(ref, () => ({
    createNote: (title) => addNote(title || "Untitled Note"),
    focus: () => editorRef.current?.focus()
  }), []);

  /* ---------- formatting commands ---------- */
  const syncFromDom = () => {
    if (!active) return;
    normalizeLTRDom(editorRef.current);
    const html = editorRef.current?.innerHTML || "";
    setHtml(active.id, html);
  };
  const exec = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
    syncFromDom();
  };
  const applyHeading = (level) => exec("formatBlock", `h${level}`);
  const applyParagraph = () => exec("formatBlock", "p");
  const makeLink = () => {
    const url = prompt("Enter URL:");
    if (url) exec("createLink", url);
  };
  const clearFormatting = () => exec("removeFormat");

  /* ---------- copy / download / chat / AI ---------- */
  const copy = async () => {
    if (!active) return;
    const html = editorRef.current?.innerHTML || "";
    const text = editorRef.current?.innerText || "";
    try {
      // write rich HTML + plain text so Word/Docs keep formatting
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" })
        });
        await navigator.clipboard.write([item]);
      } else {
        // Fallback: select and execCommand
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        sel.removeAllRanges(); sel.addRange(range);
        document.execCommand("copy");
        sel.removeAllRanges();
      }
      const t = document.querySelector(".helix-copy-toast");
      if (t) { t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 900); }
    } catch {}
  };

  const download = () => {
    if (!active) return;
    const blob = new Blob([
      `<!doctype html><meta charset="utf-8"><title>${active.title}</title>${editorRef.current?.innerHTML || ""}`
    ], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${active.title.replace(/\s+/g, "_")}.html`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const insertToChat = () => {
    if (!active) return;
    onInsertToChat?.(`**${active.title}**\n\n${editorRef.current?.innerText || ""}`);
  };

  const askAI = () => {
    if (!active) return;
    const prompt =
`Please review and improve these notes titled "${active.title}".
- Fix grammar/clarity
- Preserve headings/lists
- Return improved notes as Markdown

CONTENT:
${editorRef.current?.innerText || ""}`;
    onAskAI?.(prompt);
  };

  /* ---------- paste handler: keep clean but rich, and enforce LTR ---------- */
  const onPaste = (e) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const html = dt.getData("text/html");
    const text = dt.getData("text/plain");
    e.preventDefault();
    if (html) {
      const cleaned = cleanHTML(html);
      document.execCommand("insertHTML", false, cleaned);
    } else if (text) {
      document.execCommand("insertText", false, stripBidiControls(text));
    }
    syncFromDom();
  };

  // Normalize LTR when switching notes
  useEffect(() => {
    setTimeout(() => normalizeLTRDom(editorRef.current), 0);
  }, [activeId]);

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
        <button className="nt-btn" onClick={() => exec("bold")} title="Bold"><FaBold/></button>
        <button className="nt-btn" onClick={() => exec("italic")} title="Italic"><FaItalic/></button>
        <button className="nt-btn" onClick={() => exec("underline")} title="Underline"><FaUnderline/></button>
        <button className="nt-btn" onClick={() => exec("strikeThrough")} title="Strikethrough"><FaStrikethrough/></button>
        <span className="nt-sep"/>
        <button className="nt-btn" onClick={()=>applyHeading(1)} title="Heading 1"><FaHeading/><span className="nt-small">1</span></button>
        <button className="nt-btn" onClick={()=>applyHeading(2)} title="Heading 2"><FaHeading/><span className="nt-small">2</span></button>
        <button className="nt-btn" onClick={applyParagraph} title="Paragraph">¶</button>
        <span className="nt-sep"/>
        <button className="nt-btn" onClick={()=>exec("insertUnorderedList")} title="Bulleted list"><FaListUl/></button>
        <button className="nt-btn" onClick={()=>exec("insertOrderedList")} title="Numbered list"><FaListOl/></button>
        <button className="nt-btn" onClick={()=>exec("formatBlock","blockquote")} title="Quote"><FaQuoteRight/></button>
        <span className="nt-sep"/>
        <button className="nt-btn" onClick={()=>exec("justifyLeft")} title="Align left"><FaAlignLeft/></button>
        <button className="nt-btn" onClick={()=>exec("justifyCenter")} title="Align center"><FaAlignCenter/></button>
        <button className="nt-btn" onClick={()=>exec("justifyRight")} title="Align right"><FaAlignRight/></button>
        <span className="nt-sep"/>
        <button className="nt-btn" onClick={makeLink} title="Insert link"><FaLink/></button>
        <button className="nt-btn" onClick={() => exec("undo")} title="Undo"><FaUndo/></button>
        <button className="nt-btn" onClick={() => exec("redo")} title="Redo"><FaRedo/></button>
        <button className="nt-btn" onClick={clearFormatting} title="Clear formatting"><FaEraser/></button>
      </div>

      {/* Editable surface */}
      <div className="notes-surface-wrap">
        <div
          ref={editorRef}
          className="notes-surface"
          contentEditable
          suppressContentEditableWarning
          dir="ltr"
          onInput={syncFromDom}
          onPaste={onPaste}
          dangerouslySetInnerHTML={{ __html: active?.html || "<p></p>" }}
        />
      </div>
    </div>
  );
});

export default NotesEditor;
