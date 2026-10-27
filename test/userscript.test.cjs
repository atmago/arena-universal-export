const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'arena-universal-export.user.js'), 'utf8');

function load(overrides = {}) {
  const sandbox = {
    location: { pathname: '/c/sample-chat', hostname: 'arena.ai', href: 'https://arena.ai/c/sample-chat' },
    document: {
      body: null,
      documentElement: {},
      addEventListener() {},
      getElementById() { return null; },
      querySelectorAll() { return []; },
    },
    MutationObserver: class { observe() {} },
    addEventListener() {},
    setTimeout() {},
    clearTimeout() {},
    setInterval() {},
    ...overrides,
  };
  const instrumented = source.replace(/\}\)\(\);\s*$/, `
    globalThis.api = { getChatId, textOf, safeFilename, getMessages, cleanModelValue,
      buildBattleGroups, detectMode, buildDirectMarkdown, fetchEvaluation };
  })();`);
  assert.notEqual(instrumented, source, 'test instrumentation must find the script closure');
  vm.runInNewContext(instrumented, sandbox, { timeout: 1000 });
  return sandbox.api;
}

test('userscript loads and accepts saved chat routes but excludes new chats', () => {
  for (const pathname of ['/c/abc-123', '/chat/abc-123']) {
    assert.equal(load({ location: { pathname } }).getChatId(), 'abc-123');
  }
  for (const pathname of ['/', '/c/new', '/chat/new']) {
    assert.equal(load({ location: { pathname } }).getChatId(), null);
  }
});

test('message schemas and mixed text parts are normalized', () => {
  const api = load();
  const messages = [{ role: 'user', content: 'hello' }];
  for (const data of [{ messages }, { evaluation: { messages } }, { data: { messages } },
    { chat: { messages } }, { conversation: { messages } }]) {
    assert.equal(api.getMessages(data), messages);
  }
  assert.equal(api.textOf([{ text: ' 你好 ' }, { parts: ['world', null] }, 42]), '你好\nworld\n42');
  assert.equal(api.cleanModelValue('Model： Claude'), 'Claude');
  assert.equal(api.cleanModelValue('https://example.invalid/model'), '');
});

test('Battle grouping pairs siblings by parent and preserves round order', () => {
  const api = load();
  const messages = [
    { role: 'user', id: 'u1', content: 'question' },
    { role: 'assistant', parentMessageIds: ['u1'], participantPosition: 'b', content: 'B' },
    { role: 'assistant', parent_id: 'u1', participant_position: 'a', content: 'A' },
    { role: 'assistant', parentMessageId: 'u2', participantPosition: 'a', content: 'unpaired' },
  ];
  const groups = api.buildBattleGroups(messages);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].parentId, 'u1');
  assert.equal(groups[0].a.msg.content, 'A');
  assert.equal(groups[0].b.msg.content, 'B');
  assert.equal(groups[0].turn, 1);
  assert.equal(api.detectMode({}, messages, groups), 'battle');
  assert.equal(api.detectMode({ mode: 'direct' }, messages, groups), 'direct');
  assert.equal(api.detectMode({}, [], []), 'direct');
});

test('Direct Markdown retains Unicode, code, system text, model, and source', () => {
  const built = load().buildDirectMarkdown({ title: '示例对话' }, [
    { role: 'system', content: 'System instructions' },
    { role: 'human', content: '你好' },
    { role: 'bot', modelName: 'Example Model', content: '```js\nconst answer = 42;\n```' },
    { role: 'tool', content: 'excluded tool output' },
  ]);
  assert.equal(built.count, 3);
  assert.equal(built.modelName, 'Example Model');
  for (const expected of ['# 示例对话', 'System instructions', '你好', 'const answer = 42;',
    'Example Model', 'https://arena.ai/c/sample-chat']) {
    assert.ok(built.markdown.includes(expected), expected);
  }
  assert.ok(!built.markdown.includes('excluded tool output'));
  assert.equal(load().safeFilename('a/b:c*?<>|'), 'a b c');
});

test('export API falls back on failure and uses only same-origin authenticated reads', async () => {
  const calls = [];
  const messages = [{ role: 'user', content: 'sample' }];
  const api = load({
    async fetch(url, options) {
      calls.push({ url, options });
      if (calls.length === 1) return { ok: false, status: 404 };
      return { ok: true, async json() { return { messages }; } };
    },
  });
  assert.equal((await api.fetchEvaluation('chat/one')).messages, messages);
  assert.deepEqual(calls.map(c => c.url), [
    '/api/evaluation/chat%2Fone', '/nextjs-api/evaluation/chat%2Fone',
  ]);
  assert.ok(calls.every(c => c.options.credentials === 'include' && !c.options.body));
});

test('empty API data triggers fallback, and final failures remain actionable', async () => {
  let calls = 0;
  const api = load({
    async fetch() {
      calls++;
      return { ok: true, async json() { return { messages: [] }; } };
    },
  });
  await assert.rejects(api.fetchEvaluation('saved'), /returned JSON but no messages/);
  assert.equal(calls, 2);
});
