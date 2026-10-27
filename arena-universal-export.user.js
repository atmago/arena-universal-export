// ==UserScript==
// @name         Arena Universal Markdown Export (Direct + Battle)
// @namespace    local.arena.universal-export
// @version      2.6.0
// @description  Export Arena chats and automatically hide the losing Battle answer with winner-only expanded reading and no nested answer scrolling (reversible).
// @author       atmago
// @license      MIT
// @homepageURL  https://github.com/atmago/arena-universal-export
// @supportURL   https://github.com/atmago/arena-universal-export/issues
// @downloadURL  https://raw.githubusercontent.com/atmago/arena-universal-export/main/arena-universal-export.user.js
// @updateURL    https://raw.githubusercontent.com/atmago/arena-universal-export/main/arena-universal-export.user.js
// @match        *://arena.ai/*
// @match        *://lmarena.ai/*
// @match        *://canaryarena.ai/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const BTN_ID = 'arena-universal-export-button';
  const HOST_ID = 'arena-universal-export-host';

  function getChatId() {
    const m = location.pathname.match(/\/(?:c|chat)\/([a-zA-Z0-9-]+)/);
    return m && m[1] !== 'new' ? m[1] : null;
  }

  function textOf(content) {
    if (content == null) return '';
    if (typeof content === 'string') return content.trim();
    if (typeof content === 'number' || typeof content === 'boolean') return String(content);

    if (Array.isArray(content)) {
      return content
        .map((x) => textOf(x))
        .filter(Boolean)
        .join('\n')
        .trim();
    }

    if (typeof content === 'object') {
      if (typeof content.text === 'string') return content.text.trim();
      if (typeof content.content === 'string') return content.content.trim();
      if (typeof content.value === 'string') return content.value.trim();
      if (Array.isArray(content.parts)) return textOf(content.parts);
      if (Array.isArray(content.content)) return textOf(content.content);

      // Common multimodal content objects: keep text and skip binary/URL-only payloads.
      const preferred = ['text', 'content', 'value', 'parts'];
      for (const key of preferred) {
        if (content[key] != null) {
          const t = textOf(content[key]);
          if (t) return t;
        }
      }

      try {
        return JSON.stringify(content, null, 2);
      } catch {
        return String(content);
      }
    }

    return String(content).trim();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>'"]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[c]));
  }

  function safeFilename(s) {
    return String(s || 'Arena_Chat')
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90) || 'Arena_Chat';
  }

  function download(name, body) {
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function makeHost() {
    let host = document.getElementById(HOST_ID);
    if (host) return host;
    host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    host.attachShadow({ mode: 'open' });
    return host;
  }

  function closeModal() {
    const host = document.getElementById(HOST_ID);
    if (host) host.remove();
  }

  function addStyles(root) {
    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after { box-sizing: border-box; }
      .overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.62); display: flex; align-items: center; justify-content: center; padding: 20px; color: #f5f5f5; font: 14px/1.45 system-ui, -apple-system, Segoe UI, sans-serif; }
      .panel { width: min(960px, 100%); max-height: min(88vh, 900px); display: flex; flex-direction: column; background: #202020; border: 1px solid #545454; border-radius: 15px; overflow: hidden; box-shadow: 0 18px 70px rgba(0,0,0,.55); }
      .header, .footer { padding: 14px 18px; background: #292929; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
      .header { border-bottom: 1px solid #414141; }
      .footer { border-top: 1px solid #414141; }
      .header h2 { margin: 0; font-size: 17px; }
      .note { margin: 3px 0 0; color: #bcbcbc; font-size: 12px; }
      .body { padding: 16px 18px 22px; overflow: auto; }
      .summary { border: 1px solid #444; border-radius: 12px; padding: 14px; background: #242424; }
      .summary p { margin: 6px 0; }
      .turn { border: 1px solid #444; border-radius: 12px; overflow: hidden; margin: 0 0 14px; background: #242424; }
      .turnTitle { padding: 10px 12px; font-weight: 700; background: #2d2d2d; border-bottom: 1px solid #444; }
      .choices { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px; }
      .choice { text-align: left; min-height: 124px; padding: 11px; color: #f4f4f4; background: #202020; border: 1px solid #4a4a4a; border-radius: 9px; cursor: pointer; transition: .12s ease; }
      .choice:hover { border-color: #8e8e8e; background: #292929; }
      .choice.selected { border-color: #39c56b; box-shadow: inset 0 0 0 1px #39c56b; background: #183522; }
      .choice strong { display: block; margin-bottom: 7px; }
      .preview { color: #c6c6c6; white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; }
      .row { display: flex; gap: 8px; padding: 0 12px 12px; }
      button { border: 1px solid #5a5a5a; border-radius: 8px; padding: 8px 12px; cursor: pointer; color: #eee; background: #333; font: inherit; }
      button:hover { background: #404040; }
      .primary { background: #168947; border-color: #39c56b; font-weight: 650; }
      .primary:hover { background: #1aa354; }
      .muted { color: #bbb; font-size: 12px; }
      code { color: #cfe9d6; }
      @media (max-width: 700px) { .choices { grid-template-columns: 1fr; } .footer { align-items: flex-start; flex-direction: column; } }
    `;
    root.appendChild(style);
  }

  function getMessages(data) {
    const candidates = [
      data?.messages,
      data?.evaluation?.messages,
      data?.data?.messages,
      data?.chat?.messages,
      data?.conversation?.messages,
    ];
    return candidates.find(Array.isArray) || [];
  }

  function getTitle(data, messages) {
    const directTitle = data?.title || data?.evaluation?.title || data?.chat?.title || data?.conversation?.title;
    if (directTitle) return textOf(directTitle);
    const firstUser = messages.find((m) => normalizeRole(m?.role) === 'user');
    const t = textOf(firstUser?.content || firstUser?.message || firstUser?.text);
    return t ? t.slice(0, 70) : 'Arena_Chat';
  }

  function normalizeRole(role) {
    const r = String(role || '').toLowerCase();
    if (['user', 'human'].includes(r)) return 'user';
    if (['assistant', 'model', 'bot'].includes(r)) return 'assistant';
    if (r === 'system') return 'system';
    return r;
  }

  function messageText(msg) {
    return textOf(msg?.content ?? msg?.message ?? msg?.text ?? msg?.parts ?? '');
  }

  function cleanModelValue(value) {
    if (value == null) return '';
    if (typeof value === 'object') {
      const nested = value.displayName ?? value.display_name ?? value.modelName ?? value.model_name ?? value.name ?? value.slug ?? value.id;
      if (nested != null && nested !== value) return cleanModelValue(nested);
      return '';
    }
    const s = String(value)
      .replace(/\s+/g, ' ')
      .replace(/^model\s*[:：]\s*/i, '')
      .trim();
    if (!s || s.length > 140) return '';
    if (/^(unknown|null|undefined|direct|battle|assistant|model)$/i.test(s)) return '';
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s)) return '';
    if (/^https?:\/\//i.test(s)) return '';
    return s;
  }

  function uniqueModels(values) {
    const out = [];
    const seen = new Set();
    for (const raw of values) {
      const value = cleanModelValue(raw);
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
    return out;
  }

  function getMessageModelName(msg) {
    const candidates = [
      msg?.modelDisplayName,
      msg?.model_display_name,
      msg?.modelName,
      msg?.model_name,
      msg?.model?.displayName,
      msg?.model?.display_name,
      msg?.model?.name,
      msg?.model,
      msg?.metadata?.modelDisplayName,
      msg?.metadata?.model_display_name,
      msg?.metadata?.modelName,
      msg?.metadata?.model_name,
      msg?.metadata?.model?.displayName,
      msg?.metadata?.model?.name,
      msg?.metadata?.model,
      msg?.participant?.modelDisplayName,
      msg?.participant?.modelName,
      msg?.participant?.model?.name,
      msg?.participant?.name,
      msg?.endpoint?.modelDisplayName,
      msg?.endpoint?.modelName,
      msg?.endpoint?.model?.name,
      msg?.responseMetadata?.modelName,
      msg?.response_metadata?.model_name,
    ];
    return uniqueModels(candidates)[0] || '';
  }

  function collectModelishFields(obj, out, depth = 0, seen = new WeakSet()) {
    if (!obj || typeof obj !== 'object' || depth > 5 || seen.has(obj)) return;
    seen.add(obj);

    for (const [key, value] of Object.entries(obj)) {
      const k = key.toLowerCase();
      // Do not recursively scan the actual conversation body: it can contain arbitrary model names in prose.
      if (['messages', 'content', 'text', 'message', 'prompt', 'answer', 'response', 'parts'].includes(k)) continue;

      const looksModelish =
        k.includes('model') ||
        /participant.*name/.test(k) ||
        /endpoint.*name/.test(k);

      if (looksModelish && (typeof value === 'string' || typeof value === 'number')) {
        const cleaned = cleanModelValue(value);
        if (cleaned) out.push(cleaned);
      } else if (looksModelish && value && typeof value === 'object') {
        const cleaned = cleanModelValue(value);
        if (cleaned) out.push(cleaned);
      }

      if (value && typeof value === 'object') {
        collectModelishFields(value, out, depth + 1, seen);
      }
    }
  }

  function looksLikeVisibleModelName(text) {
    const s = cleanModelValue(text);
    if (!s || s.length < 3 || s.length > 120) return false;
    return /(claude|fable|opus|sonnet|haiku|gpt|o[1-9](?:\b|-)|gemini|gemma|grok|qwen|llama|deepseek|kimi|mistral|mixtral|command|cohere|glm|nemotron|yi[- ]|phi[- ]|minimax|step[- ]|ernie|doubao|hunyuan|internlm|falcon|dbrx|wizard|vicuna|arena)/i.test(s);
  }

  function getDomModelNames() {
    const candidates = [];
    const selectors = [
      '[data-testid*="model" i]',
      '[aria-label*="model" i]',
      '[title*="model" i]',
      '[class*="model" i]',
      'button',
      '[role="button"]',
      '[role="combobox"]'
    ];

    const nodes = document.querySelectorAll(selectors.join(','));
    for (const el of nodes) {
      const vals = [el.textContent, el.getAttribute?.('aria-label'), el.getAttribute?.('title')];
      for (const v of vals) {
        const s = cleanModelValue(v);
        if (looksLikeVisibleModelName(s)) candidates.push(s);
      }
    }
    return uniqueModels(candidates).slice(0, 4);
  }

  function getModelInfo(data, messages) {
    // 1) Highest confidence: model attached to each assistant message.
    const perMessage = uniqueModels(
      messages
        .filter((m) => normalizeRole(m?.role) === 'assistant')
        .map(getMessageModelName)
    );
    if (perMessage.length) {
      return { names: perMessage, display: perMessage.join(' / '), source: 'assistant message metadata' };
    }

    // 2) Known conversation-level fields seen in Arena variants.
    const directCandidates = [
      data?.modelDisplayName,
      data?.model_display_name,
      data?.modelName,
      data?.model_name,
      data?.model?.displayName,
      data?.model?.display_name,
      data?.model?.name,
      data?.model,
      data?.modelAName,
      data?.model_a_name,
      data?.modelA?.displayName,
      data?.modelA?.name,
      data?.evaluation?.modelDisplayName,
      data?.evaluation?.modelName,
      data?.evaluation?.modelAName,
      data?.evaluation?.modelA?.name,
      data?.metadata?.modelDisplayName,
      data?.metadata?.modelName,
      data?.metadata?.model,
      data?.conversation?.modelName,
      data?.conversation?.model?.name,
      data?.chat?.modelName,
      data?.chat?.model?.name,
    ];
    const direct = uniqueModels(directCandidates);
    if (direct.length) {
      return { names: direct, display: direct.join(' / '), source: 'conversation metadata' };
    }

    // 3) Schema-change fallback: recursively inspect model-related keys outside message bodies.
    const recursive = [];
    collectModelishFields(data, recursive);
    const rec = uniqueModels(recursive);
    if (rec.length) {
      return { names: rec.slice(0, 4), display: rec.slice(0, 4).join(' / '), source: 'model-related API fields' };
    }

    // 4) Last resort: read the currently visible model selector / buttons in the UI.
    const dom = getDomModelNames();
    if (dom.length) {
      return { names: dom, display: dom.join(' / '), source: 'visible Arena UI' };
    }

    return { names: [], display: '', source: 'not found' };
  }

  function buildBattleGroups(messages) {
    const parentMap = new Map();
    messages.forEach((msg, index) => {
      if (normalizeRole(msg?.role) !== 'assistant') return;
      const parentId = msg?.parentMessageIds?.[0] ?? msg?.parentMessageId ?? msg?.parent_id;
      if (!parentId) return;
      const arr = parentMap.get(parentId) || [];
      arr.push({ msg, index });
      parentMap.set(parentId, arr);
    });

    const groups = [];
    for (const [parentId, arr] of parentMap) {
      const a = arr.find((x) => String(x.msg?.participantPosition || x.msg?.participant_position || '').toLowerCase() === 'a');
      const b = arr.find((x) => String(x.msg?.participantPosition || x.msg?.participant_position || '').toLowerCase() === 'b');
      if (a && b) groups.push({ parentId, a, b, index: Math.min(a.index, b.index) });
    }

    return groups
      .sort((x, y) => x.index - y.index)
      .map((g, i) => ({ ...g, turn: i + 1 }));
  }

  function detectMode(data, messages, groups) {
    const declared = String(
      data?.mode || data?.evaluation?.mode || data?.metadata?.mode || ''
    ).toLowerCase();
    if (declared === 'direct' || declared === 'battle') return declared;
    return groups.length > 0 ? 'battle' : 'direct';
  }

  function buildDirectMarkdown(data, messages) {
    const title = getTitle(data, messages);
    const modelInfo = getModelInfo(data, messages);
    const modelName = modelInfo.display;
    const usable = messages.filter((m) => ['user', 'assistant', 'system'].includes(normalizeRole(m?.role)) && messageText(m));

    let md = `# ${title}\n\n`;
    md += `> **Provider:** Arena Direct Mode  \n`;
    if (modelName) md += `> **Model:** ${modelName}  \n`;
    md += `> **Model detection:** ${modelInfo.source}  \n`;
    md += `> **Exported:** ${new Date().toLocaleString()}  \n`;
    md += `> **Source:** ${location.href}\n\n---\n\n`;

    let turn = 0;
    for (const msg of usable) {
      const role = normalizeRole(msg?.role);
      const text = messageText(msg);
      if (!text) continue;

      if (role === 'user') {
        turn += 1;
        md += `## 用户${turn ? ` · 第 ${turn} 轮` : ''}\n\n${text}\n\n---\n\n`;
      } else if (role === 'assistant') {
        const perMessageModel = getMessageModelName(msg) || modelName;
        md += `## 助手${perMessageModel ? `（${perMessageModel}）` : ''}${turn ? ` · 第 ${turn} 轮` : ''}\n\n${text}\n\n---\n\n`;
      } else if (role === 'system') {
        md += `## System\n\n${text}\n\n---\n\n`;
      }
    }

    return { title, modelName, modelInfo, markdown: md, count: usable.length };
  }

  function createDirectModal(data, messages) {
    closeModal();
    const host = makeHost();
    const root = host.shadowRoot;
    addStyles(root);

    const built = buildDirectMarkdown(data, messages);
    const userCount = messages.filter((m) => normalizeRole(m?.role) === 'user' && messageText(m)).length;
    const assistantCount = messages.filter((m) => normalizeRole(m?.role) === 'assistant' && messageText(m)).length;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });

    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="header">
        <div>
          <h2>导出 Direct 对话</h2>
          <p class="note">已识别为 Direct 模式，不再查找 A/B Battle 回答。</p>
        </div>
        <button type="button" class="close">关闭</button>
      </div>
      <div class="body">
        <div class="summary">
          <p><strong>标题：</strong>${escapeHtml(built.title)}</p>
          <p><strong>模型：</strong>${escapeHtml(built.modelName || '未识别')}</p>
          <p><strong>识别来源：</strong>${escapeHtml(built.modelInfo?.source || 'unknown')}</p>
          <p><strong>消息：</strong>${userCount} 条用户消息 + ${assistantCount} 条助手消息</p>
          <p class="muted">将按 Arena API 返回的消息顺序完整导出为 Markdown。</p>
        </div>
      </div>
      <div class="footer">
        <span class="muted">Direct 模式：无需选择胜出回答。</span>
        <div><button type="button" class="cancel">取消</button> <button type="button" class="primary export">导出 Markdown</button></div>
      </div>`;

    panel.querySelector('.close').addEventListener('click', closeModal);
    panel.querySelector('.cancel').addEventListener('click', closeModal);
    panel.querySelector('.export').addEventListener('click', () => {
      if (!userCount && !assistantCount) {
        alert('没有找到可导出的用户/助手消息。');
        return;
      }
      download(`${safeFilename(`${built.modelName || 'UnknownModel'} - ${built.title}`)}_direct.md`, built.markdown);
      closeModal();
    });

    overlay.appendChild(panel);
    root.appendChild(overlay);
  }

  function createBattleModal(data, messages, groups) {
    closeModal();
    const host = makeHost();
    const root = host.shadowRoot;
    addStyles(root);

    const choices = new Map();
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });

    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="header">
        <div>
          <h2>导出 Battle 对话：只保留你选中的回答</h2>
          <p class="note">左侧 = Arena 的 A；右侧 = Arena 的 B。每轮选择 A、B，或两边都保留。</p>
        </div>
        <button type="button" class="close">关闭</button>
      </div>
      <div class="body"></div>
      <div class="footer">
        <span class="muted status">共 ${groups.length} 个 Battle 回合；尚未选择。</span>
        <div><button type="button" class="cancel">取消</button> <button type="button" class="primary export">导出 Markdown</button></div>
      </div>`;

    const body = panel.querySelector('.body');
    const status = panel.querySelector('.status');

    function update() {
      status.textContent = `共 ${groups.length} 个 Battle 回合；已选择 ${choices.size}/${groups.length}。`;
      for (const card of body.querySelectorAll('.turn')) {
        const parentId = card.dataset.parentId;
        const selected = choices.get(parentId);
        for (const button of card.querySelectorAll('.choice')) {
          button.classList.toggle('selected', button.dataset.choice === selected);
        }
      }
    }

    groups.forEach((group) => {
      const card = document.createElement('article');
      card.className = 'turn';
      card.dataset.parentId = group.parentId;
      const aText = messageText(group.a.msg);
      const bText = messageText(group.b.msg);
      const aModel = getMessageModelName(group.a.msg);
      const bModel = getMessageModelName(group.b.msg);
      card.innerHTML = `
        <div class="turnTitle">第 ${group.turn} 个 Battle 回合</div>
        <div class="choices">
          <button type="button" class="choice" data-choice="a"><strong>保存左侧回答（A${aModel ? ` · ${escapeHtml(aModel)}` : ''}）</strong><div class="preview">${escapeHtml(aText || '（无文本）')}</div></button>
          <button type="button" class="choice" data-choice="b"><strong>保存右侧回答（B${bModel ? ` · ${escapeHtml(bModel)}` : ''}）</strong><div class="preview">${escapeHtml(bText || '（无文本）')}</div></button>
        </div>
        <div class="row"><button type="button" data-choice="both">两边都保留</button></div>`;

      card.addEventListener('click', (event) => {
        const choiceButton = event.target.closest('[data-choice]');
        if (!choiceButton) return;
        choices.set(group.parentId, choiceButton.dataset.choice);
        update();
      });
      body.appendChild(card);
    });

    panel.querySelector('.close').addEventListener('click', closeModal);
    panel.querySelector('.cancel').addEventListener('click', closeModal);
    panel.querySelector('.export').addEventListener('click', () => {
      const unresolved = groups.filter((g) => !choices.has(g.parentId));
      if (unresolved.length) {
        alert(`还有 ${unresolved.length} 个 Battle 回合没有选择。`);
        return;
      }

      const lookup = new Map(groups.map((g) => [g.parentId, choices.get(g.parentId)]));
      const indexToTurn = new Map(groups.flatMap((g) => [[g.a.index, g.turn], [g.b.index, g.turn]]));
      const title = getTitle(data, messages);
      const modelInfo = getModelInfo(data, messages);
      let md = `# ${title}\n\n`;
      md += `> **Provider:** Arena Battle Mode  \n`;
      if (modelInfo.display) md += `> **Models:** ${modelInfo.display}  \n`;
      md += `> **Model detection:** ${modelInfo.source}  \n> **Exported:** ${new Date().toLocaleString()}  \n> **Source:** ${location.href}\n\n---\n\n`;

      messages.forEach((msg, index) => {
        const role = normalizeRole(msg?.role);
        const text = messageText(msg);
        if (!text) return;

        if (role === 'user') {
          md += `## 用户\n\n${text}\n\n---\n\n`;
          return;
        }
        if (role !== 'assistant') return;

        const parentId = msg?.parentMessageIds?.[0] ?? msg?.parentMessageId ?? msg?.parent_id;
        const chosen = lookup.get(parentId);
        const isBattle = chosen !== undefined;
        const side = String(msg?.participantPosition || msg?.participant_position || '').toLowerCase();
        if (isBattle && chosen !== 'both' && side !== chosen) return;

        const turn = indexToTurn.get(index);
        const perMessageModel = getMessageModelName(msg);
        const label = isBattle
          ? `助手（第 ${turn} 个 Battle 回合 · ${side === 'a' ? '左侧 / A' : '右侧 / B'}${perMessageModel ? ` · ${perMessageModel}` : ''}）`
          : `助手${perMessageModel ? `（${perMessageModel}）` : ''}`;
        md += `## ${label}\n\n${text}\n\n---\n\n`;
      });

      download(`${safeFilename(`${modelInfo.display || 'ArenaBattle'} - ${title}`)}_battle-selected.md`, md);
      closeModal();
    });

    overlay.appendChild(panel);
    root.appendChild(overlay);
  }

  async function fetchEvaluation(chatId) {
    // The endpoint used by the previous script still works for saved chats on Arena/LMArena.
    // Keep the retrieval logic isolated so it is easy to update if Arena changes its routes again.
    const urls = [
      `/api/evaluation/${encodeURIComponent(chatId)}`,
      `/nextjs-api/evaluation/${encodeURIComponent(chatId)}`,
    ];

    let lastError = null;
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          lastError = new Error(`${url} returned ${response.status}`);
          continue;
        }
        const data = await response.json();
        const messages = getMessages(data);
        if (messages.length) return { data, messages };
        lastError = new Error(`${url} returned JSON but no messages`);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Unable to load Arena evaluation');
  }

  async function exportConversation() {
    const chatId = getChatId();
    if (!chatId) {
      alert('找不到当前聊天 ID。请先打开一段已经保存的 Arena 对话，再点击导出。');
      return;
    }

    const button = document.getElementById(BTN_ID);
    if (button) {
      button.disabled = true;
      button.textContent = '读取中…';
    }

    try {
      const { data, messages } = await fetchEvaluation(chatId);
      const groups = buildBattleGroups(messages);
      const mode = detectMode(data, messages, groups);

      if (mode === 'battle' && groups.length > 0) {
        createBattleModal(data, messages, groups);
      } else {
        createDirectModal(data, messages);
      }
    } catch (err) {
      console.error('[Arena universal export]', err);
      alert(
        `导出失败：${err?.message || err}\n\n` +
        '请确认：\n' +
        '1. 当前是已经保存的对话页面，不是 New Chat；\n' +
        '2. 你在 Arena 页面处于登录状态；\n' +
        '3. 刷新页面后再试一次。\n\n' +
        '如果仍失败，把浏览器开发者工具 Console 里的 [Arena universal export] 报错发给我。'
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '导出对话';
      }
    }
  }

  // ===== Arena Battle winner-only reading view (v2.6) =====
  // A visual, non-destructive layer. It does not change votes, API messages, or exports.
  const WINNER_BAR_ID = 'arena-winner-view-bar';
  const WINNER_KEY_V23 = 'arena-winner-manual-v24';
  const winnerChanges = new Map();
  let winnerActivePairs = [];
  let winnerRefreshTimer = 0;
  let winnerLastPath = location.pathname;
  let winnerRendering = false;
  let winnerWantedRefresh = false;
  let winnerControlsExpanded = false; // Default: minimal button; never cover the composer.

  function winnerChatKey() {
    return `${location.hostname}:${getChatId() || location.pathname}`;
  }

  function readWinnerPreferences() {
    try {
      const obj = JSON.parse(localStorage.getItem(WINNER_KEY_V23) || '{}');
      return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
  }

  function winnerPreferencesForChat() {
    const prefs = readWinnerPreferences()[winnerChatKey()];
    return prefs && typeof prefs === 'object' ? prefs : {};
  }

  function writeWinnerPreferences(prefs) {
    const data = readWinnerPreferences();
    data[winnerChatKey()] = prefs;
    const keys = Object.keys(data);
    for (const old of keys.slice(0, Math.max(0, keys.length - 100))) delete data[old];
    try { localStorage.setItem(WINNER_KEY_V23, JSON.stringify(data)); } catch (_) {}
  }

  // Only consider real answer cards. Their dimensions, shared parent and horizontal
  // alignment are more stable than Arena's frequently changing CSS class names.
  function isPluginElement(el) {
    return !!(el && el.closest && el.closest(`#${WINNER_BAR_ID},#${HOST_ID},#${BTN_ID}`));
  }

  function rectFor(el) {
    if (!el || !el.isConnected || el.hidden) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const display = getComputedStyle(el).display;
    if (display === 'none' || display === 'contents') return null;
    return rect;
  }

  function cardTextLength(el) {
    return ((el.innerText || el.textContent || '').trim()).length;
  }

  function rgbColor(value) {
    const m = String(value || '').match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i);
    if (!m) return null;
    return [+m[1], +m[2], +m[3]];
  }

  function isWinnerGreen(value) {
    const rgb = rgbColor(value);
    return !!rgb && rgb[1] >= 95 && rgb[1] > rgb[0] + 45 && rgb[1] > rgb[2] + 28 && rgb[1] > rgb[0] * 1.33;
  }

  function hasVisibleBorder(el) {
    const s = getComputedStyle(el);
    return ['Top','Right','Bottom','Left'].some(k =>
      parseFloat(s[`border${k}Width`]) >= .8 && s[`border${k}Style`] !== 'none') ||
      parseFloat(s.outlineWidth) >= 1 && s.outlineStyle !== 'none';
  }

  function directWinnerBorderScore(el) {
    const s = getComputedStyle(el);
    let n = 0;
    for (const side of ['Top','Right','Bottom','Left']) {
      if (parseFloat(s[`border${side}Width`]) >= .8 &&
          s[`border${side}Style`] !== 'none' && isWinnerGreen(s[`border${side}Color`])) n += 3;
    }
    if (parseFloat(s.outlineWidth) >= 1 && isWinnerGreen(s.outlineColor)) n += 8;
    // Tailwind rings and selected-state inset shadows sometimes use box-shadow.
    if (/rgba?\(/i.test(s.boxShadow || '') &&
        (s.boxShadow.match(/rgba?\([^)]*\)/g) || []).some(isWinnerGreen)) n += 6;
    if (/\b(?:border|ring|outline)-(?:green|emerald|lime)-(?:[3-9]\d\d)\b/.test(String(el.className || ''))) n += 6;
    return n;
  }

  function winnerMarkScore(panel) {
    // First test the answer-card border itself (the green outline shown after voting).
    let score = directWinnerBorderScore(panel);
    const panelRect = panel.getBoundingClientRect();
    // Arena may put the border on a wrapper directly *inside* the column.
    // Consider only similar-width wrappers; do not treat code examples as votes.
    const queue = [{ el: panel, depth: 0 }];
    let visited = 0;
    while (queue.length && visited++ < 70) {
      const {el, depth} = queue.shift();
      if (depth > 3) continue;
      if (el !== panel) {
        const r = el.getBoundingClientRect();
        const widthRatio = panelRect.width ? r.width / panelRect.width : 0;
        if (widthRatio >= .78 && r.height >= 110 && Math.abs(r.left - panelRect.left) < 90) {
          score = Math.max(score, directWinnerBorderScore(el) * (depth === 1 ? .95 : .8));
        }
      }
      if (depth < 3) {
        for (const ch of el.children) queue.push({el: ch, depth: depth + 1});
      }
    }
    // On some Arena variants only the model name turns green after the vote.
    // Limit this check to the first 100 pixels (header), not answer body text.
    for (const el of panel.querySelectorAll('span,strong,h1,h2,h3,p,div')) {
      const r = el.getBoundingClientRect();
      if (r.top - panelRect.top > 105) continue;
      const t = (el.textContent || '').trim();
      if (t.length < 3 || t.length > 75 || el.children.length > 2) continue;
      const style = getComputedStyle(el);
      if (isWinnerGreen(style.color) &&
          /(?:gpt|claude|gemini|grok|qwen|deepseek|llama|model|winner|胜出|获胜|优胜|获选|opus|sonnet)/i.test(t)) {
        score = Math.max(score, 4);
        break;
      }
    }
    return score;
  }

  function cardBorderQuality(el) {
    if (hasVisibleBorder(el)) return 2;
    const children = Array.from(el.children).slice(0, 4);
    return children.some(ch => {
      const r = ch.getBoundingClientRect();
      return r.width > el.getBoundingClientRect().width * .78 && hasVisibleBorder(ch);
    }) ? 1 : 0;
  }

  function discoverArenaAnswerPairs() {
    const screenWidth = document.documentElement.clientWidth || window.innerWidth;
    if (screenWidth < 560) return []; // Small screens are normally stacked, not dual-column.
    const minWidth = Math.max(210, screenWidth * .16);
    const candidates = [];
    const nodes = document.querySelectorAll('div,section,article,main');
    for (const parent of nodes) {
      if (!parent.isConnected || isPluginElement(parent)) continue;
      if (parent.children.length < 2 || parent.children.length > 9) continue;
      const parentRect = rectFor(parent);
      if (!parentRect || parentRect.width < screenWidth * .47) continue;
      const children = [];
      for (const child of parent.children) {
        if (isPluginElement(child) || child.matches('nav,aside,footer,header')) continue;
        const r = rectFor(child);
        if (!r || r.width < minWidth || r.width > screenWidth * .72 || r.height < 155) continue;
        if (r.bottom < 0 || r.top > window.innerHeight + 450) continue;
        const chars = cardTextLength(child);
        if (chars < 55 || chars > 220000) continue;
        if (child.querySelector('textarea,[contenteditable="true"],input[type="file"]')) continue;
        children.push({el: child, rect: r, chars});
      }
      if (children.length < 2) continue;
      for (let i = 0; i < children.length - 1; i++) {
        for (let j = i + 1; j < children.length; j++) {
          const left = children[i].rect.left <= children[j].rect.left ? children[i] : children[j];
          const right = left === children[i] ? children[j] : children[i];
          if (Math.abs(left.rect.top - right.rect.top) > 72) continue;
          if (left.rect.right > right.rect.left + 12) continue;
          if (right.rect.left - left.rect.right > Math.max(120, screenWidth * .12)) continue;
          const ratio = Math.min(left.rect.width, right.rect.width) / Math.max(left.rect.width, right.rect.width);
          if (ratio < .56) continue;
          const coverage = (left.rect.width + right.rect.width) / screenWidth;
          if (coverage < .46) continue;
          const lc = cardBorderQuality(left.el), rc = cardBorderQuality(right.el);
          const greenLeft = winnerMarkScore(left.el), greenRight = winnerMarkScore(right.el);
          const score = coverage * 6 + ratio * 3 + lc * 2 + rc * 2 +
            Math.min(12, greenLeft + greenRight) +
            (/grid|flex/.test(getComputedStyle(parent).display) ? 2 : 0) -
            (parent.children.length - 2) * .9;
          candidates.push({
            parent, left: left.el, right: right.el,
            leftRect: left.rect, rightRect: right.rect,
            greenLeft, greenRight, score
          });
        }
      }
    }
    candidates.sort((a,b) => b.score - a.score);
    const pairs = [];
    for (const pair of candidates) {
      if (pairs.some(p => p.parent.contains(pair.parent) || pair.parent.contains(p.parent))) continue;
      pairs.push(pair);
    }
    pairs.sort((a,b) => a.left.compareDocumentPosition(b.left) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return pairs.slice(-15);
  }

  function changeWinnerStyle(el, property, value) {
    if (!el || !el.isConnected) return;
    let properties = winnerChanges.get(el);
    if (!properties) {
      properties = new Map();
      winnerChanges.set(el, properties);
    }
    if (!properties.has(property)) {
      properties.set(property, { value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property) });
    }
    el.style.setProperty(property, value, 'important');
  }

  function restoreWinnerStyles() {
    for (const [el, props] of winnerChanges) {
      if (!el.isConnected) continue;
      for (const [property, old] of props) {
        if (old.value) el.style.setProperty(property, old.value, old.priority);
        else el.style.removeProperty(property);
      }
    }
    winnerChanges.clear();
  }

  function expandWinnerPresentation(pair, winner) {
    const vw = document.documentElement.clientWidth || window.innerWidth || 1600;
    const chain = [];
    for (let el = winner, depth = 0; el && depth < 7; el = el.parentElement, depth++) {
      if (!(el instanceof HTMLElement) || isPluginElement(el)) break;
      if (el === document.body || el === document.documentElement) break;
      const r = rectFor(el);
      if (!r || r.height < 70) continue;
      chain.push({ el, depth, rect: r });
      if (el === pair.parent || r.width >= vw * 0.88) break;
    }

    for (const item of chain) {
      const { el, depth, rect } = item;
      const style = getComputedStyle(el);
      if (style.display.includes('grid')) changeWinnerStyle(el, 'grid-template-columns', 'minmax(0, 1fr)');
      if (style.display.includes('flex')) {
        changeWinnerStyle(el, 'flex-wrap', 'wrap');
        changeWinnerStyle(el, 'justify-content', 'center');
      }
      if (depth <= 4 && rect.width < vw * 0.9) {
        changeWinnerStyle(el, 'width', '100%');
        changeWinnerStyle(el, 'max-width', 'none');
        changeWinnerStyle(el, 'min-width', '0');
      }
      if (depth <= 3 && rect.width < vw * 0.82) {
        changeWinnerStyle(el, 'margin-left', 'auto');
        changeWinnerStyle(el, 'margin-right', 'auto');
      }
    }

    changeWinnerStyle(winner, 'width', 'min(96vw, 1500px)');
    changeWinnerStyle(winner, 'max-width', 'min(96vw, 1500px)');
    changeWinnerStyle(winner, 'min-width', '0');
    changeWinnerStyle(winner, 'margin-left', 'auto');
    changeWinnerStyle(winner, 'margin-right', 'auto');
    changeWinnerStyle(winner, 'align-self', 'stretch');

    const winnerRect = winner.getBoundingClientRect();
    const surfaces = Array.from(winner.querySelectorAll('div,section,article')).filter(el => {
      if (isPluginElement(el)) return false;
      const r = rectFor(el);
      if (!r) return false;
      if (r.width < winnerRect.width * 0.68 || r.height < 120) return false;
      if (r.width > vw * 0.97) return false;
      const textLen = cardTextLength(el);
      if (textLen < 80) return false;
      return hasVisibleBorder(el) || !!el.querySelector('pre,code,p,table,button,svg');
    }).sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return (rb.width * rb.height) - (ra.width * ra.height);
    }).slice(0, 4);

    for (const shell of surfaces) {
      changeWinnerStyle(shell, 'width', '100%');
      changeWinnerStyle(shell, 'max-width', 'none');
      changeWinnerStyle(shell, 'min-width', '0');
      changeWinnerStyle(shell, 'margin-left', 'auto');
      changeWinnerStyle(shell, 'margin-right', 'auto');
    }
  }

  function unlockWinnerVerticalScroll(pair, winner) {
    // The surviving Arena card may still contain a scrollable "answer body" with
    // height: calc(100vh - ...), max-height, or overflow-y:auto.  Removing the
    // other card does NOT remove these constraints.  Expand the vertical
    // content flow instead, leaving the outer document's scrolling intact.
    //
    // Restore is tracked with changeWinnerStyle, so "双侧显示" returns to the
    // original layout. Do not affect code editors or horizontally scrollable
    // <pre> snippets inside the answer.
    const answerWidth = Math.max(1, winner.getBoundingClientRect().width);
    const skip = el => el.matches('pre,code,textarea,input,select,table,canvas,svg,[contenteditable="true"]') ||
      !!el.closest('pre,code,textarea,[contenteditable="true"]');
    const unlock = el => {
      changeWinnerStyle(el, 'height', 'auto');
      changeWinnerStyle(el, 'max-height', 'none');
      changeWinnerStyle(el, 'overflow', 'visible');
      changeWinnerStyle(el, 'min-height', '0');
    };

    // First collect scroll owners before touching styles. Nested clipping
    // containers must be expanded from innermost toward the outer answer card.
    const descendants = Array.from(winner.querySelectorAll('div,section,article,main'));
    const targets = [];
    for (const el of descendants) {
      if (!(el instanceof HTMLElement) || skip(el) || isPluginElement(el)) continue;
      const r = rectFor(el);
      if (!r || r.width < Math.min(answerWidth * .43, 360) || r.height < 55) continue;
      const overflow = Math.max(0, el.scrollHeight - el.clientHeight);
      if (overflow < 45) continue; // Not an actual clipped/scrollable answer region.
      const css = getComputedStyle(el);
      if (!/^(auto|scroll|hidden|clip)$/.test(css.overflowY)) continue;
      // Skip compact widgets/tables: remove scrolling only from large text
      // surfaces, not code fences or embedded components.
      if (cardTextLength(el) < 150) continue;
      targets.push(el);
    }
    for (const el of targets.reverse()) unlock(el);

    // Height constraints on the answer's wrappers can keep the whole card
    // viewport-sized even after the inner scroller becomes unbounded.
    let el = winner;
    let depth = 0;
    while (el && depth++ < 5 && el !== document.body && el !== document.documentElement) {
      if (el instanceof HTMLElement && !skip(el)) {
        changeWinnerStyle(el, 'height', 'auto');
        changeWinnerStyle(el, 'max-height', 'none');
        changeWinnerStyle(el, 'min-height', '0');
        if (el === winner || el.scrollHeight > el.clientHeight + 24 ||
            /^(auto|scroll|hidden|clip)$/.test(getComputedStyle(el).overflowY)) {
          changeWinnerStyle(el, 'overflow', 'visible');
            }
      }
      if (el === pair.parent) break;
      el = el.parentElement;
    }
  }

  function applyWinnerOnly(pair, side) {
    const loser = side === 'a' ? pair.right : pair.left;
    const winner = side === 'a' ? pair.left : pair.right;
    if (loser.parentElement !== winner.parentElement || !loser.isConnected || !winner.isConnected) return false;
    changeWinnerStyle(loser, 'display', 'none');
    // Grow the surviving answer to occupy the entire row in both Grid and Flex layouts.
    const style = getComputedStyle(pair.parent);
    if (style.display.includes('grid')) changeWinnerStyle(pair.parent, 'grid-template-columns', 'minmax(0, 1fr)');
    if (style.display.includes('flex')) changeWinnerStyle(pair.parent, 'justify-content', 'center');
    changeWinnerStyle(winner, 'width', '100%');
    changeWinnerStyle(winner, 'max-width', '100%');
    changeWinnerStyle(winner, 'flex', '1 1 100%');
    changeWinnerStyle(winner, 'grid-column', '1 / -1');
    expandWinnerPresentation(pair, winner);
    unlockWinnerVerticalScroll(pair, winner);
    return true;
  }

  function automaticWinner(pair) {
    // A GREEN highlight is not automatically a vote unless it is unique and strong.
    if (pair.greenLeft >= 4 && pair.greenLeft - pair.greenRight >= 3) return 'a';
    if (pair.greenRight >= 4 && pair.greenRight - pair.greenLeft >= 3) return 'b';
    return '';
  }

  function winnerPairKey(i) { return `visual-${i}`; }

  function setManualWinner(side, i) {
    const prefs = winnerPreferencesForChat();
    if (side === 'auto') delete prefs[winnerPairKey(i)];
    else prefs[winnerPairKey(i)] = side;
    writeWinnerPreferences(prefs);
    scheduleWinnerRefresh(35);
  }

  function setWinnerControlsExpanded(expanded) {
    winnerControlsExpanded = !!expanded;
    const bar = document.getElementById(WINNER_BAR_ID);
    if (!bar) return;
    const toggle = bar.querySelector('[data-winner-toggle]');
    const panel = bar.querySelector('[data-winner-controls]');
    if (panel) panel.style.display = winnerControlsExpanded ? 'flex' : 'none';
    if (toggle) {
      toggle.textContent = winnerControlsExpanded ? '胜者视图 ◂ 收起' : '胜者视图 ▸';
      toggle.setAttribute('aria-expanded', String(winnerControlsExpanded));
      toggle.title = winnerControlsExpanded ? '点击收起菜单' : '点击展开胜者视图菜单';
    }
  }

  function renderWinnerControls(pairs, states, hidden) {
    let bar = document.getElementById(WINNER_BAR_ID);
    if (!pairs.length && !Array.from(document.querySelectorAll('select')).some(s => s.value === 'battle')) {
      if (bar) bar.remove();
      winnerControlsExpanded = false;
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = WINNER_BAR_ID;
      // Anchor to the right edge at mid-screen, away from the Arena composer.
      // Only a small toggle is visible until deliberately expanded.
      Object.assign(bar.style, {
        position: 'fixed', right: '12px', top: '46%', bottom: 'auto',
        transform: 'translateY(-50%)', zIndex: '2147483645',
        display: 'flex', alignItems: 'center', padding: '0',
        background: 'transparent', color: '#fff',
        font: '12px system-ui,sans-serif',
      });
      document.body.appendChild(bar);
    }
    bar.replaceChildren();
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.setAttribute('data-winner-toggle', '');
    toggle.setAttribute('aria-controls', 'arena-winner-controls-panel');
    toggle.style.cssText = 'font:600 12px system-ui,sans-serif;white-space:nowrap;padding:9px 11px;border-radius:999px;border:1px solid #58dc8a;background:#174b32;color:#fff;cursor:pointer;box-shadow:0 5px 16px #0009';
    toggle.addEventListener('click', () => setWinnerControlsExpanded(!winnerControlsExpanded));
    bar.appendChild(toggle);

    const panel = document.createElement('div');
    panel.id = 'arena-winner-controls-panel';
    panel.setAttribute('data-winner-controls', '');
    Object.assign(panel.style, {
      position: 'absolute', right: 'calc(100% + 9px)', top: '50%',
      transform: 'translateY(-50%)',
      boxSizing: 'border-box',
      width: 'max-content', maxWidth: 'min(355px, calc(100vw - 120px))',
      maxHeight: '75vh', overflowY: 'auto',
      display: 'none', flexWrap: 'wrap', alignItems: 'center',
      justifyContent: 'flex-start', gap: '6px', padding: '10px',
      borderRadius: '12px', background: '#222', color: '#fff',
      border: '1px solid #666',
      boxShadow: '0 8px 30px #0009'
    });
    bar.appendChild(panel);

    function addActionButton(label, title, handler, selected = false) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.style.cssText = `padding:6px 9px;border-radius:7px;border:1px solid ${selected ? '#58dc8a' : '#666'};background:${selected ? '#135c35' : '#444'};color:#fff;white-space:nowrap;cursor:pointer;font:12px system-ui,sans-serif`;
      b.addEventListener('click', () => {
        handler();
        setWinnerControlsExpanded(false); // Return to minimal footprint after action.
      });
      panel.appendChild(b);
    }

    if (!pairs.length) {
      const status = document.createElement('span');
      status.textContent = '尚未定位到左右回答';
      status.style.cssText = 'width:100%;font-size:12px;color:#ddd';
      panel.appendChild(status);
      addActionButton('重新识别', '滚动到左右回答后重新识别', () => scheduleWinnerRefresh(50));
      setWinnerControlsExpanded(winnerControlsExpanded);
      return;
    }

    const latest = states[states.length - 1];
    const mode = latest.manual === 'both' ? '显示双侧'
      : latest.manual ? '手动'
      : latest.auto ? `自动识别${latest.auto === 'a' ? '左侧' : '右侧'}胜出`
      : '尚未识别胜者';
    const status = document.createElement('span');
    status.textContent = `${hidden}/${pairs.length}轮已隐藏 · ${hidden ? '单滚动阅读' : '双栏布局'} · ${mode}`;
    status.style.cssText = 'width:100%;font-size:12px;line-height:1.5;color:#ddd;margin-bottom:2px';
    panel.appendChild(status);

    const current = latest.manual || 'auto';
    for (const [choice, label] of [['auto','自动'], ['a','仅左侧'], ['b','仅右侧'], ['both','双侧显示']]) {
      addActionButton(label,
        '控制当前对话最靠后的 Battle 回合；不更改 Arena 投票或原始数据',
        () => setManualWinner(choice, pairs.length - 1),
        choice === current);
    }
    addActionButton('全部恢复', '当前对话所有回合恢复双侧；点击自动可恢复识别', () => {
      const prefs = winnerPreferencesForChat();
      for (let i = 0; i < pairs.length; i++) prefs[winnerPairKey(i)] = 'both';
      writeWinnerPreferences(prefs);
      scheduleWinnerRefresh(35);
    });
    setWinnerControlsExpanded(winnerControlsExpanded);
  }

  // Clicking outside the panel or pressing Escape collapses it without altering
  // the winner-only reading layout or any saved choice.
  document.addEventListener('pointerdown', event => {
    if (!winnerControlsExpanded) return;
    const bar = document.getElementById(WINNER_BAR_ID);
    if (bar && !bar.contains(event.target)) setWinnerControlsExpanded(false);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && winnerControlsExpanded) setWinnerControlsExpanded(false);
  }, true);

  function refreshWinnerDisplay() {
    if (winnerRendering) { winnerWantedRefresh = true; return; }
    winnerRendering = true;
    try {
      restoreWinnerStyles();
      if (!getChatId()) {
        const bar = document.getElementById(WINNER_BAR_ID);
        if (bar) bar.remove();
        winnerActivePairs = [];
        return;
      }
      const pairs = discoverArenaAnswerPairs();
      winnerActivePairs = pairs;
      const prefs = winnerPreferencesForChat();
      let hidden = 0;
      const states = [];
      for (let i = 0; i < pairs.length; i++) {
        const manual = prefs[winnerPairKey(i)] || '';
        const auto = automaticWinner(pairs[i]);
        const side = manual || auto;
        states.push({manual, auto, side});
        if ((side === 'a' || side === 'b') && applyWinnerOnly(pairs[i], side)) hidden++;
      }
      renderWinnerControls(pairs, states, hidden);
      if (pairs.length) console.debug('[Arena winner view] visual cards:', pairs.length, 'hidden:', hidden, 'green scores:', pairs.map(p=>[p.greenLeft,p.greenRight]));
    } catch (err) {
      console.warn('[Arena winner view] Could not locate answer cards:', err);
      restoreWinnerStyles();
    } finally {
      winnerRendering = false;
      if (winnerWantedRefresh) { winnerWantedRefresh = false; scheduleWinnerRefresh(500); }
    }
  }

  function scheduleWinnerRefresh(ms = 500) {
    clearTimeout(winnerRefreshTimer);
    winnerRefreshTimer = setTimeout(refreshWinnerDisplay, ms);
  }

  function arenaVoteSide(button) {
    if (!button) return '';
    const raw = [button.textContent, button.getAttribute('aria-label'), button.title,
      button.getAttribute('data-testid'), button.getAttribute('data-value')]
      .filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ');
    if (/\b(both|tie|equal|neither|draw)\b|都好|都不好|平局|一样好|一样差/.test(raw)) return 'both';
    if (/\b(a is better|left is better|left better|vote left|vote for a)\b|左边更好|左侧更好/.test(raw)) return 'a';
    if (/\b(b is better|right is better|right better|vote right|vote for b)\b|右边更好|右侧更好/.test(raw)) return 'b';
    return '';
  }

  document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element) || isPluginElement(t)) return;
    const button = t.closest('button,[role="button"]');
    const side = arenaVoteSide(button);
    if (!side) return;
    // A labeled vote is explicit; recording it also supports layouts where the
    // selected answer does not receive a visible green outline.
    const i = winnerActivePairs.length - 1;
    if (i >= 0) setManualWinner(side, i);
    scheduleWinnerRefresh(800);
  }, true);

  let winnerObservedChangeAt = 0;
  const winnerObserver = new MutationObserver(mutations => {
    if (location.pathname !== winnerLastPath) {
      winnerLastPath = location.pathname;
      restoreWinnerStyles();
      winnerActivePairs = [];
      const bar = document.getElementById(WINNER_BAR_ID);
      if (bar) bar.remove();
      scheduleWinnerRefresh(900);
      return;
    }
    if (!getChatId() || winnerRendering) return;
    const changed = mutations.some(m => {
      const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!target || isPluginElement(target)) return false;
      if (m.type === 'attributes') return m.attributeName === 'class' || m.attributeName === 'data-state' || m.attributeName === 'aria-pressed';
      return m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && !isPluginElement(n));
    });
    if (changed && Date.now() - winnerObservedChangeAt > 400) {
      winnerObservedChangeAt = Date.now();
      scheduleWinnerRefresh(850);
    }
  });
  winnerObserver.observe(document.documentElement, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['class','data-state','aria-pressed']
  });
  addEventListener('popstate', () => scheduleWinnerRefresh(650));
  addEventListener('resize', () => scheduleWinnerRefresh(550));
  scheduleWinnerRefresh(1100);
  // Periodic slow check catches Arena variants that modify only inline styles.
  // After the first hide, no periodic scan is needed until new page activity.
  setInterval(() => {
    if (location.pathname !== winnerLastPath) {
      winnerLastPath = location.pathname;
      scheduleWinnerRefresh(400);
    } else if (getChatId() && !winnerChanges.size) {
      scheduleWinnerRefresh(120);
    }
  }, 3500);
  // ===== End winner view =====

  function mountButton() {
    if (!document.body || document.getElementById(BTN_ID)) return;
    const button = document.createElement('button');
    button.id = BTN_ID;
    button.type = 'button';
    button.textContent = '导出对话';
    Object.assign(button.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483646',
      border: '1px solid #49d17d',
      borderRadius: '999px',
      padding: '10px 14px',
      color: '#fff',
      background: '#167c42',
      font: '600 14px system-ui, sans-serif',
      cursor: 'pointer',
      boxShadow: '0 5px 20px rgba(0,0,0,.35)',
    });
    button.addEventListener('click', exportConversation);
    document.body.appendChild(button);
  }

  mountButton();
  const observer = new MutationObserver(mountButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
