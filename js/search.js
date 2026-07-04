// Pluggable web search. Default shape follows Tavily's API (POST {baseUrl}/search
// with { api_key, query, max_results }), since it's built for LLM agents and
// commonly callable directly from the browser. Users can point `search`
// settings at any compatible endpoint.
//
// NOTE: this is a static, backend-less site — if a chosen search provider
// blocks browser CORS requests, search calls will fail in the console. That's
// an inherent limitation of a client-only app; there is no server here to
// proxy through.

async function rawSearch(settings, query, maxResults = 5) {
  const { baseUrl, apiKey } = settings.search || {};
  if (!baseUrl) {
    throw new Error('Поисковый провайдер не настроен. Открой Настройки → Поиск.');
  }
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Поиск: ошибка ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const results = json.results || json.data || [];
  return results.map((r) => ({
    title: r.title || r.name || r.url,
    url: r.url || r.link,
    content: r.content || r.snippet || r.description || '',
  }));
}

// Normal search: one query, top results, formatted as context for the model.
export async function normalSearch(settings, query) {
  const results = await rawSearch(settings, query, 5);
  return formatResults(query, results);
}

// Deep search: ask the model to break the question into several sub-queries,
// searches each, dedupes by URL, and returns a richer combined context.
export async function deepSearch(settings, query, askModelFn) {
  let subQueries = [query];
  try {
    const raw = await askModelFn(
      `Разбей следующий вопрос на 3-4 более узких поисковых запроса для веб-поиска. ` +
        `Ответь только списком запросов, каждый на новой строке, без нумерации и пояснений.\n\nВопрос: ${query}`
    );
    const parsed = raw
      .split('\n')
      .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean);
    if (parsed.length) subQueries = parsed.slice(0, 4);
  } catch {
    // fall back to the single original query
  }

  const seen = new Set();
  const combined = [];
  for (const q of subQueries) {
    try {
      const results = await rawSearch(settings, q, 4);
      for (const r of results) {
        if (r.url && seen.has(r.url)) continue;
        if (r.url) seen.add(r.url);
        combined.push(r);
      }
    } catch {
      // skip a failing sub-query, keep going with the others
    }
  }
  return formatResults(query, combined, subQueries);
}

function formatResults(query, results, subQueries) {
  if (!results.length) {
    return `Веб-поиск по запросу «${query}» не дал результатов (или поисковый провайдер не настроен).`;
  }
  const lines = [`Результаты веб-поиска по запросу «${query}»:`];
  if (subQueries && subQueries.length > 1) {
    lines.push(`(Подзапросы: ${subQueries.join('; ')})`);
  }
  results.forEach((r, i) => {
    lines.push(`\n[${i + 1}] ${r.title}\n${r.url}\n${(r.content || '').slice(0, 500)}`);
  });
  lines.push(
    '\nИспользуй эти данные как дополнительный контекст и указывай источники в квадратных скобках [1], [2], где уместно.'
  );
  return lines.join('\n');
}
