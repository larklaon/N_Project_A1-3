import { course, tutorConfig } from './config.js';

export function canonical(value, mode = 'term') {
  const clean = value.normalize('NFKC').trim();
  return mode === 'output' ? clean : clean.toLowerCase().replace(/[\s_-]/g, '');
}

export function matchesAnswer(question, text) {
  const normalized = canonical(text, question.mode);
  const candidates = [normalized, canonical(text.replace(/(?:입니다|이에요|예요|이요|이다|요)[.!。]?$/, '').trim(), question.mode)];
  return question.answers.some(answer => candidates.includes(canonical(answer, question.mode)));
}

export async function askTutor(question, messages, { signal, provider = tutorConfig.defaultProvider } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const stop = () => controller.abort();
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, tutorConfig.timeoutMs);
  try {
    const response = await fetch(tutorConfig.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: course.id, provider, questionId: question.id, messages: messages.slice(-12) }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.');
    if (!data.text?.trim() || !['correct', 'retry', 'explain'].includes(data.outcome)) throw new Error('답변 형식을 확인하지 못했어요. 다시 시도해 주세요.');
    return data;
  } catch (error) {
    if (timedOut) throw new Error('응답이 늦어지고 있어요. 입력은 남아 있으니 잠시 후 다시 시도해 주세요.');
    if (error.name === 'SyntaxError') throw new Error('AI 답변 형식을 확인하지 못했어요. 입력은 남아 있어요.');
    if (error.name === 'TypeError') throw new Error('연결을 확인해 주세요. 입력은 남아 있어요.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); }
}
