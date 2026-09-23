// One-time (re-run when the source transcript doc changes) build script.
// Parses data/astro_knowledge_source.md into structured rule chunks and
// writes data/astroKnowledgeBase.json, which the RAG service loads at runtime.
//
// Run with: node scripts/buildKnowledgeBase.js

const fs = require("fs");
const path = require("path");

const SOURCE_PATH = path.join(__dirname, "..", "data", "astro_knowledge_source.md");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "astroKnowledgeBase.json");

const raw = fs.readFileSync(SOURCE_PATH, "utf8");
const lines = raw.split("\n");

const RULE_HEADING = /^\*\*(\d+\.\d+)\s+(.+?)\*\*$/;
const H1 = /^#\s+(.+)$/;
const H2 = /^##\s+(.+)$/;

let currentPart = ""; // e.g. "Marriage Astrology Knowledge Base — Class 1, Part 1"
let currentSection = ""; // e.g. "4. Negative / No-Marriage Combinations"
let chunks = [];
let current = null;

const flush = () => {
  if (current && current.text.trim()) {
    chunks.push({
      id: current.id,
      title: current.title,
      section: current.section,
      part: current.part,
      text: current.text.trim(),
    });
  }
  current = null;
};

for (const line of lines) {
  const h1 = line.match(H1);
  if (h1) {
    currentPart = h1[1].trim();
    continue;
  }
  const h2 = line.match(H2);
  if (h2) {
    currentSection = h2[1].trim();
    continue;
  }
  const ruleMatch = line.match(RULE_HEADING);
  if (ruleMatch) {
    flush();
    current = {
      id: ruleMatch[1],
      title: ruleMatch[2].trim(),
      section: currentSection,
      part: currentPart,
      text: "",
    };
    continue;
  }
  if (current) {
    current.text += line + "\n";
  }
}
flush();

// Simple tokenizer for keyword search — lowercase, strip punctuation, drop
// very common stopwords so retrieval focuses on domain terms (planet
// names, house numbers, "divorce", "affair", etc).
// Includes common question-phrasing words ("does", "mean", "get", "having")
// in addition to grammatical stopwords — these appear in almost every
// question and every chunk ("get married" is everywhere), so leaving them
// in dilutes the score gap between an on-topic chunk and an off-topic one.
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

// Title tokens are repeated to weight them heavily in BM25 scoring — a
// chunk literally titled "Mars in the 7th house" should always outrank a
// chunk that merely mentions Mars and the 7th house in passing while
// discussing something else. Without this, BM25's term-frequency scoring
// favors long chunks that happen to repeat common domain words (7th,
// house, marriage) over the one chunk that's precisely on-topic.
const TITLE_WEIGHT = 4;

const withTokens = chunks.map((chunk) => {
  const titleTokens = tokenize(chunk.title);
  const bodyTokens = tokenize(chunk.text);
  const weightedTitleTokens = Array(TITLE_WEIGHT).fill(titleTokens).flat();
  return { ...chunk, tokens: [...weightedTitleTokens, ...bodyTokens] };
});

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(withTokens, null, 2));
console.log(`Built ${withTokens.length} knowledge chunks -> ${OUTPUT_PATH}`);
