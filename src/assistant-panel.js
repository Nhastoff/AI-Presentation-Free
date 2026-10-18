import './assistant.css';
import { prepareAttachments } from './assistant-attachments.js';

const uid = () => globalThis.crypto.randomUUID();
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Mount outside #app: editor renders must never destroy a running conversation. */
export function mountAssistant(adapter, bridge = window.presentationAI) {
  const host = el('aside', 'ai-panel');
  host.id = 'assistant-panel';
  host.hidden = true;
  host.setAttribute('aria-label', 'Помощник Codex');
  const toggle = el('button', 'ai-toggle', '✦ Помощник');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', host.id);
  toggle.setAttribute('aria-expanded', 'false');
  const handle = el('div', 'ai-resizer');
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-label', 'Ширина помощника');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.tabIndex = 0;
  const header = el('header', 'ai-header');
  header.append(el('strong', '', '✦ Помощник Codex'));
  const close = button('Свернуть', () => setOpen(false), '×');
  header.append(close);
  const connection = el('div', 'ai-connection');
  const status = el('span', 'ai-status', bridge ? 'Codex не подключён' : 'Откройте настольное приложение для подключения Codex');
  status.setAttribute('role', 'status');
  const connect = button('Подключить Codex', () => connectionAction('connect'), 'Подключить');
  const login = button('Войти через ChatGPT', () => connectionAction('login'), 'Войти');
  const disconnect = button('Отключить Codex', () => connectionAction('disconnect'), 'Отключить');
  connection.append(status, connect, login, disconnect);
  const toolbar = el('div', 'ai-toolbar');
  const conversationsSelect = el('select');
  conversationsSelect.setAttribute('aria-label', 'История разговоров');
  const newChat = button('Новый разговор', () => { if (busy) return; active = makeConversation(); conversations.push(active); renderHistory(); renderMessages(); save(); }, '+');
  const clear = button('Удалить историю этой презентации', async () => {
    if (busy || !window.confirm('Удалить историю разговоров этой презентации?')) return;
    conversations = [makeConversation()]; active = conversations[0]; renderHistory(); renderMessages(); await save();
  }, 'Очистить');
  toolbar.append(conversationsSelect, newChat, clear);
  const messages = el('div', 'ai-messages');
  messages.setAttribute('role', 'log');
  messages.setAttribute('aria-label', 'Переписка с помощником');
  const notice = el('p', 'ai-privacy', 'Для ответа Codex получает запрос, нужные слайды и прикреплённые материалы. Интернет необходим.');
  const usage = el('p', 'ai-privacy ai-usage'); usage.hidden = true;
  const attachmentsList = el('div', 'ai-attachments');
  const form = el('form', 'ai-composer');
  const input = el('textarea');
  input.placeholder = 'Например: создай 5 слайдов о путешествии…';
  input.setAttribute('aria-label', 'Сообщение помощнику');
  input.rows = 3;
  const actions = el('div', 'ai-composer-actions');
  const attach = button('Прикрепить материалы', pickAttachments, '＋ Файл');
  const mode = el('select');
  mode.setAttribute('aria-label', 'Режим качества');
  for (const [value, label] of [['economy', 'Экономно'], ['balanced', 'Обычно'], ['quality', 'Качественно']]) {
    const option = el('option', '', label); option.value = value; mode.append(option);
  }
  mode.value = 'balanced';
  mode.title = 'Режим влияет на поддерживаемые моделью настройки; расход зависит от задачи';
  const send = el('button', 'ai-primary', 'Отправить'); send.type = 'submit';
  const stop = button('Остановить выполнение', async () => { try { await bridge?.stop({ conversationId: active.id }); status.textContent = 'Остановка…'; } catch (error) { showError(error); } }, 'Стоп');
  stop.hidden = true;
  actions.append(attach, mode, send, stop);
  form.append(input, actions);
  host.append(handle, header, connection, toolbar, messages, usage, notice, attachmentsList, form);
  document.body.append(host, toggle);
  let documentId = null, conversations = [], active, attachments = [], busy = false, connected = false, width = 390, streaming = null, historyGeneration = 0;
  let saveTimer;

  function button(label, action, text = label) {
    const node = el('button', '', text); node.type = 'button'; node.title = label; node.setAttribute('aria-label', label); node.addEventListener('click', action); return node;
  }
  function makeConversation() { return { id: uid(), title: 'Новый разговор', createdAt: Date.now(), messages: [] }; }
  function setOpen(open) {
    host.hidden = !open; toggle.hidden = open;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('ai-open', open);
    document.documentElement.style.setProperty('--ai-panel-width', `${width}px`);
    window.dispatchEvent(new Event('resize'));
    if (open) input.focus();
  }
  toggle.onclick = () => setOpen(true);
  function setBusy(value) {
    busy = value; send.hidden = value; stop.hidden = !value;
    conversationsSelect.disabled = value; newChat.disabled = value; clear.disabled = value; mode.disabled = value; attach.disabled = value;
    input.disabled = value; send.disabled = !bridge || !connected;
  }
  function updateConnection(state) {
    connected = Boolean(state?.connected || state?.status === 'connected' || state?.ready);
    status.textContent = state?.message || (connected ? 'Codex подключён' : 'Codex не подключён');
    connect.hidden = connected; login.hidden = connected && state?.authenticated !== false; disconnect.hidden = !connected;
    connect.disabled = login.disabled = !bridge; send.disabled = !connected || busy;
    if (state) notice.textContent = `Для ответа Codex получает запрос, нужные слайды и вложения. Интернет необходим. ${state.imageGenerationReason || (state.capabilities?.imageGeneration ? 'Генерация изображений доступна.' : 'Генерация изображений пока не подключена.')}`;
    for (const option of mode.options) { const settings = state?.modes?.[option.value]; if (settings) option.title = `${settings.displayName || settings.model}: ${settings.effort || 'настройка модели'}`; }
  }
  async function connectionAction(method) {
    if (!bridge?.[method]) return;
    try { status.textContent = method === 'login' ? 'Ожидание входа в браузере…' : 'Подключение…'; updateConnection(await bridge[method]({ tools: adapter.tools, instructions: adapter.instructions })); } catch (error) { showError(error); }
  }
  function showError(error) { status.textContent = error?.message || String(error); }
  function renderHistory() {
    conversationsSelect.replaceChildren(...conversations.map(item => { const option = el('option', '', item.title); option.value = item.id; return option; }));
    conversationsSelect.value = active.id;
  }
  conversationsSelect.onchange = () => { active = conversations.find(item => item.id === conversationsSelect.value); renderMessages(); };
  function renderMessages() {
    messages.replaceChildren();
    if (!active?.messages.length) messages.append(el('div', 'ai-empty', 'Создайте презентацию с нуля или попросите изменить выбранный слайд. Небольшие правки можно отменить, крупные изменения сначала появятся в предпросмотре.'));
    for (const message of active?.messages || []) {
      const bubble = el('article', `ai-message ai-message-${message.role}`);
      bubble.append(el('b', 'ai-message-author', message.role === 'user' ? 'Вы' : 'Codex'), el('div', 'ai-message-text', message.text || ''));
      if (message.attachments?.length) bubble.append(el('small', '', message.attachments.map(file => file.name).join(', ')));
      if (message.proposal) renderProposal(bubble, message);
      messages.append(bubble);
    }
    messages.scrollTop = messages.scrollHeight;
  }
  function renderProposal(bubble, message) {
    const proposal = message.proposal;
    const card = el('div', 'ai-proposal');
    card.append(el('strong', '', proposal.summary || 'Изменения презентации'));
    const slides = proposal.deck?.slides || proposal.preview?.slides;
    if (slides?.length) {
      const overview = el('div', 'ai-slide-previews');
      slides.slice(0, 30).forEach((slide, index) => {
        const thumb = el('div', 'ai-slide-preview');
        thumb.style.background = /^#[\da-f]{3,8}$/i.test(slide.background || '') ? slide.background : '#fff';
        thumb.title = `Слайд ${index + 1}`;
        thumb.setAttribute('aria-label', `Предпросмотр слайда ${index + 1}`);
        const canvas = el('div', 'ai-preview-canvas');
        for (const item of (slide.elements || []).slice(0, 150)) {
          const object = el('div', 'ai-preview-object');
          const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
          Object.assign(object.style, { left: `${number(item.x) / 12.8}%`, top: `${number(item.y) / 7.2}%`, width: `${number(item.w, 100) / 12.8}%`, height: `${number(item.h, 50) / 7.2}%`, transform: `rotate(${number(item.rotation)}deg)`, opacity: String(number(item.opacity, 1)) });
          if (item.type === 'text') {
            object.textContent = String(item.text || '').slice(0, 2000);
            Object.assign(object.style, { fontSize: `${number(item.fontSize, 24) / 12.8}cqw`, color: item.color || '#222', fontWeight: item.bold ? 'bold' : 'normal', textAlign: item.align || 'left', fontStyle: item.italic ? 'italic' : 'normal' });
          } else if (item.type === 'image' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(item.src || '')) {
            const image = el('img'); image.src = item.src; image.alt = ''; object.append(image);
          } else {
            object.style.background = item.fill || 'transparent';
            object.style.borderRadius = item.type === 'ellipse' ? '50%' : '0';
            if (item.stroke) object.style.border = `1px solid ${item.stroke}`;
          }
          canvas.append(object);
        }
        thumb.append(canvas);
        overview.append(thumb);
      });
      card.append(overview);
    }
    if (message.proposalState) card.append(el('span', 'ai-proposal-state', message.proposalState));
    else {
      const row = el('div', 'ai-proposal-actions');
      row.append(button('Применить изменения', async () => apply(message), 'Применить'), button('Отклонить изменения', async () => { try { await adapter.rejectProposal?.(proposal); message.proposalState = 'Отклонено'; renderMessages(); save(); } catch (error) { showError(error); } }, 'Отклонить'));
      card.append(row);
    }
    if (message.proposalState === 'Применено' && !message.proposalRestored) card.append(button('Отменить изменения', async () => { try { await adapter.undo(message.proposal); message.proposalState = 'Отменено'; renderMessages(); save(); } catch (error) { showError(error); } }, 'Отменить'));
    bubble.append(card);
  }
  async function apply(message) {
    try { await adapter.applyProposal(message.proposal); message.proposalState = 'Применено'; renderMessages(); save(); } catch (error) { showError(error); }
  }
  async function save() {
    const snapshot = { documentId, conversations: conversations.map(conversation => ({ ...conversation, messages: conversation.messages.map(message => message.proposal ? { ...message, proposal: { id: message.proposal.id, summary: message.proposal.summary }, proposalRestored: true, proposalState: message.proposalState || 'Предпросмотр завершён — запросите изменения повторно' } : message) })) };
    try {
      if (bridge?.historySave) await bridge.historySave(snapshot);
      else localStorage.setItem(`presentation-ai:${documentId}`, JSON.stringify(snapshot.conversations));
    } catch (error) { status.textContent = `История не сохранена: ${error.message}`; }
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
  async function syncDocument() {
    const nextId = adapter.getDocumentId();
    if (nextId === documentId) return;
    const generation = ++historyGeneration;
    if (busy) { try { await bridge?.stop({ conversationId: active.id }); } catch {} setBusy(false); }
    if (generation !== historyGeneration) return;
    clearTimeout(saveTimer);
    if (documentId) await save();
    if (generation !== historyGeneration) return;
    documentId = nextId; streaming = null; attachments = []; renderAttachments();
    try {
      const result = bridge?.historyLoad ? await bridge.historyLoad({ documentId }) : JSON.parse(localStorage.getItem(`presentation-ai:${documentId}`) || '[]');
      if (generation !== historyGeneration) return;
      conversations = Array.isArray(result) ? result : result?.conversations || [];
    } catch { conversations = []; }
    if (!conversations.length) conversations = [makeConversation()];
    active = conversations.at(-1); renderHistory(); renderMessages();
  }
  async function pickAttachments() {
    if (!bridge?.pickAttachments) { status.textContent = 'Вложения доступны в настольном приложении'; return; }
    try { const result = await bridge.pickAttachments(); attachments.push(...await prepareAttachments(Array.isArray(result) ? result : result?.files || [])); renderAttachments(); } catch (error) { showError(error); }
  }
  function renderAttachments() {
    attachmentsList.replaceChildren(...attachments.map((file, index) => {
      const row = el('div', 'ai-attachment');
      row.append(button(`Убрать ${file.name}`, () => { attachments.splice(index, 1); renderAttachments(); }, `${file.name} ×`));
      if (file.dataUrl) {
        const label = el('label', 'ai-image-analysis');
        const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(file.analyzeImage);
        checkbox.onchange = () => { file.analyzeImage = checkbox.checked; };
        label.append(checkbox, document.createTextNode('Анализировать изображение (расходует больше лимита)')); row.append(label);
      }
      return row;
    }));
  }
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy || !connected || !input.value.trim()) return;
    await syncDocument();
    const prompt = input.value.trim();
    const requestAttachments = attachments;
    adapter.setAttachments?.(requestAttachments);
    active.messages.push({ role: 'user', text: prompt, attachments: requestAttachments.map(({ name }) => ({ name })) });
    if (active.title === 'Новый разговор') active.title = prompt.slice(0, 45);
    streaming = { role: 'assistant', text: '' }; active.messages.push(streaming);
    input.value = ''; attachments = []; renderAttachments(); renderHistory(); renderMessages(); setBusy(true); await save();
    try {
      const result = await bridge.send({ documentId, conversationId: active.id, prompt, mode: mode.value, attachments: requestAttachments, context: adapter.getContext() });
      if (result?.text && streaming && !streaming.text) streaming.text = result.text;
      if (result?.proposal) await receiveProposal(result.proposal);
      if (result?.done) { setBusy(false); streaming = null; }
      renderMessages(); scheduleSave();
    } catch (error) {
      if (streaming) streaming.text += `\n${error.message}`;
      showError(error); streaming = null; setBusy(false); renderMessages(); save();
    }
  };
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
  async function receiveProposal(proposal) {
    const message = { role: 'assistant', text: '', proposal, ...(proposal.alreadyApplied ? { proposalState: 'Применено' } : {}) }; active.messages.push(message);
    if (proposal.requiresApproval === false && !proposal.alreadyApplied) await apply(message);
    renderMessages(); scheduleSave();
  }
  const unsubscribeEvents = bridge?.onEvent?.(async event => {
    if (event.type === 'connection') { updateConnection(event); return; }
    if (event.conversationId && event.conversationId !== active?.id) return;
    if (event.type === 'delta') { if (!streaming) { streaming = { role: 'assistant', text: '' }; active.messages.push(streaming); } streaming.text += event.text || ''; renderMessages(); scheduleSave(); }
    if (event.type === 'status') status.textContent = event.text || event.message || 'Выполнение…';
    if (event.type === 'proposal') await receiveProposal(event.proposal);
    if (event.type === 'usage') {
      const total = event.usage?.total?.totalTokens ?? event.usage?.totalTokens;
      if (Number.isFinite(total)) { usage.hidden = false; usage.textContent = `Использовано в разговоре: ${total.toLocaleString('ru-RU')} токенов`; }
    }
    if (event.type === 'error') { showError(event); setBusy(false); streaming = null; save(); }
    if (event.type === 'done') { status.textContent = event.cancelled ? 'Остановлено' : 'Готово'; setBusy(false); streaming = null; save(); }
  });
  const setWidth = value => { width = Math.max(320, Math.min(value, window.innerWidth - 300, 680)); document.documentElement.style.setProperty('--ai-panel-width', `${width}px`); window.dispatchEvent(new Event('resize')); };
  handle.onpointerdown = event => {
    handle.setPointerCapture(event.pointerId);
    handle.onpointermove = move => setWidth(window.innerWidth - move.clientX);
    handle.onpointerup = () => { handle.onpointermove = null; };
  };
  handle.onkeydown = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidth(width + (event.key === 'ArrowLeft' ? 20 : -20)); } };
  const unsubscribeDocument = adapter.subscribe?.(event => {
    if (event?.type === 'proposal') { receiveProposal(event.proposal); return; }
    syncDocument();
  });
  syncDocument(); updateConnection(null);
  bridge?.status?.().then(updateConnection).catch(showError);
  return { refresh: syncDocument, open: () => setOpen(true), receiveProposal, destroy() { clearTimeout(saveTimer); unsubscribeEvents?.(); unsubscribeDocument?.(); host.remove(); toggle.remove(); document.body.classList.remove('ai-open'); } };
}
