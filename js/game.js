// =====================================================================
//  게임 화면 파일
//  - 화면 그리기, 터치/클릭 처리, 진행 순서(조준 → 토스 → 비행 → 리시브 → 결과)
//  - 계산 규칙은 rules.js 에 있어요.
// =====================================================================

// ---------- 기본 선수 데이터 (능력치는 0~100) ----------
// acc = 서브 정확도(원 크기), pow = 서브 파워(공 속도, 리시브 난이도)
const DEFAULT_OUR = [
  { num: 7,  name: '강서브', acc: 55, pow: 88 },
  { num: 3,  name: '정확해', acc: 88, pow: 55 },
  { num: 10, name: '박균형', acc: 72, pow: 72 },
  { num: 1,  name: '최세터', acc: 70, pow: 50 },
  { num: 12, name: '이미들', acc: 50, pow: 65 },
  { num: 15, name: '한신인', acc: 40, pow: 40 },
];
// receive = 리시브 능력, x/y = 서 있는 위치(m)
const DEFAULT_OPP = [
  { num: 4,  name: '레프트1', receive: 72, x: 1.6, y: 3.2 },
  { num: 9,  name: '리베로',  receive: 88, x: 4.5, y: 3.6 },
  { num: 11, name: '레프트2', receive: 66, x: 7.4, y: 3.2 },
  { num: 8,  name: '미들1',   receive: 35, x: 1.8, y: 7.0 },
  { num: 2,  name: '세터',    receive: 45, x: 4.5, y: 7.6 },
  { num: 17, name: '아포짓',  receive: 50, x: 7.2, y: 7.0 },
];
// 우리 팀 서버를 뺀 5명이 서는 자리
const OUR_SPOTS = [
  { x: 1.5, y: 11.5 }, { x: 4.5, y: 11.3 }, { x: 7.5, y: 11.5 },
  { x: 1.5, y: 15.5 }, { x: 4.5, y: 15.5 },
];
const SERVER_SPOT = { x: 7.3, y: 19.6 };
const SETTER_SPOT = { x: 5.4, y: 7.9 };  // 좋은 리시브가 가야 하는 곳

// 결과 기호별 색 (우리 서버 입장: 노랑 = 아주 좋음, 빨강 = 아쉬움)
const GRADE_COLOR = {
  '=': '#ffd23f', '/': '#7be07b', '-': '#b6e3a8', '!': '#cfd6e0',
  '+': '#ff9f5a', '#': '#ff5d5d', 'E': '#a58bff',
};

// 화면에 보이는 영역(m): 코트 바깥 여유 공간 포함
const VIEW = { x0: -2.2, x1: 11.2, y0: -3, y1: 21.4 };

// ---------- 저장/불러오기 (실패해도 게임은 돌아가요) ----------
function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 무시 */ }
}
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- 게임 상태 ----------
const game = {
  our: load('vb_our_v1', clone(DEFAULT_OUR)),
  opp: load('vb_opp_v1', clone(DEFAULT_OPP)),
  serverIdx: load('vb_server_v1', 0),
  stats: load('vb_stats_v1', {}),
  history: [],          // 최근 서브 낙하 지점 기록
  phase: 'aim',         // aim → toss → flight → receive → result
  target: null,         // 조준한 지점
  radius: 1,            // 목표 원 반지름
  phaseStart: 0,        // 현재 단계 시작 시각
  ring: 0,              // 타이밍 링 크기
  shot: null,           // 이번 서브 정보
};
if (game.serverIdx >= game.our.length) game.serverIdx = 0;

const canvas = document.getElementById('court');
const ctx = canvas.getContext('2d');
const btn = document.getElementById('actionBtn');
const hint = document.getElementById('hint');
let scale = 20, dpr = 1;

const server = () => game.our[game.serverIdx];
const now = () => performance.now() / 1000;

