// Multi-provider AI service: Groq (primary) → Gemini → Cloudflare Workers AI
const { GoogleGenAI } = require("@google/genai");
const Groq = require("groq-sdk");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL = process.env.GOOGLE_MODEL || "gemini-2.5-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Cloudflare Workers AI config
const CLOUDFLARE_ENABLED = process.env.CLOUDFLARE_AI_ENABLED === 'true';
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_AI_TOKEN = process.env.CLOUDFLARE_AI_TOKEN;
const CLOUDFLARE_MODEL = process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct";
const CLOUDFLARE_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run`;

const MAX_ATTEMPTS = 3;
const CF_MAX_ATTEMPTS = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const providers = [
  {
    name: 'groq',
    client: groq,
    model: GROQ_MODEL,
    priority: 1,
    enabled: !!process.env.GROQ_API_KEY,
    maxAttempts: MAX_ATTEMPTS,
    timeout: 30000,
  },
  {
    name: 'gemini',
    client: ai,
    model: MODEL,
    priority: 2,
    enabled: !!process.env.GEMINI_API_KEY,
    maxAttempts: MAX_ATTEMPTS,
    timeout: 30000,
  },
  {
    name: 'cloudflare',
    client: null,
    model: CLOUDFLARE_MODEL,
    priority: 3,
    enabled: CLOUDFLARE_ENABLED && !!CLOUDFLARE_ACCOUNT_ID && !!CLOUDFLARE_AI_TOKEN,
    maxAttempts: CF_MAX_ATTEMPTS,
    timeout: 60000,
    healthCheck: checkCloudflareHealth,
  },
].filter(p => p.enabled && (p.client || p.name === 'cloudflare')).sort((a, b) => a.priority - b.priority);

async function checkCloudflareHealth() {
  if (!CLOUDFLARE_ENABLED || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_AI_TOKEN) {
    return { healthy: false, error: 'Cloudflare not configured' };
  }
  try {
    const response = await fetch(`${CLOUDFLARE_API_BASE}/${CLOUDFLARE_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_AI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { healthy: false, error: `HTTP ${response.status}: ${err.errors?.[0]?.message || 'Unknown error'}` };
    }
    return { healthy: true, model: CLOUDFLARE_MODEL };
  } catch (e) {
    return { healthy: false, error: `Connection failed: ${e.message}` };
  }
}

const SYSTEM_PROMPT = `You are a Vedic astrology (Jyotish) assistant for a marriage matchmaking app.

Ground rules:
- Answer ONLY using the "Knowledge base excerpts" and "Chart data" provided in the user message below. Never invent astrological rules, planetary positions, or combinations that are not present in the provided excerpts or chart data.
- If the provided excerpts don't cover the question, say so plainly and suggest what additional chart detail or topic would be needed — do not guess.
- When a rule has a stated exception or cancellation condition in the excerpts, always mention it alongside the rule. Never state a combination as a certain outcome if the source material frames it as conditional.
- When chart data is provided (the user's or a couple's actual computed placements), apply the relevant rules to that specific data and explain your reasoning step by step, citing which rule (by its ID, e.g. "Rule 12.4") led to each part of your answer.
- Keep a warm, plain-spoken tone. This is a sensitive, personal topic (marriage, compatibility, relationships) — avoid alarming or deterministic language ("you will get divorced"); prefer "this combination is traditionally read as indicating..." framing, and note when the source material itself flags something as an illustrative extreme case rather than a typical outcome.
- Do not give medical, legal, or financial advice even if astrology combinations touch on those topics.
- Answer the exact question that was asked, point to point: lead with the direct answer, then give a brief explanation only if the chart data or excerpts add useful context. Do not pad the response with tangents, extra predictions, or unrelated points.
- Never reproduce speaker names, timestamps, or transcript/dialogue formatting in your answer. Always respond in a single, consistent voice — no "Speaker 1", "Speaker 2", timecodes, or "person A says ..." framing.
- Keep answers focused and conversational — a few short paragraphs, not an exhaustive essay, unless the user asks for full detail.`;

