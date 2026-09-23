// Top-level orchestrator for the "ask the AI astrologer" feature.
// Ties together: knowledge base retrieval (retrievalService), the
// person's own computed Vedic chart data (vedicAstrologyService /
// vedicCompatibilityService), and the LLM (llmService) — so answers are
// always grounded in both the lecture content AND the user's real numbers,
// never invented.

const { retrieve } = require("./retrievalService");
const { answerQuestion } = require("./llmService");

/**
 * @param {string} question
 * @param {object} [options]
 * @param {object} [options.chartContext] - output of buildChartContextForQA
 *   (from vedicAstrologyService), e.g. { personA: {...}, personB: {...}, gunaMilan: {...} }
 *   Pass this whenever the question is about a specific user or match —
 *   omit it for general "how does X work" questions.
 * @param {number} [options.topK] - number of knowledge base chunks to retrieve (default 6)
 * @returns {Promise<{answer: string, sources: Array<{id, title, section}>}>}
 */
const askAstroQuestion = async (question, options = {}) => {
  const { chartContext = null, topK = 6 } = options;

  const chunks = retrieve(question, topK);
  const answer = await answerQuestion(question, chunks, chartContext);

  return {
    answer,
    sources: chunks.map(({ id, title, section }) => ({ id, title, section })),
  };
};

module.exports = { askAstroQuestion };
