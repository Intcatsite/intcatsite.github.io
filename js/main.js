import { Store } from './storage.js';
import { toast, confirmDialog, escapeHtml } from './ui.js';
import { getModels, getModelById } from './models.js';
import { createChat, getAllChats, getActiveChat, setActiveChat, saveChat, deleteChat, sendMessage } from './chat.js';
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
const exportBtn = document.getElementById('export-btn');
const githubBtn = document.getElementById('github-btn');
const sidebarOpenBtn = document.getElementById('sidebar-open');
const sidebarCloseBtn = document.getElementById('sidebar-close');

const modelSelect = document.getElementById('model-select');
const chatTitleLabel = document.getElementById('chat-title-label');
const messagesEl = document.getElementById('messages');
const attachPreviewEl = document.getElementById('attach-preview');
const attachBtn = document.getElementById('attach-btn');
const attachInput = document.getElementById('attach-input');
const composerInput = document.getElementById('composer-input');
const sendBtn = document.getElementById('send-btn');

const livebuildToggle = document.getElementById('livebuild-toggle');
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

// ---------------- Markdown rendering ----------------
function renderMarkdown(text) {
  const raw = window.marked ? window.marked.parse(text || '') : escapeHtml(text || '').replace(/\n/g, '<br>');
  return window.DOMPurify ? window.DOMPurify.sanitize(raw) : raw;
}

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
      del.className = 'chat-item__del';
      del.textContent = '✕';
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

// ---------------- Model select ----------------
function renderModelSelect() {
  const models = getModels();
  modelSelect.innerHTML = models
    .map((m) => `<option value="${m.id}">${escapeHtml(m.label)}${m.vision ? ' 👁' : ''}</option>`)
    .join('');
  if (!models.find((m) => m.id === currentChat.modelId) && models.length) {
    currentChat.modelId = models[0].id;
    saveChat(currentChat);
  }
  if (currentChat.modelId) modelSelect.value = currentChat.modelId;
  updateAttachButtonVisibility();
}
function updateAttachButtonVisibility() {
  const model = getModelById(modelSelect.value);
  attachBtn.style.display = model && model.vision ? 'inline-flex' : 'none';
}
modelSelect.addEventListener('change', () => {
  currentChat.modelId = modelSelect.value;
  saveChat(currentChat);
  updateAttachButtonVisibility();
});

// ---------------- Mode toggles ----------------
function wireModeGroup(groupEl, dataKey, stateKey) {
  const btns = [...groupEl.querySelectorAll('button')];
  btns.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset[dataKey] === mode[stateKey]);
    btn.addEventListener('click', () => {
      mode[stateKey] = btn.dataset[dataKey];
      btns.forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });
}
wireModeGroup(document.getElementById('search-mode-group'), 'searchMode', 'search');
wireModeGroup(document.getElementById('thinking-mode-group'), 'thinkingMode', 'thinking');
livebuildToggle.addEventListener('click', () => {
  mode.liveBuild = !mode.liveBuild;
  livebuildToggle.classList.toggle('is-active', mode.liveBuild);
});

// ---------------- Messages rendering ----------------
function messageBubbleEl(msg) {
  const wrap = document.createElement('div');
  wrap.className = `msg msg--${msg.role}`;

  const roleLabel = document.createElement('div');
  roleLabel.className = 'msg__role';
  roleLabel.textContent = msg.role === 'assistant' ? 'Deeps' : 'Вы';
  wrap.appendChild(roleLabel);

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

  const bubble = document.createElement('div');
  bubble.className = 'msg__bubble';
  bubble.innerHTML = renderMarkdown(msg.content || '');
  wrap.appendChild(bubble);

  if (msg.images && msg.images.length) {
    msg.images.forEach((src) => {
      const img = document.createElement('img');
      img.className = 'attach';
      img.src = src;
      bubble.appendChild(img);
    });
  }

  if (msg.files && msg.files.length) {
    const note = document.createElement('div');
    note.style.marginTop = '8px';
    note.style.fontSize = '12.5px';
    note.style.color = 'var(--text-dim)';
    note.textContent = `📦 Сгенерировано файлов: ${msg.files.length} — открой панель Live Build справа.`;
    bubble.appendChild(note);
  }

  return wrap;
}

function renderMessages() {
  messagesEl.innerHTML = '';
  currentChat.messages.forEach((msg) => messagesEl.appendChild(messageBubbleEl(msg)));
  messagesEl.scrollTop = messagesEl.scrollHeight;
  chatTitleLabel.textContent = currentChat.title || 'Новый чат';
}

function renderAll() {
  renderSidebar(chatSearchInput.value);
  renderMessages();
  renderModelSelect();
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

  messagesEl.appendChild(messageBubbleEl({ role: 'user', content: text, images }));
  const typingWrap = document.createElement('div');
  typingWrap.className = 'msg msg--assistant';
  typingWrap.innerHTML =
    '<div class="msg__role">Deeps</div>' +
    '<div class="msg__bubble" id="stream-bubble"><span class="typing-indicator"><span></span><span></span><span></span></span></div>';
  messagesEl.appendChild(typingWrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  const streamBubble = typingWrap.querySelector('#stream-bubble');

  try {
    await sendMessage({
      chat: currentChat,
      text,
      images,
      mode: { ...mode },
      onDelta: (full) => {
        streamBubble.style.whiteSpace = 'pre-wrap';
        streamBubble.textContent = full;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      },
      onThoughtProgress: (progress) => {
        const last = progress.log[progress.log.length - 1];
        streamBubble.innerHTML = `<em>🧠 Думаю… шаг ${progress.log.length}${last && last.converged ? ' (готово)' : ''}</em>`;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      },
    });
  } catch (err) {
    toast(err.message, 'error');
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

// ---------------- Settings / export / github entry points ----------------
settingsBtn.addEventListener('click', () => openSettings({ onChange: renderAll }));
githubBtn.addEventListener('click', () => openSettings({ tab: 'github', onChange: renderAll }));
exportBtn.addEventListener('click', () => downloadChatTxt(currentChat));

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
        '<div style="padding:16px;color:var(--text-dim);font-size:13px;">Не нашёл index.html для превью — смотри вкладку «Файлы».</div>';
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
    toast('Нет файлов для скачивания — сначала попроси Deeps собрать сайт во включённом режиме Live Build', 'error');
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
    toast('Сначала добавь GitHub-токен в Настройках → GitHub', 'error');
    openSettings({ tab: 'github', onChange: renderAll });
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>Запушить проект в GitHub</h3>
      <div class="field">
        <label>Существующий репозиторий</label>
        <select class="input" id="gh-repo-select"><option value="">Загрузка…</option></select>
      </div>
      <div class="field">
        <label>Или создать новый</label>
        <input class="input" id="gh-new-repo" placeholder="название-нового-репозитория" />
      </div>
      <div class="field">
        <label>Ветка</label>
        <input class="input" id="gh-branch" value="main" />
      </div>
      <div class="field">
        <label>Сообщение коммита</label>
        <input class="input" id="gh-message" value="Deeps: добавлен сгенерированный проект" />
      </div>
      <div id="gh-progress" class="meta"></div>
      <div class="modal__actions">
        <button type="button" class="btn" data-act="cancel">Отмена</button>
        <button type="button" class="btn btn--primary" data-act="push">Запушить</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
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
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => overlay.remove());
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
renderAll();
