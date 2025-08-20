// app/api/chat/route.ts
import {NextRequest} from "next/server";
import {azure, DEPLOYMENT} from "@/lib/azure";

export const runtime = "nodejs"; // 允许服务器端流式

type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
    role: ChatRole;
    content: string
}

const CLASSIFIER_SYSTEM = `You are a prompt quality checker.
Given the user's latest message, decide if it's ambiguous or underspecified.
Return STRICT JSON with keys: needs_clarification (boolean), clarifying_question (string), rewrite (string).
- rewrite = a clearer, more actionable rephrasing in the USER's language.
- If no clarification needed, set clarifying_question to "".`;

// 统一的错误响应
function json(status: number, obj: any) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: {"Content-Type": "application/json"},
    });
}

export async function POST(req: NextRequest) {
    // —— 确保所有 return 都在函数体内 ——
    const body = await req.json().catch(() => null) as { messages?: ChatMessage[] } | null;
    const messages = body?.messages ?? [];
    if (!messages.length) return json(400, {error: "No messages"});

    const userMsg = messages[messages.length - 1];

    // 1) 分类+重写（非流式）
    const classify = await azure.chat.completions.create({
        model: DEPLOYMENT,
        temperature: 0.1,
        // 如果你所在区域的 API 版本不支持 JSON mode，可删掉此行并用提示词约束
        response_format: {type: "json_object"},
        messages: [
            {role: "system", content: CLASSIFIER_SYSTEM},
            {role: "user", content: userMsg.content},
        ],
    });

    let parsed: { needs_clarification?: boolean; clarifying_question?: string; rewrite?: string } = {};
    try {
        parsed = JSON.parse(classify.choices[0]?.message?.content ?? "{}");
    } catch {
        // 忽略解析失败，走正常生成
    }

    // 需要澄清则直接返回 JSON（非流式）
    if (parsed?.needs_clarification) {
        return json(200, {
            type: "clarify",
            question: parsed.clarifying_question || "Could you clarify?",
            rewrite: parsed.rewrite || userMsg.content,
        });
    }

    // 2) 进入流式回答
    const planning = parsed?.rewrite
        ? [{role: "assistant" as const, content: `Rewritten intent: ${parsed.rewrite}`}]
        : [];

    const stream = await azure.chat.completions.create({
        model: DEPLOYMENT,
        temperature: 0.7,
        stream: true,
        messages: [
            {role: "system", content: "You are a helpful assistant. Be concise, accurate, and clarify only if needed."},
            ...messages,
            ...planning,
        ],
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                for await (const event of stream) {
                    const delta = event.choices?.[0]?.delta?.content ?? "";
                    if (delta) {
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify({type: "token", content: delta})}\n\n`),
                        );
                    }
                }
            } catch (e) {
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({type: "token", content: "\n[Stream error]"})}\n\n`),
                );
            } finally {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({type: "done"})}\n\n`));
                controller.close();
            }
        },
    });

    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}
