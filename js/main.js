import { Store } from './storage.js';
import { toast, confirmDialog, promptDialog, escapeHtml } from './ui.js';
import { injectIcons, iconSvg } from './icons.js';
import { listModels, getModelById } from './models.js';
import {
  createChat,
  getAllChats,
  getActiveChat,
  setActiveChat,
  saveChat,
  deleteChat,
  renameChat,
  sendMessage,
} from './chat.js';
import { openSettings } from './settings.js';
import { downloadChatTxt } from './exporttxt.js';
import { buildPreviewHtml, downloadZip } from './livebuild.js';
import { getCurrentUser, listRepos, createRepo, pushFiles } from './github.js';

// ---------------- DOM refs ----------------
const sidebarEl = document.getElementById('sidebar');
const sidebarScrim = document.getElementById('sidebar-scrim');
const chatListEl = document.getElementById('chat-list');
const chatSearchInput = document.getElementById('chat-search');
const newChatBtn = document.getElementById('new-chat-btn');
const settingsBtn = document.getElementById('settings-btn');
const sidebarOpenBtn = document.getElementById('sidebar-open');
const sidebarCloseBtn = document.getElementById('sidebar-close');

const modelDropdown = document.getElementById('model-dropdown');
const modelMenu = document.getElementById('model-menu');
const modelValueEl = document.getElementById('model-value');

const searchDropdown = document.getElementById('search-dropdown');
const searchValueEl = document.getElementById('search-value');
const thinkingDropdown = document.getElementById('thinking-dropdown');
const thinkingValueEl = document.getElementById('thinking-value');
const livebuildToggle = document.getElementById('livebuild-toggle');

const chatMenuBtn = document.getElementById('chat-menu-btn');
const chatMenuPopup = document.getElementById('chat-menu-popup');
const chatTitleLabel = document.getElementById('chat-title-label');

const messagesEl = document.getElementById('messages');
const attachPreviewEl = document.getElementById('attach-preview');
const attachBtn = document.getElementById('attach-btn');
const attachInput = document.getElementById('attach-input');
const composerInput = document.getElementById('composer-input');
const sendBtn = document.getElementById('send-btn');

const livepanelEl = document.getElementById('livepanel');
const livepanelBody = document.getElementById('livepanel-body');
const liveFilePillsEl = document.getElementById('live-file-pills');

// ---------------- State ----------------
let currentChat = getActiveChat();
let mode = { search: 'off', thinking: 'off', liveBuild: false };
let pendingImages = [];
let sending = false;
let currentLiveFiles = [];
let liveActiveTab = 'preview';
let liveActiveFileIdx = 0;

const SEARCH_LABELS = { off: 'Без поиска', normal: 'Обычный поиск', deep: 'Глубокий поиск' };
const THINKING_LABELS = { off: 'Обычный ответ', thinking: 'Thinking', thinkingPlus: 'Thinking+' };

// ---------------- Boot ----------------
injectIcons(document);

// ---------------- Markdown ----------------
function renderMarkdown(text) {
  const raw = window.marked ? window.marked.parse(text || '') : escapeHtml(text || '').replace(/\n/g, '<br>');
  return window.DOMPurify ? window.DOMPurify.sanitize(raw) : raw;
}

// ---------------- Dropdowns ----------------
function setupDropdown(dropdownEl, onSelect) {
  const trigger = dropdownEl.querySelector('.dropdown-trigger');
  const menu = dropdownEl.querySelector('.dropdown-menu');
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.dropdown.is-open').forEach((d) => {
      if (d !== dropdownEl) {
        d.classList.remove('is-open');
        d.querySelector('.dropdown-menu')?.classList.remove('is-open');
      }
    });
    dropdownEl.classList.toggle('is-open');
    menu.classList.toggle('is-open');
  });
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    onSelect(btn.dataset.value, btn.textContent);
    close();
  });
  function close() {
    dropdownEl.classList.remove('is-open');
    menu.classList.remove('is-open');
  }
  return { close };
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown.is-open').forEach((d) => {
      d.classList.remove('is-open');
      d.querySelector('.dropdown-menu')?.classList.remove('is-open');
    });
  }
  if (!e.target.closest('.chat-menu')) {
    chatMenuPopup?.classList.remove('is-open');
  }
});

