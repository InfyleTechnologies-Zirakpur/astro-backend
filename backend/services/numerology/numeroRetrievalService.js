// Isolated numerology retrieval — BM25 keyword search over the
// NUMEROLOGY knowledge base only. Deliberately does not import or read
// the astrology knowledge base, so numerology answers can never be
// grounded in Vedic rules and vice versa.

const fs = require("fs");
const path = require("path");

const KB_PATH = path.join(__dirname, "..", "..", "data", "numeroKnowledgeBase.json");

let knowledgeBase = [];
let docFrequency = new Map();
let avgChunkLength = 0;

// Must match scripts/buildNumeroKnowledgeBase.js's STOPWORDS exactly.
const STOPWORDS = new Set([
  "the","a","an","is","are","of","in","to","and","or","for","on","if","this","that",
  "it","be","as","with","by","at","from","not","can","will","should","may","also",
  "their","they","them","spouse","native","chart","house","planet","which","when",
  "into","than","then","but","its","such","one","two","three","other","only",
  "does","did","mean","means","get","gets","getting","having","have","has",
  "always","never","definitely","really","just","would","could","should",
  "was","were","been","being","who","what","how","why","about","some","any",
]);

const tokenize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));

const loadNumeroKnowledgeBase = () => {
  const raw = fs.readFileSync(KB_PATH, "utf8");
  knowledgeBase = JSON.parse(raw);

  docFrequency = new Map();
  let totalLength = 0;
  for (const chunk of knowledgeBase) {
    totalLength += chunk.tokens.length;
    const seen = new Set(chunk.tokens);
    for (const token of seen) {
      docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
    }
  }
  avgChunkLength = knowledgeBase.length ? totalLength / knowledgeBase.length : 0;

  return knowledgeBase;
};

const K1 = 1.5;
const B = 0.75;

const scoreChunk = (chunk, queryTokens, queryTermFreq) => {
  const N = knowledgeBase.length;
  const chunkTermFreq = new Map();
  for (const token of chunk.tokens) {
    chunkTermFreq.set(token, (chunkTermFreq.get(token) || 0) + 1);
  }

  let score = 0;
  for (const term of new Set(queryTokens)) {
    const tf = chunkTermFreq.get(term) || 0;
    if (tf === 0) continue;
    const df = docFrequency.get(term) || 0;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    const lengthNorm = 1 - B + B * (chunk.tokens.length / avgChunkLength);
    const termScore = idf * ((tf * (K1 + 1)) / (tf + K1 * lengthNorm));
    score += termScore * (queryTermFreq.get(term) || 1);
  }
  return score;
};

const retrieveNumero = (query, topK = 6) => {
  if (!knowledgeBase.length) loadNumeroKnowledgeBase();

  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  const queryTermFreq = new Map();
  for (const token of queryTokens) queryTermFreq.set(token, (queryTermFreq.get(token) || 0) + 1);

  const scored = knowledgeBase
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens, queryTermFreq) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(({ chunk, score }) => ({
    id: chunk.id,
    title: chunk.title,
    section: chunk.section,
    text: chunk.text,
    score: Math.round(score * 1000) / 1000,
  }));
};

module.exports = { retrieveNumero, loadNumeroKnowledgeBase };
