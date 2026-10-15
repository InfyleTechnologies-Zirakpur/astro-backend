// Top-level orchestrator for the "ask the numerology AI" feature.
// Mirrors the astrology RAG flow but stays fully isolated: numerology
// retrieval + numerology numbers + numerology LLM prompt.

const { retrieveNumero } = require("./numeroRetrievalService");
const { answerNumeroQuestion } = require("./numeroLlmService");

/**
 * @param {string} question
 * @param {object} [options]
 * @param {object} [options.numeroContext] - output of buildNumeroContext
 *   (from numerologyService), e.g. { fullName, dateOfBirth, mulank, bhagyank, nameNumber }
 * @param {number} [options.topK] - number of knowledge base chunks to retrieve (default 6)
 * @returns {Promise<{answer: string, sources: Array<{id, title, section}>}>}
 */
const askNumeroQuestion = async (question, options = {}) => {
  const { numeroContext = null, topK = 6 } = options;

  const chunks = retrieveNumero(question, topK);
  const answer = await answerNumeroQuestion(question, chunks, numeroContext);

  return {
    answer,
    sources: chunks.map(({ id, title, section }) => ({ id, title, section })),
  };
};

module.exports = { askNumeroQuestion };