setupDropdown(searchDropdown, (value) => {
  mode.search = value;
  searchValueEl.textContent = SEARCH_LABELS[value];
  searchDropdown.querySelector('.dropdown-trigger').classList.toggle('is-active-mode', value !== 'off');
});

setupDropdown(thinkingDropdown, (value) => {
  mode.thinking = value;
  thinkingValueEl.textContent = THINKING_LABELS[value];
  thinkingDropdown.querySelector('.dropdown-trigger').classList.toggle('is-active-mode', value !== 'off');
});

// Model dropdown is built dynamically since the model list can grow when vision is enabled.
function renderModelMenu() {
  const models = listModels();
  modelMenu.innerHTML = models
    .map(
      (m) => `
      <button type="button" data-value="${m.id}"${m.id === currentChat.modelId ? ' class="is-selected"' : ''}>
        <div class="model-item">
          <span>${escapeHtml(m.label)}</span>
          <span class="sub">${escapeHtml(m.tag)}${m.vision ? ' · vision' : ''}</span>
        </div>
      </button>`
    )
    .join('');
  const active = models.find((m) => m.id === currentChat.modelId) || models[0];
  modelValueEl.textContent = active.label;
}
setupDropdown(modelDropdown, (value) => {
  currentChat.modelId = value;
  saveChat(currentChat);
  renderModelMenu();
  updateAttachVisibility();
});

// ---------------- Live Build toggle ----------------
livebuildToggle.addEventListener('click', () => {
  mode.liveBuild = !mode.liveBuild;
  livebuildToggle.classList.toggle('is-active', mode.liveBuild);
});

// ---------------- Sidebar ----------------
function renderSidebar(filter = '') {
  const chats = getAllChats();
  chatListEl.innerHTML = '';
  const f = filter.trim().toLowerCase();
  chats
    .filter((c) => !f || (c.title || '').toLowerCase().includes(f))
    .forEach((c) => {
      const item = document.createElement('div');
      item.className = 'chat-item' + (c.id === currentChat.id ? ' is-active' : '');

      const span = document.createElement('span');
      span.className = 'title';
      span.textContent = c.title || 'Новый чат';
      item.appendChild(span);

      const del = document.createElement('button');
      del.className = 'del';
      del.innerHTML = iconSvg('trash', 14);
      del.title = 'Удалить чат';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await confirmDialog({
          title: 'Удалить чат?',
          message: `«${c.title}» будет удалён без возможности восстановления.`,
          danger: true,
          okText: 'Удалить',
        });
        if (!ok) return;
        deleteChat(c.id);
        currentChat = getActiveChat();
        renderAll();
      });
      item.appendChild(del);

      item.addEventListener('click', () => {
        setActiveChat(c.id);
        currentChat = getActiveChat();
        renderAll();
        closeSidebarMobile();
      });
      chatListEl.appendChild(item);
    });
}

function closeSidebarMobile() {
  sidebarEl.classList.remove('is-open');
  sidebarScrim.classList.remove('is-open');
}
function openSidebarMobile() {
  sidebarEl.classList.add('is-open');
  sidebarScrim.classList.add('is-open');
}
sidebarOpenBtn.addEventListener('click', openSidebarMobile);
sidebarCloseBtn.addEventListener('click', closeSidebarMobile);
sidebarScrim.addEventListener('click', closeSidebarMobile);

newChatBtn.addEventListener('click', () => {
  currentChat = createChat();
  renderAll();
  closeSidebarMobile();
});
chatSearchInput.addEventListener('input', () => renderSidebar(chatSearchInput.value));

// ---------------- Chat menu ----------------
chatMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  chatMenuPopup.classList.toggle('is-open');
});
chatMenuPopup.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  chatMenuPopup.classList.remove('is-open');
  const act = btn.dataset.act;
  if (act === 'export') {
    downloadChatTxt(currentChat);
    toast('Экспортирую чат в .txt', 'success');
  } else if (act === 'rename') {
    const title = await promptDialog({
      title: 'Переименовать чат',
      message: 'Новое название чата:',
      value: currentChat.title,
    });
    if (title) {
      renameChat(currentChat.id, title.trim() || currentChat.title);
      currentChat = getActiveChat();
      renderAll();
    }
  } else if (act === 'delete') {
    const ok = await confirmDialog({
      title: 'Удалить чат?',
      message: `«${currentChat.title}» будет удалён без возможности восстановления.`,
      danger: true,
      okText: 'Удалить',
    });
    if (!ok) return;
    deleteChat(currentChat.id);
    currentChat = getActiveChat();
    renderAll();
  }
});

