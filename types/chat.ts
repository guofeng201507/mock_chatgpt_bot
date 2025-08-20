// types/chat.ts
export type ChatRole = "system" | "user" | "assistant";


export interface ChatMessage {
    role: ChatRole;
    content: string;
}


export type ServerEvent =
    | { type: "clarify"; question: string; rewrite: string }
    | { type: "token"; content: string }
    | { type: "done" };