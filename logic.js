/* 수능 던전 2판 — 점수·기숙사 포인트 계산 (DOM 없음, node 테스트: node --test tests/logic.test.mjs)
 * 규칙은 클로드작업\산출물\수능던전_작업중\재설계안_2026-11-03.md 2절과 같다. 바꾸면 그 문서와 docs/교사용-안내.md도 같이. */
const Logic = (() => {
  // 자신감 베팅: 확신 +3/−1, 아마도 +2/0, 모르겠다 +1/0. 시범 문제는 고르기만 하면 +1(맞고 틀림 상관없음)
  const BET = { sure: { ok: 3, bad: -1 }, maybe: { ok: 2, bad: 0 }, guess: { ok: 1, bad: 0 } };
  const DEMO_PTS = 1, NOTE_PTS = 1, NOTE_MIN = 10;
  const RANK_PTS = [40, 30, 20, 10];
  const BONUS = { boss: 5, full: 5, growth: 5 };

  // 차시 → 단계 목록 [{kind:'demo'|'attack', qid, bundle, layer}]
  function steps(bundles) {
    const out = [];
    bundles.forEach(b => {
      out.push({ kind: "demo", qid: b.demo, bundle: b.id, layer: b.layer });
      b.attacks.forEach(q => out.push({ kind: "attack", qid: q, bundle: b.id, layer: b.layer }));
    });
    return out;
  }

  // 답 하나의 점수. a = {kind, pick, conf, ok}. 안 푼 문제(pick 없음)는 0
  function answerPts(a) {
    if (!a || !a.pick) return 0;
    if (a.kind === "demo") return DEMO_PTS;
    const bet = BET[a.conf] || BET.guess;
    return a.ok ? bet.ok : bet.bad;
  }
  // 보스에게 준 피해: 공격 문제 정답 1, 확신 정답 2
  function damage(a) {
    if (!a || a.kind !== "attack" || !a.ok) return 0;
    return a.conf === "sure" ? 2 : 1;
  }
  // 개인 점수 = 답 점수 합 + «왜 틀렸나» 한 줄(10자 이상) 하나에 +1(틀린 공격 문제 수까지). 0 아래로는 안 내려간다
  function personal(answers, notes) {
    const list = answers || [];
    const wrongIds = list.filter(a => a.kind === "attack" && a.pick && !a.ok).map(a => a.id);
    const noteN = (notes || []).filter(n => wrongIds.indexOf(n.id) >= 0 && String(n.text || "").trim().length >= NOTE_MIN).length;
    const raw = list.reduce((s, a) => s + answerPts(a), 0) + noteN * NOTE_PTS;
    const attacks = list.filter(a => a.kind === "attack");
    return {
      pts: Math.max(0, raw), noteN,
      dmg: list.reduce((s, a) => s + damage(a), 0),
      attackN: attacks.length, attackOk: attacks.filter(a => a.ok).length
    };
  }
  // 보스 HP = 공격 문항 수 × 참여 인원 × 0.7(올림, 최소 1). 수업 중엔 첫 공격 문제 공개 때 낸 인원, 결산은 결과를 낸 인원
  function bossHp(attackCount, present) {
    return Math.max(1, Math.ceil(attackCount * Math.max(1, present) * 0.7));
  }

  /* 순위 포인트: values {house: 평균}. 같은 값이면 같은 순위·같은 포인트, 다음 순위는 건너뛴다(40·40·20·10).
   * 값이 null인 기숙사(그 반에 없음)는 순위에서 뺀다. */
  function rankPoints(values) {
    const hs = Object.keys(values).filter(h => values[h] != null);
    const out = {};
    hs.forEach(h => {
      const better = hs.filter(x => values[x] > values[h] + 1e-9).length;
      out[h] = RANK_PTS[better] != null ? RANK_PTS[better] : 0;
    });
    return out;
  }

  /* 한 반·한 차시의 기숙사 결산.
   * roster [{studentId, house}] (확정 명단), subs {studentId: {pts, dmg, attackN, attackOk}} (그 차시 제출, 같은 학생 여러 번이면 마지막),
   * absent [studentId] (결석), prevRate {house: 지난 ⓑ 차시 정답률 0~1 | undefined}, attackCount(그 차시 공격 문항 수).
   * 분모는 명단 − 결석(출석자 전원). 미제출은 0점으로 들어간다. */
  function sessionHouses(roster, subs, absent, prevRate, attackCount) {
    const ab = new Set(absent || []);
    const by = {};
    roster.forEach(r => {
      const h = r.house; if (!h) return;
      by[h] = by[h] || { house: h, n: 0, submitted: 0, sum: 0, ok: 0, tried: 0, dmg: 0 };
      if (ab.has(r.studentId)) return;
      const s = subs[r.studentId];
      by[h].n++;
      if (s) { by[h].submitted++; by[h].sum += s.pts || 0; by[h].ok += s.attackOk || 0; by[h].tried += s.attackN || 0; by[h].dmg += s.dmg || 0; }
    });
    const avg = {};
    Object.values(by).forEach(x => { x.avg = x.n ? Math.round(x.sum / x.n * 10) / 10 : null; x.rate = x.tried ? x.ok / x.tried : 0; avg[x.house] = x.n ? x.sum / x.n : null; }); // 순위는 반올림 전 값으로
    const rank = rankPoints(avg);
    // 보스 HP의 인원 = 그 차시에 결과를 낸 학생(교사 수업 화면이 «분포를 낸 학생»으로 어림하는 것과 같은 기준)
    const present = Object.values(by).reduce((s, x) => s + x.submitted, 0);
    const totalDmg = Object.values(by).reduce((s, x) => s + x.dmg, 0);
    const slain = present > 0 && attackCount > 0 && totalDmg >= bossHp(attackCount, present);
    Object.values(by).forEach(x => {
      x.rankPts = rank[x.house] || 0;
      x.bonus = { boss: slain ? BONUS.boss : 0, full: x.n > 0 && x.submitted === x.n ? BONUS.full : 0,
        growth: prevRate && prevRate[x.house] != null && x.tried && x.rate - prevRate[x.house] >= 0.1 ? BONUS.growth : 0 };
      x.total = x.rankPts + x.bonus.boss + x.bonus.full + x.bonus.growth;
    });
    return { houses: by, slain, totalDmg, hp: bossHp(attackCount, present), present };
  }

  return { BET, DEMO_PTS, NOTE_MIN, RANK_PTS, BONUS, steps, answerPts, damage, personal, bossHp, rankPoints, sessionHouses };
})();
if (typeof module !== "undefined") module.exports = Logic;
