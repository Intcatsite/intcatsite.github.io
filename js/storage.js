const NS = 'deeps:';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(NS + key, JSON.stringify(value));
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function defaultProviders() {
  return [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      kind: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      builtin: true,
    },
    {
      id: 'routerai',
      name: 'RouterAI.ru',
      kind: 'custom',
      baseUrl: '',
      apiKey: '',
      builtin: true,
      hint: 'Впиши Base URL своего аккаунта RouterAI.ru (обычно заканчивается на /v1) — формат запросов OpenAI-совместимый.',
    },
  ];
}

function defaultModels() {
  return [
    {
      id: 'deepseek-v4-flash',
      providerId: 'openrouter',
      modelId: 'deepseek/deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      vision: false,
      builtin: true,
    },
    {
      id: 'deepseek-v4-pro',
      providerId: 'openrouter',
      modelId: 'deepseek/deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      vision: false,
      builtin: true,
    },
  ];
}

function defaultSettings() {
  return {
    systemPrompt: 'Ты — Deeps, дружелюбный и полезный AI-ассистент на базе DeepSeek. Отвечай точно, структурировано и по делу.',
    contextSize: 20,
    thinkingSeconds: 60,
    thinkingPlusMinutes: 2,
    thinkingPlusMaxMinutes: 5,
    search: { name: 'Tavily', baseUrl: 'https://api.tavily.com', apiKey: '' },
    githubToken: '',
  };
}

export const Store = {
  uid,

  getProviders() {
    return read('providers', defaultProviders());
  },
  setProviders(v) {
    write('providers', v);
  },

  getModels() {
    return read('models', defaultModels());
  },
  setModels(v) {
    write('models', v);
  },

  getChats() {
    return read('chats', []);
  },
  setChats(v) {
    write('chats', v);
  },

  getActiveChatId() {
    return read('activeChatId', null);
  },
  setActiveChatId(v) {
    write('activeChatId', v);
  },

  getSettings() {
    return { ...defaultSettings(), ...read('settings', {}) };
  },
  setSettings(v) {
    write('settings', v);
  },
};
