import { Store, PRESETS } from './storage.js';
import { confirmDialog, toast, escapeHtml } from './ui.js';
import { getCurrentUser } from './github.js';
import { injectIcons } from './icons.js';

let overlayEl = null;

export function openSettings({ onChange } = {}) {
  if (overlayEl) overlayEl.remove();
  const s = Store.getSettings();

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal modal--settings" role="dialog" aria-modal="true">
      <div class="modal__header">
        <h3>Настройки</h3>
        <button class="icon-btn" data-act="close" data-icon="close"></button>
      </div>
      <div class="modal__scroll">
        <section class="setting-section">
          <h4><span class="section-icon" data-icon="key" data-icon-size="16"></span>Провайдер</h4>
          <p class="section-desc">Один OpenAI-совместимый провайдер — через него сразу работают DeepSeek Flash и Pro.</p>
          <div class="field">
            <label>Пресет</label>
            <div class="pill-tabs" id="preset-tabs">
              ${PRESETS.map(
                (p) => `<button type="button" class="pill${p.name === s.provider.presetName ? ' is-active' : ''}" data-preset="${escapeHtml(p.name)}" data-baseurl="${escapeHtml(p.baseUrl)}">${escapeHtml(p.name)}</button>`
              ).join('')}
            </div>
          </div>
          <div class="field">
            <label>Base URL</label>
            <input class="input" id="f-baseurl" value="${escapeHtml(s.provider.baseUrl)}" placeholder="https://.../v1" />
          </div>
          <div class="field">
            <label>API-ключ</label>
            <input class="input" type="password" id="f-apikey" value="${escapeHtml(s.provider.apiKey)}" placeholder="sk-..." />
          </div>
          <label class="checkbox-row">
            <input type="checkbox" id="f-remember" ${s.provider.rememberKey ? 'checked' : ''} />
            <span>Запомнить ключ на этом устройстве</span>
          </label>
          <small class="hint">Если выключено — ключ живёт только в этой вкладке и сотрётся при закрытии.</small>
        </section>

        <section class="setting-section">
          <h4><span class="section-icon" data-icon="layers" data-icon-size="16"></span>Модели</h4>
          <div class="model-row"><span class="check-mark" data-icon="check" data-icon-size="16"></span>DeepSeek V4 Flash<span class="tag">Быстрая</span></div>
          <div class="model-row"><span class="check-mark" data-icon="check" data-icon-size="16"></span>DeepSeek V4 Pro<span class="tag">Точная</span></div>
          <label class="checkbox-row">
            <input type="checkbox" id="f-vision" ${s.visionEnabled ? 'checked' : ''} />
            <span>Добавить Gemini 2.5 Flash Lite (Vision)</span>
          </label>
          <small class="hint">Сторонняя платная модель Google для распознавания изображений. Отдельная модель — включаешь по желанию.</small>
        </section>

        <section class="setting-section">
          <h4><span class="section-icon" data-icon="edit" data-icon-size="16"></span>Системный промт</h4>
          <textarea class="input" rows="4" id="f-prompt">${escapeHtml(s.systemPrompt)}</textarea>
        </section>

        <section class="setting-section">
          <h4><span class="section-icon" data-icon="brain" data-icon-size="16"></span>Контекст и рассуждение</h4>
          <div class="field">
            <label>Размер контекста: <output id="ctx-out">${s.contextSize}</output> сообщений</label>
            <input type="range" min="4" max="100" step="1" id="f-context" value="${s.contextSize}" />
          </div>
          <div class="field">
            <label>Длительность Thinking: <output id="th-out">${s.thinkingSeconds}</output> сек</label>
            <input type="range" min="15" max="120" step="5" id="f-thinking" value="${s.thinkingSeconds}" />
          </div>
          <div class="field">
            <label>Длительность Thinking+: <output id="tp-out">${s.thinkingPlusMinutes}</output> мин (до ${s.thinkingPlusMaxMinutes})</label>
            <input type="range" min="1" max="${s.thinkingPlusMaxMinutes}" step="1" id="f-thinkingplus" value="${s.thinkingPlusMinutes}" />
          </div>
        </section>

        <section class="setting-section">
          <h4><span class="section-icon" data-icon="globe" data-icon-size="16"></span>Веб-поиск</h4>
          <p class="section-desc">Совместимо с Tavily. Используется для «Поиск» и «Глубокий поиск».</p>
          <div class="field">
            <label>Base URL</label>
            <input class="input" id="f-search-url" value="${escapeHtml(s.search.baseUrl)}" />
          </div>
          <div class="field">
            <label>API-ключ поиска</label>
            <input class="input" type="password" id="f-search-key" value="${escapeHtml(s.search.apiKey)}" />
          </div>
        </section>

        <section class="setting-section">
          <h4><span class="section-icon" data-icon="github" data-icon-size="16"></span>GitHub</h4>
          <p class="section-desc">Personal Access Token — позволяет Deeps пушить сгенерированные проекты в твои репозитории.</p>
          <div class="field">
            <label>Token</label>
            <input class="input" type="password" id="f-gh-token" value="${escapeHtml(s.githubToken)}" placeholder="ghp_..." />
          </div>
          <div class="row-flex">
            <button type="button" class="btn btn--sm" id="check-gh">Проверить подключение</button>
            <span class="hint" id="gh-status"></span>
          </div>
        </section>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--ghost" data-act="close">Отмена</button>
        <button type="button" class="btn btn--primary" data-act="save">Сохранить</button>
      </div>
    </div>`;
  document.body.appendChild(overlayEl);
  injectIcons(overlayEl);
  requestAnimationFrame(() => overlayEl.classList.add('modal-overlay--show'));

  const close = () => {
    if (!overlayEl) return;
    overlayEl.remove();
    overlayEl = null;
    onChange?.();
  };

  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl || e.target.closest('[data-act="close"]')) close();
  });

  const presetTabs = overlayEl.querySelectorAll('[data-preset]');
  const baseUrlInput = overlayEl.querySelector('#f-baseurl');
  presetTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetTabs.forEach((b) => b.classList.toggle('is-active', b === btn));
      if (btn.dataset.baseurl) baseUrlInput.value = btn.dataset.baseurl;
      baseUrlInput.focus();
    });
  });

  const wire = (rangeId, outId, suffix = '') => {
    const r = overlayEl.querySelector(rangeId);
    const o = overlayEl.querySelector(outId);
    r.addEventListener('input', () => (o.textContent = r.value + (suffix ? ` ${suffix}` : '')));
  };
  wire('#f-context', '#ctx-out');
  wire('#f-thinking', '#th-out');
  wire('#f-thinkingplus', '#tp-out');

  const visionInput = overlayEl.querySelector('#f-vision');
  visionInput.addEventListener('change', async () => {
    if (visionInput.checked) {
      const ok = await confirmDialog({
        title: 'Разрешение на vision-модель',
        message:
          'Gemini 2.5 Flash Lite — сторонняя платная модель Google, не входит в DeepSeek. Разрешаешь добавить её для распознавания изображений?',
        okText: 'Разрешаю',
        cancelText: 'Не сейчас',
      });
      if (!ok) visionInput.checked = false;
    }
  });

  overlayEl.querySelector('#check-gh').addEventListener('click', async () => {
    const token = overlayEl.querySelector('#f-gh-token').value.trim();
    const status = overlayEl.querySelector('#gh-status');
    status.textContent = 'Проверяю…';
    try {
      const user = await getCurrentUser(token);
      status.textContent = `Подключено как ${user.login}`;
    } catch (err) {
      status.textContent = `Ошибка: ${err.message}`;
    }
  });

  overlayEl.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const activePreset = overlayEl.querySelector('[data-preset].is-active');
    const settings = Store.getSettings();
    const wasRemembering = settings.provider.rememberKey;
    const newRemember = overlayEl.querySelector('#f-remember').checked;
    const newKey = overlayEl.querySelector('#f-apikey').value.trim();

    // If the user is switching from "remember" to "don't remember" and the key
    // is still filled in, confirm — spec: «тебя просто спрашивают запомнить ключ или нет».
    if (wasRemembering && !newRemember && newKey) {
      const ok = await confirmDialog({
        title: 'Не запоминать ключ?',
        message: 'Ключ будет храниться только в этой вкладке и сотрётся при закрытии браузера. Продолжить?',
        okText: 'Не запоминать',
        cancelText: 'Отмена',
      });
      if (!ok) return;
    }

    settings.provider = {
      presetName: activePreset ? activePreset.dataset.preset : settings.provider.presetName,
      baseUrl: overlayEl.querySelector('#f-baseurl').value.trim(),
      apiKey: newKey,
      rememberKey: newRemember,
    };
    settings.visionEnabled = overlayEl.querySelector('#f-vision').checked;
    settings.systemPrompt = overlayEl.querySelector('#f-prompt').value;
    settings.contextSize = Number(overlayEl.querySelector('#f-context').value);
    settings.thinkingSeconds = Number(overlayEl.querySelector('#f-thinking').value);
    settings.thinkingPlusMinutes = Number(overlayEl.querySelector('#f-thinkingplus').value);
    settings.search = {
      baseUrl: overlayEl.querySelector('#f-search-url').value.trim(),
      apiKey: overlayEl.querySelector('#f-search-key').value.trim(),
    };
    settings.githubToken = overlayEl.querySelector('#f-gh-token').value.trim();

    Store.setSettings(settings);
    toast('Настройки сохранены', 'success');
    close();
  });
}
