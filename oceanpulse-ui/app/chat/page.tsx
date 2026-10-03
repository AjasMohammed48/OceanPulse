"use client";

import React, { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const RechartsChart = dynamic(() => import("./InlinePlotChart"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
      Loading chart…
    </div>
  ),
});

// ── Types ──────────────────────────────────────────────────────
interface PlotData {
  type: "line" | "bar";
  title: string;
  x_label: string;
  y_label: string;
  data: Array<{ x: string | number; y: number; [key: string]: unknown }>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  plots?: PlotData[];
  timestamp: Date;
}

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
}

// ── Inline plot ────────────────────────────────────────────────
function InlinePlot({ plot }: { plot: PlotData }) {
  return (
    <div className="plot-card">
      <div className="plot-card-header">
        <span className="plot-card-title">{plot.title}</span>
        <span className="badge badge-teal" style={{ fontSize: 9 }}>Chart</span>
      </div>
      <div className="plot-card-body">
        <RechartsChart plot={plot} />
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)", marginTop: 8 }}>
          X-axis: {plot.x_label} &nbsp;·&nbsp; Y-axis: {plot.y_label}
        </p>
      </div>
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`chat-message${isUser ? " user" : ""}`}>
      <div className={`chat-avatar${isUser ? " user-av" : " assistant"}`}>
        {isUser ? "👤" : "🌊"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 700 }}>
        <div className="chat-bubble">
          <span dangerouslySetInnerHTML={{
            __html: msg.content
              .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
              .replace(/\*(.*?)\*/g, "<em>$1</em>")
              .replace(/\n/g, "<br/>"),
          }} />
        </div>
        {msg.plots && msg.plots.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {msg.plots.map((p, i) => <InlinePlot key={i} plot={p} />)}
          </div>
        )}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-ghost)", paddingLeft: isUser ? 0 : 4, alignSelf: isUser ? "flex-end" : "flex-start" }}>
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

// ── Typing indicator ───────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="chat-message">
      <div className="chat-avatar assistant">🌊</div>
      <div className="chat-bubble" style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--teal-bright)", animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
          ))}
        </div>
        <style>{`@keyframes typingBounce { 0%,80%,100%{transform:translateY(0);opacity:.4} 40%{transform:translateY(-6px);opacity:1} }`}</style>
      </div>
    </div>
  );
}

// ── File pill ──────────────────────────────────────────────────
function FilePill({ file, onRemove }: { file: UploadedFile; onRemove: () => void }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--ocean-surface)", border: "1px solid var(--border-active)", borderRadius: 7, padding: "5px 10px", fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
      📎 {file.name} <span style={{ color: "var(--text-muted)" }}>({(file.size / 1024).toFixed(1)} KB)</span>
      <button onClick={onRemove} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  );
}

