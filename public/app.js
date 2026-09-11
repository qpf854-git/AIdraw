// QMind frontend: AI chat + draw.io embed (JSON postMessage protocol)
const DRAWIO_URL =
  'https://embed.diagrams.net/?embed=1&proto=json&ui=dark&libraries=1&noSaveBtn=1&noExitBtn=1&saveAndExit=0&spin=1&modified=0';
const DRAWIO_ORIGIN = 'https://embed.diagrams.net';

const el = {
  iframe: document.getElementById('drawio'),
  overlay: document.getElementById('overlay'),
  messages: document.getElementById('messages'),
  prompt: document.getElementById('prompt'),
  sendBtn: document.getElementById('sendBtn'),
  presets: document.querySelectorAll('.preset'),
  status: document.getElementById('status'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  modelTag: document.getElementById('modelTag'),
  turnCount: document.getElementById('turnCount'),
  fitBtn: document.getElementById('fitBtn'),
  zoomInBtn: document.getElementById('zoomInBtn'),
  zoomOutBtn: document.getElementById('zoomOutBtn'),
  exportBtn: document.getElementById('exportBtn'),
  clearBtn: document.getElementById('clearBtn'),
};

const state = {
  ready: false,        // draw.io iframe sent init
  busy: false,         // generating
  currentXml: '',     // last loaded diagram XML
  history: [],          // [{role, content}] sent to model
  turns: 0,
  pendingLoad: null,   // xml to load once iframe becomes ready
  exportResolvers: new Map(),
};

const PRESETS = {
  flowchart: '画一个用户登录流程图：开始 → 输入账号密码 → 验证码校验 → 判断是否正确 → 成功进入首页 / 失败重试(最多3次) → 锁定账号',
  mindmap: '画一个关于「前端性能优化」的思维导图：中心主题为前端性能优化，分支包括加载优化、渲染优化、资源优化、网络优化，每个分支再展开 2-3 个子项',
  architecture: '画一个微服务架构图：客户端 → API 网关 → 鉴权服务 / 订单服务 / 商品服务；订单服务连接 MySQL 和 Redis；商品服务连接 Elasticsearch；包含消息队列 Kafka',
  er: '画一个电商数据库 ER 图：包含用户、订单、商品、订单项四张表，标出主键与外键关系',
};

// ---------- status helpers ----------
function setStatus(kind, text) {
  el.status.classList.remove('ok', 'busy', 'err');
  if (kind) el.status.classList.add(kind);
  el.statusText.textContent = text;
}

// ---------- chat UI ----------
function addMessage(role, text, { error = false, pending = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}${error ? ' error' : ''}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (pending) {
    bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  } else {
    bubble.textContent = text;
  }
  wrap.appendChild(bubble);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = role === 'user' ? '你' : 'AI';
  wrap.appendChild(meta);
  el.messages.appendChild(wrap);
  el.messages.scrollTop = el.messages.scrollHeight;
  return { wrap, bubble };
}

function finalizePending(ref, text, { error = false } = {}) {
  if (!ref) return;
  ref.bubble.textContent = text;
  if (error) ref.wrap.classList.add('error');
  el.messages.scrollTop = el.messages.scrollHeight;
}

// ---------- draw.io iframe protocol ----------
function sendToDrawio(obj) {
  el.iframe.contentWindow.postMessage(JSON.stringify(obj), DRAWIO_ORIGIN);
}

function requestCurrentXml() {
  return new Promise((resolve) => {
    if (!state.ready) { resolve(''); return; }
    const id = 'exp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    state.exportResolvers.set(id, resolve);
    sendToDrawio({ action: 'export', format: 'xml', spinKey: id });
    // Fallback if no answer in 3s
    setTimeout(() => {
      if (state.exportResolvers.has(id)) {
        state.exportResolvers.delete(id);
        resolve(state.currentXml || '');
      }
    }, 3000);
  });
}

function loadXmlIntoDrawio(xml) {
  if (!xml) return;
  state.currentXml = xml;
  if (state.ready) {
    sendToDrawio({ action: 'load', xml });
  } else {
    state.pendingLoad = xml;
  }
}

window.addEventListener('message', (e) => {
  if (e.origin !== DRAWIO_ORIGIN) return;
  let msg;
  try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; }
  catch { return; }
  if (!msg || typeof msg !== 'object') return;

  if (msg.event === 'init' || msg.event === 'ready') {
    if (!state.ready) {
      state.ready = true;
      el.overlay.classList.add('hidden');
      setStatus('ok', '就绪');
      if (state.pendingLoad) {
        sendToDrawio({ action: 'load', xml: state.pendingLoad });
        state.pendingLoad = null;
      }
    }
    return;
  }
  if (msg.event === 'export') {
    const dataXml = typeof msg.data === 'string' ? msg.data : '';
    // resolve any pending export promise (we only keep one at a time in practice)
    for (const [id, resolve] of state.exportResolvers) {
      state.exportResolvers.delete(id);
      resolve(dataXml);
      break;
    }
    return;
  }
  if (msg.event === 'save') {
    if (msg.xml) state.currentXml = msg.xml;
    return;
  }
  // status messages (loading etc.) - ignore
});

