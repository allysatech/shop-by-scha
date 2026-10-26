require('./env');

const DEFAULT_GATEWAY_BASE_URL = 'https://production-api.ai.ap-southeast-1.aws.neon.tech';

function getGatewayConfig() {
  const baseUrl = String(process.env.NEON_AI_GATEWAY_BASE_URL || DEFAULT_GATEWAY_BASE_URL).replace(/\/+$/, '');
  const token = String(process.env.NEON_AI_GATEWAY_TOKEN || '').trim();
  return {
    baseUrl,
    chatCompletionsUrl: `${baseUrl}/v1/chat/completions`,
    responsesUrl: `${baseUrl}/openai/v1/responses`,
    modelsUrl: `${baseUrl}/v1/models`,
    hasToken: Boolean(token),
    token
  };
}

async function listGatewayModels() {
  const cfg = getGatewayConfig();
  if (!cfg.hasToken) {
    return {
      configured: false,
      endpoint: cfg.modelsUrl,
      note: 'NEON_AI_GATEWAY_TOKEN is not yet provisioned in .env.local (requires a paid Neon plan or `neon login` + `neon deploy`). Using fallback editorial catalog models.',
      models: [
        { id: 'gpt-5-mini', owned_by: 'openai', enabled: true },
        { id: 'claude-haiku-4-5', owned_by: 'anthropic', enabled: true },
        { id: 'gemini-3-flash', owned_by: 'google', enabled: true }
      ]
    };
  }

  const res = await fetch(cfg.modelsUrl, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      configured: true,
      live: false,
      status: res.status,
      endpoint: cfg.modelsUrl,
      error: text.slice(0, 300)
    };
  }

  const data = await res.json();
  return {
    configured: true,
    live: true,
    endpoint: cfg.modelsUrl,
    models: data.data || []
  };
}

async function askStylistAssistant({ prompt, model = 'gpt-5-mini', catalogueSummary = [] }) {
  const cfg = getGatewayConfig();
  const userPrompt = String(prompt || 'Recommend an editorial look from Shop by SCHA').trim();

  if (cfg.hasToken) {
    try {
      const res = await fetch(cfg.chatCompletionsUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are the Shop by SCHA Editorial Stylist. Recommend items from the supplied catalogue references (Eyewear, Bags, Beauty, Footwear) concisely.'
            },
            {
              role: 'user',
              content: userPrompt
            }
          ]
        })
      });
      if (res.ok) {
        const data = await res.json();
        return {
          provider: 'neon-ai-gateway',
          liveGateway: true,
          model,
          endpoint: cfg.chatCompletionsUrl,
          reply: data.choices?.[0]?.message?.content || 'Styled by Shop by SCHA.'
        };
      }
    } catch (_) {
      // Fall through to catalogue-aware assistant response
    }
  }

  const sampleTitles = catalogueSummary.slice(0, 4).map((p) => `${p.title} (${p.category_slug})`).join(', ');
  return {
    provider: 'neon-ai-gateway',
    liveGateway: false,
    model,
    endpoint: cfg.chatCompletionsUrl,
    reply: `Shop by SCHA Editorial Stylist: Pair the Jacquemus Pink Flap-Bag (REF-08) with our Silver Oval Eyewear (REF-01) for a signature Y2K luxury look. Featured catalogue highlights: ${sampleTitles || 'Eyewear, Bags, Beauty & Footwear'}.`
  };
}

module.exports = {
  getGatewayConfig,
  listGatewayModels,
  askStylistAssistant
};
