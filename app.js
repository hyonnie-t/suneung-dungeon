/* 수능 던전 — 진행 로직 (app.js)
 * 화면: s0 입구 → sPlay 보스전(모둠) / sMock 통합 모의고사(개인) → sEnd 결과·제출. ?teacher=1 교사 화면.
 * 문항·층·차시·카드는 data.js / questions.js. 저장은 history26_backend 기본 제출 경로(gameName = 활동 id). */
const CONFIG = {
  SHEET_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbyXSjCfWY_HiZFqW_OBR-FQDoIfF1z_STqyKWUI31MacHeY3u7hbirFSFDvW-5yuUHaJQ/exec",
  GAME_PREFIX: "수능던전",
  GAME_NAME: "" // 차시를 고를 때 채운다: 수능던전_b1 … 수능던전_L7, 수능던전_모의고사
};
const TEAM_HP = 3;        // 모둠 하트
const REVIVE_HP = 2;      // 오답 노트 쓰고 부활할 때 하트
const NOTE_MIN = 20;      // 오답 노트 최소 글자
const CIRCLE = ["①", "②", "③", "④", "⑤"];

const S = {
  sid: "", name: "", grade: 0, ban: 0, preview: false, teacher: false,
  session: null, house: "", members: [],
  run: null, mock: null, submitted: false, sending: false, timer: null
};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* 교사 미리보기(?preview=1)에서는 필수 활동을 안 해도 다음으로 넘어간다. 학생 화면은 그대로. */
const skip = () => S.preview;
const qById = id => QUESTIONS.find(q => q.id === id);
const layerOf = id => LAYERS.find(l => l.id === id);
const fmtSec = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

function parseSid(sid) {
  if (!/^\d{5}$/.test(sid)) return null;
  return { grade: Number(sid[0]), ban: Number(sid.slice(1, 3)), num: Number(sid.slice(3)) };
}
function show(key) {
  ["s0", "sPlay", "sMock", "sEnd", "sTeacher"].forEach(k => { $(k).hidden = (k !== key); });
  window.scrollTo(0, 0);
}
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
}
/* 세로로 여러 장인 카드 목록: 보이는 순간 한 번 떠오름(Scroll-triggered) */
function rise(root) {
  const els = (root || document).querySelectorAll(".rise:not(.show)");
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("show")); return; }
  const io = new IntersectionObserver((ents) => {
    ents.forEach((en, i) => { if (en.isIntersecting) { setTimeout(() => en.target.classList.add("show"), i * 50); io.unobserve(en.target); } });
  }, { threshold: 0.1 });
  els.forEach(e => io.observe(e));
}

/* ───────── 문항 고르기 ───────── */
// 층(과 L2의 a/b 갈래)에 속한 문항을 은행 순서대로 n개. 같은 반 모든 모둠이 같은 문항을 받게 무작위를 쓰지 않는다.
function pickQuestions(layer, sub, n) {
  const pool = QUESTIONS.filter(q => q.layer === layer && (!sub || q.sub === sub) && !q.mock);
  return (n ? pool.slice(0, n) : pool).map(q => q.id);
}
function mockQuestions(n) {
  return QUESTIONS.filter(q => q.mock).slice(0, n).map(q => q.id);
}
function sessionById(id) { return SESSIONS.find(s => s.id === id); }

/* ───────── 입구 ───────── */
function renderGate() {
  const common = SESSIONS.filter(s => s.group === "common");
  const split = SESSIONS.filter(s => s.group !== "common");
  const btn = s => `<button type="button" class="pick ${S.session && S.session.id === s.id ? "on" : ""}" data-s="${s.id}"><b>${esc(s.title)}</b><small>${esc(s.desc)}</small></button>`;
  $("sessionPick").innerHTML = common.map(btn).join("");
  $("sessionPickSplit").innerHTML = split.map(btn).join("");
  document.querySelectorAll(".pick").forEach(b => b.addEventListener("click", () => { S.session = sessionById(b.dataset.s); renderGate(); }));
  $("housePick").innerHTML = HOUSES.map(h => `<button type="button" class="house ${S.house === h.id ? "on" : ""}" style="--hcolor:${h.color}" data-h="${h.id}"><span class="ico">${h.icon}</span>${esc(h.name)}</button>`).join("");
  document.querySelectorAll(".house").forEach(b => b.addEventListener("click", () => { S.house = b.dataset.h; renderGate(); }));
  const isMock = S.session && S.session.mockOnly;
  $("houseCard").hidden = !!isMock;
  $("startBtn").textContent = isMock ? "모의고사 시작" : "던전 입장";
}

