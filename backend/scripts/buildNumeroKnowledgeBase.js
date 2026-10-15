// One-time (re-run when the numerology source doc changes) build script.
// Parses data/numero_knowledge_source.md into structured rule chunks and
// writes data/numeroKnowledgeBase.json, which the numerology RAG service
// loads at runtime. Fully separate from the astrology knowledge base.
//
// Run with: node scripts/buildNumeroKnowledgeBase.js

const fs = require("fs");
const path = require("path");

const SOURCE_PATH = path.join(__dirname, "..", "data", "numero_knowledge_source.md");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "numeroKnowledgeBase.json");

const raw = fs.readFileSync(SOURCE_PATH, "utf8");
const lines = raw.split("\n");

const RULE_HEADING = /^\*\*(\d+\.\d+)\s+(.+?)\*\*$/;
const H1 = /^#\s+(.+)$/;
const H2 = /^##\s+(.+)$/;

let currentPart = "";
let currentSection = "";
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
  if (/^\*\*(?:Unknown\s+)?Speaker\b.*\*\*$/i.test(line)) continue;
  const cleanedLine = line
    .replace(/^>\s*Speaker\s+\d+\s*\([^)]*\)\s*[:：]\s*/i, "> ")
    .replace(/\bspeaker\b/gi, "teacher");

  const h1 = cleanedLine.match(H1);
  if (h1) {
    currentPart = h1[1].trim();
    continue;
  }
  const h2 = cleanedLine.match(H2);
  if (h2) {
    currentSection = h2[1].trim();
    continue;
  }
  const ruleMatch = cleanedLine.match(RULE_HEADING);
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
    current.text += cleanedLine + "\n";
  }
}
flush();

// Same tokenizer contract as the numerology retrieval service — both the
// stored chunks and incoming queries need identical tokenization.
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

// Title tokens are repeated to weight them heavily in BM25 scoring.
const TITLE_WEIGHT = 4;

const withTokens = chunks.map((chunk) => {
  const titleTokens = tokenize(chunk.title);
  const bodyTokens = tokenize(chunk.text);
  const weightedTitleTokens = Array(TITLE_WEIGHT).fill(titleTokens).flat();
  return { ...chunk, tokens: [...weightedTitleTokens, ...bodyTokens] };
});

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(withTokens, null, 2));
console.log(`Built ${withTokens.length} numerology chunks -> ${OUTPUT_PATH}`);
