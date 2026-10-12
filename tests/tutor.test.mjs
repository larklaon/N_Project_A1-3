import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesAnswer, askTutor } from '../js/tutor.js';
import { tutorConfig } from '../js/config.js';

test('output grading preserves meaningful whitespace and case', () => {
  const q = { mode: 'output', answers: ['A B\nC'] };
  assert.equal(matchesAnswer(q, ' A B\nC '), true);
  assert.equal(matchesAnswer(q, 'A  B C'), false);
  assert.equal(matchesAnswer(q, 'a b\nc'), false);
});
test('term grading supports registered synonyms and polite answers', () => {
  const q = { mode: 'term', answers: ['형상 관리', 'configuration management'] };
  assert.equal(matchesAnswer(q, '형상관리입니다'), true);
  assert.equal(matchesAnswer(q, 'Configuration Management'), true);
  assert.equal(matchesAnswer(q, '백업'), false);
});
test('Gemini is sent by default and server errors are not converted into fake replies', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, args) => {
    request = JSON.parse(args.body);
    return { ok: false, json: async () => ({ error: 'AI 연결 준비 중' }) };
  };
  try {
    await assert.rejects(askTutor({ id: 'MP-C-01-01' }, [{ role: 'user', content: '왜?' }]), /AI 연결 준비 중/);
    assert.equal(request.provider, 'gemini');
    assert.equal(request.questionId, 'MP-C-01-01');
    assert.equal('answers' in request, false);
  } finally { globalThis.fetch = original; }
});
test('malformed success responses are rejected', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ text: '', outcome: 'correct' }) });
  try { await assert.rejects(askTutor({ id: 'MP-C-01-01' }, [{ role: 'user', content: '3' }]), /답변 형식/); }
  finally { globalThis.fetch = original; }
});
test('cancellation aborts an in-flight request', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, { signal }) => new Promise((resolve, reject) => {
    const stop = () => reject(new DOMException('Stopped', 'AbortError'));
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
  });
  const controller = new AbortController();
  try {
    const request = askTutor({ id: 'MP-C-01-01' }, [{ role: 'user', content: '3' }], { signal: controller.signal });
    controller.abort();
    await assert.rejects(request, { name: 'AbortError' });
  } finally { globalThis.fetch = original; }
});
test('late replies produce a timeout notice', async () => {
  const original = globalThis.fetch, oldTimeout = tutorConfig.timeoutMs;
  tutorConfig.timeoutMs = 5;
  globalThis.fetch = async (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
  });
  try { await assert.rejects(askTutor({ id: 'MP-C-01-01' }, [{ role: 'user', content: '3' }]), /응답이 늦어지고/); }
  finally { globalThis.fetch = original; tutorConfig.timeoutMs = oldTimeout; }
});