// ---------------- Messages rendering ----------------
function messageBubbleEl(msg) {
  const wrap = document.createElement('div');
  wrap.className = `msg msg--${msg.role}`;

  const meta = document.createElement('div');
  meta.className = 'msg__meta';
  meta.textContent = msg.role === 'assistant' ? 'Deeps' : 'Вы';
  wrap.appendChild(meta);

  if (msg.thoughtLog && msg.thoughtLog.length) {
    const details = document.createElement('details');
    details.className = 'thought-log';
    const summary = document.createElement('summary');
    summary.textContent = `Ход мыслей (${msg.thoughtLog.length} шаг(ов))`;
    details.appendChild(summary);
    msg.thoughtLog.forEach((entry) => {
      const div = document.createElement('div');
      div.className = 'iter';
      div.textContent = `#${entry.iteration}: ${entry.thought || '(без явных рассуждений)'}`;
      details.appendChild(div);
    });
    wrap.appendChild(details);
  }

  const content = document.createElement('div');
  content.className = 'msg__content';
  content.innerHTML = renderMarkdown(msg.content || '');
  wrap.appendChild(content);

  if (msg.images && msg.images.length) {
    msg.images.forEach((src) => {
      const img = document.createElement('img');
      img.className = 'attach';
      img.src = src;
      content.appendChild(img);
    });
  }

  if (msg.files && msg.files.length) {
    const note = document.createElement('div');
    note.style.marginTop = '10px';
    note.style.fontSize = '12.5px';
    note.style.color = 'var(--text-dim)';
    note.textContent = `Сгенерировано файлов: ${msg.files.length} — панель Live Build →`;
    content.appendChild(note);
  }

  return wrap;
}

function welcomeScreen() {
  const wrap = document.createElement('div');
  wrap.className = 'welcome-screen';
  wrap.innerHTML = `
    <div class="brand-logo">D</div>
    <h2>Привет, я Deeps</h2>
    <p>DeepSeek с приятным интерфейсом: настраиваешь один провайдер, выбираешь модель, получаешь чат, поиск, режимы рассуждения и Live Build сайтов в zip.</p>
    <div class="suggestion-row">
      <button type="button" class="suggestion" data-suggest="Придумай план приложения для трекинга привычек и опиши экраны.">Спланируй приложение для трекинга привычек</button>
      <button type="button" class="suggestion" data-suggest="Собери одностраничный сайт-портфолио дизайнера с тёмной темой.">Собрать сайт-портфолио (Live Build)</button>
      <button type="button" class="suggestion" data-suggest="Сравни DeepSeek V4 Flash и Pro — когда какую использовать?">Flash vs Pro — когда какую?</button>
      <button type="button" class="suggestion" data-suggest="Найди последние новости про DeepSeek в интернете.">Найди свежие новости про DeepSeek</button>
    </div>`;
  wrap.querySelectorAll('.suggestion').forEach((btn) => {
    btn.addEventListener('click', () => {
      composerInput.value = btn.dataset.suggest;
      composerInput.dispatchEvent(new Event('input'));
      composerInput.focus();
    });
  });
  return wrap;
}

function renderMessages() {
  messagesEl.innerHTML = '';
  if (!currentChat.messages.length) {
    messagesEl.appendChild(welcomeScreen());
  } else {
    const inner = document.createElement('div');
    inner.className = 'messages__inner';
    currentChat.messages.forEach((m) => inner.appendChild(messageBubbleEl(m)));
    messagesEl.appendChild(inner);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  chatTitleLabel.textContent = currentChat.title || 'Новый чат';
}

function updateAttachVisibility() {
  const model = getModelById(currentChat.modelId);
  attachBtn.style.display = model.vision ? 'inline-flex' : 'none';
}

function renderAll() {
  renderSidebar(chatSearchInput.value);
  renderMessages();
  renderModelMenu();
  updateAttachVisibility();
}

// ---------------- Attachments ----------------
attachBtn.addEventListener('click', () => attachInput.click());
attachInput.addEventListener('change', () => {
  [...attachInput.files].forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      pendingImages.push(reader.result);
      renderAttachPreview();
    };
    reader.readAsDataURL(file);
  });
  attachInput.value = '';
});
function renderAttachPreview() {
  attachPreviewEl.innerHTML = '';
  pendingImages.forEach((src, idx) => {
    const img = document.createElement('img');
    img.src = src;
    img.title = 'Убрать вложение';
    img.addEventListener('click', () => {
      pendingImages.splice(idx, 1);
      renderAttachPreview();
    });
    attachPreviewEl.appendChild(img);
  });
}

