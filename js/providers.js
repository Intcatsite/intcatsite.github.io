// Generic OpenAI-compatible chat completions client used for any provider
// the user configures — OpenRouter, RouterAI.ru, or a custom endpoint.

function isOpenRouter(provider) {
  return /openrouter\.ai/i.test(provider.baseUrl || '') || provider.presetName === 'OpenRouter';
}

function buildHeaders(provider) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey || ''}`,
  };
  if (isOpenRouter(provider)) {
    headers['HTTP-Referer'] = location.origin;
    headers['X-Title'] = 'Deeps';
  }
  return headers;
}

function endpoint(provider) {
  const base = (provider.baseUrl || '').replace(/\/+$/, '');
  return `${base}/chat/completions`;
}

async function readError(res) {
  let text = '';
  try { text = await res.text(); } catch { /* ignore */ }
  return `Ошибка API (${res.status}): ${text.slice(0, 400) || res.statusText}`;
}

export async function* streamChatCompletion({ provider, modelId, messages, signal, extra }) {
  if (!provider || !provider.baseUrl) {
    throw new Error('У провайдера не задан Base URL. Открой Настройки.');
  }
  const res = await fetch(endpoint(provider), {
    method: 'POST',
    headers: buildHeaders(provider),
    signal,
    body: JSON.stringify({ model: modelId, messages, stream: true, ...(extra || {}) }),
  });
  if (!res.ok || !res.body) throw new Error(await readError(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices && json.choices[0] && json.choices[0].delta;
        if (delta && delta.content) yield delta.content;
      } catch { /* ignore keep-alives */ }
    }
  }
}

export async function chatCompletion({ provider, modelId, messages, signal, extra }) {
  if (!provider || !provider.baseUrl) {
    throw new Error('У провайдера не задан Base URL. Открой Настройки.');
  }
  const res = await fetch(endpoint(provider), {
    method: 'POST',
    headers: buildHeaders(provider),
    signal,
    body: JSON.stringify({ model: modelId, messages, stream: false, ...(extra || {}) }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}
