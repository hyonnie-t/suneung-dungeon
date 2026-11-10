/* 수능 던전 2판 — 진행 로직 (app.js, 2026-11-03 재설계)
 * 학생(개인 태블릿): s0 입구 → sHouse 역사 성향 테스트·기숙사 → sPlay 수업(열쇠 글자로 단계 열기) → sEnd 결과·제출. 모의고사는 sMock.
 * 교사(?teacher=1, 전자칠판): 수업 진행(문제·분포·단서·개념 카드·보스) / 기숙사 배정 / 기숙사 포인트 / 문제 은행.
 * 묶음·열쇠는 plan.js, 점수 규칙은 logic.js, 층·기숙사·차시는 data.js. 저장은 history26_backend 기본 제출 경로(gameName = 활동 id),
 * 기숙사 조회·분포는 v141 경로(mode=house·dungeonPick·dungeonTally·houseAssign·houseRoster). */
const CONFIG = {
  SHEET_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbyXSjCfWY_HiZFqW_OBR-FQDoIfF1z_STqyKWUI31MacHeY3u7hbirFSFDvW-5yuUHaJQ/exec",
  GAME_PREFIX: "수능던전",
  GAME_NAME: "" // 차시를 고를 때 채운다: 수능던전_b1 … 수능던전_L7, 수능던전_모의고사
};
const CIRCLE = ["①", "②", "③", "④", "⑤"];
const CONF = [
  { id: "sure", label: "🔥 확신", hint: "맞으면 +3 · 틀리면 −1" },
  { id: "maybe", label: "🙂 아마도", hint: "맞으면 +2" },
  { id: "guess", label: "🎲 모르겠다", hint: "맞으면 +1" }
];
const STEP_SEC = 75; // 문제 하나 풀이 시간(교사 화면 타이머, 넘겨도 막지 않는다)

const S = {
  sid: "", name: "", grade: 0, ban: 0, preview: false, teacher: false,
  session: null, sessIdx: 0, house: "", houseSource: "", steps: [],
  run: null, mock: null, submitted: false, sending: false, timer: null
};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* 교사 미리보기(?preview=1)에서는 열쇠 글자·필수 입력 없이 넘어간다. 학생 화면은 그대로. */
const skip = () => S.preview;
const qById = id => QUESTIONS.find(q => q.id === id);
const layerOf = id => LAYERS.find(l => l.id === id);
const bundleOf = id => BUNDLES.find(b => b.id === id);
const houseByName = n => HOUSES.find(h => h.name === n);
const fmtSec = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

