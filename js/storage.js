const LS = 'deeps:';

function readLS(k, f) { try { const r = localStorage.getItem(LS + k); return r ? JSON.parse(r) : f; } catch { return f; } }
function writeLS(k, v) { localStorage.setItem(LS + k, JSON.stringify(v)); }
function readSS(k, f) { try { const r = sessionStorage.getItem(LS + k); return r ? JSON.parse(r) : f; } catch { return f; } }
function writeSS(k, v) { sessionStorage.setItem(LS + k, JSON.stringify(v)); }
function removeSS(k) { sessionStorage.removeItem(LS + k); }

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

export const PRESETS = [
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { name: 'RouterAI.ru', baseUrl: '' },
  { name: 'Свой', baseUrl: '' },
];

function defaultSettings() {
  return {
    systemPrompt:
      'Ты — Deeps, дружелюбный и полезный AI-ассистент на базе DeepSeek. Отвечай точно, структурированно и по делу.',
    contextSize: 20,
    thinkingSeconds: 60,
    thinkingPlusMinutes: 2,
    thinkingPlusMaxMinutes: 5,
    provider: {
      presetName: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      rememberKey: true,
    },
    visionEnabled: false,
    search: { baseUrl: 'https://api.tavily.com', apiKey: '' },
    githubToken: '',
  };
}

export const Store = {
  uid,

  getChats() { return readLS('chats', []); },
  setChats(v) { writeLS('chats', v); },

  getActiveChatId() { return readLS('activeChatId', null); },
  setActiveChatId(v) { writeLS('activeChatId', v); },

  getSettings() {
    const s = { ...defaultSettings(), ...readLS('settings', {}) };
    s.provider = { ...defaultSettings().provider, ...(s.provider || {}) };
    s.search = { ...defaultSettings().search, ...(s.search || {}) };
    const sessKey = readSS('apiKey', null);
    if (sessKey !== null) s.provider.apiKey = sessKey;
    return s;
  },

  setSettings(v) {
    const clone = JSON.parse(JSON.stringify(v));
    if (clone.provider && clone.provider.rememberKey === false) {
      writeSS('apiKey', clone.provider.apiKey || '');
      clone.provider.apiKey = '';
    } else {
      removeSS('apiKey');
    }
    writeLS('settings', clone);
  },
};