// ---------- 화면 크기 맞추기 ----------
function resize() {
  const stage = document.getElementById('stage');
  const w = stage.clientWidth, h = stage.clientHeight;
  const vw = VIEW.x1 - VIEW.x0, vh = VIEW.y1 - VIEW.y0;
  scale = Math.min(w / vw, h / vh);
  dpr = window.devicePixelRatio || 1;
  canvas.style.width = vw * scale + 'px';
  canvas.style.height = vh * scale + 'px';
  canvas.width = Math.round(vw * scale * dpr);
  canvas.height = Math.round(vh * scale * dpr);
}
window.addEventListener('resize', resize);

// 미터 → 화면 픽셀
const sx = (x) => (x - VIEW.x0) * scale;
const sy = (y) => (y - VIEW.y0) * scale;

// ---------- 입력 처리 ----------
canvas.addEventListener('pointerdown', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) / scale + VIEW.x0;
  const y = (ev.clientY - rect.top) / scale + VIEW.y0;
  if (game.phase === 'aim' || game.phase === 'result') {
    if (y < RULES.NET_Y - 0.3) {
      if (game.phase === 'result') resetRally();
      game.target = { x, y };
      game.radius = RULES.circleRadius(server().acc);
      setButton('서브 토스', false);
      setHint('좋아요! 이제 서브 토스를 누르세요 (다시 눌러서 위치 바꾸기 가능)');
    } else if (game.phase === 'result') {
      nextServe();
    }
  } else if (game.phase === 'toss') {
    hit();
  }
});

btn.addEventListener('click', onAction);
document.addEventListener('keydown', (ev) => {
  if (ev.code === 'Space' || ev.code === 'Enter') {
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT' || ev.target === btn) return;
    ev.preventDefault();
    onAction();
  }
});

function onAction() {
  if (game.phase === 'aim' && game.target) startToss();
  else if (game.phase === 'toss') hit();
  else if (game.phase === 'result') nextServe();
}

function setButton(text, disabled, cls = '') {
  btn.textContent = text;
  btn.disabled = disabled;
  btn.className = cls;
}
function setHint(text) { hint.textContent = text; }

// ---------- 진행 단계 ----------
function startToss() {
  game.phase = 'toss';
  game.phaseStart = now();
  setButton('때리기!', false, 'hit');
  setHint('바깥 링이 노란 원과 겹칠 때 누르세요!');
}

function hit() {
  const r = game.radius;
  const e = (game.ring - r) / r;          // +면 빠름, -면 늦음
  const timing = RULES.judgeTiming(e);
  const s = server();
  const landing = RULES.landingPoint(game.target, r, timing, e);

  let outcome = null; // 'out' | 'net' | null(인)
  if (landing.y > RULES.NET_Y) { outcome = 'net'; landing.y = RULES.NET_Y + 0.15; }
  else if (!RULES.isIn(landing)) outcome = 'out';

  let rec = null;
  if (!outcome) {
    rec = RULES.judgeReception(game.opp, landing, s.pow, timing);
  }

  game.shot = {
    timing, e, landing, outcome, rec,
    from: { x: SERVER_SPOT.x, y: SERVER_SPOT.y },
    flight: outcome === 'net' ? 0.7 : RULES.flightTime(s.pow),
  };
  game.phase = 'flight';
  game.phaseStart = now();
  setButton('...', true);
  const words = { perfect: '퍼펙트 타이밍!', good: '좋은 타이밍!', miss: e > 0 ? '너무 빨랐어요' : '너무 늦었어요' };
  setHint(words[timing]);
}

