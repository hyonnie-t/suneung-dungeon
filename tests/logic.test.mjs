// node --test tests/logic.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const Logic = require("../logic.js");

// 브라우저 전역 파일(plan.js·data.js·questions.js)을 한 컨텍스트에 올린다
const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ["data.js", "questions.js", "plan.js"]) vm.runInContext(fs.readFileSync(new URL("../" + f, import.meta.url), "utf8") + "\n;this.__x=1", ctx);
const G = vm.runInContext("({ SESSIONS, BUNDLES, QUESTIONS, KEYS, HOUSES, TEST, bundlesForSession })", ctx);

test("베팅 점수", () => {
  assert.equal(Logic.answerPts({ kind: "attack", pick: 2, conf: "sure", ok: true }), 3);
  assert.equal(Logic.answerPts({ kind: "attack", pick: 2, conf: "sure", ok: false }), -1);
  assert.equal(Logic.answerPts({ kind: "attack", pick: 2, conf: "maybe", ok: false }), 0);
  assert.equal(Logic.answerPts({ kind: "attack", pick: 2, conf: "guess", ok: true }), 1);
  assert.equal(Logic.answerPts({ kind: "demo", pick: 3, conf: "sure", ok: false }), 1, "시범 문제는 참여 1점");
  assert.equal(Logic.answerPts({ kind: "attack", pick: 0 }), 0, "안 푼 문제 0");
});

test("개인 점수: 한 줄 메모는 틀린 공격 문제에만, 10자 이상", () => {
  const ans = [
    { id: "a", kind: "attack", pick: 1, conf: "sure", ok: false },
    { id: "b", kind: "attack", pick: 1, conf: "sure", ok: true },
    { id: "c", kind: "demo", pick: 2, ok: false }
  ];
  const p = Logic.personal(ans, [{ id: "a", text: "환국과 예송을 헷갈렸다" }, { id: "b", text: "맞힌 문제 메모는 점수 없음" }, { id: "a2", text: "짧음" }]);
  assert.equal(p.pts, -1 + 3 + 1 + 1);
  assert.equal(p.dmg, 2);
  assert.equal(p.attackN, 2); assert.equal(p.attackOk, 1);
  assert.equal(Logic.personal([{ kind: "attack", pick: 1, conf: "sure", ok: false }], []).pts, 0, "0 아래로 안 감");
});

test("결산 순위는 반올림 전 평균으로", () => {
  const roster = ["30501", "30502", "30503", "30504", "30505", "30506"].map((id, i) => ({ studentId: id, house: i < 3 ? "청룡" : "백호" }));
  const subs = { "30501": { pts: 10 }, "30502": { pts: 10 }, "30503": { pts: 11 }, "30504": { pts: 10 }, "30505": { pts: 10 }, "30506": { pts: 10.9 } };
  const r = Logic.sessionHouses(roster, subs, [], null, 6);
  assert.equal(r.houses["청룡"].rankPts, 40); assert.equal(r.houses["백호"].rankPts, 30);
});

test("순위 포인트: 동점은 같은 포인트, 다음 순위 건너뜀", () => {
  assert.deepEqual(Logic.rankPoints({ 청룡: 5, 백호: 5, 주작: 3, 현무: 1 }), { 청룡: 40, 백호: 40, 주작: 20, 현무: 10 });
  assert.deepEqual(Logic.rankPoints({ 청룡: 2, 백호: null, 주작: 3 }), { 청룡: 30, 주작: 40 });
});

