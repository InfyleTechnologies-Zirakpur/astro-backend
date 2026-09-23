// Lightweight retrieval over the astrology knowledge base — no external
// embeddings API or vector DB required. Uses BM25-style keyword scoring,
// which works well here because the knowledge base is domain-dense
// (planet names, house numbers, specific terms like "divorce", "affair",
// "Navamsha") rather than free-flowing prose.
//
// If the knowledge base grows much larger (multiple courses, hundreds of
// pages) it's worth swapping this for real embeddings (e.g. Voyage AI,
// with a vector store). For a single-course knowledge base, this keyword
// approach is simpler to run, free, and fully explainable (you can see
// exactly why a chunk matched).

const fs = require("fs");
const path = require("path");

const KB_PATH = path.join(__dirname, "..", "..", "data", "astroKnowledgeBase.json");

let knowledgeBase = [];
let docFrequency = new Map(); // token -> number of chunks containing it
let avgChunkLength = 0;

// Must match scripts/buildKnowledgeBase.js's STOPWORDS exactly — both the
// stored chunks and incoming queries need identical tokenization for BM25
// term matching to work. If you edit one, edit the other.
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

const loadKnowledgeBase = () => {
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

// BM25 scoring — standard, well-tested keyword-ranking formula (same
// family of algorithm used by Elasticsearch/Lucene by default).
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

/**
 * Retrieve the top-K most relevant knowledge base chunks for a question.
 * @param {string} query - the user's natural-language question
 * @param {number} topK - how many chunks to return (default 6)
 * @returns {Array<{id, title, section, text, score}>}
 */
const retrieve = (query, topK = 6) => {
  if (!knowledgeBase.length) loadKnowledgeBase();

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

module.exports = { retrieve, loadKnowledgeBase };
