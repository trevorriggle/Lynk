export const PROVIDERS = {
  xai: {
    baseURL: "https://api.x.ai/v1",              // xAI Grok
    keyEnv: "XAI_API_KEY",
    path: "/chat/completions",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    // OpenAI-compatible payload shape
    toPayload: ({ messages, model, stream }) => ({ model, messages, stream }),
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",   // Groq (OpenAI-compatible)
    keyEnv: "GROQ_API_KEY",
    path: "/chat/completions",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    toPayload: ({ messages, model, stream }) => ({ model, messages, stream }),
  },
};