function parseSid(sid) {
  if (!/^\d{5}$/.test(sid)) return null;
  return { grade: Number(sid[0]), ban: Number(sid.slice(1, 3)), num: Number(sid.slice(3)) };
}
function show(key) {
  ["s0", "sHouse", "sPlay", "sMock", "sEnd", "sTeacher"].forEach(k => { $(k).hidden = (k !== key); });
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
function sessionById(id) { return SESSIONS.find(s => s.id === id); }
function stepsOf(s) { return Logic.steps(bundlesForSession(s)); }
// 열쇠 글자: 차시마다 시작 위치를 달리해 지난 차시 글자로는 안 열리게
function keyFor(sessIdx, k) { return KEYS[(sessIdx * 7 + k) % KEYS.length]; }
const normKey = s => String(s || "").replace(/\s+/g, "");
function mockQuestions(n) { return QUESTIONS.filter(q => q.mock).slice(0, n).map(q => q.id); }

/* ───────── 문항 그리기(학생·교사 공용) ───────── */
// opt.clues: 형광펜 칠할 단서 / opt.big: 교사 화면 / opt.kind: 'demo'|'attack'
function questionHTML(q, n, total, opt) {
  opt = opt || {};
  const L = layerOf(q.layer);
  // 자료 안 __낱말__은 원문의 밑줄(문제에서 «밑줄 친 ○○»으로 가리키는 곳)
  let boxHtml = esc(q.box || "").replace(/__(.+?)__/g, "<u>$1</u>");
  (opt.clues || []).forEach(c => { boxHtml = boxHtml.split(esc(c)).join(`<mark class="clue">${esc(c)}</mark>`); });
  const box = q.box ? `<div class="q-box ${q.boxKind === "img" ? "img" : ""}">${boxHtml}</div>` : "";
  const note = q.edited ? `<p class="q-note">※ 사료 어휘를 중학생 수준으로 손봤어(원문 아님).</p>` : "";
  const self = /^self/.test(q.srcKey || "") ? `<p class="q-note">※ 자체 문항(교과서 내용으로 만든 문제)</p>` : "";
  const bogi = q.bogi ? `<div class="q-box"><b style="font-family:var(--sans)">&lt;보기&gt;</b>\n${q.bogi.map(esc).join("\n")}</div>` : "";
  const long = q.ch.some(c => c.length > 28);
  const kindTag = opt.kind === "demo" ? `<span class="tag demo">시범 문제 · 찍어도 괜찮아</span>` : opt.kind === "attack" ? `<span class="tag atk">⚔️ 보스 공격</span>` : `<span class="tag">${esc(q.type)}</span>`;
  return `<div class="card q-card ${opt.big ? "big" : ""}">
    <div class="q-meta"><span>${kindTag} <span class="tag pts">${esc(q.type)}</span></span><span>${n} / ${total} · ${esc(L.short)}</span></div>
    <p class="q-stem">${esc(q.q)}</p>${box}${note}${self}${bogi}
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
function conceptCardHTML(b, big) {
  return `<div class="card concept layer-${b.layer} ${big ? "big" : ""}"><p class="eyebrow" style="color:var(--accent)">개념 카드 · ${esc(layerOf(b.layer).short)}</p>
    <h3 class="concept-title">${esc(b.title)}</h3>
    <ol class="concept-flow">${b.card.flow.map(f => `<li>${esc(f)}</li>`).join("")}</ol>
    <p class="concept-trap"><b>헷갈리면 이것만</b> ${esc(b.card.trap)}</p></div>`;
}

/* ───────── 입구 ───────── */
function renderGate() {
  const common = SESSIONS.filter(s => s.group === "common");
  const split = SESSIONS.filter(s => s.group !== "common");
  const btn = s => `<button type="button" class="pick ${S.session && S.session.id === s.id ? "on" : ""}" data-s="${s.id}"><b>${esc(s.title)}</b><small>${esc(s.desc)}</small></button>`;
  $("sessionPick").innerHTML = common.map(btn).join("");
  $("sessionPickSplit").innerHTML = split.map(btn).join("");
  document.querySelectorAll(".pick").forEach(b => b.addEventListener("click", () => { S.session = sessionById(b.dataset.s); renderGate(); }));
  $("startBtn").textContent = S.session && S.session.mockOnly ? "모의고사 시작" : "던전 입장";
}

function startApp() {
  const sid = $("sid").value.trim(), name = $("sname").value.trim();
  const p = parseSid(sid);
  if (!p) { $("startErr").textContent = "학번은 숫자 5자리로 써 줘."; return; }
  if (!name) { $("startErr").textContent = "이름을 써 줘."; return; }
  if (!S.session) { $("startErr").textContent = "오늘 던전(차시)을 골라 줘."; return; }
  $("startErr").textContent = "";
  S.sid = sid; S.name = name; S.grade = p.grade; S.ban = p.ban;
  S.outText = ""; S.padletUrl = "";
  loadPadletUrl(p.grade, p.ban).then(u => { S.padletUrl = u; syncPadlet(); });
  S.sessIdx = SESSIONS.indexOf(S.session);
  CONFIG.GAME_NAME = CONFIG.GAME_PREFIX + "_" + S.session.gameId;
  FocusGuard.start({ key: CONFIG.GAME_NAME + ":" + sid }); // 화면 이탈·붙여넣기 기록
  if (window.DraftGuard) DraftGuard.start({ key: CONFIG.GAME_NAME, sid: sid }); // «왜 틀렸나» 칸 임시저장
  if (S.session.mockOnly) { startMock(S.session.mockCount); return; }
  const cached = store.get("sd2:house:" + sid);
  if (cached && cached.name === name && houseByName(cached.house)) {
    S.house = cached.house; S.houseSource = cached.source || "server";
    if (S.houseSource !== "self") { startRun(); return; }
    $("startBtn").disabled = true; $("startBtn").textContent = "기숙사 확인 중…";
    // 지난번에 직접 골랐으면 명단이 생겼는지 다시 묻는다(명단이 있으면 명단 기숙사로 바꾼다 — 점수가 가는 곳과 맞추려고)
    fetchHouse().then(h => { if (h) { S.house = h; S.houseSource = "server"; store.set("sd2:house:" + sid, { name, house: h, source: "server" }); } startRun(); });
    return;
  }
  startHouseTest();
}
// 백엔드 명단의 기숙사 이름(없거나 실패하면 "")
async function fetchHouse() {
  if (S.preview) return HOUSES[Number(S.sid.slice(3)) % HOUSES.length].name;
  try {
    const u = CONFIG.SHEET_WEBAPP_URL + "?mode=house&studentId=" + encodeURIComponent(S.sid) + "&name=" + encodeURIComponent(S.name);
    const json = await Promise.race([fetch(u).then(r => r.json()), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 6000))]);
    if (json.result === "success" && json.found && houseByName(json.house)) return json.house;
  } catch (e) { /* 못 찾음·느림은 같이 처리 */ }
  return "";
}

/* ───────── 역사 성향 테스트 → 기숙사 ─────────
 * 테스트 답은 결과에 쓰지 않는다. 결과는 백엔드가 성적 균형으로 미리 정한 기숙사(mode=house). 못 찾으면 학생이 고른다. */
function startHouseTest() {
  S.test = { i: 0 };
  show("sHouse");
  renderTest();
}
function renderTest() {
  const v = $("houseView"), i = S.test.i, t = TEST[i];
  v.innerHTML = `<header class="gate-head"><p class="eyebrow">기숙사 배정 · 역사 성향 테스트</p><h1 class="title" style="font-size:1.6rem">너는 어떤 역사 인물과 닮았을까?</h1></header>
    <div class="card rise"><p class="q-meta"><span>${i + 1} / ${TEST.length}</span></p><p class="q-stem">${esc(t.q)}</p>
    <div class="choices long">${t.opts.map((o, n) => `<button type="button" class="choice" data-n="${n}"><span class="num">${n + 1}</span><span>${esc(o)}</span></button>`).join("")}</div></div>`;
  v.querySelectorAll(".choice").forEach(b => b.addEventListener("click", () => {
    b.classList.add("picked");
    setTimeout(() => { S.test.i++; if (S.test.i < TEST.length) renderTest(); else revealHouse(); }, 220);
  }));
  rise(v);
}
async function revealHouse() {
  const v = $("houseView");
  v.innerHTML = `<div class="card boss-card"><div class="ico spin">🔮</div><h2>기숙사가 너를 고르는 중…</h2></div>`;
  const [house] = await Promise.all([fetchHouse(), new Promise(r => setTimeout(r, 900))]);
  if (!house) { renderHousePick(); return; }
  S.house = house; S.houseSource = "server";
  store.set("sd2:house:" + S.sid, { name: S.name, house, source: "server" });
  const h = houseByName(house);
  v.innerHTML = `<div class="card house-reveal rise" style="--hcolor:${h.color}"><div class="ico">${h.icon}</div>
    <p class="eyebrow">너는</p><h2>${esc(h.persona.type)}!</h2>
    <p>${esc(h.persona.desc)}</p>
    <p class="house-name">${esc(h.name)} 기숙사가 너를 골랐어</p>
    <p class="hint">이 기숙사로 수능 던전을 끝까지 함께해.</p>
    <button class="btn-main" type="button" id="enterBtn">던전 입장</button></div>`;
  $("enterBtn").addEventListener("click", startRun);
  rise(v);
}
function renderHousePick() {
  const v = $("houseView");
  v.innerHTML = `<div class="card"><h2 class="h2">기숙사를 아직 못 찾았어</h2><p>학번과 이름이 명단과 다르거나, 선생님이 아직 기숙사를 정하지 않았을 수 있어. <b>선생님께 내 기숙사를 물어보고</b> 골라 줘. 다음에 들어올 때 명단이 생겼으면 명단 기숙사로 바뀌어.</p>
    <div class="house-grid">${HOUSES.map(h => `<button type="button" class="house" style="--hcolor:${h.color}" data-h="${esc(h.name)}"><span class="ico">${h.icon}</span>${esc(h.name)}</button>`).join("")}</div>
    <button class="btn" type="button" id="retryHouse">학번·이름 다시 쓰기</button></div>`;
  v.querySelectorAll(".house").forEach(b => b.addEventListener("click", () => {
    if (!confirm(`${b.dataset.h} 기숙사가 맞아? 선생님께 들은 대로 골라야 해.`)) return;
    S.house = b.dataset.h; S.houseSource = "self";
    store.set("sd2:house:" + S.sid, { name: S.name, house: S.house, source: "self" });
    startRun();
  }));
  $("retryHouse").addEventListener("click", () => show("s0"));
}

/* ───────── 수업(개인 태블릿) ─────────
 * run.cur = 열린 단계(-1 = 대기실, steps.length = 마무리). phase: 'q' 풀기 / 'locked' 제출함 / 'result' 지난 문제 결과.
 * 다음 단계는 교사 화면의 열쇠 글자를 넣어야 열린다. 늦게 온 학생은 지금 글자를 넣으면 거기서 합류(놓친 문제는 0점). */
const runKey = () => "sd2:run:" + CONFIG.GAME_NAME + ":" + S.sid;
function saveRun() { store.set(runKey(), { ...S.run, house: S.house, houseSource: S.houseSource }); }
function startRun() {
  S.steps = stepsOf(S.session);
  const saved = store.get(runKey());
  if (saved && saved.submitted && saved.done) {
    show("sEnd"); S.submitted = true;
    $("endView").innerHTML = `<div class="card"><h2 class="h2">${esc(S.session.title)}</h2><p>이 차시 결과는 이미 보냈어 ✓</p><button class="btn-main" type="button" id="submitBtn" disabled>보냈어 ✓</button>${PADLET_BOX}</div>`;
    $("copyBtn").addEventListener("click", copyOut);
    afterSubmit(); return;
  }
  S.run = saved && saved.steps === S.steps.length ? saved : { steps: S.steps.length, cur: -1, phase: "lobby", answers: {}, notes: {}, cards: [], pending: null, picked: null, conf: "", submitted: false };
  S.submitted = !!S.run.submitted;
  show("sPlay");
  renderPlay();
}
function answersList() {
  return S.steps.map(st => S.run.answers[st.qid] ? { ...S.run.answers[st.qid], id: st.qid, kind: st.kind } : { id: st.qid, kind: st.kind, pick: 0, ok: false });
}
function myScore() {
  const notes = Object.entries(S.run.notes).map(([id, text]) => ({ id, text }));
  return Logic.personal(answersList().filter((a, i) => i < Math.max(0, S.run.cur) || S.run.answers[a.id]), notes);
}
function renderHud() {
  const h = houseByName(S.house);
  const st = S.steps[S.run.cur];
  $("sPlay").className = "page layer-" + (st ? st.layer : S.session.parts[0].layer);
  $("hudFloor").textContent = st ? layerOf(st.layer).short : S.session.title;
  $("hudStep").textContent = S.run.cur < 0 ? "대기실" : S.run.cur >= S.steps.length ? "마무리" : `${S.run.cur + 1} / ${S.steps.length}`;
  $("hudHouse").innerHTML = h ? `<span class="hbadge" style="--hcolor:${h.color}">${h.icon} ${esc(h.name)}</span>` : "";
  const sc = myScore();
  $("hudPts").textContent = sc.pts; $("hudDmg").textContent = sc.dmg; $("hudCards").textContent = S.run.cards.length;
}
function keyBoxHTML(msg) {
  return `<div class="card key-card"><p>${msg}</p>
    <div class="key-row"><input id="keyIn" type="text" maxlength="4" autocomplete="off" placeholder="두 글자" aria-label="열쇠 글자"><button class="btn primary" type="button" id="keyBtn">열기</button></div>
    <p id="keyErr" class="err" style="color:var(--bad)"></p>${skip() ? `<button class="btn" type="button" id="keySkip">(미리보기) 다음 단계</button>` : ""}</div>`;
}
function bindKey() {
  const go = () => {
    const val = normKey($("keyIn").value);
    for (let j = S.run.cur + 1; j <= S.steps.length; j++) {
      if (val && val === keyFor(S.sessIdx, j)) { openStep(j); return; }
    }
    $("keyErr").textContent = val ? "열쇠 글자가 달라. 칠판을 다시 봐 줘." : "칠판의 두 글자를 써 줘.";
  };
  $("keyBtn").addEventListener("click", go);
  $("keyIn").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  if ($("keySkip")) $("keySkip").addEventListener("click", () => openStep(S.run.cur + 1));
}
// 단계 j를 연다. 지금 단계에서 답한 게 있으면 결과부터 보여 준다(교사가 칠판에서 정답을 공개한 뒤라서).
function openStep(j) {
  const prev = S.run.cur;
  S.run.pending = j;
  const answeredPrev = prev >= 0 && prev < S.steps.length && S.run.answers[S.steps[prev].qid];
  if (answeredPrev) { S.run.phase = "result"; }
  else { goStep(j); return; }
  saveRun(); renderPlay();
}
function goStep(j) {
  // 열지 못하고 지나간 데모의 개념 카드도 도감에 넣는다(설명은 칠판에서 들었으니)
  for (let k = Math.max(0, S.run.cur); k < Math.min(j, S.steps.length); k++) {
    const st = S.steps[k];
    if (st.kind === "demo" && S.run.cards.indexOf(st.bundle) < 0) S.run.cards.push(st.bundle);
  }
  S.run.cur = j; S.run.pending = null; S.run.picked = null; S.run.conf = "";
  S.run.phase = j >= S.steps.length ? "end" : "q";
  saveRun();
  if (S.run.phase === "end") { finishRun(); return; }
  renderPlay();
}
/* 지난 차시 도감 카드(같은 태블릿에 남은 기록). 없으면 [] → 칸을 숨긴다. */
function prevCards() {
  for (const ps of prevSessionsOf(S.session)) {
    const r = store.get("sd2:run:" + CONFIG.GAME_PREFIX + "_" + ps.gameId + ":" + S.sid);
    const ids = r && Array.isArray(r.cards) ? r.cards.filter(id => bundleOf(id)) : [];
    if (ids.length) return { s: ps, ids };
  }
  return null;
}
function prevCardsHTML() {
  const pc = prevCards();
  if (!pc) return "";
  return `<div class="card prev-cards rise" id="prevCards"><h2 class="h2">📖 지난 시간 도감 다시 보기</h2>
    <p class="hint">${esc(pc.s.title)}에서 모은 카드 ${pc.ids.length}장. 선생님이 시작하기 전에 «헷갈리면 이것만»부터 다시 읽어 봐.</p></div>` +
    pc.ids.map(id => `<div class="rise">${conceptCardHTML(bundleOf(id))}</div>`).join("");
}
function renderPlay() {
  renderHud();
  const v = $("playView"), ph = S.run.phase;
  if (S.submitted || ph === "end") { finishRun(); return; }
  if (ph === "lobby") {
    const h = houseByName(S.house);
    v.innerHTML = `<div class="card boss-card rise"><div class="ico">${layerOf(S.session.parts[0].layer).boss.icon}</div>
      <p class="eyebrow" style="color:var(--accent)">${esc(S.session.title)}</p><h2>대기실</h2>
      <p>오늘은 선생님이 <b>시범 문제</b>를 칠판에서 같이 풀며 개념을 설명하고, 바로 같은 개념의 <b>보스 공격 문제</b>를 네가 혼자 풀어.</p>
      <p>문제마다 <b>자신감</b>을 골라: 🔥 확신(+3/−1) · 🙂 아마도(+2) · 🎲 모르겠다(+1). 기숙사 점수는 기숙사원 <b>평균</b>이라 한 명 한 명이 다 중요해.</p>
      <p class="hint">${h ? h.icon + " " + esc(h.name) + " 기숙사" : ""}</p></div>` + keyBoxHTML("선생님 칠판에 뜬 <b>열쇠 글자</b>를 넣으면 첫 문제가 열려.") + prevCardsHTML();
    bindKey(); rise(v); return;
  }
  const st = S.steps[S.run.cur];
  const q = qById(st.qid);
  if (ph === "q" || ph === "locked") {
    const a = S.run.answers[st.qid];
    v.innerHTML = questionHTML(q, S.run.cur + 1, S.steps.length, { kind: st.kind }) +
      (ph === "q"
        ? `<div class="card conf-card"><p class="h2">자신감</p><div class="conf-row">${CONF.map(c => `<button type="button" class="conf ${S.run.conf === c.id ? "on" : ""}" data-c="${c.id}"><b>${c.label}</b><small>${st.kind === "demo" ? "시범은 내면 +1" : c.hint}</small></button>`).join("")}</div>
           <button class="btn-main" type="button" id="lockBtn" disabled>제출하기</button><p class="hint">제출하면 바꿀 수 없어.</p></div>
           <details class="more late"><summary>못 풀었는데 선생님이 다음으로 넘어갔어</summary>${keyBoxHTML("칠판의 지금 <b>열쇠 글자</b>를 넣으면 거기로 가(이 문제는 0점).")}</details>`
        : `<div class="card locked-card"><p class="lead-ok">✔ 제출했어 — ${CIRCLE[a.pick - 1]} · ${esc((CONF.find(c => c.id === a.conf) || CONF[2]).label)}</p><p>정답은 선생님이 칠판에서 공개해. 설명을 듣고 다음 열쇠 글자를 넣어.</p></div>` + keyBoxHTML("다음 <b>열쇠 글자</b>"));
    if (ph === "q") {
      const ready = () => { $("lockBtn").disabled = !(S.run.picked && S.run.conf); };
      v.querySelectorAll(".choice").forEach(b => {
        if (Number(b.dataset.n) === S.run.picked) b.classList.add("picked");
        b.addEventListener("click", () => { S.run.picked = Number(b.dataset.n); v.querySelectorAll(".choice").forEach(x => x.classList.toggle("picked", Number(x.dataset.n) === S.run.picked)); ready(); });
      });
      v.querySelectorAll(".conf").forEach(b => b.addEventListener("click", () => { S.run.conf = b.dataset.c; v.querySelectorAll(".conf").forEach(x => x.classList.toggle("on", x === b)); ready(); }));
      ready();
      $("lockBtn").addEventListener("click", lockAnswer);
      bindKey();
    } else {
      v.querySelectorAll(".choice").forEach(b => { b.disabled = true; if (Number(b.dataset.n) === a.pick) b.classList.add("picked"); });
      bindKey();
    }
    return;
  }
  if (ph === "result") {
    const a = S.run.answers[st.qid];
    const pts = Logic.answerPts({ ...a, kind: st.kind });
    const b = bundleOf(st.bundle);
    const isDemo = st.kind === "demo";
    if (isDemo && S.run.cards.indexOf(st.bundle) < 0) { S.run.cards.push(st.bundle); saveRun(); renderHud(); }
    v.innerHTML = questionHTML(q, S.run.cur + 1, S.steps.length, { kind: st.kind }) +
      `<div class="feedback ${a.ok ? "ok" : "bad"}"><b class="lead">${a.ok ? (isDemo ? "맞혔어!" : "정답! 보스에게 " + Logic.damage({ ...a, kind: "attack" }) + "만큼 피해.") : "아직 자라는 중이야 🌱 정답은 " + CIRCLE[q.ans - 1] + "."}</b>
        <span class="pts-chip">${pts > 0 ? "+" : ""}${pts}점</span><br>${a.ok ? "" : "<b>왜?</b> "}${esc(q.exp)}${!a.ok && !isDemo ? `<p class="clue-line"><b>🔑 핵심 단서</b> ${esc(b.card.trap)}</p>` : ""}</div>` +
      (isDemo ? `<p class="eyebrow got">📖 도감에 개념 카드가 들어왔어</p>${conceptCardHTML(b)}` : "") +
      `<button class="btn-main" type="button" id="nextBtn" style="margin-top:12px">${S.run.pending >= S.steps.length ? "결과 보기" : "다음 문제"}</button>`;
    markChoices(v, q, a.pick);
    $("nextBtn").addEventListener("click", () => goStep(S.run.pending));
    rise(v); return;
  }
}
function lockAnswer() {
  const st = S.steps[S.run.cur], q = qById(st.qid);
  if (!S.run.picked || !S.run.conf) return;
  const ok = S.run.picked === q.ans;
  S.run.answers[st.qid] = { pick: S.run.picked, conf: S.run.conf, ok, kind: st.kind, bundle: st.bundle, layer: st.layer, type: q.type };
  S.run.phase = "locked";
  saveRun();
  sendPick(st.qid, S.run.picked, S.run.conf);
  renderPlay();
}
// 교사 화면 분포용. 실패해도 수업·점수에는 상관없다(한 번만 다시 시도).
async function sendPick(qid, pick, conf) {
  if (S.preview) return;
  const body = { action: "dungeonPick", studentId: S.sid, session: S.session.gameId, qid, pick, conf, house: S.house };
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(CONFIG.SHEET_WEBAPP_URL, { method: "POST", body: JSON.stringify(body) }); const j = await r.json(); if (j.result === "success") return; } catch (e) { /* 다시 */ }
  }
}

/* 마무리 → 제출 (ⓑ5는 제출 뒤 모의고사로 이어진다) */
function finishRun() {
  clearInterval(S.timer);
  show("sEnd");
  const sc = myScore();
  const list = answersList();
  const h = houseByName(S.house);
  const wrongs = list.filter(a => a.kind === "attack" && a.pick && !a.ok);
  const missed = list.filter(a => !a.pick).length;
  $("endView").innerHTML = `<div class="card rise"><p class="eyebrow" style="color:var(--accent)">던전 결과 · ${h ? h.icon + " " + esc(h.name) : ""} 기숙사</p>
    <h2 class="h2" style="font-size:1.4rem">${esc(S.session.title)}</h2>
    <div class="sum-grid">
      <div class="stat"><b id="endPts">${sc.pts}</b><span>내 점수</span></div>
      <div class="stat"><b>${sc.attackOk}/${sc.attackN}</b><span>보스 공격 정답</span></div>
      <div class="stat"><b>${sc.dmg}</b><span>보스에게 준 피해</span></div>
      <div class="stat"><b>${S.run.cards.length}</b><span>도감 개념 카드</span></div>
    </div>
    ${missed ? `<p class="hint">놓친 문제 ${missed}개는 0점이야.</p>` : ""}
    <p class="hint">내 점수는 기숙사 <b>평균</b>에 들어가. 보내지 않으면 0점으로 계산돼.</p></div>
    ${wrongs.length ? `<div class="card rise"><h2 class="h2">틀린 보스 공격 문제 — «왜 틀렸나» 한 줄 (하나에 +1, ${Logic.NOTE_MIN}자 이상)</h2>
      ${wrongs.map((a, i) => { const q = qById(a.id); return `<div class="wrong-item"><p class="st">${esc(q.q)}</p><p class="ex">내 답 ${CIRCLE[a.pick - 1]} · 정답 ${CIRCLE[q.ans - 1]} ${esc(q.ch[q.ans - 1])}<br>${esc(q.exp)}</p>
        <label class="field note-box"><span>왜 헷갈렸는지 한 줄</span><textarea name="why_${i}" data-q="${esc(a.id)}" placeholder="떠오르는 대로 한 줄">${esc(S.run.notes[a.id] || "")}</textarea></label></div>`; }).join("")}</div>` : ""}
    <div class="card rise"><h2 class="h2">📖 오늘의 도감</h2>${S.run.cards.map(id => conceptCardHTML(bundleOf(id))).join("") || "<p>아직 모은 카드가 없어.</p>"}</div>
    <div class="card rise"><p id="endErr" class="err" style="color:var(--bad)"></p>
    <button class="btn-main" type="button" id="submitBtn" ${S.submitted ? "disabled" : ""}>${S.submitted ? "보냈어 ✓" : "제출하고 복사하기"}</button>
    <p class="hint">보내면 고칠 수 없어. 보낼 때 글이 복사돼.</p>
    ${PADLET_BOX}</div>`;
  $("endView").querySelectorAll("textarea[data-q]").forEach(t => t.addEventListener("input", () => {
    if (S.submitted) return;
    S.run.notes[t.dataset.q] = t.value; saveRun();
    $("endPts").textContent = myScore().pts;
  }));
  $("submitBtn").addEventListener("click", submitRun);
  $("copyBtn").addEventListener("click", copyOut);
  syncPadlet();
  if (S.submitted) afterSubmit();
  rise($("endView"));
}

/* ── 제출하고 복사하기 → 패들렛 (제출 안 누르고 패들렛으로 가는 일을 막는다. 2026-11-10) ── */
const PADLET_BOX = '<div class="padlet-box" style="margin-top:10px"><a id="padletBtn" class="btn-main" target="_blank" rel="noopener" style="text-decoration:none;text-align:center" hidden>우리 반 패들렛 열기</a>' +
  '<button class="btn ghost" type="button" id="copyBtn" style="margin-top:8px" hidden>다시 복사</button><p id="padletMsg" class="hint"></p></div>';
function ensureUrlScheme(u) { u = String(u || "").trim(); return u && !/^https?:\/\//i.test(u) ? "https://" + u : u; }
/* 패들렛 링크는 백엔드 학년정보(포트폴리오)에서 가져온다(반 정보가 든 링크라 레포에 적지 않는다). */
async function loadPadletUrl(grade, ban) {
  try {
    const res = await fetch(CONFIG.SHEET_WEBAPP_URL + "?mode=curriculum");
    const json = await res.json();
    const pf = json && json.grades && json.grades[String(grade)] && json.grades[String(grade)].portfolio;
    if (!pf) return "";
    return ensureUrlScheme(pf.urlByBan ? (pf.urlByBan[ban] || pf.urlByBan[String(ban)] || "") : (pf.url || ""));
  } catch (e) { return ""; }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("data-no-draft", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}
const copyFirst = (text) => Promise.race([copyText(text), new Promise(r => setTimeout(() => r(false), 3000))]); // 클릭 직후에 복사를 먼저 시작해야 브라우저가 허용한다
function syncPadlet() {
  const a = $("padletBtn"), c = $("copyBtn"), m = $("padletMsg");
  if (!a || !c || !m) return;
  c.hidden = !(S.submitted && S.outText); // 제출한 글은 태블릿에 남기지 않아서, 새로고침하면 다시 복사는 못 한다
  if (!S.submitted) { a.hidden = true; m.textContent = S.padletUrl ? "보내면 패들렛 버튼이 열려." : ""; }
  else if (S.padletUrl) { a.href = S.padletUrl; a.hidden = false; m.textContent = ""; }
  else { a.hidden = true; m.textContent = "패들렛 링크는 선생님이 알려 준 곳을 써 줘."; }
}
async function copyOut() {
  const ok = S.outText ? await copyText(S.outText) : false;
  toast(ok ? "복사했어. 패들렛에 붙여 넣어 줘." : "복사가 안 됐어. 한 번 더 눌러 줘.");
}
function runText(sc, notes) {
  const h = houseByName(S.house);
  const head = ["[수능 던전] " + S.session.title + (h ? " · " + h.name + " 기숙사" : ""),
    "내 점수 " + sc.pts + "점 · 보스 공격 정답 " + sc.attackOk + "/" + sc.attackN + " · 피해 " + sc.dmg + " · 도감 카드 " + S.run.cards.length];
  return head.concat(notes.length ? ["", "왜 헷갈렸나"].concat(notes.map(n => "- " + n.text)) : []).join("\n");
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
  const sc = myScore(), list = answersList();
  const notes = Object.entries(S.run.notes).filter(([, t]) => String(t).trim()).map(([id, text]) => ({ id, text: String(text).trim() }));
  const body = {
    studentId: S.sid, studentName: S.name, gameName: CONFIG.GAME_NAME, groupId: S.house,
    choiceSummary: `${S.house} · ${S.session.title} · ${sc.pts}점 · 공격 ${sc.attackOk}/${sc.attackN} · 피해 ${sc.dmg} · 카드 ${S.run.cards.length}`,
    reflection: notes.map(n => `[${n.id}] ${n.text}`).join("\n"),
    choicesJson: JSON.stringify({ v: 2, house: S.house, houseSource: S.houseSource, session: S.session.id, pts: sc.pts, dmg: sc.dmg, attackN: sc.attackN, attackOk: sc.attackOk, noteN: sc.noteN,
      answers: list.map(a => ({ id: a.id, kind: a.kind, type: (qById(a.id) || {}).type, pick: a.pick || 0, conf: a.conf || "", ok: !!a.ok })), notes, cards: S.run.cards })
  };
  const out = runText(sc, notes);
  const copyP = copyFirst(out);
  if (S.preview) { toast("미리보기라 저장하지 않았어"); S.submitted = true; S.outText = out; afterSubmit(); return; }
  S.sending = true; $("submitBtn").disabled = true; $("submitBtn").textContent = "보내는 중…";
  try {
    await postBody(body);
    if (window.DraftGuard) DraftGuard.clear(); // 저장 성공 → 임시저장 삭제
    S.submitted = true; S.run.submitted = true;
    store.set(runKey(), { steps: S.run.steps, submitted: true, done: true }); // 공용 태블릿: 답·메모는 지운다
    S.outText = out; // 메모리에만 둔다(공용 태블릿에 글을 남기지 않는다)
    const copied = await copyP;
    toast(copied ? "보냈고 글도 복사했어!" : "보냈어! 복사가 안 됐으니 «다시 복사»를 눌러 줘."); afterSubmit();
  } catch (e) {
    $("endErr").textContent = /로그인/.test(e.message || "") ? e.message : "저장이 안 됐어. 인터넷을 확인하고 다시 눌러 줘. (답은 이 태블릿에 남아 있어)";
    $("submitBtn").disabled = false; $("submitBtn").textContent = "다시 보내기";
  } finally { S.sending = false; }
}
function afterSubmit() {
  syncPadlet();
  $("submitBtn").textContent = "보냈어 ✓"; $("submitBtn").disabled = true;
  $("endView").querySelectorAll("textarea[data-q]").forEach(t => { t.disabled = true; });
  if (S.session.mockCount && !$("mockGo")) {
    const b = document.createElement("button"); b.className = "btn-main"; b.type = "button"; b.id = "mockGo"; b.style.marginTop = "10px";
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
  $("mockTime").textContent = fmtSec(S.mock.limitSec);
  clearInterval(S.timer);
  S.timer = setInterval(() => {
    const left = S.mock.limitSec - (Date.now() - S.mock.startAt) / 1000;
    $("mockTime").textContent = fmtSec(Math.max(0, left));
    if (left <= 0 && !S.mock.done) gradeMock(true);
  }, 500);
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
function typeStatsHTML(answers) {
  const by = {};
  answers.forEach(a => { by[a.type] = by[a.type] || { n: 0, ok: 0 }; by[a.type].n++; if (a.ok) by[a.type].ok++; });
  const rows = Object.entries(by).map(([t, x]) => `<tr><td>${esc(t)}</td><td class="num">${x.ok}/${x.n}</td><td><div class="meter"><i style="width:${Math.round(x.ok / x.n * 100)}%"></i></div></td></tr>`).join("");
  return `<table class="tbl" style="margin-top:10px"><thead><tr><th>유형</th><th>정답</th><th>정답률</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    <button class="btn-main" type="button" id="submitBtn">제출하고 복사하기</button>
    <p class="hint">보낼 때 결과가 복사돼.</p>
    ${PADLET_BOX}</div>
    <div class="card rise"><h2 class="h2">틀린 문제 해설</h2>${m.results.filter(r => !r.ok).map(r => { const q = qById(r.id); return `<div class="wrong-item"><p class="st">${esc(q.q)}</p><p class="ex">내 답 ${r.pick ? CIRCLE[r.pick - 1] : "(안 함)"} · 정답 ${CIRCLE[q.ans - 1]} ${esc(q.ch[q.ans - 1])}<br>${esc(q.exp)}</p><p class="src">출처: ${esc(q.src)}</p></div>`; }).join("") || "<p>전부 맞혔어!</p>"}</div>`;
  $("copyBtn").addEventListener("click", copyOut);
  syncPadlet();
  $("submitBtn").addEventListener("click", async () => {
    if (S.sending || S.submitted) return;
    const body = {
      studentId: S.sid, studentName: S.name, gameName: CONFIG.GAME_PREFIX + "_모의고사", groupId: S.house || "",
      choiceSummary: `${t.name} · 정답 ${correct}/${m.qids.length} · ${score}점 · ${fmtSec(m.sec)}${timeout ? " · 시간 종료" : ""}`,
      reflection: "",
      choicesJson: JSON.stringify({ house: S.house, session: S.session.id, title: t.name, correct, total: m.qids.length, score, sec: m.sec, timeout: !!timeout, answers: m.results.map(r => ({ id: r.id, type: r.type, pick: r.pick, ok: r.ok })) })
    };
    const outM = "[통합 모의고사] " + t.name + " · 정답 " + correct + "/" + m.qids.length + " · " + score + "점 · " + fmtSec(m.sec) + (timeout ? " · 시간 종료" : "");
    const copyPM = copyFirst(outM);
    if (S.preview) { toast("미리보기라 저장하지 않았어"); S.submitted = true; S.outText = outM; syncPadlet(); $("submitBtn").textContent = "보냈어 ✓"; $("submitBtn").disabled = true; return; }
    S.sending = true; $("submitBtn").disabled = true; $("submitBtn").textContent = "보내는 중…";
    try { await postBody(body); if (window.DraftGuard) DraftGuard.clear(); S.outText = outM; const cpd = await copyPM; S.submitted = true; toast(cpd ? "보냈고 결과도 복사했어!" : "보냈어! 복사가 안 됐으니 «다시 복사»를 눌러 줘."); syncPadlet(); $("submitBtn").textContent = "보냈어 ✓"; }
    catch (e) { $("endErr").textContent = /로그인/.test(e.message || "") ? e.message : "저장이 안 됐어. 인터넷을 확인하고 다시 눌러 줘."; $("submitBtn").disabled = false; $("submitBtn").textContent = "다시 보내기"; }
    finally { S.sending = false; }
  });
  rise($("endView"));
}

/* ═════════ 교사 화면 ═════════
 * 토큰은 화면에서 받아 sessionStorage에만 둔다(코드·레포에 적지 않는다). 수업 진행 상태도 sessionStorage(새로고침해도 이어서). */
const T = { tab: "live", token: "", live: null, poll: null, tickT: null, assign: null, rows: null, roster: null, loading: false, ban: "" };
function ss(k, v) { try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k) || "null"); sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
function teacherToken() { if (!T.token) T.token = ss("sd_teacher_token") || ""; return T.token; }
function setToken(tk) { T.token = tk; ss("sd_teacher_token", tk); }
async function tGet(params) {
  const u = CONFIG.SHEET_WEBAPP_URL + "?" + Object.entries(params).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
  return (await fetch(u)).json();
}
async function tPost(body) {
  return (await fetch(CONFIG.SHEET_WEBAPP_URL, { method: "POST", body: JSON.stringify(body) })).json();
}
function tokenField() { return `<label class="field"><span>교사 토큰</span><input id="tokenIn" type="password" autocomplete="off" value="${esc(teacherToken())}"></label>`; }
function readToken() { const el = $("tokenIn"); if (el && el.value.trim()) setToken(el.value.trim()); return T.token; }

function renderTeacher() {
  show("sTeacher");
  document.querySelectorAll(".tab").forEach(b => {
    b.classList.toggle("on", b.dataset.tab === T.tab);
    b.onclick = () => { T.tab = b.dataset.tab; renderTeacher(); };
  });
  $("tLive").hidden = T.tab !== "live"; $("tHouses").hidden = T.tab !== "houses"; $("tPoints").hidden = T.tab !== "points"; $("tBank").hidden = T.tab !== "bank";
  if (T.tab !== "live") stopPoll();
  if (T.tab === "live") renderLive();
  if (T.tab === "houses") renderAssign();
  if (T.tab === "points") renderPoints();
  if (T.tab === "bank") renderBank();
}

/* ───────── 수업 진행 ───────── */
function liveSave() { ss("sd2_live", T.live); }
function stopPoll() { clearInterval(T.poll); T.poll = null; T.pollQid = ""; clearInterval(T.tickT); T.tickT = null; }
function renderLive() {
  if (!T.live) T.live = ss("sd2_live");
  const v = $("tLive");
  if (!T.live) {
    v.innerHTML = `<div class="card"><h2 class="h2">수업 시작</h2>
      <div class="row3">${tokenField()}<label class="field"><span>반</span><input id="banIn" type="text" inputmode="numeric" maxlength="2" value="${esc(T.ban || "5")}"></label>
      <label class="field"><span>차시</span><select id="sessIn">${SESSIONS.filter(s => !s.mockOnly).map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join("")}</select></label></div>
      <p class="hint">토큰이 있으면 학생들이 고른 답의 분포가 2초마다 뜬다. 없어도 문제·단서·개념 카드는 쓸 수 있어. 토큰은 이 탭을 닫으면 지워져.</p>
      <button class="btn primary" type="button" id="liveGo">수업 시작</button></div>`;
    $("liveGo").addEventListener("click", () => {
      readToken();
      const ban = String($("banIn").value.trim() || "5");
      T.ban = ban;
      const s = sessionById($("sessIn").value);
      T.live = { sessionId: s.id, gb: "3" + ban.padStart(2, "0"), k: -1, reveal: false, dist: false, clue: false, card: false, layerCard: false, snaps: {}, present: {}, openedAt: Date.now() };
      liveSave(); renderLive();
    });
    return;
  }
  const L = T.live, s = sessionById(L.sessionId), steps = stepsOf(s), sIdx = SESSIONS.indexOf(s);
  const st = steps[L.k];
  const keyNow = keyFor(sIdx, L.k + 1 > steps.length ? steps.length : Math.max(0, L.k));
  const layer = st ? st.layer : (L.k < 0 ? s.parts[0].layer : s.parts[s.parts.length - 1].layer);
  const bundleIdx = st ? bundlesForSession(s).findIndex(b => b.id === st.bundle) + 1 : 0;
  const label = L.k < 0 ? "대기실 — 학생 입장" : L.k >= steps.length ? "마무리" : `묶음 ${bundleIdx}/${bundlesForSession(s).length} · ${st.kind === "demo" ? "시범 문제(풀어 주며 설명)" : "⚔️ 보스 공격(학생 혼자)"}`;
  v.className = "tab-pane layer-" + layer;
  v.innerHTML = `<div class="live-top">
      <div class="live-head"><span class="live-title">${esc(s.title)} · ${Number(L.gb.slice(1))}반</span><span class="live-label">${esc(label)}</span>
        <span class="key-pill" title="학생이 넣을 열쇠 글자">🔑 ${esc(L.k < 0 ? keyFor(sIdx, 0) : keyNow)}</span><span class="live-time" id="liveTime"></span></div>
      <div class="live-bars" id="liveBars">${liveBarsHTML(s, steps, layer)}</div>
    </div>
    <div id="liveBody"></div>
    <div class="live-ctrl">
      <button class="btn ghost" type="button" id="lPrev" ${L.k < 0 ? "disabled" : ""}>◀ 이전</button>
      ${st ? `<button class="btn ${L.dist ? "primary" : ""}" type="button" id="lDist">분포 ${L.dist ? "숨기기" : "보기"}</button>
      <button class="btn ${L.reveal ? "primary" : ""}" type="button" id="lReveal">${L.reveal ? "정답 숨기기" : "정답 공개"}</button>` : ""}
      ${st && st.kind === "demo" ? `<button class="btn ${L.clue ? "primary" : ""}" type="button" id="lClue">🖍 단서</button><button class="btn ${L.card ? "primary" : ""}" type="button" id="lCard">📖 개념 카드</button>` : ""}
      <button class="btn ${L.layerCard ? "primary" : ""}" type="button" id="lLayer">층 정리</button>
      <button class="btn primary" type="button" id="lNext" ${L.k >= steps.length ? "disabled" : ""}>${L.k + 1 >= steps.length ? "마무리 ▶" : "다음 ▶"}</button>
      <button class="btn ghost" type="button" id="lEnd">설정</button>
    </div>`;
  const body = $("liveBody");
  if (L.k < 0) {
    body.innerHTML = `<div class="card boss-card"><div class="ico">${layerOf(layer).boss.icon}</div><h2>${esc(layerOf(layer).boss.name)}</h2><p>${esc(layerOf(layer).boss.line)}</p>
      <p class="big-key">열쇠 글자 <b>${esc(keyFor(sIdx, 0))}</b></p><p>학생: 학번·이름 → (처음이면 성향 테스트) → 대기실에서 위 글자를 넣으면 첫 문제가 열린다.</p></div>` + (L.layerCard ? layerCardHTML(layer) : "");
  } else if (L.k >= steps.length) {
    body.innerHTML = liveEndHTML(s, steps, sIdx) + (L.layerCard ? layerCardHTML(layer) : "");
  } else {
    const q = qById(st.qid), b = bundleOf(st.bundle);
    body.innerHTML = `<div class="live-grid ${L.card && st.kind === "demo" ? "with-card" : ""}"><div>${questionHTML(q, L.k + 1, steps.length, { kind: st.kind, big: true, clues: L.clue ? b.clues : [] })}</div>
      ${L.card && st.kind === "demo" ? `<div>${conceptCardHTML(b, true)}</div>` : ""}</div>
      ${L.dist || L.reveal ? `<div class="card dist" id="distBox">${distHTML(q, L.snaps[st.qid] || [], L.reveal)}</div>` : ""}
      ${L.layerCard ? layerCardHTML(layer) : ""}`;
    if (L.reveal) markChoices(body, q, 0);
  }
  const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
  bind("lPrev", () => liveMove(-1));
  bind("lNext", () => liveMove(1));
  bind("lDist", () => { L.dist = !L.dist; liveSave(); renderLive(); });
  bind("lReveal", () => { if (!L.reveal && teacherToken() && !confirmReveal(steps)) return; L.reveal = !L.reveal; if (L.reveal) fixPresent(steps); liveSave(); renderLive(); });
  bind("lClue", () => { L.clue = !L.clue; liveSave(); renderLive(); });
  bind("lCard", () => { L.card = !L.card; liveSave(); renderLive(); });
  bind("lLayer", () => { L.layerCard = !L.layerCard; liveSave(); renderLive(); });
  bind("lEnd", () => { if (!confirm("수업 진행을 끝내고 설정으로 돌아갈까? (기록한 분포는 지워져)")) return; stopPoll(); T.live = null; ss("sd2_live", null); renderLive(); });
  // 타이머(표시만)와 분포 폴링 — 이미 같은 문제를 폴링 중이면 그대로 둔다(다시 그릴 때마다 새로 시작하면 요청이 끝없이 이어진다)
  if (!T.tickT) T.tickT = setInterval(liveTick, 500);
  liveTick();
  const qid = st && teacherToken() && !S.preview ? st.qid : "";
  if (T.pollQid !== qid) {
    clearInterval(T.poll); T.poll = null; T.pollQid = qid;
    if (qid) { pollOnce(qid); T.poll = setInterval(() => pollOnce(qid), 2000); }
  }
}
function liveTick() {
  const el = $("liveTime"), L = T.live; if (!el || !L) return;
  const st = stepsOf(sessionById(L.sessionId))[L.k];
  const s2 = (Date.now() - L.openedAt) / 1000;
  el.textContent = st ? (s2 < STEP_SEC ? "⏱ " + fmtSec(STEP_SEC - s2) : "⏱ 시간 끝") : "";
}
function liveBarsHTML(s, steps, layer) {
  const boss = bossState(s, steps, layer), hs = houseLive(steps);
  return `<div class="bar boss"><span class="bar-label">${layerOf(layer).boss.icon} ${esc(layerOf(layer).boss.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${boss.hp ? Math.max(0, (boss.hp - boss.dmg) / boss.hp * 100) : 100}%"></div></div><span class="bar-num">${boss.hp ? Math.max(0, boss.hp - boss.dmg) + "/" + boss.hp : "—"}</span></div>
    <div class="house-bars">${HOUSES.map(h => `<span class="hb" style="--hcolor:${h.color}">${h.icon}<i style="width:${hs.max ? Math.round((hs.avg[h.name] || 0) / hs.max * 100) : 0}%"></i><b>${hs.avg[h.name] != null ? hs.avg[h.name].toFixed(1) : "—"}</b></span>`).join("")}</div>`;
}
// 정답을 공개하면 아직 안 낸 학생이 칠판을 보고 고를 수 있어서, 지금 문제를 낸 인원이 앞 문제보다 적으면 한 번 묻는다
function confirmReveal(steps) {
  const L = T.live, st = steps[L.k]; if (!st) return true;
  const now = (L.snaps[st.qid] || []).length;
  const before = Math.max(0, ...steps.slice(0, L.k).map(x => (L.snaps[x.qid] || []).length));
  if (now >= before) return true;
  return confirm(`지금 ${now}명 냈어(앞 문제는 ${before}명). 안 낸 학생이 정답을 보고 고를 수 있어. 그래도 공개할까?`);
}
function liveMove(d) {
  const L = T.live, s = sessionById(L.sessionId), steps = stepsOf(s);
  L.k = Math.max(-1, Math.min(steps.length, L.k + d));
  L.reveal = false; L.dist = false; L.clue = false; L.card = false; L.openedAt = Date.now();
  liveSave(); renderLive(); window.scrollTo(0, 0);
}
async function pollOnce(qid) {
  const L = T.live; if (!L) return;
  try {
    const j = await tGet({ mode: "dungeonTally", token: T.token, gradeBan: L.gb, session: sessionById(L.sessionId).gameId, qid });
    if (j.result !== "success") return;
    if (!T.live) return;
    const prevN = (L.snaps[qid] || []).length;
    L.snaps[qid] = j.picks; liveSave();
    const box = $("distBox");
    const s = sessionById(L.sessionId), steps = stepsOf(s), st = steps[L.k];
    if (box && st && st.qid === qid) box.innerHTML = distHTML(qById(qid), j.picks, L.reveal);
    if (prevN !== j.picks.length) renderLiveBars();
  } catch (e) { /* 다음 폴링에서 */ }
}
// 막대(보스·기숙사)만 다시 그린다(문항·분포·버튼은 그대로)
function renderLiveBars() {
  const L = T.live, el = $("liveBars"); if (!L || !el) return;
  const s = sessionById(L.sessionId), steps = stepsOf(s), st = steps[L.k];
  el.innerHTML = liveBarsHTML(s, steps, st ? st.layer : s.parts[s.parts.length - 1].layer);
}
function distHTML(q, picks, reveal) {
  const n = picks.length;
  const cnt = [0, 0, 0, 0, 0], sureWrong = picks.filter(p => p.c === "sure" && p.p !== q.ans).length;
  picks.forEach(p => { if (p.p >= 1 && p.p <= 5) cnt[p.p - 1]++; });
  const max = Math.max(1, ...cnt);
  return `<div class="q-meta"><span><b>제출 ${n}명</b></span>${reveal ? `<span class="warn">🔥 확신했는데 틀림 ${sureWrong}명</span>` : `<span>정답은 아직 숨김</span>`}</div>
    <div class="dist-rows">${q.ch.map((c, i) => `<div class="dist-row ${reveal && i + 1 === q.ans ? "right" : ""}"><span class="dn">${CIRCLE[i]}</span><div class="dist-track"><i style="width:${Math.round(cnt[i] / max * 100)}%"></i></div><span class="dc">${cnt[i]}</span></div>`).join("")}</div>
    ${!teacherToken() ? `<p class="hint">토큰 없이 시작해서 분포를 못 불러와. «설정»에서 토큰을 넣고 다시 시작해.</p>` : ""}`;
}
// 보스: 층의 공격 문항 수 × (그 층 첫 공격 문제를 공개할 때 제출 인원) × 0.7. 피해는 지금까지 받은 분포 기준(정답 1, 확신 정답 2)
function fixPresent(steps) {
  const L = T.live, st = steps[L.k];
  if (!st || st.kind !== "attack" || L.present[st.layer]) return;
  L.present[st.layer] = (L.snaps[st.qid] || []).length || 0;
}
function bossState(s, steps, layer) {
  const L = T.live;
  const atk = steps.filter(x => x.kind === "attack" && x.layer === layer);
  const present = L.present[layer] || 0;
  let dmg = 0;
  atk.forEach(x => { const q = qById(x.qid); (L.snaps[x.qid] || []).forEach(p => { dmg += Logic.damage({ kind: "attack", ok: p.p === q.ans, conf: p.c }); }); });
  return { hp: present ? Logic.bossHp(atk.length, present) : 0, dmg };
}
// 기숙사 평균(수업 중 어림값): 지금까지 분포의 점수 합 ÷ 그 기숙사에서 한 번이라도 낸 학생 수. 최종은 «기숙사 포인트» 탭(제출 기준)
function houseLive(steps) {
  const L = T.live, sum = {}, who = {};
  steps.forEach(x => {
    const q = qById(x.qid);
    (L.snaps[x.qid] || []).forEach(p => {
      if (!p.h) return;
      sum[p.h] = (sum[p.h] || 0) + Logic.answerPts({ kind: x.kind, pick: p.p, conf: p.c, ok: p.p === q.ans });
      (who[p.h] = who[p.h] || new Set()).add(p.num);
    });
  });
  const avg = {}; let max = 0;
  Object.keys(sum).forEach(h => { avg[h] = sum[h] / who[h].size; max = Math.max(max, avg[h]); });
  return { avg, max };
}
function liveEndHTML(s, steps, sIdx) {
  const layers = [...new Set(steps.map(x => x.layer))];
  const hs = houseLive(steps);
  const order = HOUSES.map(h => ({ h, a: hs.avg[h.name] })).filter(x => x.a != null).sort((a, b) => b.a - a.a);
  return `<div class="card"><h2 class="h2" style="font-size:1.4rem">마무리</h2>
    ${layers.map(l => { const b = bossState(s, steps, l), slain = b.hp && b.dmg >= b.hp; return `<p class="boss-line">${layerOf(l).boss.icon} ${esc(layerOf(l).boss.name)} — ${b.hp ? (slain ? "<b>처치!</b> " + esc(layerOf(l).boss.defeat) : `HP ${b.hp - b.dmg} 남음`) : "분포 기록 없음"}</p>`; }).join("")}
    <h3 class="h2" style="margin-top:12px">오늘 기숙사(수업 중 어림값)</h3>
    <ol class="rank">${order.map(x => `<li style="--hcolor:${x.h.color}">${x.h.icon} ${esc(x.h.name)} <b>${x.a.toFixed(1)}</b></li>`).join("") || "<li>분포 기록이 없어</li>"}</ol>
    <p class="big-key">학생 결과 화면 열쇠 <b>${esc(keyFor(sIdx, steps.length))}</b></p>
    <p>학생은 이 글자를 넣고 «제출하고 복사하기»까지 눌러야 기숙사 점수에 들어가(안 보내면 0점). 최종 포인트는 «기숙사 포인트» 탭에서.</p></div>`;
}
function layerCardHTML(layerId) {
  const c = CARDS.find(x => x.layer === layerId); if (!c) return "";
  return `<div class="card slide layer-${c.layer}"><p class="eyebrow" style="color:var(--torch-deep)">층 정리 · ${esc(layerOf(c.layer).name)}</p><h2>${esc(c.title)}</h2>
    <div class="flow">${c.flow.map((f, i) => (i ? "<i>→</i>" : "") + `<span>${esc(f)}</span>`).join("")}</div>
    <h3>헷갈리면 이것만</h3><ul>${c.traps.map(p => `<li>${esc(p)}</li>`).join("")}</ul></div>`;
}

/* ───────── 기숙사 배정(houseAssign) ───────── */
function renderAssign() {
  const v = $("tHouses"), a = T.assign;
  v.innerHTML = `<div class="card"><h2 class="h2">3학년 기숙사 배정</h2>
    <p>반마다 학기말 합계로 줄을 세워 4명씩 띠를 짓고, 띠마다 기숙사 4곳에 1명씩 넣은 뒤 같은 띠 안에서 맞바꿔 기숙사 평균을 맞춘다. 학생은 성향 테스트 뒤 이 기숙사를 결과로 본다(테스트 답과 상관없음).</p>
    <div class="row3">${tokenField()}<label class="field"><span>성적 기준</span><select id="basisIn"><option value="both">학기말 합계(수행 30 + 지필 70)</option><option value="exam">지필만</option></select></label><span></span></div>
    <p id="aErr" class="err" style="color:var(--bad)"></p>
    <div class="btn-row"><button class="btn primary" type="button" id="aPrev">미리보기</button>${a && a.result === "success" ? `<button class="btn" type="button" id="aConfirm" ${a.confirmed ? "disabled" : ""}>${a.confirmed ? "확정됨 ✓" : "이대로 확정"}</button>` : ""}<button class="btn" type="button" id="aRoster">확정 명단 보기</button></div></div>
    ${T.rosterView ? rosterHTML(T.rosterView, a) : ""}
    ${a && a.result === "success" ? assignHTML(a) : ""}`;
  $("aRoster").addEventListener("click", async () => {
    readToken(); if (!T.token) { $("aErr").textContent = "토큰을 넣어 줘."; return; }
    try { const j = await tGet({ mode: "houseRoster", token: T.token, grade: "3" }); if (j.result !== "success") throw new Error(j.message); T.rosterView = j.list; }
    catch (e) { $("aErr").textContent = e.message || "명단을 불러오지 못했어."; return; }
    renderAssign();
  });
  $("aPrev").addEventListener("click", async () => {
    readToken(); if (!T.token) { $("aErr").textContent = "토큰을 넣어 줘."; return; }
    $("aPrev").disabled = true; $("aPrev").textContent = "계산 중…";
    try { const j = await tPost({ action: "houseAssign", token: T.token, grade: "3", basis: $("basisIn").value }); if (j.result !== "success") throw new Error(j.message); T.assign = j; T.assign.basis = $("basisIn").value; }
    catch (e) { T.assign = null; renderAssign(); $("aErr").textContent = e.message || "불러오지 못했어(백엔드 재배포 전이면 이 기능이 아직 없어)."; return; }
    renderAssign();
  });
  if ($("aConfirm")) $("aConfirm").addEventListener("click", async () => {
    if (!confirm("이 배정으로 확정할까? 학생들이 성향 테스트 결과로 이 기숙사를 보게 돼.")) return;
    const send = overwrite => tPost({ action: "houseAssign", token: T.token, grade: "3", basis: T.assign.basis, confirm: true, overwrite });
    try {
      let j = await send(false);
      if (j.already && confirm("이미 확정된 배정이 있어. 덮어쓸까? (이미 기숙사를 본 학생은 바뀐 기숙사를 못 봐 — 태블릿에 남은 결과가 우선)")) j = await send(true);
      if (j.result !== "success") throw new Error(j.message);
      T.assign = { ...j, basis: T.assign.basis }; toast("확정했어"); renderAssign();
    } catch (e) { $("aErr").textContent = e.message || "확정 실패"; }
  });
}
/* 확정 명단: 반마다 기숙사 4칸에 이름. 미리보기를 불러 둔 상태면 반 안 순위로 상·중·하 띠를 붙인다(교사 화면 전용, 칠판에 띄우지 말 것). */
function rosterHTML(list, a) {
  if (!list.length) return `<div class="card"><p>확정된 명단이 없어.</p></div>`;
  const tier = {};
  if (a && a.list) {
    const byBan = {};
    a.list.forEach(s => { (byBan[s.studentId.slice(1, 3)] = byBan[s.studentId.slice(1, 3)] || []).push(s); });
    Object.values(byBan).forEach(arr => arr.slice().sort((x, y) => y.total - x.total).forEach((s, i, all) => {
      tier[s.studentId] = i < all.length / 3 ? "상" : i < all.length * 2 / 3 ? "중" : "하";
    }));
  }
  const byBan = {};
  list.forEach(s => { (byBan[s.studentId.slice(1, 3)] = byBan[s.studentId.slice(1, 3)] || []).push(s); });
  return `<div class="card"><h2 class="h2">확정 명단 — 기숙사별</h2>${Object.keys(tier).length ? `<p class="hint">이름 옆 상·중·하는 반 안 학기말 합계 순위(세 등분). 학생에게 보이지 말 것.</p>` : `<p class="hint">«미리보기»를 먼저 누르면 이름 옆에 상·중·하 띠가 같이 나와.</p>`}
    ${Object.entries(byBan).sort().map(([ban, arr]) => `<h3 class="bank-b">${Number(ban)}반 (${arr.length}명)</h3>
      <div class="roster-grid">${HOUSES.map(h => { const ms = arr.filter(s => s.house === h.name).sort((x, y) => x.studentId < y.studentId ? -1 : 1);
        const cnt = { 상: 0, 중: 0, 하: 0 }; ms.forEach(s => { if (tier[s.studentId]) cnt[tier[s.studentId]]++; });
        return `<div class="roster-col" style="--hcolor:${h.color}"><b>${h.icon} ${esc(h.name)} · ${ms.length}명</b>${Object.keys(tier).length ? `<small>상 ${cnt.상} · 중 ${cnt.중} · 하 ${cnt.하}</small>` : ""}
          <ul>${ms.map(s => `<li>${Number(s.studentId.slice(3))} ${esc(s.name)}${tier[s.studentId] ? ` <span class="tier t-${tier[s.studentId]}">${tier[s.studentId]}</span>` : ""}</li>`).join("")}</ul></div>`; }).join("")}</div>`).join("")}</div>`;
}
function assignHTML(a) {
  const byBan = {};
  a.list.forEach(s => { (byBan[s.studentId.slice(1, 3)] = byBan[s.studentId.slice(1, 3)] || []).push(s); });
  return `${(a.warnings || []).map(w => `<p class="warn-box">⚠️ ${esc(w)}</p>`).join("")}
    <div class="card"><p class="hint">지필: ${esc(a.examTitle || "-")} · 수행: ${esc(a.perfTitle || "-")}</p>
    <table class="tbl"><thead><tr><th>반</th>${HOUSES.map(h => `<th>${h.icon} ${esc(h.name)}<br><small>인원 · 평균</small></th>`).join("")}<th>평균 차이</th></tr></thead><tbody>
    ${a.summary.map(r => { const avgs = r.houses.map(h => h.avg); return `<tr><td>${Number(r.ban)}반 (${r.total}명)</td>${HOUSES.map(h => { const x = r.houses.find(y => y.house === h.name) || {}; return `<td class="num">${x.count || 0}명 · ${x.avg ?? "-"}</td>`; }).join("")}<td class="num">${(Math.max(...avgs) - Math.min(...avgs)).toFixed(1)}</td></tr>`; }).join("")}
    </tbody></table></div>
    ${Object.entries(byBan).map(([ban, list]) => `<details class="card"><summary><b>${Number(ban)}반 명단</b> (성적 포함 — 학생에게 보이지 말 것)</summary>
      <table class="tbl"><thead><tr><th>학번</th><th>이름</th><th>기숙사</th><th>합계</th><th>빈 점수</th></tr></thead><tbody>
      ${list.slice().sort((x, y) => y.total - x.total).map(s => `<tr><td>${esc(s.studentId)}</td><td>${esc(s.name)}</td><td>${esc(s.house)}</td><td class="num">${s.total}</td><td>${esc(s.missing || "")}</td></tr>`).join("")}</tbody></table></details>`).join("")}`;
}

/* ───────── 기숙사 포인트(제출 기준 최종) ───────── */
function renderPoints() {
  const v = $("tPoints");
  if (!T.rows) {
    v.innerHTML = `<div class="card"><h2 class="h2">기숙사 포인트 불러오기</h2><p class="hint">게임활동_로그의 «수능던전_» 제출과 확정된 기숙사 명단을 읽어 차시마다 순위 포인트(40·30·20·10)와 보너스(보스 처치·전원 참여·성장 각 +5)를 계산해. 평균의 분모는 명단 − 결석, 안 낸 학생은 0점.</p>
      <div class="row3">${tokenField()}<label class="field"><span>반</span><input id="banIn2" type="text" inputmode="numeric" maxlength="2" value="${esc(T.ban || "5")}"></label><span></span></div>
      <p id="pErr" class="err" style="color:var(--bad)"></p><button class="btn primary" type="button" id="pLoad" ${T.loading ? "disabled" : ""}>${T.loading ? "불러오는 중…" : "불러오기"}</button></div>`;
    $("pLoad").addEventListener("click", loadPoints);
    return;
  }
  const gb = "3" + String(T.ban).padStart(2, "0");
  const roster = T.roster.filter(r => r.studentId.slice(0, 3) === gb);
  const absentAll = store.get("sd2_absent") || {};
  let prevRate = null;
  const cum = {}; HOUSES.forEach(h => { cum[h.name] = 0; });
  const blocks = [];
  SESSIONS.filter(s => !s.mockOnly).forEach(s => {
    const game = CONFIG.GAME_PREFIX + "_" + s.gameId;
    const subs = {};
    T.rows.forEach(r => {
      if (r.gameName !== game || String(r.studentId || "").slice(0, 3) !== gb) return;
      let j; try { j = JSON.parse(r.choicesJson || "{}"); } catch (e) { return; }
      if (j.v !== 2) return;
      subs[String(r.studentId)] = { pts: j.pts || 0, dmg: j.dmg || 0, attackN: j.attackN || 0, attackOk: j.attackOk || 0 };
    });
    if (!Object.keys(subs).length) return;
    const key = gb + ":" + s.id;
    const absent = (absentAll[key] || "").split(/[,\s]+/).filter(Boolean).map(n => gb + n.padStart(2, "0"));
    const atk = stepsOf(s).filter(x => x.kind === "attack").length;
    const res = Logic.sessionHouses(roster, subs, absent, s.group === "common" ? prevRate : null, atk);
    if (s.group === "common") { prevRate = {}; Object.values(res.houses).forEach(x => { prevRate[x.house] = x.tried ? x.rate : undefined; }); }
    Object.values(res.houses).forEach(x => { cum[x.house] = (cum[x.house] || 0) + x.total; });
    blocks.push({ s, res, key, absent: absentAll[key] || "" });
  });
  const cumRank = HOUSES.map(h => ({ h, p: cum[h.name] || 0 })).sort((a, b) => b.p - a.p);
  v.innerHTML = `<div class="card"><div class="q-meta"><span><b>${Number(T.ban)}반</b> · 명단 ${roster.length}명</span><span><button class="btn" type="button" id="pReload">새로고침</button> <button class="btn" type="button" id="pCopy">표 복사</button> <button class="btn" type="button" id="pBan">반 바꾸기</button></span></div>
    <h2 class="h2" style="margin-top:10px">누적 기숙사 포인트 (수능 던전)</h2>
    <ol class="rank">${cumRank.map(x => `<li style="--hcolor:${x.h.color}">${x.h.icon} ${esc(x.h.name)} <b>${x.p}</b></li>`).join("")}</ol>
    ${roster.length ? "" : `<p class="warn-box">확정된 기숙사 명단이 없어. «기숙사 배정»에서 확정해야 분모(출석자 전원)를 셀 수 있어.</p>`}</div>
    ${blocks.map(b => `<div class="card"><h3 class="h2">${esc(b.s.title)} ${b.res.slain ? "· 🏆 보스 처치" : `· 보스 ${b.res.totalDmg}/${b.res.hp}`}</h3>
      <label class="field"><span>결석 번호(쉼표로, 이 기기에 저장)</span><input class="absIn" data-key="${esc(b.key)}" type="text" value="${esc(b.absent)}"></label>
      <table class="tbl"><thead><tr><th>기숙사</th><th>출석</th><th>제출</th><th>평균</th><th>순위</th><th>보스</th><th>전원</th><th>성장</th><th>합</th></tr></thead><tbody>
      ${HOUSES.map(h => { const x = b.res.houses[h.name]; if (!x) return ""; return `<tr><td>${h.icon} ${esc(h.name)}</td><td class="num">${x.n}</td><td class="num">${x.submitted}</td><td class="num">${x.avg ?? "-"}</td><td class="num">${x.rankPts}</td><td class="num">${x.bonus.boss}</td><td class="num">${x.bonus.full}</td><td class="num">${x.bonus.growth}</td><td class="num"><b>${x.total}</b></td></tr>`; }).join("")}
      </tbody></table></div>`).join("") || `<div class="card"><p>이 반의 2판 제출이 아직 없어.</p></div>`}
    ${worstHTML(gb)}`;
  v.querySelectorAll(".absIn").forEach(inp => inp.addEventListener("change", () => { const all = store.get("sd2_absent") || {}; all[inp.dataset.key] = inp.value; store.set("sd2_absent", all); renderPoints(); }));
  $("pReload").addEventListener("click", () => { T.rows = null; loadPoints(); });
  $("pBan").addEventListener("click", () => { const b = prompt("반 번호", T.ban); if (b) { T.ban = b.trim(); renderPoints(); } });
  $("pCopy").addEventListener("click", () => {
    const lines = ["누적\t" + cumRank.map(x => x.h.name + " " + x.p).join("\t")];
    blocks.forEach(b => { lines.push(b.s.title); HOUSES.forEach(h => { const x = b.res.houses[h.name]; if (x) lines.push([h.name, x.n, x.submitted, x.avg, x.rankPts, x.bonus.boss, x.bonus.full, x.bonus.growth, x.total].join("\t")); }); });
    navigator.clipboard.writeText(lines.join("\n")).then(() => toast("복사했어")).catch(() => toast("복사가 안 됐어"));
  });
}
function worstHTML(gb) {
  const byQ = {};
  T.rows.forEach(r => {
    if (!String(r.gameName || "").startsWith(CONFIG.GAME_PREFIX + "_") || String(r.studentId || "").slice(0, 3) !== gb) return;
    let j; try { j = JSON.parse(r.choicesJson || "{}"); } catch (e) { return; }
    (j.answers || []).forEach(a => { if (!a.pick) return; byQ[a.id] = byQ[a.id] || { n: 0, ok: 0, sureBad: 0 }; byQ[a.id].n++; if (a.ok) byQ[a.id].ok++; else if (a.conf === "sure") byQ[a.id].sureBad++; });
  });
  const worst = Object.entries(byQ).filter(([, x]) => x.n >= 2).map(([id, x]) => ({ id, ...x, rate: x.ok / x.n })).sort((a, b) => a.rate - b.rate).slice(0, 8);
  if (!worst.length) return "";
  return `<div class="card"><h3 class="h2">많이 틀린 문항 (다음 차시 도입에서 한 문제)</h3><table class="tbl"><thead><tr><th>문항</th><th>정답률</th><th>확신 오답</th></tr></thead><tbody>
    ${worst.map(w => { const q = qById(w.id); return q ? `<tr><td><b>${esc(q.q)}</b><br><span class="src">${esc(q.id)} · ${esc(q.src)}</span></td><td class="num">${Math.round(w.rate * 100)}% (${w.ok}/${w.n})</td><td class="num">${w.sureBad}</td></tr>` : ""; }).join("")}</tbody></table></div>`;
}
async function loadPoints() {
  readToken();
  if ($("banIn2")) T.ban = $("banIn2").value.trim() || T.ban || "5";
  if (!T.token) { $("pErr").textContent = "토큰을 넣어 줘."; return; }
  T.loading = true; renderPoints();
  try {
    const [rows, roster] = await Promise.all([tGet({ mode: "teacher", token: T.token }), tGet({ mode: "houseRoster", token: T.token, grade: "3" })]);
    if (!rows.rows) throw new Error(rows.message || "토큰이 틀렸거나 읽기 실패");
    T.rows = rows.rows.filter(r => String(r.gameName || "").startsWith(CONFIG.GAME_PREFIX + "_"));
    T.roster = roster.result === "success" ? roster.list : [];
  } catch (e) { T.rows = null; T.loading = false; renderPoints(); $("pErr").textContent = e.message; return; }
  T.loading = false; renderPoints();
}

/* ───────── 문제 은행 ───────── */
function renderBank() {
  const v = $("tBank");
  const used = new Set();
  BUNDLES.forEach(b => [b.demo, ...b.attacks].forEach(id => used.add(id)));
  const row = (q, role) => `<tr><td>${q.id}</td><td>${esc(role)}</td><td>${esc(q.type)}</td><td>${esc(q.q)}</td><td>${CIRCLE[q.ans - 1]} ${esc(q.ch[q.ans - 1])}</td><td>${esc(q.src)}</td></tr>`;
  v.innerHTML = `<p class="hint" style="color:var(--paper)">정답 포함 — 학생에게 보이지 말 것.</p>` + LAYERS.map(L => {
    const bs = BUNDLES.filter(b => b.layer === L.id);
    const rest = QUESTIONS.filter(q => q.layer === L.id && !q.mock && !used.has(q.id));
    return `<div class="card layer-${L.id}"><h2 class="h2">${esc(L.name)}</h2>
      ${bs.map(b => `<h3 class="bank-b">${esc(b.title)} ${b.core ? "<span class='tag'>통합 차시에도</span>" : ""}</h3><p class="src">단서: ${b.clues.map(esc).join(" · ")}</p>
        <table class="tbl"><tbody>${row(qById(b.demo), "시범")}${b.attacks.map((id, i) => row(qById(id), "공격" + (i + 1))).join("")}</tbody></table>`).join("")}
      ${rest.length ? `<h3 class="bank-b">묶음 밖(예비)</h3><table class="tbl"><tbody>${rest.map(q => row(q, "예비")).join("")}</tbody></table>` : ""}</div>`;
  }).join("") + `<div class="card layer-M"><h2 class="h2">통합 모의고사</h2><table class="tbl"><tbody>${QUESTIONS.filter(q => q.mock).map(q => row(q, "모의")).join("")}</tbody></table></div>`;
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
  if (s && sessionById(s)) { S.session = sessionById(s); $("sessionCard").hidden = true; }
  renderGate();
  $("startBtn").addEventListener("click", startApp);
  Glossary.start({ terms: GLOSSARY, unique: true, skip: [".eyebrow", ".title", ".hud", ".pick", ".house", ".choice", ".conf", ".tabs", ".toast", ".tbl", ".src", ".q-meta", ".key-card", ".house-reveal"] }); // 어려운 낱말 풀이. 선택지 안은 누르기와 겹쳐 밑줄을 긋지 않는다
}
init();
