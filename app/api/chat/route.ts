// app/api/chat/route.ts


const content = classify.choices[0]?.message?.content ?? "{}";
let parsed: { needs_clarification?: boolean; clarifying_question?: string; rewrite?: string };
try {
    parsed = JSON.parse(content);
} catch {
    parsed = {};
}


// If we need clarification, short-circuit with a JSON response (easier for the UI to render)
if (parsed?.needs_clarification) {
    return new Response(
        JSON.stringify({
            type: "clarify",
            question: parsed.clarifying_question || "Could you clarify?",
            rewrite: parsed.rewrite || userMsg.content,
        }),
        {status: 200, headers: {"Content-Type": "application/json"}}
    );
}


// 2) Otherwise stream the answer
// Inject the rewrite as assistant planning context (light-touch; model can use it)
const planning = parsed?.rewrite ? [{role: "assistant" as const, content: `Rewritten intent: ${parsed.rewrite}`}] : [];


const stream = await azure.chat.completions.create({
    model: DEPLOYMENT,
    temperature: 0.7,
    stream: true,
    messages: [
        {
            role: "system",
            content: "You are a helpful assistant. Be concise, accurate, and ask for clarification only if strictly needed."
        },
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
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({type: "token", content: delta})}\n\n`));
                }
            }
        } catch (err: any) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "token",
                content: "\n[Stream error]"
            })}\n\n`));
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