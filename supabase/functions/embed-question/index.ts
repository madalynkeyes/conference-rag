// embed-question: turns a user's question into an embedding vector.
// Browser -> this function -> OpenAI, so the OpenAI key never reaches the browser.
//
// Request:  POST { "question": "How can I find peace?" }
// Response: { "embedding": [0.012, -0.034, ...] }  (1,536 numbers)
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  // 1. CORS preflight: the browser asks "may I call you?" before the real request.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // 2. Only logged-in users may use this (it costs OpenAI credits).
  const userOrResponse = await requireAuth(req);
  if (userOrResponse instanceof Response) return userOrResponse;

  try {
    // 3. Read and validate the question.
    const { question } = await req.json();
    if (typeof question !== "string" || question.trim() === "") {
      return jsonResponse({ error: "Request body must include a non-empty 'question'" }, 400);
    }

    // 4. The key you set with `supabase secrets set OPENAI_API_KEY=...`
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "OPENAI_API_KEY secret is not set" }, 500);
    }

    // 5. Call OpenAI. Must be the same model used to embed the talks.
    const openaiRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: question.trim(),
      }),
    });

    if (!openaiRes.ok) {
      const details = await openaiRes.text();
      console.error("OpenAI error:", details);
      return jsonResponse({ error: "OpenAI request failed" }, 502);
    }

    // 6. Send the vector back to the browser.
    const data = await openaiRes.json();
    return jsonResponse({ embedding: data.data[0].embedding });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Invalid request" }, 400);
  }
});
