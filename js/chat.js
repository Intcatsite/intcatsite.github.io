import { Store } from './storage.js';
import { getModelById, listModels } from './models.js';
import { streamChatCompletion, chatCompletion } from './providers.js';
import { normalSearch, deepSearch } from './search.js';
import { runThinking } from './thinking.js';
import { LIVEBUILD_SYSTEM_SUFFIX, parseFiles, stripFileBlocks } from './livebuild.js';

export function createChat() {
  const chats = Store.getChats();
  const models = listModels();
  const chat = {
    id: Store.uid(),
    title: 'Новый чат',
    createdAt: Date.now(),
    modelId: chats[0]?.modelId || models[0]?.id || 'deepseek/deepseek-v4-flash',
    messages: [],
  };
  chats.unshift(chat);
  Store.setChats(chats);
  Store.setActiveChatId(chat.id);
  return chat;
}

export function getAllChats() { return Store.getChats(); }

export function getActiveChat() {
  const chats = Store.getChats();
  const id = Store.getActiveChatId();
  let chat = chats.find((c) => c.id === id);
  if (!chat) {
    chat = chats[0] || createChat();
    Store.setActiveChatId(chat.id);
  }
  return chat;
}

export function setActiveChat(id) { Store.setActiveChatId(id); }

export function saveChat(chat) {
  const chats = Store.getChats();
  const idx = chats.findIndex((c) => c.id === chat.id);
  if (idx >= 0) chats[idx] = chat;
  else chats.unshift(chat);
  Store.setChats(chats);
}

export function deleteChat(id) {
  const chats = Store.getChats().filter((c) => c.id !== id);
  Store.setChats(chats);
  if (Store.getActiveChatId() === id) Store.setActiveChatId(chats[0]?.id || null);
}

export function renameChat(id, title) {
  const chats = Store.getChats();
  const chat = chats.find((c) => c.id === id);
  if (chat) { chat.title = title; Store.setChats(chats); }
}

function buildContextMessages(chat, settings) {
  const history = chat.messages.slice(0, -1).slice(-settings.contextSize);
  return history.map((m) => ({ role: m.role, content: m.contentForApi || m.content }));
}

export async function sendMessage({ chat, text, images, mode, onDelta, onThoughtProgress }) {
  const settings = Store.getSettings();
  const model = getModelById(chat.modelId);
  const provider = settings.provider;

  if (!provider.baseUrl) throw new Error('Не задан Base URL провайдера. Открой Настройки.');
  if (!provider.apiKey) throw new Error('Не задан API-ключ провайдера. Открой Настройки.');

  const userContent =
    images && images.length
      ? [{ type: 'text', text }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
      : text;

  const userMsg = { role: 'user', content: text, contentForApi: userContent, images: images || [] };
  chat.messages.push(userMsg);
  if (chat.messages.length === 1) chat.title = text.slice(0, 42) || 'Новый чат';

  let systemPrompt = settings.systemPrompt;
  if (mode.liveBuild) systemPrompt += '\n' + LIVEBUILD_SYSTEM_SUFFIX;

  let searchContext = '';
  try {
    if (mode.search === 'normal') {
      searchContext = await normalSearch(settings, text);
    } else if (mode.search === 'deep') {
      searchContext = await deepSearch(settings, text, (prompt) =>
        chatCompletion({
          provider,
          modelId: model.id,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        })
      );
    }
  } catch (err) {
    searchContext = `[Веб-поиск недоступен: ${err.message}]`;
  }

  const systemMessages = [{ role: 'system', content: systemPrompt }];
  if (searchContext) systemMessages.push({ role: 'system', content: `Контекст из веб-поиска:\n${searchContext}` });
  const historyMessages = buildContextMessages(chat, settings);

  let assistantMsg;
  try {
    if (!mode.thinking || mode.thinking === 'off') {
      let full = '';
      const stream = streamChatCompletion({
        provider,
        modelId: model.id,
        messages: [...systemMessages, ...historyMessages, { role: 'user', content: userContent }],
      });
      for await (const chunk of stream) {
        full += chunk;
        onDelta?.(full);
      }
      assistantMsg = { role: 'assistant', content: full };
    } else {
      const budgetSeconds =
        mode.thinking === 'thinking' ? settings.thinkingSeconds : settings.thinkingPlusMinutes * 60;
      const complete = (promptText) =>
        chatCompletion({
          provider,
          modelId: model.id,
          messages: [...systemMessages, ...historyMessages, { role: 'user', content: promptText }],
        });
      const result = await runThinking({
        complete,
        question: text,
        mode: mode.thinking,
        budgetSeconds,
        onProgress: onThoughtProgress,
      });
      assistantMsg = { role: 'assistant', content: result.answer, thoughtLog: result.log };
    }
  } catch (err) {
    assistantMsg = { role: 'assistant', content: `⚠️ Ошибка запроса: ${err.message}`, isError: true };
    chat.messages.push(assistantMsg);
    saveChat(chat);
    throw err;
  }

  if (mode.liveBuild) {
    const files = parseFiles(assistantMsg.content);
    if (files.length) {
      assistantMsg.files = files;
      assistantMsg.content = stripFileBlocks(assistantMsg.content) || 'Готово — проект собран, смотри панель Live Build.';
    }
  }

  chat.messages.push(assistantMsg);
  saveChat(chat);
  return assistantMsg;
}
