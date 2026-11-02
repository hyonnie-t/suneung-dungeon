# suneung-dungeon — 3학년 한국사 «수능 던전»

조선 후기(탕평·세도)부터 현대까지를 수능·모의평가·학력평가 한국사 기출로 푸는 게임형 수업 웹앱(정적 파일). 기말고사 뒤 9차시 재설계안의 ⓑ 묶음(공통 5차시, 유연 +2). 한 차시 = 효니 강의 15분(교사 화면 강의 카드) + 모둠(기숙사) 보스전 25분 + 오답 5분.
배포: https://hyonnie-t.github.io/suneung-dungeon/ (GitHub Pages). 포털 커리큘럼 등록은 **비공개**(기출 문항 저작권 — 교실 안에서만 쓴다).

## 왜 final-practice 안에 넣지 않고 새 레포인가 (2026-11-02 결정)
- final-practice는 «개인 오답노트»(localStorage 풀이 기록·ftSubmit 세트·학생 출제)이고, 이 앱은 «모둠 보스전 + 개인 모의고사»라 화면 흐름·상태·제출 경로(게임활동_로그 기본 제출)가 전부 다르다. 한 레포에 두면 app.js 하나가 두 앱을 분기하게 돼 토큰·버그가 는다.
- 포털 커리큘럼에 ⓑ1~ⓑ5가 **활동 id 6개**로 따로 잡혀야 하고, Tailwind CDN(final-practice)과 plain CSS(최근 앱 규칙) 톤도 다르다.
- 재활용한 것: `.wrap` 폭 3단계, 선택지 렌더링·채점(`ansArr.every`)·셔플·`esc`, 오답노트의 «이유 쓰기» 구조. 코드로 복사했고 모듈로 잇지는 않았다.

## 구조
- `index.html` — 화면 뼈대(입구 s0 / 보스전 sPlay / 모의고사 sMock / 결과 sEnd / 교사 sTeacher)
- `style.css` — 던전 배색(어두운 석벽 바탕 + 양피지 카드, 층마다 강조색). `:root` 주석에 배색 이유
- `data.js` — 층(LAYERS)·기숙사(HOUSES)·차시 구성(SESSIONS)·강의 카드(CARDS)·칭호(TITLES)·어휘(GLOSSARY)
- `questions.js` — 문제 은행 `QUESTIONS`(약 80문항). 원본은 `bank/questions.json`, `node bank/build.js`가 `questions.js`를 다시 만든다(빌드 도구가 아니라 JSON → JS 상수 변환 한 줄)
- `bank/sources.md` — 출처 표(시험·연도·번호·층·유형·난이도). 원문 PDF는 **레포에 넣지 않는다**
- `app.js` — 진행 로직. `CONFIG.GAME_NAME`은 고른 차시에 따라 `수능던전_b1`~`수능던전_b5`·`수능던전_L1`~`L7`·`수능던전_모의고사`로 채운다
- `snippets/` — history26 `focus_guard.js`·`draft_guard.js`·`glossary.js` 복사본(2026-11-02 시점)
- `docs/교사용-안내.md` — 공통 5차시 흐름과 유연 +1·+2에서 바뀌는 점

## 차시·층 매핑
| 통합(공통) | 층 | 문항 수 |
|---|---|---|
| ⓑ1 `b1` | L1 탕평·세도 + L2a 농민 봉기·사회경제 | 층당 6 |
| ⓑ2 `b2` | L2b 실학·서민 문화 + L3 개항·개화 | 층당 6 |
| ⓑ3 `b3` | L4 동학·갑오·대한제국·국권 피탈 | 10 |
| ⓑ4 `b4` | L5 일제 통치·3·1·임정 + L6 무장 투쟁·민족 문화·사회 운동 | 층당 6 |
| ⓑ5 `b5` | L7 현대(6) → 통합 모의고사 15문항 개인전 | |
분할(유연): `L1`~`L7` 각 한 차시(8~10문항), 모의고사 `mock`은 20문항. 유연 +1 = ⓑ4를 L5/L6로, +2 = ⓑ1·ⓑ2를 L1/L2/L3으로.
`?s=b1` 식으로 차시를 주소에 박아 포털에 등록한다. 주소에 없으면 입구에서 고른다.

## 규칙
- 저장은 `history26_backend` 기본 제출 경로(action 없음, `gameName`=활동 id). 모둠 보스전은 태블릿 주인 학번으로 1행, `choicesJson`에 기숙사·모둠원·층별 클리어 시간·정답 기록, `reflection`에 오답 노트 글. Firebase·새 action을 만들지 않는다.
- 교사 화면(`?teacher=1`)의 통계는 교사 토큰을 **화면에서 입력**받아 `?mode=teacher`를 읽는다. 토큰을 코드·레포에 적지 않는다.
- 문항은 교육 목적 교실 활용. 출처(시험·연도·번호)를 화면에 표기하고, 어휘를 고친 문항은 `edited: true`로 «원문 아님» 표시를 붙인다. 공개 배포·재출판 금지.
- 예시·placeholder에 정답 힌트 금지. 태블릿 기본(폭 3단계·768px 이상 글자 확대). 움직임은 Sticky(HUD)·Scroll-triggered(카드 목록)·정답 순간 보스 피격만, `prefers-reduced-motion`이면 전부 끈다.
- 푸시는 작업 브랜치 → PR → 검증 뒤 `main` 병합·배포 확인까지 Claude가 한다(feedback-merge-prs-myself). 수정·배포 뒤 배포 주소를 내장 브라우저로 직접 연다.
- 기숙사 이름·색(`HOUSES`)은 ⓐ 문화사·ⓒ 총복습 앱과 맞춘다. 바꾸면 세 앱을 같이 바꾼다.