function startApp() {
  const sid = $("sid").value.trim(), name = $("sname").value.trim();
  const p = parseSid(sid);
  if (!p) { $("startErr").textContent = "학번은 숫자 5자리로 써 줘."; return; }
  if (!name) { $("startErr").textContent = "이름을 써 줘."; return; }
  if (!S.session) { $("startErr").textContent = "오늘 던전(차시)을 골라 줘."; return; }
  if (!S.session.mockOnly && !S.house) { $("startErr").textContent = "기숙사를 골라 줘."; return; }
  $("startErr").textContent = "";
  S.sid = sid; S.name = name; S.grade = p.grade; S.ban = p.ban;
  S.members = $("members").value.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean).slice(0, 8);
  if (!S.members.length) S.members = [name];
  CONFIG.GAME_NAME = CONFIG.GAME_PREFIX + "_" + S.session.gameId;
  FocusGuard.start({ key: CONFIG.GAME_NAME + ":" + sid }); // 작성 중 화면 이탈·붙여넣기 기록
  if (window.DraftGuard) DraftGuard.start({ key: CONFIG.GAME_NAME, sid: sid }); // 오답 노트 칸 임시저장
  if (S.session.mockOnly) startMock(S.session.mockCount);
  else startRun();
}

/* ───────── 보스전 ───────── */
function startRun() {
  const parts = S.session.parts.map(pt => {
    const qids = pickQuestions(pt.layer, pt.sub, S.session.perFloor);
    const L = layerOf(pt.layer);
    return { layer: pt.layer, sub: pt.sub || "", qids, idx: 0, bossMax: qids.length, bossHp: qids.length, boss: L.boss, startAt: 0, clearSec: 0, correct: 0, wrong: 0 };
  });
  S.run = { parts, partIdx: 0, teamHp: TEAM_HP, revived: 0, answers: [], notes: [], state: "intro", picked: null, turn: 0, startAt: Date.now() };
  show("sPlay");
  startTimer("hudTime", () => (Date.now() - S.run.startAt) / 1000);
  renderPlay();
}
function startTimer(id, secFn) {
  clearInterval(S.timer);
  S.timer = setInterval(() => { const el = $(id); if (el) el.textContent = fmtSec(Math.max(0, secFn())); }, 500);
}
function curPart() { return S.run.parts[S.run.partIdx]; }
function curQ() { const pt = curPart(); return qById(pt.qids[pt.idx]); }

function renderHud() {
  const pt = curPart(), L = layerOf(pt.layer);
  $("sPlay").className = "page layer-" + pt.layer;
  $("hudFloor").textContent = `${S.run.partIdx + 1}/${S.run.parts.length}층 · ${L.short}`;
  const who = S.members[S.run.turn % S.members.length];
  $("hudTurn").textContent = S.run.state === "q" ? `${who} 차례` : "";
  $("bossName").textContent = pt.boss.name;
  $("bossBar").style.width = (pt.bossHp / pt.bossMax * 100) + "%";
  $("bossNum").textContent = `${pt.bossHp}/${pt.bossMax}`;
  $("teamHearts").innerHTML = Array.from({ length: TEAM_HP }, (_, i) => `<span class="${i < S.run.teamHp ? "" : "lost"}">❤️</span>`).join("");
}

function renderPlay() {
  renderHud();
  const v = $("playView"), pt = curPart(), L = layerOf(pt.layer), st = S.run.state;
  if (st === "intro") {
    v.innerHTML = `<div class="card boss-card rise">
      <div class="ico">${pt.boss.icon}</div>
      <p class="eyebrow" style="color:var(--accent)">${esc(L.name)}</p>
      <h2>${esc(pt.boss.name)}</h2>
      <p>${esc(pt.boss.line)}</p>
      <p><b>HP ${pt.bossMax}</b> · 문제 ${pt.bossMax}개를 맞히면 쓰러져. 틀리면 우리 하트가 하나 깎여.</p>
      <p class="hint">순서: ${S.members.map(esc).join(" → ")}</p>
      <button class="btn-main" type="button" id="goBtn">전투 시작</button></div>`;
    $("goBtn").addEventListener("click", () => { pt.startAt = Date.now(); S.run.state = "q"; S.run.picked = null; renderPlay(); });
    rise(v); return;
  }
  if (st === "q" || st === "fb") {
    const q = curQ();
    v.innerHTML = questionHTML(q, pt.idx + 1, pt.qids.length) + (st === "q"
      ? `<div class="btn-row"><button class="btn-main" type="button" id="checkBtn" disabled>정답 확인</button></div>`
      : feedbackHTML(q, S.run.picked) + `<div class="btn-row"><button class="btn-main" type="button" id="nextBtn">${pt.bossHp === 0 ? "보스 처치!" : "다음 문제"}</button></div>`);
    if (st === "q") {
      v.querySelectorAll(".choice").forEach(b => b.addEventListener("click", () => {
        S.run.picked = Number(b.dataset.n);
        v.querySelectorAll(".choice").forEach(x => x.classList.toggle("picked", Number(x.dataset.n) === S.run.picked));
        $("checkBtn").disabled = false;
      }));
      $("checkBtn").addEventListener("click", checkAnswer);
    } else {
      markChoices(v, q, S.run.picked);
      $("nextBtn").addEventListener("click", afterFeedback);
    }
    return;
  }
  if (st === "revive") { renderRevive(v); return; }
  if (st === "clear") {
    v.innerHTML = `<div class="card boss-card rise"><div class="ico">🏆</div><h2>${esc(pt.boss.name)} 처치!</h2>
      <p>걸린 시간 <b>${fmtSec(pt.clearSec)}</b> · 정답 ${pt.correct} / 오답 ${pt.wrong}</p>
      <p>${esc(pt.boss.defeat)}</p>
      <button class="btn-main" type="button" id="nextFloorBtn">${S.run.partIdx + 1 < S.run.parts.length ? "다음 층으로" : "던전 결과 보기"}</button></div>`;
    $("nextFloorBtn").addEventListener("click", () => {
      if (S.run.partIdx + 1 < S.run.parts.length) { S.run.partIdx++; S.run.state = "intro"; renderPlay(); }
      else finishRun();
    });
    rise(v); return;
  }
}

