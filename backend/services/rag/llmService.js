// Wraps the Google Gemini API. The model only ever answers using the chunks
// it's given — it never calculates astrology itself (positions, house
// placements, etc. always come from the Vedic astrology API / your own
// chart data, not from the LLM's memory).

const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL = process.env.GOOGLE_MODEL || "gemini-3.6-flash";
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (err) => {
  const code = err?.code ?? err?.status ?? err?.error?.code;
  const message = String(err?.message || err?.error?.message || "");
  return (
    code === 429 ||
    code === 503 ||
    code === 408 ||
    /(high demand|UNAVAILABLE|RESOURCE_EXHAUSTED|429|503|temporarily blocked)/i.test(
      message
    )
  );
};

const SYSTEM_PROMPT = `You are a Vedic astrology (Jyotish) assistant for a marriage matchmaking app.

Ground rules:
- Answer ONLY using the "Knowledge base excerpts" and "Chart data" provided in the user message below. Never invent astrological rules, planetary positions, or combinations that are not present in the provided excerpts or chart data.
- If the provided excerpts don't cover the question, say so plainly and suggest what additional chart detail or topic would be needed — do not guess.
- When a rule has a stated exception or cancellation condition in the excerpts, always mention it alongside the rule. Never state a combination as a certain outcome if the source material frames it as conditional.
- When chart data is provided (the user's or a couple's actual computed placements), apply the relevant rules to that specific data and explain your reasoning step by step, citing which rule (by its ID, e.g. "Rule 12.4") led to each part of your answer.
- Keep a warm, plain-spoken tone. This is a sensitive, personal topic (marriage, compatibility, relationships) — avoid alarming or deterministic language ("you will get divorced"); prefer "this combination is traditionally read as indicating..." framing, and note when the source material itself flags something as an illustrative extreme case rather than a typical outcome.
- Do not give medical, legal, or financial advice even if astrology combinations touch on those topics.
- Keep answers focused and conversational — a few short paragraphs, not an exhaustive essay, unless the user asks for full detail.`;

/**
 * @param {string} question - the end user's question
 * @param {Array<{id, title, section, text}>} chunks - retrieved knowledge base excerpts
 * @param {object} [chartContext] - optional computed Vedic chart data (from vedicAstrologyService)
 *   e.g. { personA: {...}, personB: {...}, gunaMilan: {...} }
 * @returns {Promise<string>} the model's answer
 */
const answerQuestion = async (question, chunks, chartContext) => {
  const excerptsText = chunks.length
    ? chunks
        .map((chunk) => `[Rule ${chunk.id} — ${chunk.title}]\n${chunk.text}`)
        .join("\n\n---\n\n")
    : "(No closely matching knowledge base excerpts were found for this question.)";

  const chartText = chartContext
    ? `\n\nChart data:\n${JSON.stringify(chartContext, null, 2)}`
    : "";

  const userMessage = `Question: ${question}\n\nKnowledge base excerpts:\n${excerptsText}${chartText}`;

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: {
          role: "user",
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
        },
      });

      const textContent = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return textContent || "";
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS && isRetryable(error)) {
        await sleep(1000 * attempt * 2);
        continue;
      }
      break;
    }
  }

  const retryable = isRetryable(lastError);
  const error = new Error(
    retryable
      ? "The AI astrologer is busy right now. Please try again in a moment."
      : "The AI astrologer service failed to respond. Please try again."
  );
  error.statusCode = retryable ? 503 : 502;
  error.expose = true;
  throw error;
};

module.exports = { answerQuestion };