// ---------------- Composer / send ----------------
composerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});
composerInput.addEventListener('input', () => {
  composerInput.style.height = 'auto';
  composerInput.style.height = `${Math.min(composerInput.scrollHeight, 200)}px`;
});
sendBtn.addEventListener('click', handleSend);

async function handleSend() {
  if (sending) return;
  const text = composerInput.value.trim();
  const images = pendingImages.slice();
  if (!text && !images.length) return;

  sending = true;
  sendBtn.disabled = true;
  composerInput.value = '';
  composerInput.style.height = 'auto';
  pendingImages = [];
  renderAttachPreview();

  // Ensure messages container is in list-mode (kill welcome if present)
  if (!currentChat.messages.length) {
    messagesEl.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'messages__inner';
    messagesEl.appendChild(inner);
  }
  let inner = messagesEl.querySelector('.messages__inner');
  if (!inner) {
    inner = document.createElement('div');
    inner.className = 'messages__inner';
    messagesEl.appendChild(inner);
  }

  inner.appendChild(messageBubbleEl({ role: 'user', content: text, images }));
  const typingWrap = document.createElement('div');
  typingWrap.className = 'msg msg--assistant';
  typingWrap.innerHTML =
    '<div class="msg__meta">Deeps</div>' +
    '<div class="msg__content" id="stream-content"><span class="typing-indicator"><span></span><span></span><span></span></span></div>';
  inner.appendChild(typingWrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  const streamBubble = typingWrap.querySelector('#stream-content');

  try {
    await sendMessage({
      chat: currentChat,
      text,
      images,
      mode: { ...mode },
      onDelta: (full) => {
        streamBubble.innerHTML = renderMarkdown(full);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      },
      onThoughtProgress: (progress) => {
        const last = progress.log[progress.log.length - 1];
        streamBubble.innerHTML = `<em style="color:var(--text-dim)">Думаю… шаг ${progress.log.length}${
          last && last.converged ? ' (готово)' : ''
        }</em>`;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      },
    });
  } catch (err) {
    toast(err.message, 'error', 5000);
  } finally {
    sending = false;
    sendBtn.disabled = false;
    renderAll();
    const lastMsg = currentChat.messages[currentChat.messages.length - 1];
    if (lastMsg && lastMsg.files && lastMsg.files.length) {
      openLivePanel(lastMsg.files);
    }
  }
}

// ---------------- Settings ----------------
settingsBtn.addEventListener('click', () => openSettings({ onChange: renderAll }));

// ---------------- Live Build panel ----------------
function openLivePanel(files) {
  currentLiveFiles = files;
  liveActiveTab = 'preview';
  liveActiveFileIdx = 0;
  livepanelEl.classList.add('is-open');
  document.querySelectorAll('[data-live-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.liveTab === 'preview'));
  renderLivePanel();
}

function renderLivePanel() {
  if (liveActiveTab === 'preview') {
    liveFilePillsEl.style.display = 'none';
    const html = buildPreviewHtml(currentLiveFiles);
    livepanelBody.innerHTML = '';
    if (html) {
      const iframe = document.createElement('iframe');
      iframe.sandbox = 'allow-scripts allow-forms allow-modals allow-popups';
      iframe.srcdoc = html;
      livepanelBody.appendChild(iframe);
    } else {
      livepanelBody.innerHTML =
        '<div class="livepanel__empty">Не нашёл index.html для превью — смотри вкладку «Файлы».</div>';
    }
  } else {
    liveFilePillsEl.style.display = 'flex';
    liveFilePillsEl.innerHTML = currentLiveFiles
      .map((f, i) => `<button class="file-pill${i === liveActiveFileIdx ? ' is-active' : ''}" data-idx="${i}">${escapeHtml(f.path)}</button>`)
      .join('');
    liveFilePillsEl.querySelectorAll('.file-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        liveActiveFileIdx = Number(btn.dataset.idx);
        renderLivePanel();
      });
    });
    const f = currentLiveFiles[liveActiveFileIdx];
    livepanelBody.innerHTML = `<div class="file-tab-content">${escapeHtml(f ? f.content : '')}</div>`;
  }
}

