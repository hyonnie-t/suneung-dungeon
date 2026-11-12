// bank/questions.json → questions.js (JS 상수). 빌드 도구가 아니라 JSON을 <script>로 읽히게 하는 변환 한 줄.
// 사용: node bank/build.js   (레포 루트에서)
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'questions.json');
const out = path.join(__dirname, '..', 'questions.js');
const qs = JSON.parse(fs.readFileSync(src, 'utf8'));

// 검사: id 중복, 선택지 5개, 정답 1~5, 필수 칸
const ids = new Set();
const errs = [];
qs.forEach((q, i) => {
  const tag = `${i}:${q.id}`;
  if (!q.id || ids.has(q.id)) errs.push(tag + ' id 중복/없음'); ids.add(q.id);
  ['layer', 'type', 'pts', 'src', 'q', 'ch', 'ans', 'exp'].forEach(k => { if (q[k] === undefined || q[k] === '') errs.push(tag + ' ' + k + ' 없음'); });
  if (!Array.isArray(q.ch) || q.ch.length !== 5) errs.push(tag + ' 선택지 5개 아님');
  if (!(q.ans >= 1 && q.ans <= 5)) errs.push(tag + ' 정답 범위');
  if (!/^L[1-7]$/.test(q.layer)) errs.push(tag + ' layer');
  if (q.layer === 'L2' && !q.mock && !['a', 'b'].includes(q.sub)) errs.push(tag + ' L2는 sub a/b 필요');
  if (!['연표', '사료', '지도', '인물', '사진', '개념'].includes(q.type)) errs.push(tag + ' type');
  // 예시 힌트 금지: 선택지·해설이 아닌 자료 안에 정답 문장이 통째로 들어 있으면 경고
  if (q.type !== '연표' && q.box && q.ch[q.ans - 1] && q.box.includes(q.ch[q.ans - 1])) errs.push(tag + ' 자료에 정답 선택지 문장이 그대로 있음');
});
if (errs.length) { console.error('문제 은행 검사 실패:\n' + errs.join('\n')); process.exit(1); }

const header = `/* 수능 던전 문제 은행 — bank/questions.json에서 node bank/build.js로 만든 파일. 직접 고치지 말고 JSON을 고친다.
 * 출처: 평가원 수능·모의평가, 시도교육청 전국연합학력평가 한국사(공개 자료, 출처 표기 유지). 문항 수 ${qs.length} (${new Date().toISOString().slice(0, 10)}) */\n`;
fs.writeFileSync(out, header + 'const QUESTIONS = ' + JSON.stringify(qs, null, 1) + ';\n', 'utf8');
const by = {};
qs.forEach(q => { const k = q.mock ? 'M' : q.layer + (q.sub || ''); by[k] = (by[k] || 0) + 1; });
console.log('questions.js 생성: ' + qs.length + '문항', by);
