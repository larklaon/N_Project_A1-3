import { course, tutorConfig } from './config.js';
import { matchesAnswer, askTutor } from './tutor.js';

const KEY = 'practical-one-step-v1';
const $ = id => document.getElementById(id);
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const titles = { home: '학습 홈', study: '한 질문씩 배우기', practice: '단답 연습', review: '다시 볼 질문', about: '학습실 소개' };
let questions = [], ordered = [], units = [], byId = {}, busy = false, controller = null, apiError = '', quiz = null;
let storageError = false;
let state = { current: '', completed: [], review: [], drafts: {}, conversations: {}, checked: {}, attempts: {}, provider: tutorConfig.defaultProvider };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && typeof saved === 'object') {
    for (const key of ['current', 'provider']) if (typeof saved[key] === 'string') state[key] = saved[key];
    for (const key of ['completed', 'review']) if (Array.isArray(saved[key])) state[key] = saved[key].filter(v => typeof v === 'string');
    for (const key of ['drafts', 'conversations', 'checked', 'attempts']) if (saved[key] && typeof saved[key] === 'object' && !Array.isArray(saved[key])) state[key] = saved[key];
  }
} catch { storageError = true; }
if (!tutorConfig.providers.some(p => p.id === state.provider)) state.provider = tutorConfig.defaultProvider;

function announce(text) { $('announcement').textContent = text; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { storageError = true; announce('기록을 저장하지 못했어요. 현재 창에서만 이어갈 수 있어요.'); } }
function view() { return Object.hasOwn(titles, location.hash.slice(1)) ? location.hash.slice(1) : 'home'; }
function topicOf(q) { return course.topics.find(t => t.id === q.topic); }
function current() { return byId[state.current] || ordered[0]; }
function addUnique(key, id) { if (!state[key].includes(id)) state[key].push(id); }
function progress() { return Math.round(state.completed.length / questions.length * 100) || 0; }
function messagesFor(id) { return (state.conversations[id] || []).filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-12); }
function setQuestion(id) { if (!byId[id] || busy) return; state.current = id; apiError = ''; save(); if (view() !== 'study') location.hash = 'study'; else render(); }
function questionMarkup(q) { return `<div class="question-meta"><span class="pill">${esc(topicOf(q).name)}</span><span>${q.kind === 'micro' ? '작은 질문' : '연결 문제'} · 창작 문항</span></div><h2 class="question-title">${esc(q.prompt)}</h2>${q.code ? `<div class="code-label">${esc(topicOf(q).label)} · CODE</div><pre><code>${esc(q.code)}</code></pre>` : ''}`; }
function topicTiles() { return course.topics.map(t => { const list = questions.filter(q => q.topic === t.id); const done = list.filter(q => state.completed.includes(q.id)).length; return `<button class="topic-card ${t.color}" data-topic="${t.id}"><span class="topic-icon">${t.label}</span><h3>${t.name}</h3><p>${t.description}</p><div class="topic-bottom"><span>${done} / ${list.length} 질문</span><span aria-hidden="true">↗</span></div></button>`; }).join(''); }

function home() {
  const q = current();
  return `<div class="page-eyebrow">오늘의 공부, 작게 시작해요</div><div class="home-intro"><div><h1>한 질문씩,<br>실기를 내 것으로.</h1><p class="lead">막연히 읽는 공부에서 직접 답하는 공부로.<br>정보처리산업기사 실기를 한 걸음씩 배워요.</p><a class="button primary" href="#study">${state.completed.length ? '이어서 배우기' : '첫 질문 시작하기'} <span aria-hidden="true">→</span></a></div><div class="start-card"><span class="caption">NEXT SMALL STEP</span><div class="step-orbit" aria-hidden="true"><span>01</span><i></i><span>02</span><i></i><span>03</span></div><p>질문 하나에 답하고,<br>헷갈린 부분만 짧게 확인해요.</p><div class="next-label"><span class="tiny-dot"></span>${esc(q.unitTitle)}</div></div></div>
  <div class="stat-row"><div><strong>${questions.length}<small>개</small></strong><span>창작 학습 질문</span></div><div><strong>${units.length}<small>개</small></strong><span>작은 질문 수업</span></div><div><strong>${state.completed.length}<small>개</small></strong><span>내가 답을 확인한 질문</span></div><div><strong>${state.review.length}<small>개</small></strong><span>다시 볼 질문</span></div></div>
  <div class="section-head"><div><span class="caption">CHOOSE YOUR FOCUS</span><h2>어디부터 배워볼까요?</h2></div><span class="muted">한 영역씩, 부담 없이.</span></div><div class="topic-grid">${topicTiles()}</div><div class="gentle-note"><span>✦</span><p>모르겠으면 힌트부터. 정답을 맞히는 것보다 <strong>이유를 이해하는 것</strong>이 먼저예요.</p></div>`;
}