function questionHTML(q, n, total) {
  const L = layerOf(q.layer);
  // 자료 안 __낱말__은 원문의 밑줄(문제에서 «밑줄 친 ○○»으로 가리키는 곳)
  const box = q.box ? `<div class="q-box ${q.boxKind === "img" ? "img" : ""}">${esc(q.box).replace(/__(.+?)__/g, "<u>$1</u>")}</div>` : "";
  const note = q.edited ? `<p class="q-note">※ 사료 어휘를 중학생 수준으로 손봤어(원문 아님).</p>` : "";
  const bogi = q.bogi ? `<div class="q-box"><b style="font-family:var(--sans)">&lt;보기&gt;</b>\n${q.bogi.map(esc).join("\n")}</div>` : "";
  const long = q.ch.some(c => c.length > 28);
  return `<div class="card">
    <div class="q-meta"><span><span class="tag">${esc(q.type)}</span> <span class="tag pts">${q.pts}점</span></span><span>${n} / ${total} · ${esc(L.short)}</span></div>
    <p class="q-stem">${esc(q.q)}</p>${box}${note}${bogi}
    <div class="choices ${long ? "long" : ""}">${q.ch.map((c, i) => `<button type="button" class="choice" data-n="${i + 1}"><span class="num">${i + 1}</span><span>${esc(c)}</span></button>`).join("")}</div>
    <p class="src">출처: ${esc(q.src)}</p>
  </div>`;
}
function markChoices(root, q, pick) {
  root.querySelectorAll(".choice").forEach(b => {
    const n = Number(b.dataset.n); b.disabled = true;
    if (n === q.ans) b.classList.add("right");
    else if (n === pick) b.classList.add("wrong");
  });
}
function feedbackHTML(q, pick) {
  const ok = pick === q.ans;
  return `<div class="feedback ${ok ? "ok" : "bad"}"><b class="lead">${ok ? "정답! 보스에게 한 방." : `아쉽다. 정답은 ${CIRCLE[q.ans - 1]}.`}</b><br>${esc(q.exp)}</div>`;
}

function checkAnswer() {
  const pt = curPart(), q = curQ(), ok = S.run.picked === q.ans;
  S.run.answers.push({ id: q.id, layer: q.layer, type: q.type, pick: S.run.picked, ok, who: S.members[S.run.turn % S.members.length] });
  if (ok) { pt.bossHp--; pt.correct++; $("hud").classList.remove("boss-hit"); void $("hud").offsetWidth; $("hud").classList.add("boss-hit"); }
  else { pt.wrong++; S.run.teamHp--; $("playView").classList.remove("team-hit"); void $("playView").offsetWidth; $("playView").classList.add("team-hit"); }
  S.run.state = "fb";
  renderPlay();
}
function afterFeedback() {
  const pt = curPart();
  S.run.turn++;
  pt.idx++;
  if (pt.bossHp === 0 || pt.idx >= pt.qids.length) {
    // 문제가 다 떨어졌는데 보스가 살아 있으면 남은 HP만큼 하트를 깎지 않고 그냥 클리어 처리(수업 시간 보호)
    pt.clearSec = Math.round((Date.now() - pt.startAt) / 1000);
    S.run.state = "clear"; renderPlay(); return;
  }
  if (S.run.teamHp <= 0) { S.run.state = "revive"; renderPlay(); return; }
  S.run.state = "q"; S.run.picked = null; renderPlay();
}

