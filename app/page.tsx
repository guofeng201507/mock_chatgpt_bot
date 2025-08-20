// app/page.tsx
"use client";
import {useEffect, useRef, useState} from "react";
import type {ChatMessage, ServerEvent} from "@/types/chat";

export default function ChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {role: "system", content: "You are ChatGPT‑like assistant."},
    ]);

    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState(false);
    const [rewrite, setRewrite] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({top: scrollRef.current.scrollHeight});
    }, [messages]);

    async function send() {
        if (!input.trim() || streaming) return;


        const next = [...messages, {role: "user", content: input.trim()} as ChatMessage];
        setMessages(next);
        setInput("");
        setRewrite(null);

        const res = await fetch("/api/chat", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({messages: next}),
        });


        const contentType = res.headers.get("Content-Type") || "";


// Case A: clarification JSON (no streaming)
        if (contentType.includes("application/json")) {
            const data = (await res.json()) as ServerEvent & { type: "clarify" };
            setRewrite(data.rewrite);
            setMessages((prev) => [
                ...prev,
                {role: "assistant", content: `需要澄清：${data.question}`},
            ]);
            return;
        }

// Case B: stream tokens
        setStreaming(true);
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";


// Push a placeholder assistant message we will append to
        setMessages((prev) => [...prev, {role: "assistant", content: ""}]);

        try {
            while (true) {
                const {value, done} = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {stream: true});


                let idx;
                while ((idx = buffer.indexOf("\n\n")) !== -1) {
                    const line = buffer.slice(0, idx).trim();
                    buffer = buffer.slice(idx + 2);
                    if (!line.startsWith("data:")) continue;
                    const payload = JSON.parse(line.slice(5)) as ServerEvent;


                    if (payload.type === "token") {
                        setMessages((prev) => {
                            const last = prev[prev.length - 1];
                            const updated = {...last, content: (last.content || "") + payload.content} as ChatMessage;
                            return [...prev.slice(0, -1), updated];
                        });
                    } else if (payload.type === "done") {
                        setStreaming(false);
                    }
                }
            }
        } finally {
            setStreaming(false);
        }
    }

    return (
        <div className="min-h-screen flex flex-col bg-[#0b0f14] text-white">
            <header className="p-4 text-center font-semibold">Azure GPT‑4o Chat</header>
            <main ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.filter(m => m.role !== "system").map((m, i) => (
                    <div key={i}
                         className={`max-w-[85%] p-3 rounded-2xl ${m.role === "user" ? "bg-[#1d2837] self-end ml-auto" : "bg-[#131a23]"}`}>
                        <div className="opacity-70 text-xs mb-1">{m.role}</div>
                        <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    </div>
                ))}
                {rewrite && (
                    <div className="text-xs opacity-70 px-1">
                        建议重写：<span className="opacity-90">{rewrite}</span>
                    </div>
                )}
            </main>
            <form onSubmit={(e) => {
                e.preventDefault();
                void send();
            }} className="p-4 border-t border-white/10 flex gap-2">
                <input
                    className="flex-1 bg-[#0e141b] border border-white/10 rounded-xl px-3 py-2 outline-none"
                    placeholder={streaming ? "Generating..." : "Type your question"}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={streaming}
                />
                <button className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50"
                        disabled={streaming}>Send
                </button>
            </form>
        </div>
    );
}