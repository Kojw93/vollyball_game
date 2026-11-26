// =====================================================================
//  규칙(계산) 파일
//  - 서브가 어디 떨어지는지, 리시브가 어떻게 되는지를 숫자로 계산합니다.
//  - 게임 밸런스를 바꾸고 싶으면 이 파일의 숫자를 고치면 됩니다.
//  - 좌표 단위는 "미터(m)"입니다. 코트는 가로 9m, 세로 18m.
//    y = 0 이 상대 엔드라인, y = 9 가 네트, y = 18 이 우리 엔드라인.
// =====================================================================

const RULES = {
  // 코트 크기
  COURT_W: 9,
  COURT_L: 18,
  NET_Y: 9,

  // 서브 정확도(0~100) → 목표 원의 반지름(m)
  // 정확도 100 이면 0.6m, 0 이면 3.0m
  circleRadius(accuracy) {
    return 0.6 + ((100 - accuracy) / 100) * 2.4;
  },

  // 타이밍 링: 링이 줄어드는 데 걸리는 시간(초)과 판정 범위
  RING_TIME: 1.5,        // 링이 다 줄어들 때까지 걸리는 시간
  RING_START: 3.5,       // 처음 링 크기 = 목표 원의 3.5배
  PERFECT_WINDOW: 0.06,  // 링이 원과 6% 이내로 겹치면 "퍼펙트"
  GOOD_WINDOW: 0.18,     // 18% 이내면 "굿"

  // 타이밍 판정: e = (링 크기 - 원 크기) / 원 크기
  //   e > 0 이면 너무 빨리 누름, e < 0 이면 너무 늦게 누름
  judgeTiming(e) {
    const a = Math.abs(e);
    if (a <= this.PERFECT_WINDOW) return 'perfect';
    if (a <= this.GOOD_WINDOW) return 'good';
    return 'miss';
  },

  // 공이 떨어지는 지점 정하기
  landingPoint(target, radius, timing, e, rand = Math.random) {
    if (timing !== 'miss') {
      // 성공: 원 안 아무 곳에 랜덤으로
      return randomInCircle(target, radius, rand);
    }
    // 실패: 훨씬 넓은 원 안에 랜덤으로
    // 너무 빨리 누르면 길게(엔드라인 쪽), 늦게 누르면 짧게(네트 쪽) 치우침
    const wide = Math.min(radius + 1.5 + Math.abs(e) * 2.5, 5.5);
    const center = { x: target.x, y: target.y - Math.sign(e) * Math.min(Math.abs(e), 1.5) * 1.2 };
    return randomInCircle(center, wide, rand);
  },

  // 공이 날아가는 시간(초): 파워가 셀수록 빨리 도착
  flightTime(power) {
    return 1.6 - power * 0.006;
  },

  // 리시버가 움직이는 속도(m/초)와 반응 시간
  moveSpeed(receive) {
    return 1.8 + receive * 0.015;
  },
  REACTION: 0.25,  // 서브를 보고 움직이기 시작하기까지 걸리는 시간
  ARM_REACH: 0.6,  // 이 거리 안이면 제자리에서 받을 수 있음
  DIVE_REACH: 1.3, // 이 거리까지는 몸을 날려 겨우 닿을 수 있음

  // 서브 결과 등급 (배구 기록 방식)
  GRADES: {
    '#': { label: '완벽', desc: '세터에게 정확히 연결! 상대는 모든 공격을 쓸 수 있어요.' },
    '+': { label: '좋음', desc: '세터가 조금만 움직이면 돼요. 속공도 가능해요.' },
    '!': { label: '보통', desc: '세터가 많이 움직여야 해요. 속공은 어려워요.' },
    '-': { label: '나쁨', desc: '겨우 연결. 상대는 높은 공 공격만 할 수 있어요.' },
    '/': { label: '넘어감', desc: '리시브가 바로 우리 코트로 넘어왔어요. 찬스볼!' },
    '=': { label: '범실', desc: '리시브 실패! 서브 에이스!' },
  },

  // 리시브 판정
  //  receivers: [{x, y, receive}], ball: {x, y}, server: {power}, timing
  //  결과: { grade, receiverIndex, moveDist, gap, quality, touched }
  judgeReception(receivers, ball, power, timing, rand = Math.random) {
    const T = this.flightTime(power);

    // 공에서 가까운 순서대로 정렬
    const order = receivers
      .map((r, i) => ({ i, d: dist(r, ball) }))
      .sort((a, b) => a.d - b.d);
    const main = order[0];
    const second = order[1];
    const rcv = receivers[main.i];

    // 리시버가 공 떨어지기 전까지 움직일 수 있는 거리
    const canMove = Math.max(0, T - this.REACTION) * this.moveSpeed(rcv.receive);
    const needMove = Math.max(0, main.d - this.ARM_REACH);
    const moveDist = Math.min(needMove, canMove);
    const gap = needMove - moveDist; // 그래도 남은 거리 (0이면 제때 도착)

    // 아예 닿지 못하면 서브 에이스
    if (gap > this.DIVE_REACH - this.ARM_REACH) {
      return { grade: '=', receiverIndex: main.i, moveDist, gap, quality: -99, touched: false };
    }

    // 리시브 품질 점수: 높을수록 좋은 리시브
    let q = 34 + rcv.receive * 0.7;
    q -= power * 0.5;           // 서브가 셀수록 어려움
    q -= moveDist * moveDist * 6;   // 많이 움직일수록 (특히 멀리) 어려움
    q -= gap * 45;              // 몸을 날려야 하면 훨씬 어려움
    if (second && second.d - main.d < 0.8) q -= 8; // 두 선수 사이(심)에 떨어지면 서로 미룸
    if (timing === 'perfect') q -= 6;  // 퍼펙트 타이밍은 더 날카로운 서브
    q += gaussian(rand) * 14;   // 운

    let grade;
    if (q >= 50) grade = '#';
    else if (q >= 36) grade = '+';
    else if (q >= 22) grade = '!';
    else if (q >= 6) grade = '-';
    else if (q >= -3) grade = '/';
    else grade = '=';

    return { grade, receiverIndex: main.i, moveDist, gap, quality: q, touched: true };
  },

  // 공이 코트 안에 떨어졌는지 (라인에 걸치면 인)
  isIn(p) {
    const BALL = 0.1;
    return p.x >= -BALL && p.x <= this.COURT_W + BALL && p.y >= -BALL && p.y <= this.NET_Y;
  },
};

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function randomInCircle(c, r, rand) {
  const ang = rand() * Math.PI * 2;
  const rr = Math.sqrt(rand()) * r;
  return { x: c.x + Math.cos(ang) * rr, y: c.y + Math.sin(ang) * rr };
}

function gaussian(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

if (typeof module !== 'undefined') module.exports = { RULES, dist };