function landed() {
  const shot = game.shot;
  game.phase = 'receive';
  game.phaseStart = now();
  if (shot.outcome) {
    shot.dest = shot.outcome === 'net'
      ? { x: shot.landing.x, y: RULES.NET_Y + 0.8 }
      : extend(shot.from, shot.landing, 1.6);
    shot.arc = 0.4;
    return;
  }
  const g = shot.rec.grade;
  const p = shot.landing;
  const jitter = (s) => ({ x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s });
  let d;
  if (g === '#') { d = { x: SETTER_SPOT.x, y: SETTER_SPOT.y }; shot.arc = 3.2; }
  else if (g === '+') { const j = jitter(2.2); d = { x: SETTER_SPOT.x + j.x, y: SETTER_SPOT.y - 0.8 + j.y * 0.5 }; shot.arc = 3; }
  else if (g === '!') { const j = jitter(3); d = { x: 4.5 + j.x, y: 5.3 + j.y }; shot.arc = 3.4; }
  else if (g === '-') { const j = jitter(5); d = { x: 4.5 + j.x, y: 2.8 + j.y * 0.6 }; shot.arc = 2.6; }
  else if (g === '/') { d = { x: 2 + Math.random() * 5, y: 10.5 + Math.random() * 2.5 }; shot.arc = 2.8; }
  else if (shot.rec.touched) {
    // 맞았지만 튕겨나감
    const side = p.x < 4.5 ? -1 : 1;
    d = { x: side < 0 ? -1.6 : 10.6, y: p.y + (Math.random() - 0.5) * 3 }; shot.arc = 1.6;
  } else {
    d = extend(shot.from, p, 1.4); shot.arc = 0.4; // 아무도 못 닿음 → 굴러감
  }
  shot.dest = d;
}

function finish() {
  const shot = game.shot;
  game.phase = 'result';
  const key = shot.outcome ? 'E' : shot.rec.grade;
  game.stats[key] = (game.stats[key] || 0) + 1;
  save('vb_stats_v1', game.stats);
  game.history.push({ ...shot.landing, key });
  if (game.history.length > 40) game.history.shift();
  renderStats();
  setButton('다음 서브', false);
  setHint('다음 서브: 버튼을 누르거나 상대 코트를 바로 눌러 조준하세요');
}

function resetRally() {
  game.shot = null;
  game.phase = 'aim';
}

function nextServe() {
  resetRally();
  game.target = null;
  setButton('서브 토스', true);
  setHint('상대 코트를 눌러 서브할 곳을 정하세요');
}

// a → b 방향으로 b 에서 len 만큼 더 간 점
function extend(a, b, len) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  return { x: b.x + (dx / d) * len, y: b.y + (dy / d) * len };
}

// ---------- 매 프레임 업데이트 ----------
function update() {
  const t = now() - game.phaseStart;
  if (game.phase === 'toss') {
    const p = t / RULES.RING_TIME;
    game.ring = game.radius * RULES.RING_START * (1 - p);
    if (game.ring <= 0) { game.ring = 0; hit(); }
  } else if (game.phase === 'flight') {
    if (t >= game.shot.flight) landed();
  } else if (game.phase === 'receive') {
    if (t >= 0.9) finish();
  }
}

// 리시버 위치 (서브가 날아오는 동안 공 쪽으로 움직임)
function receiverPos(i) {
  const base = game.opp[i];
  const shot = game.shot;
  if (!shot || !shot.rec || shot.rec.receiverIndex !== i) return base;
  let moved;
  if (game.phase === 'flight') {
    const t = now() - game.phaseStart - RULES.REACTION;
    moved = Math.max(0, Math.min(shot.rec.moveDist, t * RULES.moveSpeed(base.receive)));
  } else {
    moved = shot.rec.moveDist;
  }
  const dx = shot.landing.x - base.x, dy = shot.landing.y - base.y;
  const d = Math.hypot(dx, dy) || 1;
  return { ...base, x: base.x + (dx / d) * moved, y: base.y + (dy / d) * moved };
}

