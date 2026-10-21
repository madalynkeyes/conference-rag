// generate-answer: the "G" in RAG.
// Browser -> this function -> OpenAI (GPT-4o), so the OpenAI key never reaches the browser.
//
// Request:  POST {
//   "question": "How can I find peace?",
//   "context_talks": [{ "title": "...", "speaker": "...", "url": "...", "text": "full talk text" }, ...]
// }
// Response: { "answer": "..." }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const MODEL = "gpt-4o";
const MAX_TALKS = 5;
const MAX_CHARS_PER_TALK = 15000; // ~3,750 tokens; keeps the prompt (and cost) bounded

type ContextTalk = { title?: string; speaker?: string; url?: string; text?: string };

const SYSTEM_PROMPT = `You answer questions using ONLY the General Conference talks provided.

Rules:
- Base every statement on the provided talks. Do not add outside facts or quotes.
- Cite the talks you use by title and speaker, e.g. (Elder X, "Talk Title").
- Short direct quotes from the talks are welcome; put them in quotation marks.
- If the talks don't really answer the question, say so honestly and share whatever related insight they do offer.
- Be warm and practical. Write 2–4 short paragraphs of plain text — no markdown, headings, or bullet symbols.`;

Deno.serve(async (req) => {
  // 1. CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // 2. Only logged-in users (each call costs OpenAI credits)
  const userOrResponse = await requireAuth(req);
  if (userOrResponse instanceof Response) return userOrResponse;

  try {
    // 3. Validate input
    const { question, context_talks } = await req.json();
    if (typeof question !== "string" || question.trim() === "") {
      return jsonResponse({ error: "Request body must include a non-empty 'question'" }, 400);
    }
    const talks: ContextTalk[] = Array.isArray(context_talks) ? context_talks : [];

    // The site's readiness check sends an empty list — answer without calling OpenAI (free).
    if (talks.length === 0) {
      return jsonResponse({ answer: "No talks were provided to answer from." });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "OPENAI_API_KEY secret is not set" }, 500);
    }

    // 4. Build the context block: one numbered section per talk
    const context = talks.slice(0, MAX_TALKS).map((t, i) => {
      const text = String(t.text ?? "").slice(0, MAX_CHARS_PER_TALK);
      return `[Talk ${i + 1}] "${t.title ?? "Untitled"}" by ${t.speaker ?? "Unknown speaker"}\n${text}`;
    }).join("\n\n---\n\n");

    // 5. Ask GPT-4o
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Talks:\n\n${context}\n\n===\n\nQuestion: ${question.trim()}`,
          },
        ],
      }),
    });

    if (!openaiRes.ok) {
      console.error("OpenAI error:", await openaiRes.text());
      return jsonResponse({ error: "OpenAI request failed" }, 502);
    }

    const data = await openaiRes.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return jsonResponse({ error: "OpenAI returned an empty answer" }, 502);
    }

    // 6. Send the answer back to the browser
    return jsonResponse({ answer });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Invalid request" }, 400);
  }
});
