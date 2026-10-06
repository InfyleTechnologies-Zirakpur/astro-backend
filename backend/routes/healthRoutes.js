const express = require("express");
const { getProviderHealth } = require("../services/rag/llmService");

const router = express.Router();

router.get("/ai", async (req, res) => {
  try {
    const providers = await getProviderHealth();
    const healthy = providers.filter(p => p.healthy).length;
    const total = providers.length;
    
    res.json({
      status: healthy === total ? 'healthy' : healthy > 0 ? 'degraded' : 'down',
      providers,
      summary: {
        healthy,
        total,
        primary: providers[0]?.provider || null
      }
    });
  } catch (error) {
    console.error('[Health] AI health check failed:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      providers: []
    });
  }
});

module.exports = router;