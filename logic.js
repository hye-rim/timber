'use strict';
// 나무꾼: 규칙만 (DOM 없음). 화면·입력·소리는 game.js.
// 왼쪽·오른쪽을 눌러 나무를 베며 올라간다. 가지가 있는 쪽에 서 있으면 부딪히고, 시간 게이지가 다 닳아도 끝난다.
(function (root) {
  const SEGS = 9;                                   // 화면에 보이는 나무 마디 수
  const LEVELS = {
    easy: { label: '쉬움', branch: 0.38, refill: 0.06, r0: 0.10, dr: 0.0010, rmax: 0.38 },
    normal: { label: '보통', branch: 0.46, refill: 0.05, r0: 0.12, dr: 0.0016, rmax: 0.32 },
    hard: { label: '어려움', branch: 0.54, refill: 0.045, r0: 0.15, dr: 0.0022, rmax: 0.40 },
  };
  const MAX_RUN = 3;                                // 가지가 이어지는 마디는 최대 3개 (그 사이에 쉴 틈)
  const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };

  function nextBranch(st) {
    const p = st.params;
    let run = 0; for (let i = st.trunk.length - 1; i >= 0 && st.trunk[i] !== 0; i--) run++;
    if (run >= MAX_RUN || st.rand() >= p.branch) return 0;
    return st.rand() < 0.5 ? -1 : 1;
  }
  function newGame(rand, level, opts = {}) {
    rand = rand || Math.random;
    const lv = LEVELS[level] ? level : 'normal';
    const st = { rand, level: lv, params: LEVELS[lv], tutorial: !!opts.tutorial, trunk: [], side: 1, score: 0, gauge: 1, over: false, why: null, t: 0, events: [], bonks: 0 };
    for (let i = 0; i < SEGS; i++) st.trunk.push(i < 2 ? 0 : nextBranch(st));                // 바닥 두 마디는 가지가 없다
    return st;
  }
  const drainRate = (st) => Math.min(st.params.rmax, st.params.r0 + st.score * st.params.dr);

  // side: -1 왼쪽, 1 오른쪽. 그쪽으로 옮겨 서서 맨 아래 마디를 벤다.
  function chop(st, side) {
    if (st.over || (side !== -1 && side !== 1)) return false;
    st.side = side;
    // 베고 나면 위 마디가 내려오는데, 그 마디의 가지가 내 쪽이면 부딪힌다
    if (st.trunk[1] === side) {
      if (st.tutorial) { st.bonks++; st.events.push({ type: 'bonk', side }); return false; }          // 연습에서는 안 베이고 튕겨 나기만
      st.over = true; st.why = 'hit'; st.events.push({ type: 'over', why: 'hit', score: st.score }); return false;
    }
    st.trunk.shift(); st.trunk.push(nextBranch(st));
    st.score++; st.gauge = Math.min(1, st.gauge + st.params.refill);
    st.events.push({ type: 'chop', side, score: st.score });
    return true;
  }
  function step(st, dt) {
    if (st.over) return;
    st.t += dt;
    if (st.tutorial) return;
    st.gauge -= drainRate(st) * dt;
    if (st.gauge <= 0) { st.gauge = 0; st.over = true; st.why = 'time'; st.events.push({ type: 'over', why: 'time', score: st.score }); }
  }
  // 올바른 쪽: 다음에 내려올 마디(두 번째 마디)의 가지가 없는 쪽
  function safeSides(st) { return [-1, 1].filter((s) => st.trunk[1] !== s); }

  const api = { SEGS, LEVELS, MAX_RUN, rng, newGame, chop, step, drainRate, safeSides };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LOGIC_TIMBER = api;
})(typeof window !== 'undefined' ? window : globalThis);
