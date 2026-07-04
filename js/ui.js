// Small UI helpers shared across modules: toasts and a generic confirm dialog.

export function toast(message, type = 'info', timeout = 3500) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--show'));
  setTimeout(() => {
    el.classList.remove('toast--show');
    setTimeout(() => el.remove(), 250);
  }, timeout);
}

export function confirmDialog({ title = 'Подтвердите', message = '', okText = 'Да', cancelText = 'Отмена', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal--confirm" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-act="cancel">${cancelText}</button>
          <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-act="ok">${okText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => cleanup(false));
    overlay.querySelector('[data-act="ok"]').addEventListener('click', () => cleanup(true));
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--show'));
  });
}

export function promptDialog({ title = 'Введите значение', message = '', placeholder = '', okText = 'ОК', cancelText = 'Отмена', value = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal--confirm" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        <p>${message}</p>
        <input type="text" class="input" data-role="prompt-input" placeholder="${placeholder}" />
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-act="cancel">${cancelText}</button>
          <button type="button" class="btn btn--primary" data-act="ok">${okText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('[data-role="prompt-input"]');
    input.value = value;
    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => cleanup(null));
    overlay.querySelector('[data-act="ok"]').addEventListener('click', () => cleanup(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cleanup(input.value);
      if (e.key === 'Escape') cleanup(null);
    });
    requestAnimationFrame(() => {
      overlay.classList.add('modal-overlay--show');
      input.focus();
    });
  });
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
