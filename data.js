/* 수능 던전 — 층·기숙사·차시·강의 카드·칭호·어휘 (data.js). 문항은 questions.js. */

// 층(시대). boss: 이름·아이콘·등장 대사·처치 대사. HP는 문항 수로 정해진다.
const LAYERS = [
  { id: "L1", name: "탕평과 세도 정치", short: "탕평·세도", boss: { name: "세도 가문의 문중 어른", icon: "👑", line: "왕이 어리니 나라 일은 우리 집안이 맡지. 비변사는 우리 손 안이다.", defeat: "삼정의 문란까지 들통났군… 백성의 분노가 밀려온다." } },
  { id: "L2", name: "농민 봉기·실학·서민 문화", short: "농민 봉기·실학", boss: { name: "탐관오리 수령", icon: "💰", line: "군포는 죽은 사람 몫도, 갓난아이 몫도 걷는다. 내 곳간은 늘 비어 있거든.", defeat: "홍경래와 진주의 농민들이… 실학자들의 글까지… 내 자리는 끝이다." } },
  { id: "L3", name: "개항과 개화", short: "개항·개화", boss: { name: "척화비 수호자", icon: "⚓", line: "서양 오랑캐가 침범하는데 싸우지 않으면 화친하는 것이다! 문을 열지 마라.", defeat: "강화도 조약… 개화 정책… 시대의 파도는 막을 수 없었군." } },
  { id: "L4", name: "동학·갑오개혁·대한 제국·국권 피탈", short: "동학·대한 제국", boss: { name: "통감 이토 히로부미", icon: "🎩", line: "을사년의 조약은 이미 맺어졌다. 외교권은 내가 가져가지.", defeat: "하얼빈… 안중근… 의병과 애국 계몽 운동이 이렇게 거셀 줄은." } },
  { id: "L5", name: "일제 통치의 변화·3·1 운동·임시 정부", short: "일제 통치·3·1", boss: { name: "조선 총독부", icon: "🏛️", line: "헌병 경찰이 곳곳에 있다. 태형 한 대면 조용해질 것이다.", defeat: "탑골 공원에서 시작된 만세가 전국으로… 상하이에 정부가 세워졌다니." } },
  { id: "L6", name: "무장 투쟁·민족 문화·사회 운동", short: "무장 투쟁·사회 운동", boss: { name: "관동군 토벌대장", icon: "🪖", line: "독립군 따위, 봉오동 골짜기에서 쓸어버리겠다.", defeat: "청산리에서… 윤봉길의 폭탄까지… 광복군이 국내 진입을 준비한다고?" } },
  { id: "L7", name: "광복·분단·6·25·민주주의·경제", short: "현대", boss: { name: "독재의 그림자", icon: "🌑", line: "헌법쯤이야 사사오입으로, 유신으로 바꾸면 그만이다.", defeat: "4·19, 5·18, 6월 항쟁… 시민의 광장이 나를 걷어냈다." } }
];

// 기숙사(모둠) — ⓐ 문화사·ⓒ 총복습 앱과 이름·색을 맞춘다(바꾸면 세 앱 같이).
const HOUSES = [
  { id: "cheongryong", name: "청룡", icon: "🐉", color: "#2f6b8f" },
  { id: "baekho", name: "백호", icon: "🐯", color: "#7b7f88" },
  { id: "jujak", name: "주작", icon: "🔥", color: "#b03a3a" },
  { id: "hyeonmu", name: "현무", icon: "🐢", color: "#2f5d4f" }
];