/* 모둠 HP 0 → 오답 노트 쓰기로 부활 */
function renderRevive(v) {
  const wrongs = S.run.answers.filter(a => !a.ok).slice(-3).map(a => ({ a, q: qById(a.id) }));
  v.innerHTML = `<div class="card rise">
    <h2 class="h2">💀 모둠 HP 0 — 오답 노트로 부활</h2>
    <p>방금 틀린 문제를 돌아보고, <b>왜 틀렸는지·정답이 왜 맞는지</b>를 ${NOTE_MIN}자 이상 써야 하트 ${REVIVE_HP}개로 살아나.</p>
    ${wrongs.map(({ a, q }) => `<div class="wrong-item"><p class="st">${esc(q.q)}</p><p class="ex">내 답 ${CIRCLE[a.pick - 1]} ${esc(q.ch[a.pick - 1])}<br>정답 ${CIRCLE[q.ans - 1]} ${esc(q.ch[q.ans - 1])}</p><p class="ex">${esc(q.exp)}</p></div>`).join("")}
    <label class="field note-box"><span>오답 노트</span><textarea id="noteText" name="note_${S.run.notes.length}" placeholder="틀린 까닭과 바른 답의 근거를 적어 줘"></textarea></label>
    <p class="count" id="noteCount">0자</p>
    <button class="btn-main" type="button" id="reviveBtn" ${skip() ? "" : "disabled"}>부활하기</button></div>`;
  const ta = $("noteText");
  ta.addEventListener("input", () => {
    const n = ta.value.trim().length; $("noteCount").textContent = n + "자";
    $("reviveBtn").disabled = !(skip() || n >= NOTE_MIN);
  });
  $("reviveBtn").addEventListener("click", () => {
    const text = ta.value.trim();
    if (!skip() && text.length < NOTE_MIN) return;
    S.run.notes.push({ qids: wrongs.map(w => w.q.id), text });
    S.run.teamHp = REVIVE_HP; S.run.revived++;
    S.run.state = "q"; S.run.picked = null; renderPlay();
    toast("부활! 하트 " + REVIVE_HP + "개");
  });
  rise(v);
}

