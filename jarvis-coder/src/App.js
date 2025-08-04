import React, { useState, useRef, useEffect } from "react";
import { FaMicrophone, FaRobot, FaCode } from "react-icons/fa";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import './Helix.css'; // We'll keep the filename for now

function TypingDots() {
  return (
    <span className="typing-dots">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

export default function App() {
  const [messages, setMessages] = useState([
    { type: "ai", content: "Hello, I am Helix. How can I assist you with your code today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendPrompt(prompt) {
    setLoading(true);
    setMessages((prev) => [...prev, { type: "user", content: prompt }]);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          type: "ai",
          content: "```python\n# Example generated code:\ndef greet(name):\n    print(f\"Hello, {name}!\")\n```"
        },
      ]);
      setLoading(false);
    }, 1600);
  }

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendPrompt(input);
    setInput("");
  };

  function renderContent(content) {
    if (content.startsWith("```")) {
      const match = content.match(/```(\w+)?\n([\s\S]*?)```/);
      if (match) {
        const lang = match[1] || "python";
        return (
          <SyntaxHighlighter language={lang} style={vscDarkPlus}>
            {match[2]}
          </SyntaxHighlighter>
        );
      }
    }
    return <span>{content}</span>;
  }

  return (
    <div className="helix-root">
      {/* Side nav */}
      <aside className="helix-sidebar">
        <div className="helix-avatar-wrap">
          <span className="helix-avatar-pulse"></span>
          <FaRobot className="helix-avatar" />
        </div>
        <div className="helix-sidebar-btns">
          <button className="helix-btn"><FaCode /></button>
          <button className="helix-btn"><FaMicrophone /></button>
        </div>
      </aside>

      {/* Main chat window */}
      <main className="helix-main">
        {/* Helix Core */}
        <div className="helix-core-outer">
          <div className="helix-core"><FaRobot /></div>
        </div>

        {/* Chat area */}
        <div className="helix-chat-area">
          {messages.map((msg, idx) => (
            <div key={idx} className={`helix-msg ${msg.type}`}>
              <div className={`helix-msg-bubble ${msg.type}`}>
                {renderContent(msg.content)}
              </div>
            </div>
          ))}
          {loading && (
            <div className="helix-msg ai">
              <div className="helix-msg-bubble ai">
                <span>Helix is thinking</span>
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef}></div>
        </div>
        {/* Input area */}
        <form className="helix-input-row" onSubmit={handleSend}>
          <input
            type="text"
            className="helix-input"
            placeholder="Type your prompt for Helix..."
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <button className="helix-send-btn" type="submit">
            Send
          </button>
        </form>
        <p className="helix-status">Helix AI is running offline on your device.</p>
      </main>
    </div>
  );
}
