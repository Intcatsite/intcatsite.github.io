import { Store } from './storage.js';

const BASE = [
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', vision: false, tag: 'Быстрая' },
  { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', vision: false, tag: 'Точная' },
];

export const VISION_MODEL = {
  id: 'google/gemini-2.5-flash-lite-preview-09-2025',
  label: 'Gemini 2.5 Flash Lite',
  vision: true,
  tag: 'Vision',
};

export function listModels() {
  const s = Store.getSettings();
  return [...BASE, ...(s.visionEnabled ? [VISION_MODEL] : [])];
}

export function getModelById(id) {
  return listModels().find((m) => m.id === id) || BASE[0];
}