/* 던전 결과 → 제출 (ⓑ5는 결과 뒤 모의고사로 이어진다) */
function runScore() {
  const r = S.run;
  const correct = r.answers.filter(a => a.ok).length;
  let pts = correct * 10 + Math.max(0, r.teamHp) * 5;
  r.parts.forEach(p => { if (p.bossHp === 0 && p.clearSec <= 600) pts += 10; }); // 10분 안에 처치하면 +10
  pts -= r.revived * 5;
  return { correct, total: r.answers.length, pts: Math.max(0, pts) };
}
function finishRun() {
  clearInterval(S.timer);
  const sc = runScore();
  const r = S.run;
  show("sEnd");
  const house = HOUSES.find(h => h.id === S.house);
  $("endView").innerHTML = `<div class="card rise"><p class="eyebrow" style="color:var(--accent)">던전 결과 · ${esc(house.name)} 기숙사</p>
    <h2 class="h2" style="font-size:1.4rem">${r.parts.every(p => p.bossHp === 0) ? "던전 클리어!" : "보스가 아직 살아 있어"}</h2>
    <div class="sum-grid">
      <div class="stat"><b>${sc.correct}/${sc.total}</b><span>정답</span></div>
      <div class="stat"><b>${fmtSec(r.parts.reduce((s, p) => s + p.clearSec, 0))}</b><span>전투 시간</span></div>
      <div class="stat"><b>${r.revived}</b><span>부활</span></div>
      <div class="stat"><b>${sc.pts}</b><span>기숙사 점수</span></div>
    </div>
    ${typeStatsHTML(r.answers)}
    <p id="endErr" class="err" style="color:var(--bad)"></p>
    <button class="btn-main" type="button" id="submitBtn">결과 보내기</button>
    <p class="hint">점수는 기숙사 합계에 더해져. 보내면 고칠 수 없어.</p></div>
    <div class="card rise" id="wrongList"><h2 class="h2">오답 다시 보기</h2>${r.answers.filter(a => !a.ok).map(a => { const q = qById(a.id); return `<div class="wrong-item"><p class="st">${esc(q.q)}</p><p class="ex">정답 ${CIRCLE[q.ans - 1]} ${esc(q.ch[q.ans - 1])} — ${esc(q.exp)}</p><p class="src">출처: ${esc(q.src)}</p></div>`; }).join("") || "<p>틀린 문제가 없어. 대단해!</p>"}</div>`;
  $("submitBtn").addEventListener("click", submitRun);
  rise($("endView"));
}
function typeStatsHTML(answers) {
  const by = {};
  answers.forEach(a => { by[a.type] = by[a.type] || { n: 0, ok: 0 }; by[a.type].n++; if (a.ok) by[a.type].ok++; });
  const rows = Object.entries(by).map(([t, v]) => `<tr><td>${esc(t)}</td><td class="num">${v.ok}/${v.n}</td><td><div class="meter"><i style="width:${Math.round(v.ok / v.n * 100)}%"></i></div></td></tr>`).join("");
  return `<table class="tbl" style="margin-top:10px"><thead><tr><th>유형</th><th>정답</th><th>정답률</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function postBody(body) {
  Object.assign(body, FocusGuard.payload());
  const res = await fetch(CONFIG.SHEET_WEBAPP_URL, { method: "POST", body: JSON.stringify(body) });
  const json = await res.json();
  if (json.result !== "success") throw new Error(json.message || "저장 실패");
  return json;
}
async function submitRun() {
  if (S.sending || S.submitted) return;
  const r = S.run, sc = runScore();
  const house = HOUSES.find(h => h.id === S.house);
  const body = {
    studentId: S.sid, studentName: S.name, gameName: CONFIG.GAME_NAME,
    choiceSummary: `${house.name} · ${S.session.title} · 정답 ${sc.correct}/${sc.total} · ${fmtSec(r.parts.reduce((s, p) => s + p.clearSec, 0))} · 부활 ${r.revived} · ${sc.pts}점`,
    reflection: r.notes.map((n, i) => `[오답 노트 ${i + 1}] ${n.text}`).join("\n"),
    choicesJson: JSON.stringify({ house: S.house, session: S.session.id, members: S.members, points: sc.pts,
      floors: r.parts.map(p => ({ layer: p.layer, sub: p.sub, clearSec: p.clearSec, correct: p.correct, wrong: p.wrong, cleared: p.bossHp === 0 })),
      answers: r.answers.map(a => ({ id: a.id, type: a.type, pick: a.pick, ok: a.ok, who: a.who })), revived: r.revived, notes: r.notes })
  };
  if (S.preview) { toast("미리보기라 저장하지 않았어"); afterSubmit(); return; }
  S.sending = true; $("submitBtn").disabled = true; $("submitBtn").textContent = "보내는 중…";
  try {
    await postBody(body);
    if (window.DraftGuard) DraftGuard.clear(); // 저장 성공 → 임시저장 삭제
    S.submitted = true; toast("보냈어!"); afterSubmit();
  } catch (e) {
    $("endErr").textContent = /로그인/.test(e.message || "") ? e.message : "저장이 안 됐어. 인터넷을 확인하고 다시 눌러 줘.";
    $("submitBtn").disabled = false; $("submitBtn").textContent = "결과 보내기";
  } finally { S.sending = false; }
}
function afterSubmit() {
  $("submitBtn").textContent = "보냈어 ✓"; $("submitBtn").disabled = true;
  if (S.session.mockCount) {
    const b = document.createElement("button"); b.className = "btn-main"; b.type = "button"; b.style.marginTop = "10px";
    b.textContent = `통합 모의고사 ${S.session.mockCount}문항 (개인전) 시작`;
    b.addEventListener("click", () => { S.submitted = false; CONFIG.GAME_NAME = CONFIG.GAME_PREFIX + "_모의고사"; startMock(S.session.mockCount); });
    $("submitBtn").after(b);
  }
}

/* ───────── 통합 모의고사(개인전) ───────── */
function startMock(n) {
  const qids = mockQuestions(n);
  S.mock = { qids, idx: 0, picks: {}, startAt: Date.now(), limitSec: n >= 20 ? 25 * 60 : 20 * 60, done: false };
  show("sMock");
  $("sMock").className = "page layer-M";
  startTimer("mockTime", () => { const left = S.mock.limitSec - (Date.now() - S.mock.startAt) / 1000; if (left <= 0 && !S.mock.done) gradeMock(true); return left; });
  renderMock();
}
function renderMock() {
  const m = S.mock, q = qById(m.qids[m.idx]), v = $("mockView");
  $("mockProg").textContent = `${m.idx + 1} / ${m.qids.length}`;
  v.innerHTML = questionHTML(q, m.idx + 1, m.qids.length) +
    `<div class="btn-row"><button class="btn" type="button" id="prevBtn" ${m.idx === 0 ? "disabled" : ""}>◀ 이전</button>
     <button class="btn primary" type="button" id="nextBtn">${m.idx + 1 < m.qids.length ? "다음 ▶" : "답안 제출"}</button></div>
     <p class="hint">답한 문제 ${Object.keys(m.picks).length} / ${m.qids.length}</p>`;
  v.querySelectorAll(".choice").forEach(b => {
    if (Number(b.dataset.n) === m.picks[q.id]) b.classList.add("picked");
    b.addEventListener("click", () => { m.picks[q.id] = Number(b.dataset.n); v.querySelectorAll(".choice").forEach(x => x.classList.toggle("picked", Number(x.dataset.n) === m.picks[q.id])); });
  });
  $("prevBtn").addEventListener("click", () => { m.idx--; renderMock(); });
  $("nextBtn").addEventListener("click", () => {
    if (m.idx + 1 < m.qids.length) { m.idx++; renderMock(); return; }
    const left = m.qids.length - Object.keys(m.picks).length;
    if (left > 0 && !skip() && !confirm(`아직 ${left}문제를 안 풀었어. 그래도 제출할까?`)) return;
    gradeMock(false);
  });
}
function mockTitle(correct, total) {
  const r = correct / total;
  return TITLES.find(t => r >= t.min) || TITLES[TITLES.length - 1];
}
function gradeMock(timeout) {
  const m = S.mock; if (m.done) return;
  m.done = true; clearInterval(S.timer);
  m.sec = Math.round((Date.now() - m.startAt) / 1000);
  m.results = m.qids.map(id => { const q = qById(id); const pick = m.picks[id] || 0; return { id, type: q.type, layer: q.layer, pick, ok: pick === q.ans, pts: q.pts }; });
  const correct = m.results.filter(r => r.ok).length;
  const score = m.results.filter(r => r.ok).reduce((s, r) => s + r.pts, 0);
  const t = mockTitle(correct, m.qids.length);
  show("sEnd");
  $("endView").innerHTML = `<div class="card rise"><p class="eyebrow" style="color:var(--accent)">통합 모의고사 결과${timeout ? " · 시간 종료" : ""}</p>
    <div style="text-align:center"><span class="title-badge">${esc(t.icon)} ${esc(t.name)}</span><p class="hint">${esc(t.desc)}</p></div>
    <div class="sum-grid">
      <div class="stat"><b>${correct}/${m.qids.length}</b><span>정답</span></div>
      <div class="stat"><b>${score}</b><span>점수(배점 합)</span></div>
      <div class="stat"><b>${fmtSec(m.sec)}</b><span>걸린 시간</span></div>
      <div class="stat"><b>${Math.round(correct / m.qids.length * 100)}%</b><span>정답률</span></div>
    </div>
    ${typeStatsHTML(m.results)}
    <p id="endErr" class="err" style="color:var(--bad)"></p>
    <button class="btn-main" type="button" id="submitBtn">결과 보내기</button></div>
    <div class="card rise"><h2 class="h2">틀린 문제 해설</h2>${m.results.filter(r => !r.ok).map(r => { const q = qById(r.id); return `<div class="wrong-item"><p class="st">${esc(q.q)}</p><p class="ex">내 답 ${r.pick ? CIRCLE[r.pick - 1] : "(안 함)"} · 정답 ${CIRCLE[q.ans - 1]} ${esc(q.ch[q.ans - 1])}<br>${esc(q.exp)}</p><p class="src">출처: ${esc(q.src)}</p></div>`; }).join("") || "<p>전부 맞혔어!</p>"}</div>`;
  $("submitBtn").addEventListener("click", async () => {
    if (S.sending || S.submitted) return;
    const body = {
      studentId: S.sid, studentName: S.name, gameName: CONFIG.GAME_PREFIX + "_모의고사",
      choiceSummary: `${t.name} · 정답 ${correct}/${m.qids.length} · ${score}점 · ${fmtSec(m.sec)}${timeout ? " · 시간 종료" : ""}`,
      reflection: "",
      choicesJson: JSON.stringify({ house: S.house, session: S.session.id, title: t.name, correct, total: m.qids.length, score, sec: m.sec, timeout: !!timeout, answers: m.results.map(r => ({ id: r.id, type: r.type, pick: r.pick, ok: r.ok })) })
    };
    if (S.preview) { toast("미리보기라 저장하지 않았어"); $("submitBtn").textContent = "보냈어 ✓"; $("submitBtn").disabled = true; return; }
    S.sending = true; $("submitBtn").disabled = true; $("submitBtn").textContent = "보내는 중…";
    try { await postBody(body); if (window.DraftGuard) DraftGuard.clear(); S.submitted = true; toast("보냈어!"); $("submitBtn").textContent = "보냈어 ✓"; }
    catch (e) { $("endErr").textContent = /로그인/.test(e.message || "") ? e.message : "저장이 안 됐어. 인터넷을 확인하고 다시 눌러 줘."; $("submitBtn").disabled = false; $("submitBtn").textContent = "결과 보내기"; }
    finally { S.sending = false; }
  });
  rise($("endView"));
}

/* ───────── 교사 화면 ───────── */
const T = { tab: "cards", session: null, slide: 0, token: "", rows: null, loading: false };
function renderTeacher() {
  show("sTeacher");
  document.querySelectorAll(".tab").forEach(b => {
    b.classList.toggle("on", b.dataset.tab === T.tab);
    b.onclick = () => { T.tab = b.dataset.tab; renderTeacher(); };
  });
  $("tCards").hidden = T.tab !== "cards"; $("tStats").hidden = T.tab !== "stats"; $("tBank").hidden = T.tab !== "bank";
  if (T.tab === "cards") renderCards();
  if (T.tab === "stats") renderStats();
  if (T.tab === "bank") renderBank();
}
function cardsForSession(s) {
  if (!s) return [];
  return s.parts ? s.parts.map(p => CARDS.find(c => c.layer === p.layer)).filter(Boolean) : [];
}
function renderCards() {
  const v = $("tCards");
  if (!T.session) T.session = SESSIONS[0];
  const cards = cardsForSession(T.session);
  const c = cards[Math.min(T.slide, Math.max(0, cards.length - 1))];
  v.innerHTML = `<div class="pick-grid" style="margin-bottom:10px">${SESSIONS.map(s => `<button type="button" class="pick ${T.session.id === s.id ? "on" : ""}" data-s="${s.id}"><b>${esc(s.title)}</b><small>${esc(s.desc)}</small></button>`).join("")}</div>
    ${c ? `<div class="slide-nav"><button class="btn ghost" type="button" id="cPrev" ${T.slide === 0 ? "disabled" : ""}>◀ 앞 장</button><span>${T.slide + 1} / ${cards.length} · 15분 강의: ${cards.length > 1 ? "두 장을 이어서 7분씩" : "한 장 15분"}</span><button class="btn ghost" type="button" id="cNext" ${T.slide + 1 >= cards.length ? "disabled" : ""}>뒷 장 ▶</button></div>
    <div class="card slide layer-${c.layer}"><p class="eyebrow" style="color:var(--torch-deep)">수능에 이렇게 나온다 · ${esc(layerOf(c.layer).name)}</p><h2>${esc(c.title)}</h2>
      <h3>핵심 흐름</h3><div class="flow">${c.flow.map((f, i) => (i ? "<i>→</i>" : "") + `<span>${esc(f)}</span>`).join("")}</div>
      <ul>${c.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
      <h3>기출 유형 ① ${esc(c.patterns[0].name)}</h3><div class="pattern"><b>${esc(c.patterns[0].how)}</b><br>${esc(c.patterns[0].ex)}<br><span class="src">${esc(c.patterns[0].src)}</span></div>
      <h3>기출 유형 ② ${esc(c.patterns[1].name)}</h3><div class="pattern"><b>${esc(c.patterns[1].how)}</b><br>${esc(c.patterns[1].ex)}<br><span class="src">${esc(c.patterns[1].src)}</span></div>
      <h3>헷갈리면 이것만</h3><ul>${c.traps.map(p => `<li>${esc(p)}</li>`).join("")}</ul></div>` : `<div class="card"><p>이 차시는 강의 카드가 없어(모의고사만).</p></div>`}`;
  v.querySelectorAll(".pick").forEach(b => b.addEventListener("click", () => { T.session = sessionById(b.dataset.s); T.slide = 0; renderCards(); }));
  if (c) { $("cPrev").addEventListener("click", () => { T.slide--; renderCards(); }); $("cNext").addEventListener("click", () => { T.slide++; renderCards(); }); }
}
/* 통계: 교사 토큰은 화면에서 받아 sessionStorage에만 둔다(코드·레포에 적지 않는다). */
function renderStats() {
  const v = $("tStats");
  if (!T.token) { try { T.token = sessionStorage.getItem("sd_teacher_token") || ""; } catch (e) {} }
  if (!T.rows) {
    v.innerHTML = `<div class="card"><h2 class="h2">제출 기록 불러오기</h2><p class="hint">포털 교사 토큰을 넣으면 게임활동_로그에서 «수능던전_» 기록을 읽어 유형별 정답률·오답 상위 문항·기숙사 점수를 계산해. 토큰은 이 탭을 닫으면 지워져.</p>
      <div class="row2"><label class="field"><span>교사 토큰</span><input id="tokenIn" type="password" value="${esc(T.token)}"></label><label class="field"><span>반(비우면 전체)</span><input id="banIn" type="text" inputmode="numeric" placeholder="예: 5"></label></div>
      <p id="tErr" class="err" style="color:var(--bad)"></p><button class="btn primary" type="button" id="loadBtn" ${T.loading ? "disabled" : ""}>${T.loading ? "불러오는 중…" : "불러오기"}</button></div>`;
    $("loadBtn").addEventListener("click", loadStats);
    return;
  }
  const ban = T.ban;
  const rows = T.rows.filter(r => !ban || String(r.studentId || "").slice(1, 3) === String(ban).padStart(2, "0"));
  const sessions = {};
  rows.forEach(r => { sessions[r.gameName] = (sessions[r.gameName] || 0) + 1; });
  const answers = [];
  const housePts = {};
  rows.forEach(r => {
    let j; try { j = JSON.parse(r.choicesJson || "{}"); } catch (e) { return; }
    (j.answers || []).forEach(a => answers.push({ ...a, game: r.gameName }));
    if (j.house) { const h = j.house; housePts[h] = housePts[h] || { pts: 0, n: 0 }; housePts[h].pts += Number(j.points || j.score || 0); housePts[h].n++; }
  });
  const byType = {}, byQ = {};
  answers.forEach(a => {
    byType[a.type] = byType[a.type] || { n: 0, ok: 0 }; byType[a.type].n++; if (a.ok) byType[a.type].ok++;
    byQ[a.id] = byQ[a.id] || { n: 0, ok: 0, picks: {} }; byQ[a.id].n++; if (a.ok) byQ[a.id].ok++; byQ[a.id].picks[a.pick] = (byQ[a.id].picks[a.pick] || 0) + 1;
  });
  const worst = Object.entries(byQ).filter(([, v]) => v.n >= 2).map(([id, v]) => ({ id, ...v, rate: v.ok / v.n })).sort((a, b) => a.rate - b.rate).slice(0, 8);
  v.innerHTML = `<div class="card"><div class="q-meta"><span>기록 ${rows.length}건 · 답 ${answers.length}개 ${ban ? "· " + ban + "반" : "· 전체"}</span><span><button class="btn" type="button" id="reloadBtn">새로고침</button> <button class="btn" type="button" id="copyBtn">표 복사</button></span></div>
    <h2 class="h2" style="margin-top:10px">기숙사 점수</h2><table class="tbl"><thead><tr><th>기숙사</th><th>제출</th><th>점수 합</th></tr></thead><tbody>${HOUSES.map(h => `<tr><td>${h.icon} ${esc(h.name)}</td><td class="num">${(housePts[h.id] || {}).n || 0}</td><td class="num">${(housePts[h.id] || {}).pts || 0}</td></tr>`).join("")}</tbody></table>
    <h2 class="h2" style="margin-top:14px">유형별 정답률</h2><table class="tbl"><thead><tr><th>유형</th><th>답 수</th><th>정답률</th></tr></thead><tbody>${Object.entries(byType).map(([t, x]) => `<tr><td>${esc(t)}</td><td class="num">${x.n}</td><td><span class="pct">${Math.round(x.ok / x.n * 100)}%</span><div class="meter"><i style="width:${Math.round(x.ok / x.n * 100)}%"></i></div></td></tr>`).join("")}</tbody></table>
    <h2 class="h2" style="margin-top:14px">오답 상위 문항 (오답 5분에 짚을 것)</h2><table class="tbl"><thead><tr><th>문항</th><th>정답률</th><th>많이 고른 답</th></tr></thead><tbody>${worst.map(w => { const q = qById(w.id); if (!q) return ""; const top = Object.entries(w.picks).sort((a, b) => b[1] - a[1])[0]; return `<tr><td><b>${esc(q.q)}</b><br><span class="src">${esc(q.src)} · 정답 ${CIRCLE[q.ans - 1]}</span></td><td class="num">${Math.round(w.rate * 100)}% (${w.ok}/${w.n})</td><td>${top ? CIRCLE[top[0] - 1] + " " + esc(q.ch[top[0] - 1]) : ""}</td></tr>`; }).join("") || "<tr><td colspan=3>아직 2번 이상 풀린 문항이 없어.</td></tr>"}</tbody></table>
    <p class="hint">차시별 제출: ${Object.entries(sessions).map(([g, n]) => esc(g) + " " + n).join(" · ") || "없음"}</p></div>`;
  $("reloadBtn").addEventListener("click", () => { T.rows = null; loadStats(); });
  $("copyBtn").addEventListener("click", () => {
    const text = Object.entries(byType).map(([t, x]) => `${t}\t${x.ok}/${x.n}\t${Math.round(x.ok / x.n * 100)}%`).join("\n") + "\n\n" + worst.map(w => { const q = qById(w.id); return q ? `${q.src}\t${Math.round(w.rate * 100)}%\t${q.q}` : ""; }).join("\n");
    navigator.clipboard.writeText(text).then(() => toast("복사했어")).catch(() => toast("복사가 안 됐어"));
  });
}
async function loadStats() {
  const tk = $("tokenIn") ? $("tokenIn").value.trim() : T.token;
  if (!tk) { $("tErr").textContent = "토큰을 넣어 줘."; return; }
  T.token = tk; try { sessionStorage.setItem("sd_teacher_token", tk); } catch (e) {}
  T.ban = $("banIn") ? $("banIn").value.trim() : T.ban;
  T.loading = true; renderStats();
  try {
    const res = await fetch(CONFIG.SHEET_WEBAPP_URL + "?mode=teacher&token=" + encodeURIComponent(tk));
    const json = await res.json();
    if (!json.rows) throw new Error(json.message || "토큰이 틀렸거나 읽기 실패");
    T.rows = json.rows.filter(r => String(r.gameName || "").startsWith(CONFIG.GAME_PREFIX + "_"));
  } catch (e) { T.rows = null; T.loading = false; renderStats(); $("tErr").textContent = e.message; return; }
  T.loading = false; renderStats();
}
function renderBank() {
  const v = $("tBank");
  const by = {};
  QUESTIONS.forEach(q => { const k = q.mock ? "M" : q.layer; (by[k] = by[k] || []).push(q); });
  v.innerHTML = Object.entries(by).map(([k, qs]) => `<div class="card layer-${k}"><h2 class="h2">${k === "M" ? "통합 모의고사" : esc(layerOf(k).name)} · ${qs.length}문항</h2>
    <table class="tbl"><thead><tr><th>id</th><th>유형</th><th>점</th><th>문항</th><th>정답</th><th>출처</th></tr></thead><tbody>${qs.map(q => `<tr><td>${q.id}</td><td>${esc(q.type)}</td><td class="num">${q.pts}</td><td>${esc(q.q)}${q.sub ? " <span class='tag'>" + q.sub + "</span>" : ""}</td><td>${CIRCLE[q.ans - 1]}</td><td>${esc(q.src)}</td></tr>`).join("")}</tbody></table></div>`).join("");
}

/* ───────── 시작 ───────── */
function init() {
  const u = new URLSearchParams(location.search);
  S.preview = u.get("preview") === "1";
  S.teacher = u.get("teacher") === "1";
  $("previewBar").hidden = !S.preview;
  if (S.teacher) { renderTeacher(); return; }
  const sid = u.get("sid") || (S.preview ? "30599" : ""), name = u.get("name") || (S.preview ? "미리보기" : "");
  if (sid) $("sid").value = sid;
  if (name) $("sname").value = name;
  const s = u.get("s");
  if (s && sessionById(s)) S.session = sessionById(s);
  renderGate();
  $("startBtn").addEventListener("click", startApp);
  Glossary.start({ terms: GLOSSARY, unique: true, skip: [".eyebrow", ".title", ".hud", ".pick", ".house", ".choice", ".tabs", ".toast", ".tbl", ".src", ".q-meta"] }); // 어려운 낱말 풀이. 선택지 안은 누르기와 겹쳐 밑줄을 긋지 않는다
}
init();