function study() {
  const q = current(), unit = units.find(u => u.id === q.unitId), index = ordered.indexOf(q);
  const feedback = state.checked[q.id], marked = state.review.includes(q.id);
  const history = messagesFor(q.id);
  return `<div class="section-head"><div><span class="page-eyebrow">한 번에 하나, 직접 답하며</span><h1>한 질문씩 배우기</h1></div><div class="course-select"><label class="sr-only" for="topic">학습 영역</label><select id="topic" ${busy ? 'disabled' : ''}>${course.topics.map(t => `<option value="${t.id}" ${q.topic === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}</select><label class="sr-only" for="unit">수업</label><select id="unit" ${busy ? 'disabled' : ''}>${units.filter(u => u.topic === q.topic).map(u => `<option value="${u.id}" ${u.id === q.unitId ? 'selected' : ''}>${esc(u.title)}</option>`).join('')}</select></div></div>
  <div class="lesson-progress"><span>${esc(q.unitTitle)}</span><span>${unit.ids.indexOf(q.id) + 1} / ${unit.ids.length} 질문</span></div><progress class="progress-track" max="${unit.ids.length}" value="${unit.ids.indexOf(q.id) + 1}" aria-label="수업 내 현재 위치"></progress>
  <div class="study-grid"><section class="panel question-panel">${questionMarkup(q)}<form id="answer-form"><label for="answer">내 답</label><textarea id="answer" rows="2" maxlength="2000" placeholder="숫자 하나, 용어 하나부터 적어 보세요." ${busy ? 'disabled' : ''}>${esc(state.drafts[q.id] || '')}</textarea><div class="actions"><button class="primary" type="submit" ${busy ? 'disabled' : ''}>답 확인하기</button><button type="button" data-action="hint">힌트 보기</button><button type="button" class="quiet" data-action="reveal">정답·해설</button></div></form><div id="answer-feedback" class="feedback ${feedback?.correct ? 'success' : ''}" role="status">${feedback ? `<strong>${esc(feedback.title)}</strong><p>${esc(feedback.text)}</p>` : ''}</div><div class="question-footer"><button class="bookmark ${marked ? 'marked' : ''}" data-action="bookmark" aria-pressed="${marked}">${marked ? '✓ 다시 볼 질문에 저장됨' : '+ 다시 볼 질문에 담기'}</button><span class="muted">${esc(q.id)}</span></div></section>
  <section class="panel tutor-panel"><div class="tutor-title"><span class="teacher-avatar">선</span><div><h2>AI 선생님</h2><span>이 질문에서 막힌 부분을 물어보세요.</span></div></div><div class="provider-picker"><label for="provider">AI 연결</label><select id="provider" ${busy ? 'disabled' : ''}>${tutorConfig.providers.map(p => `<option value="${p.id}" ${p.id === state.provider ? 'selected' : ''}>${p.name}${p.id === 'gemini' ? ' · 기본' : ''}</option>`).join('')}</select></div><div class="tutor-messages" id="messages" role="log" aria-label="현재 질문의 대화">${history.length ? history.map(m => `<div class="message ${m.role}"><span>${m.role === 'user' ? '나' : '선생님'}</span><p>${esc(m.content)}</p></div>`).join('') : `<div class="chat-empty"><span aria-hidden="true">✧</span><p>“왜 이렇게 되나요?”<br>“힌트만 주세요.”<br>“예시로 쉽게 설명해 주세요.”</p><small>현재 질문과 대화가 선택한 AI에 전달돼요.</small></div>`}${busy ? '<p class="pending" role="status">선생님이 답을 살피고 있어요…</p>' : ''}</div><div class="api-error" role="status">${esc(apiError)}</div><form id="tutor-form" class="chat-composer"><label class="sr-only" for="tutor-input">선생님에게 물어볼 내용</label><textarea id="tutor-input" rows="2" maxlength="2000" placeholder="내 답이나 궁금한 점을 말해 보세요." ${busy ? 'disabled' : ''}>${esc(state.drafts['chat:' + q.id] || '')}</textarea><div><span>${state.provider === 'gemini' ? 'Gemini' : 'OpenAI'} · 이 질문의 대화</span>${busy ? '<button type="button" data-action="cancel">멈추기</button>' : '<button type="submit" class="send" aria-label="선생님에게 보내기">↑</button>'}</div></form></section></div>
  <div class="lesson-nav"><button data-action="previous" ${busy || index === 0 ? 'disabled' : ''}>← 이전 질문</button><span>답 확인과 AI 설명은 서로 구분해서 기록해요.</span><button data-action="next" ${busy || index === ordered.length - 1 ? 'disabled' : ''}>다음 질문 →</button></div>${index === ordered.length - 1 ? '<div class="gentle-note">마지막 질문이에요. 다시 볼 질문에서 헷갈린 개념을 복습해 보세요.</div>' : ''}`;
}

function practice() {
  if (!quiz) return `<span class="page-eyebrow">기억에서 꺼내는 연습</span><h1>단답 연습</h1><p class="lead">직접 만든 연결 문제로 개념을 확인해요.<br>등록된 정답·동의어를 비교하며, 공식 시험 채점은 아니에요.</p><div class="practice-start panel"><span class="topic-icon">12</span><h2>짧게 풀고, 헷갈린 것만 다시.</h2><p>영역을 고르면 최대 12문제를 무작위로 묶어드려요.</p><label for="practice-topic">연습 영역</label><select id="practice-topic"><option value="all">전체 영역 섞기</option>${course.topics.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</select><button class="primary" data-action="start-quiz">연습 시작하기 →</button></div>`;
  if (quiz.finished) { const correct = Object.values(quiz.results).filter(r => r.correct).length; return `<span class="page-eyebrow">오늘 꺼내 본 기억</span><h1>이번 연습을 마쳤어요.</h1><section class="panel result-panel"><span class="result-score">${correct}<small> / ${quiz.ids.length}</small></span><h2>확인한 만큼, 한 걸음 앞으로.</h2><p>맞힌 문제도 이유를 다시 떠올려 보세요.<br>틀렸거나 답을 먼저 본 질문은 복습 목록에 모아뒀어요.</p><div class="actions"><a class="button primary" href="#review">다시 볼 질문</a><button data-action="end-quiz">새 연습 시작</button></div></section>`; }
  const q = byId[quiz.ids[quiz.index]], result = quiz.results[q.id];
  return `<div class="section-head"><div><span class="page-eyebrow">창작 문항 · 단답 확인</span><h1>단답 연습</h1></div><button data-action="end-quiz">연습 종료</button></div><div class="lesson-progress"><span>${topicOf(q).name}</span><span>${quiz.index + 1} / ${quiz.ids.length}</span></div><section class="panel practice-question">${questionMarkup(q)}<form id="practice-form"><label for="practice-answer">내 답</label><textarea id="practice-answer" rows="3" maxlength="2000" ${result ? 'disabled' : ''} placeholder="직접 떠올려 적어 보세요.">${esc(quiz.drafts[q.id] || '')}</textarea>${!result ? '<div class="actions"><button class="primary">답 확인하기</button><button type="button" data-action="quiz-reveal">정답 먼저 보기</button></div>' : ''}</form><div class="feedback ${result?.correct ? 'success' : ''}" id="practice-feedback" role="status">${result ? `<strong>${result.correct ? '맞았어요.' : result.revealed ? '답을 먼저 확인했어요.' : '다음에 한 번 더 떠올려 봐요.'}</strong><p>답: ${esc(q.answers[0])}<br>${esc(q.explanation)}</p>` : ''}</div>${result ? `<button class="primary" data-action="quiz-next">${quiz.index === quiz.ids.length - 1 ? '결과 보기' : '다음 문제 →'}</button>` : ''}</section>`;
}

function review() {
  const qs = state.review.map(id => byId[id]).filter(Boolean);
  return `<div class="section-head"><div><span class="page-eyebrow">헷갈림도 공부의 일부</span><h1>다시 볼 질문 <small class="count">${qs.length}</small></h1></div><button data-action="export">복습 목록 내려받기</button></div><p class="lead">직접 담은 질문과 연습에서 놓친 문제를 모았어요.<br>다시 답해 본 뒤, 이해했다면 목록에서 꺼내 주세요.</p>${qs.length ? `<div class="review-list">${qs.map(q => `<article class="panel review-card"><div><span class="pill">${topicOf(q).name}</span><h2>${esc(q.prompt)}</h2><p>${esc(q.unitTitle)}</p></div><div class="actions"><button class="primary" data-question="${q.id}">다시 배우기</button><button data-remove="${q.id}">목록에서 꺼내기</button></div></article>`).join('')}</div>` : '<div class="empty-state"><span>✧</span><h2>아직 담아둔 질문이 없어요.</h2><p>막혔던 질문을 모아두면 다음 공부가 조금 쉬워져요.</p><a class="button primary" href="#study">한 질문부터 시작하기</a></div>'}`;
}

function about() {
  return `<span class="page-eyebrow">작은 질문으로, 확실한 이해</span><h1>실기 한 걸음이 돕는 공부</h1><p class="lead">정보처리산업기사 실기를 준비하는 학습자를 위한<br>질문 중심의 개인 학습실이에요.</p><div class="about-grid"><section class="panel"><span class="caption">01 / LEARN</span><h2>설명보다 질문부터</h2><p>숫자 하나, 연산 하나, 용어 하나씩 답하며 배워요. 작은 질문 뒤에는 연결 문제로 개념을 확인해요.</p></section><section class="panel"><span class="caption">02 / ASK</span><h2>막힌 곳에서 물어보기</h2><p>힌트, 예시, 오답 원인, 쉬운 설명을 AI 선생님에게 요청할 수 있어요. Gemini를 기본으로 사용하며 OpenAI도 선택할 수 있어요.</p></section><section class="panel"><span class="caption">03 / REVIEW</span><h2>내가 놓친 질문을 다시</h2><p>질문별 초안과 대화, 답 확인 기록을 이 브라우저에 저장해요. 다른 기기로 자동 동기화되지는 않아요.</p></section></div><section class="panel about-detail"><h2>자료와 기록에 대해</h2><dl><dt>학습 자료</dt><dd>${questions.length}개 창작 연습 문항 · ${units.length}개 수업 · ${course.topics.length}개 영역. 기출 원문과 출판사 PDF는 포함하지 않아요.</dd><dt>정답 확인</dt><dd>단답은 등록된 답·동의어 비교, AI 대화는 설명과 문장형 답의 학습 피드백이에요. 공식 시험 성적이나 숙달 판정이 아니에요.</dd><dt>AI 대화</dt><dd>보내기를 눌렀을 때 현재 문항과 해당 질문의 대화만 선택한 AI 서비스에 전달해요. 다른 질문의 대화는 보내지 않아요.</dd><dt>기록 저장</dt><dd>진도와 초안은 브라우저 안에 저장돼요. 브라우저 데이터를 지우면 함께 사라져요.</dd></dl><details><summary>이 학습실의 저장 기록 관리</summary><p>현재 브라우저의 이 서비스 기록만 삭제해요.</p><button class="danger" data-action="clear">내 학습 기록 초기화</button><p id="clear-confirm" role="status"></p></details></section>`;
}

function render() {
  if (!questions.length) return;
  const v = view();
  document.querySelectorAll('[data-view]').forEach(a => { a.classList.toggle('active', a.dataset.view === v); if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('breadcrumb').textContent = 'MY STUDY / ' + titles[v];
  $('content').innerHTML = (storageError ? '<p class="storage-alert" role="status">저장이 차단되어 현재 창에서만 공부를 이어갈 수 있어요.</p>' : '') + ({ home, study, practice, review, about }[v])();
  $('content').setAttribute('aria-busy', 'false');
}

async function sendTutor(text) {
  if (busy) return;
  if (!text.trim()) { apiError = '답이나 궁금한 점을 입력해 주세요.'; render(); $('tutor-input')?.focus(); return; }
  const q = current(), history = messagesFor(q.id), user = { role: 'user', content: text.trim() };
  busy = true; apiError = ''; controller = new AbortController(); render();
  try {
    const result = await askTutor(q, [...history, user], { signal: controller.signal, provider: state.provider });
    state.conversations[q.id] = [...history, user, { role: 'assistant', content: result.text }].slice(-12);
    state.drafts['chat:' + q.id] = '';
    if (result.outcome === 'correct') addUnique('completed', q.id);
    if (result.outcome === 'retry') addUnique('review', q.id);
    save(); announce('선생님의 답변이 도착했어요.');
  } catch (error) { apiError = error.name === 'AbortError' ? '질문 전송을 멈췄어요. 입력은 남아 있어요.' : error.message; }
  finally { busy = false; controller = null; render(); $('tutor-input')?.focus({ preventScroll: true }); }
}

function gradeStudy(text) {
  const q = current();
  if (!text.trim()) { state.checked[q.id] = { title: '내 답을 입력해 주세요.', text: '힌트부터 확인해도 괜찮아요.' }; render(); $('answer')?.focus(); return; }
  const correct = matchesAnswer(q, text);
  state.checked[q.id] = { correct, title: correct ? '맞았어요. 이유도 확인해 볼까요?' : '아직 등록된 답과는 달라요.', text: correct ? q.explanation : q.hint + ' 문장형 답의 의미 확인은 AI 선생님에게 요청할 수 있어요.' };
  if (correct) addUnique('completed', q.id); else addUnique('review', q.id);
  save(); render();
}

function gradeQuiz(text, revealed = false) {
  const q = byId[quiz.ids[quiz.index]];
  if (!text.trim() && !revealed) { $('practice-feedback').textContent = '내 답을 입력해 주세요.'; $('practice-answer').focus(); return; }
  const correct = !revealed && matchesAnswer(q, text);
  quiz.results[q.id] = { correct, revealed };
  state.attempts[q.id] = { correct, revealed };
  if (!correct) addUnique('review', q.id); else addUnique('completed', q.id);
  save(); render();
}

document.addEventListener('input', e => {
  const q = current();
  if (e.target.id === 'answer') { state.drafts[q.id] = e.target.value; save(); }
  if (e.target.id === 'tutor-input') { state.drafts['chat:' + q.id] = e.target.value; save(); }
  if (e.target.id === 'practice-answer' && quiz) quiz.drafts[quiz.ids[quiz.index]] = e.target.value;
});
document.addEventListener('change', e => {
  if (e.target.id === 'provider') { state.provider = e.target.value; save(); render(); }
  if (e.target.id === 'topic') setQuestion(ordered.find(q => q.topic === e.target.value).id);
  if (e.target.id === 'unit') setQuestion(units.find(u => u.id === e.target.value).ids[0]);
});
document.addEventListener('submit', e => {
  if (e.target.id === 'answer-form') { e.preventDefault(); gradeStudy($('answer').value); }
  if (e.target.id === 'tutor-form') { e.preventDefault(); sendTutor($('tutor-input').value); }
  if (e.target.id === 'practice-form') { e.preventDefault(); gradeQuiz($('practice-answer').value); }
});
document.addEventListener('keydown', e => { if (e.target.id === 'tutor-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendTutor(e.target.value); } });
document.addEventListener('click', e => {
  const topic = e.target.closest('[data-topic]'); if (topic) { const qs = ordered.filter(q => q.topic === topic.dataset.topic); setQuestion((qs.find(q => !state.completed.includes(q.id)) || qs[0]).id); return; }
  const link = e.target.closest('[data-question]'); if (link) { setQuestion(link.dataset.question); return; }
  const remove = e.target.closest('[data-remove]'); if (remove) { state.review = state.review.filter(id => id !== remove.dataset.remove); save(); render(); return; }
  const button = e.target.closest('[data-action]'); if (!button || button.disabled) return;
  const q = current();
  switch (button.dataset.action) {
    case 'cancel': controller?.abort(); break;
    case 'bookmark': state.review.includes(q.id) ? state.review = state.review.filter(id => id !== q.id) : addUnique('review', q.id); save(); render(); break;
    case 'hint': state.checked[q.id] = { title: '작은 힌트', text: q.hint }; save(); render(); break;
    case 'reveal': state.checked[q.id] = { title: '정답: ' + q.answers[0], text: q.explanation }; addUnique('review', q.id); save(); render(); break;
    case 'previous': setQuestion(ordered[ordered.indexOf(q) - 1]?.id); break;
    case 'next': setQuestion(ordered[ordered.indexOf(q) + 1]?.id); break;
    case 'start-quiz': {
      const topic = $('practice-topic').value;
      const pool = questions.filter(q => q.kind === 'checkpoint' && (topic === 'all' || q.topic === topic));
      for (let i = pool.length - 1; i > 0; i--) { const value = crypto.getRandomValues(new Uint32Array(1))[0]; const j = value % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      quiz = { ids: pool.slice(0, 12).map(q => q.id), index: 0, results: {}, drafts: {} }; render(); break;
    }
    case 'quiz-reveal': gradeQuiz('', true); break;
    case 'quiz-next': if (++quiz.index === quiz.ids.length) quiz.finished = true; render(); break;
    case 'end-quiz': quiz = null; render(); break;
    case 'export': {
      const blob = new Blob([JSON.stringify({ course: course.name, questions: state.review.map(id => ({ id, prompt: byId[id].prompt, draft: state.drafts[id] || '' })) }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = '실기_복습목록.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); break;
    }
    case 'clear': button.dataset.action = 'confirm-clear'; button.textContent = '확인: 내 기록 모두 초기화'; $('clear-confirm').textContent = '진도·대화·초안·복습 목록을 삭제합니다. 계속하려면 확인 버튼을 눌러 주세요.'; break;
    case 'confirm-clear': quiz = null; apiError = ''; state = { current: ordered[0].id, completed: [], review: [], drafts: {}, conversations: {}, checked: {}, attempts: {}, provider: tutorConfig.defaultProvider }; save(); render(); announce('이 학습실의 저장 기록을 초기화했어요.'); break;
  }
});
window.addEventListener('hashchange', () => { if (busy) controller?.abort(); render(); });

async function init() {
  try {
    const response = await fetch(course.dataUrl);
    if (!response.ok) throw new Error('자료를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
    questions = await response.json(); byId = Object.fromEntries(questions.map(q => [q.id, q]));
    const groups = new Map();
    for (const q of questions) { if (!groups.has(q.unitId)) groups.set(q.unitId, { id: q.unitId, title: q.unitTitle, topic: q.topic, ids: [] }); groups.get(q.unitId).ids.push(q.id); }
    units = course.topics.flatMap(t => [...groups.values()].filter(u => u.topic === t.id));
    for (const unit of units) unit.ids.sort((a, b) => (byId[a].kind === 'checkpoint') - (byId[b].kind === 'checkpoint') || a.localeCompare(b));
    ordered = units.flatMap(u => u.ids.map(id => byId[id]));
    state.completed = [...new Set(state.completed)].filter(id => byId[id]); state.review = [...new Set(state.review)].filter(id => byId[id]);
    if (!byId[state.current]) state.current = ordered[0].id;
    render();
  } catch (error) { $('content').innerHTML = `<div class="empty-state"><h1>학습실을 열지 못했어요.</h1><p>${esc(error.message)}</p><button data-reload>다시 불러오기</button></div>`; $('content').setAttribute('aria-busy', 'false'); $('content').querySelector('[data-reload]').onclick = () => location.reload(); }
}
init();
