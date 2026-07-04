// Thinking / Thinking+ reasoning modes.
//
// Both modes spend real extra model calls on reasoning rather than faking a
// delay: "thinking" does a reasoning pass plus one self-check pass (~1
// minute budget); "thinking+" iterates draft -> critique -> revise until the
// user's configured time budget (up to 5 minutes) is used up or the model
// signals convergence with a "ГОТОВО" marker.

const ANSWER_MARKER = '### Ответ';
const DONE_MARKER = 'ГОТОВО';

function splitThoughtAndAnswer(raw) {
  const idx = raw.indexOf(ANSWER_MARKER);
  if (idx === -1) {
    return { thought: '', answer: raw.trim() };
  }
  const thought = raw.slice(0, idx).replace(/<\/?thinking>/gi, '').trim();
  const answer = raw.slice(idx + ANSWER_MARKER.length).trim();
  return { thought, answer };
}

function reasoningInstruction(question) {
  return (
    `Реши следующую задачу через явное пошаговое рассуждение.\n` +
    `Сначала внутри блока <thinking>...</thinking> подробно, честно и критично разбери задачу.\n` +
    `Затем выведи разделитель "${ANSWER_MARKER}" и после него — только финальный ответ пользователю.\n\n` +
    `Задача: ${question}`
  );
}

function critiqueInstruction(question, previousAnswer) {
  return (
    `Исходный вопрос: ${question}\n\n` +
    `Твой предыдущий ответ:\n${previousAnswer}\n\n` +
    `Критически проверь этот ответ: найди ошибки, пробелы, неточности или способы сделать его лучше. ` +
    `Внутри <thinking>...</thinking> проведи проверку, затем после "${ANSWER_MARKER}" выведи улучшенную версию ответа. ` +
    `Если ответ уже полностью корректен и улучшать нечего, начни секцию после "${ANSWER_MARKER}" со слова "${DONE_MARKER}", а затем повтори финальный ответ.`
  );
}

// `complete` is an async (promptText) => string function that performs a
// single non-streaming model call using whatever chat history / system
// prompt the caller already has set up.
export async function runThinking({ complete, question, mode, budgetSeconds, onProgress }) {
  const start = Date.now();
  const elapsed = () => (Date.now() - start) / 1000;
  const log = [];

  onProgress?.({ phase: 'start', log });

  let raw = await complete(reasoningInstruction(question));
  let { thought, answer } = splitThoughtAndAnswer(raw);
  log.push({ iteration: 1, thought, answer });
  onProgress?.({ phase: 'iteration', log });

  const maxIterations = mode === 'thinkingPlus' ? 8 : 2;

  for (let i = 2; i <= maxIterations; i++) {
    if (elapsed() >= budgetSeconds) break;
    raw = await complete(critiqueInstruction(question, answer));
    const split = splitThoughtAndAnswer(raw);
    const converged = split.answer.trim().toUpperCase().startsWith(DONE_MARKER);
    const cleanedAnswer = converged
      ? split.answer.replace(new RegExp(`^${DONE_MARKER}\\s*`, 'i'), '').trim()
      : split.answer;
    thought = split.thought;
    answer = cleanedAnswer || answer;
    log.push({ iteration: i, thought, answer, converged });
    onProgress?.({ phase: 'iteration', log });
    if (converged) break;
  }

  onProgress?.({ phase: 'done', log });
  return { answer, log, elapsedSeconds: elapsed() };
}