// ---------- 그리기 ----------
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = canvas.width / dpr, H = canvas.height / dpr;

  // 바깥(프리존)
  ctx.fillStyle = '#1f5f8b';
  ctx.fillRect(0, 0, W, H);

  // 코트
  ctx.fillStyle = '#e0894a';
  ctx.fillRect(sx(0), sy(0), 9 * scale, 18 * scale);

  // 라인
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(2, scale * 0.08);
  ctx.strokeRect(sx(0), sy(0), 9 * scale, 18 * scale);
  line(0, 6, 9, 6); line(0, 12, 9, 12); // 어택 라인

  // 지난 서브 낙하 지점
  for (const h of game.history) {
    ctx.fillStyle = GRADE_COLOR[h.key];
    ctx.globalAlpha = 0.55;
    circle(h.x, h.y, 0.16, true);
  }
  ctx.globalAlpha = 1;

  // 목표 원
  if (game.target && game.phase !== 'result') drawTarget();
  if (game.phase === 'result' && game.target) {
    ctx.globalAlpha = 0.35; drawTarget(); ctx.globalAlpha = 1;
  }

  // 우리 선수
  const others = game.our.filter((_, i) => i !== game.serverIdx);
  others.slice(0, 5).forEach((p, i) => drawPlayer(OUR_SPOTS[i], p, '#2f7cf6', false));
  drawPlayer(SERVER_SPOT, server(), '#2f7cf6', true);

  // 상대 선수
  game.opp.forEach((_, i) => {
    const p = receiverPos(i);
    const active = game.shot && game.shot.rec && game.shot.rec.receiverIndex === i;
    drawPlayer(p, p, '#d8344a', active);
  });

  // 네트 (위에서 본 모습)
  drawNet();

  // 공
  drawBall();

  // 결과
  if (game.phase === 'result') drawResult();
}

function line(x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(sx(x1), sy(y1)); ctx.lineTo(sx(x2), sy(y2)); ctx.stroke();
}
function circle(x, y, r, fill) {
  ctx.beginPath(); ctx.arc(sx(x), sy(y), r * scale, 0, Math.PI * 2);
  fill ? ctx.fill() : ctx.stroke();
}