// ---------- generation flow ----------
async function generate(userText) {
  if (state.busy) return;
  if (!userText.trim()) return;

  state.busy = true;
  el.sendBtn.disabled = true;
  setStatus('busy', '生成中…');

  addMessage('user', userText);
  const pending = addMessage('assistant', '', { pending: true });

  // grab current diagram XML so AI can modify it
  const currentXml = await requestCurrentXml();
  let userContent = userText;
  if (currentXml) {
    userContent =
      userText +
      '\n\n[Current diagram XML — modify this and return the full updated XML]:\n' +
      currentXml;
  }

  state.history.push({ role: 'user', content: userContent });

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.history }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error || `HTTP ${resp.status}`);
    }
    const xml = data.xml || '';
    if (!xml) {
      throw new Error('AI 未返回有效 XML');
    }
    loadXmlIntoDrawio(xml);
    state.history.push({ role: 'assistant', content: xml });
    state.turns += 1;
    el.turnCount.textContent = `${state.turns} 轮`;
    finalizePending(pending, '已生成图表并加载到画布 ✦');
    setStatus('ok', '就绪');
  } catch (err) {
    finalizePending(pending, '生成失败：' + (err?.message || err), { error: true });
    setStatus('err', '生成失败');
    // drop the failed user turn so retry is clean
    state.history.pop();
  } finally {
    state.busy = false;
    el.sendBtn.disabled = false;
  }
}

// ---------- wire up UI ----------
function refreshSendState() {
  el.sendBtn.disabled = state.busy || !el.prompt.value.trim();
}

el.presets.forEach((b) =>
  b.addEventListener('click', () => {
    const key = b.dataset.preset;
    el.prompt.value = PRESETS[key] || '';
    refreshSendState();
    el.prompt.focus();
  })
);

el.prompt.addEventListener('input', () => {
  el.sendBtn.disabled = state.busy || !el.prompt.value.trim();
});
el.prompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!el.sendBtn.disabled) el.sendBtn.click();
  }
});

el.sendBtn.addEventListener('click', () => {
  const text = el.prompt.value;
  generate(text).then(() => {});
  el.prompt.value = '';
  el.sendBtn.disabled = true;
});

el.fitBtn.addEventListener('click', () => state.ready && sendToDrawio({ action: 'fit' }));
el.zoomInBtn.addEventListener('click', () => state.ready && sendToDrawio({ action: 'zoomIn' }));
el.zoomOutBtn.addEventListener('click', () => state.ready && sendToDrawio({ action: 'zoomOut' }));
el.exportBtn.addEventListener('click', () => state.ready && sendToDrawio({ action: 'export', format: 'png' }));
el.clearBtn.addEventListener('click', () => {
  if (!state.ready) return;
  const empty = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>`;
  loadXmlIntoDrawio(empty);
  state.currentXml = '';
});

// ---------- init ----------
el.iframe.src = DRAWIO_URL;
el.sendBtn.disabled = true;
fetch('/api/health').then(r => r.json()).then(h => {
  if (h?.model) el.modelTag.textContent = h.model;
}).catch(() => {});
setStatus('busy', '加载 draw.io…');
