// 콘텐츠와 화면/응답 엔진을 분리합니다. 공개 화면에는 이 과정만 제공합니다.
export const course = {
  id: 'industry-practical', name: '정보처리산업기사 실기',
  description: '한 번에 하나씩, 직접 답하며 배우는 실기 공부',
  dataUrl: '/data/questions.json',
  topics: [
    { id: 'c', name: 'C 기본·재귀', label: 'C', description: '값의 변화와 실행 순서를 차근차근', color: 'green' },
    { id: 'pointer', name: '배열·포인터', label: '*', description: '주소와 값을 구분하는 연습', color: 'green' },
    { id: 'java', name: 'Java', label: 'J', description: '객체와 메서드의 흐름 읽기', color: 'orange' },
    { id: 'python', name: 'Python', label: 'Py', description: '자료형과 짧은 코드의 결과', color: 'orange' },
    { id: 'sql', name: 'SQL', label: 'SQL', description: '조회·집계·조건을 한 단계씩', color: 'blue' },
    { id: 'db', name: '데이터베이스', label: 'DB', description: '키·정규화·트랜잭션 핵심 개념', color: 'blue' },
    { id: 'network', name: '네트워크', label: 'NET', description: '통신 방식과 프로토콜 구분하기', color: 'purple' },
    { id: 'test', name: '테스트', label: 'QA', description: '검증 방법과 테스트 용어', color: 'purple' },
    { id: 'os', name: '운영체제·UI·배포', label: 'OS', description: '프로세스부터 변경 관리까지', color: 'purple' },
  ],
};
// API 키는 여기에 넣지 않습니다. Python 엔드포인트의 환경 변수로만 관리합니다.
export const tutorConfig = {
  endpoint: '/api/chat', timeoutMs: 25000, defaultProvider: 'gemini',
  providers: [{ id: 'gemini', name: 'Gemini' }, { id: 'openai', name: 'OpenAI' }],
};