test("기숙사 결산: 분모는 출석자 전원, 미제출 0점, 보너스", () => {
  const roster = [
    { studentId: "30501", house: "청룡" }, { studentId: "30502", house: "청룡" },
    { studentId: "30503", house: "백호" }, { studentId: "30504", house: "백호" }
  ];
  const subs = { "30501": { pts: 10, dmg: 6, attackN: 6, attackOk: 6 }, "30503": { pts: 8, dmg: 4, attackN: 6, attackOk: 4 }, "30504": { pts: 8, dmg: 4, attackN: 6, attackOk: 4 } };
  const r = Logic.sessionHouses(roster, subs, [], { 청룡: 0.5, 백호: 0.6 }, 6);
  assert.equal(r.houses["청룡"].avg, 5, "미제출 30502가 0점으로 들어가 평균 5");
  assert.equal(r.houses["백호"].avg, 8);
  assert.equal(r.houses["백호"].rankPts, 40);
  assert.equal(r.houses["백호"].bonus.full, 5); assert.equal(r.houses["청룡"].bonus.full, 0);
  assert.equal(r.houses["청룡"].bonus.growth, 5, "정답률 0.5 → 1.0");
  assert.equal(r.hp, Math.ceil(6 * 3 * 0.7), "HP 인원 = 낸 학생 3명"); assert.equal(r.slain, true, "피해 14 ≥ HP 13"); assert.equal(r.houses["청룡"].bonus.boss, 5);
  const r2 = Logic.sessionHouses(roster, subs, ["30502"], null, 6);
  assert.equal(r2.houses["청룡"].avg, 10, "결석은 분모에서 뺀다");
  assert.equal(r2.houses["청룡"].bonus.full, 5);
});

test("차시 묶음: 층 하나 차시는 묶음 3개·공격 2, 두 층 차시는 core만·공격 1", () => {
  const b1 = G.bundlesForSession(G.SESSIONS.find(s => s.id === "b1"));
  assert.equal(b1.length, 3); assert.ok(b1.every(b => b.attacks.length >= 1 && b.attacks.length <= 2));
  const b3 = G.bundlesForSession(G.SESSIONS.find(s => s.id === "b3"));
  assert.ok(b3.length === 4 && b3.every(b => b.core && b.attacks.length === 1), JSON.stringify(b3.map(b => b.id)));
  const b5 = G.bundlesForSession(G.SESSIONS.find(s => s.id === "b5"));
  assert.ok(b5.length === 2 && b5.every(b => b.attacks.length === 1));
  for (const s of G.SESSIONS) {
    const st = Logic.steps(G.bundlesForSession(s));
    assert.ok(st.length + 1 <= G.KEYS.length, s.id + " 단계 수가 열쇠 글자보다 많음");
    assert.equal(new Set(st.map(x => x.qid)).size, st.length, s.id + " 같은 문항이 두 번");
  }
});

test("묶음 문항·단서가 은행과 맞음", () => {
  for (const b of G.BUNDLES) {
    for (const id of [b.demo, ...b.attacks]) {
      const q = G.QUESTIONS.find(x => x.id === id);
      assert.ok(q, "없는 문항 " + id);
      assert.equal(q.layer, b.layer, id);
    }
    const box = G.QUESTIONS.find(x => x.id === b.demo).box.replace(/__/g, "");
    for (const c of b.clues) assert.ok(box.includes(c), b.id + " 단서 «" + c + "»가 자료에 없음");
    assert.equal(b.card.flow.length, 3, b.id);
  }
});

test("성향 테스트: 문항 4개·보기 4개, 기숙사 페르소나 있음", () => {
  assert.equal(G.TEST.length, 4);
  for (const t of G.TEST) assert.equal(t.opts.length, 4);
  for (const h of G.HOUSES) assert.ok(h.persona && h.persona.type && h.persona.desc, h.name);
});

test("학생 화면 문자열에 검증 라벨·정답 힌트 예시 없음", () => {
  const src = ["index.html", "app.js", "data.js", "plan.js"].map(f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8")).join("\n");
  for (const w of ["검수", "원문 대조", "대조 전", "미확인", "[2차]", "(2차)", "확인 전"]) assert.ok(!src.includes(w), "라벨 " + w);
  const ph = [...src.matchAll(/placeholder="([^"]*)"/g)].map(m => m[1]).join(" ");
  for (const b of G.BUNDLES) for (const c of b.clues) assert.ok(!ph.includes(c), "placeholder에 단서 " + c);
});
