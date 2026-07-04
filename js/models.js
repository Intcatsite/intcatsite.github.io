import { Store } from './storage.js';
import { confirmDialog, toast } from './ui.js';

// Model that requires an explicit, separate user permission gate before it
// is ever added — it's a paid third-party vision model, not part of DeepSeek.
export const GATED_VISION_MODEL = {
  modelId: 'google/gemini-2.5-flash-lite-preview-09-2025',
  label: 'Gemini 2.5 Flash Lite (Vision)',
  vision: true,
};

export function getModels() {
  return Store.getModels();
}

export function getModelById(id) {
  return Store.getModels().find((m) => m.id === id);
}

export function getProviderForModel(model) {
  return Store.getProviders().find((p) => p.id === model.providerId);
}

// Adds a model after asking the user to confirm the save, per spec:
// "когда добавил модель, тебя спрашивают сохранить?"
export async function addModelWithConfirm({ providerId, modelId, label, vision = false }) {
  const ok = await confirmDialog({
    title: 'Сохранить модель?',
    message: `Добавить «${label || modelId}» в список моделей и сохранить локально?`,
    okText: 'Сохранить',
    cancelText: 'Отмена',
  });
  if (!ok) {
    toast('Модель не сохранена', 'info');
    return null;
  }
  const models = Store.getModels();
  const id = Store.uid();
  const entry = { id, providerId, modelId, label: label || modelId, vision, builtin: false };
  models.push(entry);
  Store.setModels(models);
  toast(`Модель «${entry.label}» сохранена`, 'success');
  return entry;
}

// Special gated flow for the vision model: requires an explicit permission
// confirmation ("только с разрешением юзера") before it is fetched/added,
// separate from and in addition to the normal save confirmation.
export async function addGatedVisionModel(providerId) {
  const permitted = await confirmDialog({
    title: 'Разрешение на загрузку vision-модели',
    message:
      `Модель «${GATED_VISION_MODEL.label}» (${GATED_VISION_MODEL.modelId}) — сторонняя ` +
      `платная модель Google, не входит в DeepSeek. Разрешаешь добавить её для распознавания изображений?`,
    okText: 'Разрешаю',
    cancelText: 'Не сейчас',
  });
  if (!permitted) {
    toast('Добавление vision-модели отменено', 'info');
    return null;
  }
  return addModelWithConfirm({
    providerId,
    modelId: GATED_VISION_MODEL.modelId,
    label: GATED_VISION_MODEL.label,
    vision: true,
  });
}

export async function removeModel(id) {
  const models = Store.getModels();
  const model = models.find((m) => m.id === id);
  if (!model) return;
  const ok = await confirmDialog({
    title: 'Удалить модель?',
    message: `Убрать «${model.label}» из списка?`,
    okText: 'Удалить',
    danger: true,
  });
  if (!ok) return;
  Store.setModels(models.filter((m) => m.id !== id));
  toast('Модель удалена', 'info');
}
