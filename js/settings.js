import { Store } from './storage.js';
import { confirmDialog, toast, escapeHtml } from './ui.js';
import { addModelWithConfirm, addGatedVisionModel, removeModel, GATED_VISION_MODEL } from './models.js';
import { getCurrentUser } from './github.js';

let overlayEl = null;

export function openSettings({ tab = 'general', onChange } = {}) {
  if (overlayEl) overlayEl.remove();

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal modal--settings" role="dialog" aria-modal="true">
      <h3>Настройки</h3>
      <div class="settings-tabs">
        <button class="settings-tab-btn" data-tab="general">Общие</button>
        <button class="settings-tab-btn" data-tab="providers">Провайдеры</button>
        <button class="settings-tab-btn" data-tab="models">Модели</button>
        <button class="settings-tab-btn" data-tab="search">Поиск</button>
        <button class="settings-tab-btn" data-tab="github">GitHub</button>
      </div>
      <div class="settings-tab-content"></div>
      <div class="modal__actions">
        <button type="button" class="btn" data-act="close">Закрыть</button>
      </div>
    </div>`;
  document.body.appendChild(overlayEl);

  const content = overlayEl.querySelector('.settings-tab-content');
  const tabBtns = [...overlayEl.querySelectorAll('.settings-tab-btn')];

  function renderTab(name) {
    tabBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
    if (name === 'general') content.innerHTML = generalPane();
    if (name === 'providers') content.innerHTML = providersPane();
    if (name === 'models') content.innerHTML = modelsPane();
    if (name === 'search') content.innerHTML = searchPane();
    if (name === 'github') content.innerHTML = githubPane();
    wireTab(name);
  }

  tabBtns.forEach((b) => b.addEventListener('click', () => renderTab(b.dataset.tab)));

  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl || e.target.dataset.act === 'close') {
      overlayEl.remove();
      overlayEl = null;
      onChange?.();
    }
  });

  function wireTab(name) {
    if (name === 'general') wireGeneral();
    if (name === 'providers') wireProviders();
    if (name === 'models') wireModels();
    if (name === 'search') wireSearch();
    if (name === 'github') wireGithub();
  }

  // ---------------- General ----------------
  function generalPane() {
    const s = Store.getSettings();
    return `
      <div class="settings-pane is-active">
        <div class="field">
          <label>Системный промт</label>
          <textarea class="input" id="f-system-prompt" rows="4">${escapeHtml(s.systemPrompt)}</textarea>
          <small>Свой собственный системный промт — можно задать любые инструкции для модели.</small>
        </div>
        <div class="field">
          <label>Размер контекста (сколько последних сообщений помнить)</label>
          <div class="range-row">
            <input type="range" min="4" max="100" step="1" id="f-context-size" value="${s.contextSize}" />
            <output id="f-context-size-out">${s.contextSize}</output>
          </div>
        </div>
        <div class="field">
          <label>Длительность режима Thinking (сек)</label>
          <div class="range-row">
            <input type="range" min="15" max="120" step="5" id="f-thinking-seconds" value="${s.thinkingSeconds}" />
            <output id="f-thinking-seconds-out">${s.thinkingSeconds} с</output>
          </div>
        </div>
        <div class="field">
          <label>Длительность режима Thinking+ (мин, до ${s.thinkingPlusMaxMinutes})</label>
          <div class="range-row">
            <input type="range" min="1" max="${s.thinkingPlusMaxMinutes}" step="1" id="f-thinking-plus" value="${s.thinkingPlusMinutes}" />
            <output id="f-thinking-plus-out">${s.thinkingPlusMinutes} мин</output>
          </div>
        </div>
        <button class="btn btn--primary" id="save-general">Сохранить</button>
      </div>`;
  }

  function wireGeneral() {
    const ctxRange = overlayEl.querySelector('#f-context-size');
    const ctxOut = overlayEl.querySelector('#f-context-size-out');
    ctxRange.addEventListener('input', () => (ctxOut.textContent = ctxRange.value));

    const thRange = overlayEl.querySelector('#f-thinking-seconds');
    const thOut = overlayEl.querySelector('#f-thinking-seconds-out');
    thRange.addEventListener('input', () => (thOut.textContent = `${thRange.value} с`));

    const tpRange = overlayEl.querySelector('#f-thinking-plus');
    const tpOut = overlayEl.querySelector('#f-thinking-plus-out');
    tpRange.addEventListener('input', () => (tpOut.textContent = `${tpRange.value} мин`));

    overlayEl.querySelector('#save-general').addEventListener('click', () => {
      const s = Store.getSettings();
      s.systemPrompt = overlayEl.querySelector('#f-system-prompt').value;
      s.contextSize = Number(ctxRange.value);
      s.thinkingSeconds = Number(thRange.value);
      s.thinkingPlusMinutes = Number(tpRange.value);
      Store.setSettings(s);
      toast('Настройки сохранены', 'success');
      onChange?.();
    });
  }

  // ---------------- Providers ----------------
  function providersPane() {
    const providers = Store.getProviders();
    const cards = providers
      .map(
        (p) => `
      <div class="list-card" data-provider-id="${p.id}">
        <div class="list-card__row">
          <strong>${escapeHtml(p.name)}</strong>
          <span class="meta">${p.kind}${p.builtin ? ' · встроенный' : ''}</span>
        </div>
        ${p.hint ? `<small>${escapeHtml(p.hint)}</small>` : ''}
        <div class="field">
          <label>Base URL</label>
          <input class="input" data-field="baseUrl" value="${escapeHtml(p.baseUrl || '')}" placeholder="https://.../v1" />
        </div>
        <div class="field">
          <label>API-ключ</label>
          <input class="input" type="password" data-field="apiKey" value="${escapeHtml(p.apiKey || '')}" placeholder="sk-..." />
        </div>
        <div class="list-card__row">
          <button class="btn btn--sm" data-act="save-provider">Сохранить</button>
          ${!p.builtin ? '<button class="btn btn--sm btn--danger" data-act="delete-provider">Удалить</button>' : ''}
        </div>
      </div>`
      )
      .join('');

    return `
      <div class="settings-pane is-active">
        ${cards}
        <div class="list-card">
          <strong>Добавить провайдера</strong>
          <div class="subform">
            <input class="input full" id="np-name" placeholder="Название" />
            <input class="input full" id="np-baseurl" placeholder="Base URL, напр. https://api.example.com/v1" />
            <input class="input full" id="np-key" placeholder="API-ключ" type="password" />
          </div>
          <button class="btn btn--primary btn--sm" id="add-provider">Добавить провайдера</button>
        </div>
      </div>`;
  }

  function wireProviders() {
    overlayEl.querySelectorAll('[data-act="save-provider"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.list-card');
        const id = card.dataset.providerId;
        const providers = Store.getProviders();
        const p = providers.find((x) => x.id === id);
        p.baseUrl = card.querySelector('[data-field="baseUrl"]').value.trim();
        p.apiKey = card.querySelector('[data-field="apiKey"]').value.trim();
        Store.setProviders(providers);
        toast(`Провайдер «${p.name}» сохранён`, 'success');
        onChange?.();
      });
    });
    overlayEl.querySelectorAll('[data-act="delete-provider"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.list-card');
        const id = card.dataset.providerId;
        const ok = await confirmDialog({ title: 'Удалить провайдера?', message: 'Модели, привязанные к нему, перестанут работать.', danger: true, okText: 'Удалить' });
        if (!ok) return;
        Store.setProviders(Store.getProviders().filter((p) => p.id !== id));
        toast('Провайдер удалён', 'info');
        renderTab('providers');
        onChange?.();
      });
    });
    overlayEl.querySelector('#add-provider').addEventListener('click', () => {
      const name = overlayEl.querySelector('#np-name').value.trim();
      const baseUrl = overlayEl.querySelector('#np-baseurl').value.trim();
      const apiKey = overlayEl.querySelector('#np-key').value.trim();
      if (!name || !baseUrl) {
        toast('Укажи название и Base URL', 'error');
        return;
      }
      const providers = Store.getProviders();
      providers.push({ id: Store.uid(), name, kind: 'custom', baseUrl, apiKey, builtin: false });
      Store.setProviders(providers);
      toast(`Провайдер «${name}» добавлен`, 'success');
      renderTab('providers');
      onChange?.();
    });
  }

  // ---------------- Models ----------------
  function modelsPane() {
    const models = Store.getModels();
    const providers = Store.getProviders();
    const providerOptions = providers.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    const hasVision = models.some((m) => m.modelId === GATED_VISION_MODEL.modelId);

    const cards = models
      .map((m) => {
        const provider = providers.find((p) => p.id === m.providerId);
        return `
        <div class="list-card" data-model-id="${m.id}">
          <div class="list-card__row">
            <strong>${escapeHtml(m.label)}</strong>
            <span class="meta">${m.vision ? '👁 vision · ' : ''}${escapeHtml(provider?.name || '?')}</span>
          </div>
          <small>${escapeHtml(m.modelId)}</small>
          ${!m.builtin ? '<button class="btn btn--sm btn--danger" data-act="delete-model">Удалить</button>' : ''}
        </div>`;
      })
      .join('');

    return `
      <div class="settings-pane is-active">
        ${cards}
        <div class="list-card">
          <strong>Добавить модель</strong>
          <div class="subform">
            <select class="input full" id="nm-provider">${providerOptions}</select>
            <input class="input" id="nm-modelid" placeholder="ID модели, напр. deepseek/deepseek-v4-flash" />
            <input class="input" id="nm-label" placeholder="Название для отображения" />
            <label style="font-size:13px;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="nm-vision" /> Vision (понимает изображения)</label>
          </div>
          <button class="btn btn--primary btn--sm" id="add-model">Добавить модель</button>
        </div>
        ${
          !hasVision
            ? `<div class="list-card">
                <strong>👁 ${escapeHtml(GATED_VISION_MODEL.label)}</strong>
                <small>${escapeHtml(GATED_VISION_MODEL.modelId)} — сторонняя платная модель Google. Требует твоего явного разрешения.</small>
                <select class="input" id="nm-vision-provider">${providerOptions}</select>
                <button class="btn btn--sm" id="add-gated-vision">Разрешить и добавить</button>
              </div>`
            : ''
        }
      </div>`;
  }

  function wireModels() {
    overlayEl.querySelectorAll('[data-act="delete-model"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.list-card').dataset.modelId;
        await removeModel(id);
        renderTab('models');
        onChange?.();
      });
    });
    overlayEl.querySelector('#add-model').addEventListener('click', async () => {
      const providerId = overlayEl.querySelector('#nm-provider').value;
      const modelId = overlayEl.querySelector('#nm-modelid').value.trim();
      const label = overlayEl.querySelector('#nm-label').value.trim();
      const vision = overlayEl.querySelector('#nm-vision').checked;
      if (!modelId) {
        toast('Укажи ID модели', 'error');
        return;
      }
      const added = await addModelWithConfirm({ providerId, modelId, label, vision });
      if (added) {
        renderTab('models');
        onChange?.();
      }
    });
    const gatedBtn = overlayEl.querySelector('#add-gated-vision');
    if (gatedBtn) {
      gatedBtn.addEventListener('click', async () => {
        const providerId = overlayEl.querySelector('#nm-vision-provider').value;
        const added = await addGatedVisionModel(providerId);
        if (added) {
          renderTab('models');
          onChange?.();
        }
      });
    }
  }

  // ---------------- Search ----------------
  function searchPane() {
    const s = Store.getSettings();
    return `
      <div class="settings-pane is-active">
        <div class="field">
          <label>Название поискового провайдера</label>
          <input class="input" id="f-search-name" value="${escapeHtml(s.search.name || '')}" />
        </div>
        <div class="field">
          <label>Base URL (Tavily-совместимый POST {url}/search)</label>
          <input class="input" id="f-search-url" value="${escapeHtml(s.search.baseUrl || '')}" />
        </div>
        <div class="field">
          <label>API-ключ</label>
          <input class="input" type="password" id="f-search-key" value="${escapeHtml(s.search.apiKey || '')}" />
        </div>
        <small>Используется и для обычного, и для глубокого поиска (глубокий — это несколько подзапросов + синтез).</small>
        <button class="btn btn--primary" id="save-search">Сохранить</button>
      </div>`;
  }

  function wireSearch() {
    overlayEl.querySelector('#save-search').addEventListener('click', () => {
      const s = Store.getSettings();
      s.search = {
        name: overlayEl.querySelector('#f-search-name').value.trim(),
        baseUrl: overlayEl.querySelector('#f-search-url').value.trim(),
        apiKey: overlayEl.querySelector('#f-search-key').value.trim(),
      };
      Store.setSettings(s);
      toast('Настройки поиска сохранены', 'success');
      onChange?.();
    });
  }

  // ---------------- GitHub ----------------
  function githubPane() {
    const s = Store.getSettings();
    return `
      <div class="settings-pane is-active">
        <div class="field">
          <label>Personal Access Token</label>
          <input class="input" type="password" id="f-gh-token" value="${escapeHtml(s.githubToken || '')}" placeholder="ghp_..." />
          <small>Токен хранится только в этом браузере (localStorage) и используется для прямых запросов к api.github.com — управляет только твоими репозиториями.</small>
        </div>
        <div class="list-card__row">
          <button class="btn btn--primary btn--sm" id="save-gh">Сохранить</button>
          <button class="btn btn--sm" id="check-gh">Проверить подключение</button>
        </div>
        <div id="gh-status" class="meta"></div>
      </div>`;
  }

  function wireGithub() {
    overlayEl.querySelector('#save-gh').addEventListener('click', () => {
      const s = Store.getSettings();
      s.githubToken = overlayEl.querySelector('#f-gh-token').value.trim();
      Store.setSettings(s);
      toast('GitHub-токен сохранён', 'success');
      onChange?.();
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
  }

  renderTab(tab);
  requestAnimationFrame(() => overlayEl.classList.add('modal-overlay--show'));
}