document.querySelectorAll('[data-live-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    liveActiveTab = btn.dataset.liveTab;
    document.querySelectorAll('[data-live-tab]').forEach((b) => b.classList.toggle('is-active', b === btn));
    renderLivePanel();
  });
});
document.getElementById('livepanel-close').addEventListener('click', () => livepanelEl.classList.remove('is-open'));

document.getElementById('live-download-zip').addEventListener('click', async () => {
  if (!currentLiveFiles.length) {
    toast('Сначала попроси Deeps собрать сайт во включённом режиме Live Build', 'error');
    return;
  }
  try {
    await downloadZip(currentLiveFiles, `${(currentChat.title || 'deeps-site').replace(/[^\w-]+/g, '_')}.zip`);
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('live-push-github').addEventListener('click', () => openGithubPushModal(currentLiveFiles));

async function openGithubPushModal(files) {
  if (!files.length) {
    toast('Нет файлов для пуша — сначала сгенерируй проект в режиме Live Build', 'error');
    return;
  }
  const settings = Store.getSettings();
  if (!settings.githubToken) {
    toast('Сначала добавь GitHub-токен в Настройках', 'error');
    openSettings({ onChange: renderAll });
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal__header">
        <h3>Запушить проект в GitHub</h3>
        <button class="icon-btn" data-act="cancel" data-icon="close"></button>
      </div>
      <div class="modal__scroll">
        <div class="field">
          <label>Существующий репозиторий</label>
          <select class="input" id="gh-repo-select"><option value="">Загрузка…</option></select>
        </div>
        <div class="field">
          <label>Или создать новый</label>
          <input class="input" id="gh-new-repo" placeholder="my-generated-site" />
        </div>
        <div class="field">
          <label>Ветка</label>
          <input class="input" id="gh-branch" value="main" />
        </div>
        <div class="field">
          <label>Сообщение коммита</label>
          <input class="input" id="gh-message" value="Deeps: сгенерированный проект" />
        </div>
        <div id="gh-progress" class="hint"></div>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--ghost" data-act="cancel">Отмена</button>
        <button type="button" class="btn btn--primary" data-act="push">Запушить</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  injectIcons(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-overlay--show'));

  const repoSelect = overlay.querySelector('#gh-repo-select');
  let owner = '';
  try {
    const user = await getCurrentUser(settings.githubToken);
    owner = user.login;
    const repos = await listRepos(settings.githubToken);
    repoSelect.innerHTML =
      '<option value="">— выбери репозиторий —</option>' +
      repos.map((r) => `<option value="${r.name}">${escapeHtml(r.full_name)}</option>`).join('');
  } catch (err) {
    repoSelect.innerHTML = `<option value="">Ошибка: ${escapeHtml(err.message)}</option>`;
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-act="cancel"]')) overlay.remove();
  });
  overlay.querySelector('[data-act="push"]').addEventListener('click', async () => {
    const progressEl = overlay.querySelector('#gh-progress');
    const newRepoName = overlay.querySelector('#gh-new-repo').value.trim();
    const branch = overlay.querySelector('#gh-branch').value.trim() || 'main';
    const message = overlay.querySelector('#gh-message').value.trim() || 'Deeps push';
    let repoName = repoSelect.value;
    try {
      if (newRepoName) {
        progressEl.textContent = 'Создаю репозиторий…';
        const created = await createRepo(settings.githubToken, newRepoName, true);
        repoName = created.name;
        owner = created.owner.login;
      }
      if (!repoName) {
        toast('Выбери существующий репозиторий или введи название нового', 'error');
        return;
      }
      progressEl.textContent = 'Пушу файлы…';
      await pushFiles(settings.githubToken, owner, repoName, files, message, branch, (path) => {
        progressEl.textContent = `Загружено: ${path}`;
      });
      toast('Проект запушен в GitHub', 'success');
      overlay.remove();
    } catch (err) {
      progressEl.textContent = `Ошибка: ${err.message}`;
      toast(err.message, 'error');
    }
  });
}

// ---------------- Init ----------------
searchValueEl.textContent = SEARCH_LABELS[mode.search];
thinkingValueEl.textContent = THINKING_LABELS[mode.thinking];
renderAll();