const cleanAnswer = (text) =>
  text
    .split("\n")
    .map((line) => {
      const core = line.replace(/^\s*[>*+\-–]\s*/, "").replace(/^\s*\*{1,3}\s*/, "").trim();
      if (/^(?:Unknown\s+)?Speaker\b/i.test(core)) return "";
      if (/\d/.test(core) && /^\(?\d{1,2}:\d{2}(?::\d{2})?\s*\)?\s*[:：]?\s*$/.test(core)) return "";
      return line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const buildPrompt = (question, chunks, chartContext) => {
  const excerptsText = chunks.length
    ? chunks
        .map((chunk) => `[Rule ${chunk.id} — ${chunk.title}]\n${chunk.text}`)
        .join("\n\n---\n\n")
    : "(No closely matching knowledge base excerpts were found for this question.)";

  const chartText = chartContext
    ? `\n\nChart data:\n${JSON.stringify(chartContext, null, 2)}`
    : "";

  return `Question: ${question}\n\nKnowledge base excerpts:\n${excerptsText}${chartText}`;
};

function formatError(error) {
  return {
    code: error.code ?? error.status ?? error.error?.code,
    message: String(error.message ?? error.error?.message ?? error),
    status: error.status,
  };
}

function classifyError(providerName, error) {
  const code = error.code ?? error.status ?? error.error?.code;
  const message = String(error.message ?? error.error?.message ?? "").toLowerCase();
  
  if (providerName === 'groq') {
    if (code === 404 || message.includes('model not found') || message.includes('model_not_found')) {
      return { fatal: true, type: 'model_unavailable', retryable: false };
    }
    if (code === 401 || code === 403) {
      return { fatal: true, type: 'auth', retryable: false };
    }
    if (code === 429 || code === 503 || code === 408 || 
        /(high demand|unavailable|resource_exhausted|temporarily blocked)/i.test(message)) {
      return { fatal: false, type: 'rate_limit', retryable: true };
    }
    return { fatal: false, type: 'unknown', retryable: true };
  }
  
  if (providerName === 'gemini') {
    if (code === 401 || code === 403) {
      return { fatal: true, type: 'auth', retryable: false };
    }
    if (code === 429 || code === 503 || code === 408 ||
        /(high demand|unavailable|resource_exhausted|temporarily blocked|quota exceeded)/i.test(message)) {
      return { fatal: false, type: 'rate_limit', retryable: true };
    }
    return { fatal: false, type: 'unknown', retryable: true };
  }
  
  if (providerName === 'cloudflare') {
    if (code === 401 || code === 403) {
      return { fatal: true, type: 'auth', retryable: false };
    }
    if (code === 404 || message.includes('model not found') || message.includes('model_not_found')) {
      return { fatal: true, type: 'model_unavailable', retryable: false };
    }
    if (code === 429 || code === 503 || code === 408 || message.includes('rate limit') || message.includes('quota')) {
      return { fatal: false, type: 'rate_limit', retryable: true };
    }
    return { fatal: false, type: 'unknown', retryable: true };
  }
  
  return { fatal: false, type: 'unknown', retryable: true };
}

async function callProvider(provider, userMessage) {
  const { name, client, model, timeout } = provider;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    let content;
    
    if (name === 'groq') {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
      }, { signal: controller.signal });
      content = response.choices?.[0]?.message?.content || '';
    } else if (name === 'gemini') {
      const response = await client.models.generateContent({
        model,
        contents: {
          role: "user",
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
        },
      }, { signal: controller.signal });
      content = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (name === 'cloudflare') {
      const response = await fetch(`${CLOUDFLARE_API_BASE}/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_AI_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 4096,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
      
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw Object.assign(new Error(err.errors?.[0]?.message || `HTTP ${response.status}`), { 
          status: response.status, 
          code: response.status 
        });
      }
      
      const data = await response.json();
      content = data.result?.response || data.response || data.result?.text || '';
    }
    
    clearTimeout(timeoutId);
    if (!content || !content.trim()) {
      throw new Error(`${name} returned empty response`);
    }
    return cleanAnswer(content);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
      throw Object.assign(new Error(`Request timeout after ${timeout}ms`), { code: 408 });
    }
    throw error;
  }
}

async function tryProvider(provider, userMessage) {
  const { name, maxAttempts } = provider;
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await callProvider(provider, userMessage);
      return { success: true, content: result, provider: name };
    } catch (error) {
      lastError = error;
      const classification = classifyError(name, error);
      const formattedError = formatError(error);
      
      console.error(`[${name}] Attempt ${attempt}/${maxAttempts} failed:`, {
        type: classification.type,
        code: formattedError.code,
        message: formattedError.message
      });
      
      if (classification.fatal) {
        return { 
          success: false, 
          provider: name, 
          fatal: true, 
          error: classification.message || formattedError.message,
          classification 
        };
      }
      
      if (attempt < maxAttempts && classification.retryable) {
        const delay = 1000 * attempt * 2 + Math.random() * 500;
        await sleep(delay);
        continue;
      }
      
      return { 
        success: false, 
        provider: name, 
        fatal: false, 
        error: formattedError.message,
        classification 
      };
    }
  }
  
  return { 
    success: false, 
    provider: name, 
    fatal: false, 
    error: lastError?.message || 'Unknown error',
    classification: classifyError(name, lastError)
  };
}

const answerQuestion = async (question, chunks, chartContext) => {
  const userMessage = buildPrompt(question, chunks, chartContext);
  const providerErrors = [];
  
  for (const provider of providers) {
    const result = await tryProvider(provider, userMessage);
    
    if (result.success) {
      console.log(`[AI] Success with ${result.provider}`);
      return result.content;
    }
    
    providerErrors.push({
      provider: result.provider,
      error: result.error,
      type: result.classification?.type,
      fatal: result.fatal
    });
    
    if (result.fatal) {
      console.warn(`[AI] ${result.provider} fatal error, trying next provider: ${result.error}`);
      continue;
    }
    
    console.warn(`[AI] ${result.provider} failed (retryable), trying next provider: ${result.error}`);
  }
  
  const error = new Error(
    `All AI providers failed. Last errors: ${providerErrors.map(e => `${e.provider}: ${e.error}`).join('; ')}`
  );
  error.statusCode = 503;
  error.expose = true;
  error.providerErrors = providerErrors;
  throw error;
};

const getProviderHealth = async () => {
  const results = await Promise.all(
    providers.map(async (p) => {
      if (p.healthCheck) {
        const health = await p.healthCheck();
        return { provider: p.name, model: p.model, ...health };
      }
      return { provider: p.name, model: p.model, healthy: !!p.client };
    })
  );
  return results;
};

module.exports = { answerQuestion, getProviderHealth };