// ── Argo float pre-fill banner ─────────────────────────────────
function ArgoBanner({ onSend, onDismiss, message }: { onSend: (msg: string) => void; onDismiss: () => void; message: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem",
      padding: "0.65rem 1rem", borderRadius: 10, marginBottom: "0.75rem",
      background: "linear-gradient(90deg, rgba(0,168,150,0.15), rgba(0,212,186,0.06))",
      border: "1px solid var(--border-active)",
    }}>
      <p style={{ fontSize: "0.78rem", color: "var(--teal-bright)", fontFamily: "var(--font-mono)" }}>
        📍 An Argo float profile has been loaded. Send the pre-filled question below to analyse it.
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          onClick={() => onSend(message)}
          style={{ padding: "0.3rem 0.9rem", borderRadius: 7, background: "var(--teal-mid)", border: "none", color: "var(--ocean-void)", fontWeight: 700, fontSize: "0.75rem", cursor: "pointer", fontFamily: "var(--font-display)" }}
        >
          Send Now
        </button>
        <button
          onClick={onDismiss}
          style={{ padding: "0.3rem 0.75rem", borderRadius: 7, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", fontSize: "0.75rem", cursor: "pointer", fontFamily: "var(--font-display)" }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── Inner chat component (uses useSearchParams) ────────────────
function ChatPageInner() {
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome",
    role: "assistant",
    content: "Hello! I am the OceanPulse assistant. I can answer questions about the Indian Ocean — sea temperatures, marine heatwaves, climate patterns, Argo float data, and more. When relevant, I will include charts to help explain the data. What would you like to know?",
    timestamp: new Date(),
  }]);
  const [input,          setInput]          = useState("");
  const [isLoading,      setIsLoading]      = useState(false);
  const [uploadedFiles,  setUploadedFiles]  = useState<UploadedFile[]>([]);
  const [showArgoBanner, setShowArgoBanner] = useState(false);

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const argoMessageRef  = useRef<string>("");           // ← stores the float message

  // ── Read ?message= from URL (set by Argo page) ────────────
  useEffect(() => {
    const msg = searchParams.get("message");
    if (msg?.trim()) {
      const decoded = decodeURIComponent(msg);
      argoMessageRef.current = decoded;                 // ← save to ref
      setInput(decoded);
      setShowArgoBanner(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  // File upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedFiles((prev) => [...prev, { name: file.name, size: file.size, type: file.type, dataUrl: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // ── Core API call (shared by both send paths) ──────────────
  const callChatAPI = useCallback(async (text: string, currentMessages: ChatMessage[]) => {
    const body: Record<string, unknown> = {
      question: text,
      history: currentMessages.map((m) => ({ role: m.role, content: m.content })),
    };

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/chat`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );

    if (!res.ok) throw new Error(`Server returned an error (status ${res.status}).`);
    return await res.json();
  }, []);

  // ── Send from textarea (uses input state) ──────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setShowArgoBanner(false);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => {
      const next = [...prev, userMsg];
      return next;
    });
    setIsLoading(true);

    try {
      const snapshot = await new Promise<ChatMessage[]>((resolve) => {
        setMessages((prev) => { resolve(prev); return prev; });
      });
      const json = await callChatAPI(text, snapshot.filter((m) => m.role !== "user" || m.id !== userMsg.id));
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: json.answer || "I could not generate a response. Please try again.",
        plots: json.plots ?? [],
        timestamp: new Date(),
      }]);
      setUploadedFiles([]);
    } catch (err: unknown) {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: err instanceof Error ? `Something went wrong: ${err.message}` : "I could not connect to the OceanPulse server. Please make sure the backend is running.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, callChatAPI]);

  // ── Send from Argo banner (uses direct string, no state) ───
  const sendMessageWithText = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    setShowArgoBanner(false);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const json = await callChatAPI(text, messages);
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: json.answer || "I could not generate a response. Please try again.",
        plots: json.plots ?? [],
        timestamp: new Date(),
      }]);
    } catch (err: unknown) {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: err instanceof Error ? `Something went wrong: ${err.message}` : "I could not connect to the OceanPulse server. Please make sure the backend is running.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, callChatAPI]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ocean Chat</h1>
          <p className="page-subtitle">Ask anything about the Indian Ocean — the assistant has access to real data and will include charts when helpful</p>
        </div>
        <button
          onClick={() => {
            setMessages([{ id: "welcome", role: "assistant", content: "Hello! I am the OceanPulse assistant. How can I help you understand the Indian Ocean today?", timestamp: new Date() }]);
            setShowArgoBanner(false);
          }}
          style={{ background: "transparent", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em", alignSelf: "center", transition: "all 0.18s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-active)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-subtle)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
        >
          Clear conversation
        </button>
      </div>

      <div className="page-body" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>

        {/* Argo pre-fill banner */}
        {showArgoBanner && (
          <ArgoBanner
            message={argoMessageRef.current}
            onSend={(msg) => {
              setShowArgoBanner(false);
              sendMessageWithText(msg);
            }}
            onDismiss={() => setShowArgoBanner(false)}
          />
        )}

        {/* Messages */}
        <div className="chat-messages" style={{ flex: 1, overflowY: "auto" }}>
          {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Uploaded files */}
        {uploadedFiles.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 0 6px" }}>
            {uploadedFiles.map((f, i) => (
              <FilePill key={i} file={f} onRemove={() => setUploadedFiles((prev) => prev.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="chat-input-bar">
          <div className="chat-input-wrapper">
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, padding: "0 2px", transition: "color 0.18s", alignSelf: "flex-end", marginBottom: 2 }}
              title="Upload a data file"
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--teal-bright)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)")}
            >📎</button>
            <input ref={fileInputRef} type="file" multiple accept=".csv,.parquet,.json,.txt,.nc,.pdf" style={{ display: "none" }} onChange={handleFileUpload} />

            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder="Ask about sea temperatures, marine heatwaves, climate patterns…"
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              rows={1}
            />

            <button className="chat-send-btn" onClick={sendMessage} disabled={!input.trim() || isLoading} title="Send message">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 8h12M8 2l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-ghost)", marginTop: 7 }}>
            Press Enter to send · Shift + Enter for a new line · Attach data files using 📎
          </p>
        </div>
      </div>
    </>
  );
}

// ── Wrap in Suspense — required by Next.js for useSearchParams ─
export default function ChatPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: "2rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
        Loading chat…
      </div>
    }>
      <ChatPageInner />
    </Suspense>
  );
}