// 차시 구성. common = 공통 5차시(통합 모드, 층당 6문항). split = 유연 모듈(층 하나씩, 문항 전부). perFloor 없으면 전부.
// gameId → 포털 활동 id는 "수능던전_" + gameId.
const SESSIONS = [
  { id: "b1", gameId: "b1", group: "common", title: "ⓑ1 탕평·세도·농민 봉기", desc: "1층 세도 가문 → 2층 탐관오리(봉기 편)", perFloor: 6, parts: [{ layer: "L1" }, { layer: "L2", sub: "a" }] },
  { id: "b2", gameId: "b2", group: "common", title: "ⓑ2 실학·서민 문화 + 개항·개화", desc: "1층 탐관오리(실학·문화 편) → 2층 척화비", perFloor: 6, parts: [{ layer: "L2", sub: "b" }, { layer: "L3" }] },
  { id: "b3", gameId: "b3", group: "common", title: "ⓑ3 동학·갑오·대한 제국·국권 피탈", desc: "한 층, 보스 통감 이토 (문항 10개)", perFloor: 10, parts: [{ layer: "L4" }] },
  { id: "b4", gameId: "b4", group: "common", title: "ⓑ4 일제 통치·3·1·임정 + 무장 투쟁", desc: "1층 조선 총독부 → 2층 관동군", perFloor: 6, parts: [{ layer: "L5" }, { layer: "L6" }] },
  { id: "b5", gameId: "b5", group: "common", title: "ⓑ5 현대 + 통합 모의고사", desc: "현대 보스전 6문항 → 개인전 15문항(20분)", perFloor: 6, parts: [{ layer: "L7" }], mockCount: 15 },
  { id: "L1", gameId: "L1", group: "split", title: "L1 탕평·세도 정치", desc: "유연 +2 · 층 하나 전부", parts: [{ layer: "L1" }] },
  { id: "L2", gameId: "L2", group: "split", title: "L2 농민 봉기·실학·서민 문화", desc: "유연 +2 · 층 하나 전부", parts: [{ layer: "L2" }] },
  { id: "L3", gameId: "L3", group: "split", title: "L3 개항·개화", desc: "유연 +2 · 층 하나 전부", parts: [{ layer: "L3" }] },
  { id: "L4", gameId: "L4", group: "split", title: "L4 동학·갑오·대한 제국·국권 피탈", desc: "층 하나 전부", parts: [{ layer: "L4" }] },
  { id: "L5", gameId: "L5", group: "split", title: "L5 일제 통치·3·1·임정", desc: "유연 +1 · 층 하나 전부", parts: [{ layer: "L5" }] },
  { id: "L6", gameId: "L6", group: "split", title: "L6 무장 투쟁·민족 문화·사회 운동", desc: "유연 +1 · 층 하나 전부", parts: [{ layer: "L6" }] },
  { id: "L7", gameId: "L7", group: "split", title: "L7 현대", desc: "층 하나 전부", parts: [{ layer: "L7" }] },
  { id: "mock", gameId: "모의고사", group: "split", title: "통합 모의고사 20문항", desc: "유연 반 한 차시 · 개인전 25분", mockOnly: true, mockCount: 20 }
];

// 던전 클리어 칭호(정답률 기준, 위에서부터 검사)
const TITLES = [
  { min: 1.0, name: "던전 마스터", icon: "🏰", desc: "한 문제도 틀리지 않았어. 수능 한국사 1등급도 문제없겠다." },
  { min: 0.8, name: "보스 사냥꾼", icon: "⚔️", desc: "보스급 실력. 틀린 문제 해설만 한 번 더 보면 끝." },
  { min: 0.6, name: "던전 탐험가", icon: "🧭", desc: "길은 다 알아. 연표·사료 유형을 조금만 더 다져 보자." },
  { min: 0.4, name: "견습 모험가", icon: "🕯️", desc: "절반은 넘었어. 강의 카드의 «핵심 흐름»을 다시 읽어 보자." },
  { min: 0, name: "초보 모험가", icon: "🚪", desc: "던전에 들어온 것만으로 시작이야. 오답 해설을 한 문제씩 읽자." }
];

// 강의 카드 «수능에 이렇게 나온다» — 층마다 1장. 교사 화면(?teacher=1)에 투사. 같은 내용이 docs/강의카드.md에 있다.
const CARDS = [];

// 어려운 낱말 풀이(중3 기준). 선택지·사료 안 글자는 바꾸지 않고 밑줄만 긋는다.
const GLOSSARY = {};