function drawNet() {
  const y = sy(RULES.NET_Y), h = scale * 0.35;
  ctx.fillStyle = 'rgba(20,20,20,0.35)';
  ctx.fillRect(sx(-0.5), y - h / 2, 10 * scale, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  for (let x = -0.5; x <= 9.5; x += 0.25) {
    ctx.beginPath(); ctx.moveTo(sx(x), y - h / 2); ctx.lineTo(sx(x), y + h / 2); ctx.stroke();
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(2, scale * 0.1);
  ctx.beginPath(); ctx.moveTo(sx(-0.5), y - h / 2); ctx.lineTo(sx(9.5), y - h / 2); ctx.stroke();
  ctx.fillStyle = '#ddd';
  ctx.fillRect(sx(-0.9), y - h, scale * 0.3, h * 2);
  ctx.fillRect(sx(9.6), y - h, scale * 0.3, h * 2);
}

function drawTarget() {
  const { x, y } = game.target;
  ctx.fillStyle = 'rgba(255,210,63,0.25)';
  circle(x, y, game.radius, true);
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2;
  circle(x, y, game.radius, false);
  ctx.fillStyle = '#ffd23f';
  circle(x, y, 0.08, true);

  if (game.phase === 'toss') {
    const e = (game.ring - game.radius) / game.radius;
    const ok = Math.abs(e) <= RULES.GOOD_WINDOW;
    ctx.strokeStyle = ok ? '#3ecf7a' : '#ffffff';
    ctx.lineWidth = ok ? 5 : 3;
    circle(x, y, game.ring, false);
  }
}

function drawPlayer(pos, p, color, highlight) {
  const r = 0.42;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  circle(pos.x + 0.08, pos.y + 0.1, r, true);
  ctx.fillStyle = color;
  circle(pos.x, pos.y, r, true);
  ctx.strokeStyle = highlight ? '#ffd23f' : '#fff';
  ctx.lineWidth = highlight ? 3 : 1.5;
  circle(pos.x, pos.y, r, false);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.max(10, scale * 0.42)}px sans-serif`;
  ctx.fillText(p.num, sx(pos.x), sy(pos.y) + 1);
  ctx.font = `${Math.max(9, scale * 0.34)}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(p.name, sx(pos.x), sy(pos.y + r + 0.35));
}

// 공: 바닥 그림자 + 높이만큼 위로 그린 공
function drawBallAt(x, y, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  circle(x, y, 0.18, true);
  const by = y - h * 0.45;
  const r = 0.2 + h * 0.02;
  ctx.fillStyle = '#fff6c7';
  circle(x, by, r, true);
  ctx.strokeStyle = '#2459c4';
  ctx.lineWidth = 1.5;
  circle(x, by, r, false);
}

function drawBall() {
  const t = now() - game.phaseStart;
  if (game.phase === 'aim') {
    drawBallAt(SERVER_SPOT.x - 0.3, SERVER_SPOT.y - 0.3, 1.2);
  } else if (game.phase === 'toss') {
    const p = Math.min(1, t / RULES.RING_TIME);
    drawBallAt(SERVER_SPOT.x - 0.3, SERVER_SPOT.y - 0.3, 1.2 + Math.sin(p * Math.PI * 0.85) * 3);
  } else if (game.phase === 'flight') {
    const s = game.shot;
    const p = Math.min(1, t / s.flight);
    const x = s.from.x + (s.landing.x - s.from.x) * p;
    const y = s.from.y + (s.landing.y - s.from.y) * p;
    const endH = s.outcome === 'net' ? 1.6 : 0;
    const h = 3 * (1 - p) + endH * p + (2.2 - server().pow * 0.012) * 4 * p * (1 - p);
    drawBallAt(x, y, h);
  } else if (game.phase === 'receive' || game.phase === 'result') {
    const s = game.shot;
    if (!s) return;
    const p = game.phase === 'result' ? 1 : Math.min(1, t / 0.9);
    const x = s.landing.x + (s.dest.x - s.landing.x) * p;
    const y = s.landing.y + (s.dest.y - s.landing.y) * p;
    const startH = s.outcome === 'net' ? 1.6 : 0;
    const h = startH * (1 - p) + s.arc * 4 * p * (1 - p);
    // 낙하 지점 표시
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    const L = sx(s.landing.x), T = sy(s.landing.y), k = scale * 0.22;
    ctx.beginPath(); ctx.moveTo(L - k, T - k); ctx.lineTo(L + k, T + k);
    ctx.moveTo(L + k, T - k); ctx.lineTo(L - k, T + k); ctx.stroke();
    drawBallAt(x, y, h);
  }
}

function drawResult() {
  const s = game.shot;
  let sym, title, desc;
  if (s.outcome === 'out') { sym = 'OUT'; title = '서브 범실 (아웃)'; desc = '공이 코트 밖에 떨어졌어요.'; }
  else if (s.outcome === 'net') { sym = 'NET'; title = '서브 범실 (네트)'; desc = '공이 네트에 걸렸어요.'; }
  else {
    const g = RULES.GRADES[s.rec.grade];
    sym = s.rec.grade; title = `리시브 ${g.label}`; desc = g.desc;
  }
  const color = GRADE_COLOR[s.outcome ? 'E' : s.rec.grade];
  const rcv = s.rec ? game.opp[s.rec.receiverIndex] : null;

  const W = canvas.width / dpr;
  const bx = W * 0.06, bw = W * 0.88, by = sy(12.6), bh = scale * 5.4;
  ctx.fillStyle = 'rgba(10,18,32,0.88)';
  roundRect(bx, by, bw, bh, 14); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  roundRect(bx, by, bw, bh, 14); ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.font = `800 ${scale * 2}px sans-serif`;
  ctx.fillText(sym, W / 2, by + bh * 0.26);
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${scale * 0.75}px sans-serif`;
  ctx.fillText(title, W / 2, by + bh * 0.53);
  ctx.fillStyle = '#c9d5e6';
  ctx.font = `${scale * 0.5}px sans-serif`;
  wrapText(desc, W / 2, by + bh * 0.7, bw - 20, scale * 0.62);
  if (rcv) {
    ctx.fillStyle = '#9fb0c8';
    ctx.font = `${scale * 0.45}px sans-serif`;
    ctx.fillText(`리시버: ${rcv.num}번 ${rcv.name} (리시브 ${rcv.receive})`, W / 2, by + bh * 0.9);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(text, x, y, maxW, lh) {
  const words = text.split(' ');
  let lineStr = '', lines = [];
  for (const w of words) {
    const test = lineStr ? lineStr + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && lineStr) { lines.push(lineStr); lineStr = w; }
    else lineStr = test;
  }
  lines.push(lineStr);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// ---------- 기록 ----------
function renderStats() {
  const keys = ['#', '+', '!', '-', '/', '=', 'E'];
  const labels = { E: '서브미스' };
  const grid = document.getElementById('statGrid');
  grid.innerHTML = keys.map((k) => `
    <div class="stat">
      <div class="sym" style="color:${GRADE_COLOR[k]}">${k === 'E' ? 'X' : k}</div>
      <div class="lab">${labels[k] || RULES.GRADES[k].label}</div>
      <div class="num">${game.stats[k] || 0}</div>
    </div>`).join('');
  const total = keys.reduce((a, k) => a + (game.stats[k] || 0), 0);
  const ace = game.stats['='] || 0, err = game.stats.E || 0;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0) + '%';
  document.getElementById('statSummary').textContent = total
    ? `서브 ${total}개 · 에이스 ${ace} (${pct(ace)}) · 범실 ${err} (${pct(err)}) · 서브 효율 ${pct(ace - err)}`
    : '아직 서브 기록이 없어요.';
}

document.getElementById('resetStats').addEventListener('click', () => {
  game.stats = {}; game.history = [];
  save('vb_stats_v1', game.stats);
  renderStats();
});

// ---------- 선수 설정 ----------
function renderSettings() {
  const sel = document.getElementById('serverSelect');
  sel.innerHTML = game.our.map((p, i) =>
    `<option value="${i}" ${i === game.serverIdx ? 'selected' : ''}>${p.num}번 ${escapeHtml(p.name)}</option>`).join('');

  const ourT = document.getElementById('ourTable');
  ourT.innerHTML = '<tr><th>번호</th><th>이름</th><th>정확도</th><th>파워</th></tr>' +
    game.our.map((p, i) => `<tr>
      <td><input type="number" data-t="our" data-i="${i}" data-k="num" value="${p.num}" min="0" max="99"></td>
      <td><input data-t="our" data-i="${i}" data-k="name" value="${escapeHtml(p.name)}"></td>
      <td><input type="number" data-t="our" data-i="${i}" data-k="acc" value="${p.acc}" min="0" max="100"></td>
      <td><input type="number" data-t="our" data-i="${i}" data-k="pow" value="${p.pow}" min="0" max="100"></td>
    </tr>`).join('');

  const oppT = document.getElementById('oppTable');
  oppT.innerHTML = '<tr><th>번호</th><th>이름</th><th>리시브</th></tr>' +
    game.opp.map((p, i) => `<tr>
      <td><input type="number" data-t="opp" data-i="${i}" data-k="num" value="${p.num}" min="0" max="99"></td>
      <td><input data-t="opp" data-i="${i}" data-k="name" value="${escapeHtml(p.name)}"></td>
      <td><input type="number" data-t="opp" data-i="${i}" data-k="receive" value="${p.receive}" min="0" max="100"></td>
    </tr>`).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.getElementById('settings').addEventListener('change', (ev) => {
  const el = ev.target;
  if (!el.dataset.t) return;
  const list = el.dataset.t === 'our' ? game.our : game.opp;
  const k = el.dataset.k;
  let v = el.value;
  if (k !== 'name') {
    v = Math.round(Number(v));
    if (!isFinite(v)) v = 0;
    v = Math.max(0, Math.min(k === 'num' ? 99 : 100, v));
    el.value = v;
  }
  list[+el.dataset.i][k] = v;
  save('vb_our_v1', game.our);
  save('vb_opp_v1', game.opp);
  if (game.target) game.radius = RULES.circleRadius(server().acc);
  renderSettings();
});

document.getElementById('serverSelect').addEventListener('change', (ev) => {
  game.serverIdx = +ev.target.value;
  save('vb_server_v1', game.serverIdx);
  if (game.phase === 'result') nextServe();
  if (game.target) game.radius = RULES.circleRadius(server().acc);
  ev.target.blur();
});

document.getElementById('resetPlayers').addEventListener('click', () => {
  game.our = clone(DEFAULT_OUR);
  game.opp = clone(DEFAULT_OPP);
  game.serverIdx = 0;
  save('vb_our_v1', game.our); save('vb_opp_v1', game.opp); save('vb_server_v1', 0);
  renderSettings();
});

// ---------- 시작 ----------
resize();
renderSettings();
renderStats();
loop();
