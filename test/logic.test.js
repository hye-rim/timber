'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../logic.js');

// 사람 모델: 한 번 베는 간격 tc(초), 오타 확률 err (그때는 가지가 있을 수 있는 쪽을 누름)
function run(level, tc, err, seed, cap = 900) {
  const r = T.rng(seed), st = T.newGame(r, level); let t = 0;
  while (!st.over && t < cap) {
    let rem = tc * (0.8 + r() * 0.4); t += rem;
    while (rem > 0 && !st.over) { const d = Math.min(rem, 1 / 60); T.step(st, d); rem -= d; }
    if (st.over) break;
    const safe = T.safeSides(st); let s = safe[Math.floor(r() * safe.length)];
    if (r() < err) s = -s;
    T.chop(st, s);
  }
  return st;
}

test('trunk length stays constant, bottom two segments are bare, and branch runs are short', () => {
  for (const level of Object.keys(T.LEVELS)) for (let seed = 1; seed <= 30; seed++) {
    const r = T.rng(seed), st = T.newGame(r, level);
    assert.strictEqual(st.trunk.length, T.SEGS);
    assert.strictEqual(st.trunk[0], 0); assert.strictEqual(st.trunk[1], 0);
    for (let i = 0; i < 300; i++) {
      T.chop(st, T.safeSides(st)[0]);
      assert.strictEqual(st.trunk.length, T.SEGS);
      let run = 0, worst = 0; for (const b of st.trunk) { run = b ? run + 1 : 0; worst = Math.max(worst, run); }
      assert.ok(worst <= T.MAX_RUN, level + ' ' + seed);
      assert.ok(st.trunk.every((b) => b === -1 || b === 0 || b === 1));
    }
  }
});

test('chopping on the safe side always works and scores', () => {
  const st = T.newGame(T.rng(4), 'hard');
  for (let i = 0; i < 500; i++) { const before = st.score; assert.ok(T.chop(st, T.safeSides(st)[0])); assert.strictEqual(st.score, before + 1); }
  assert.strictEqual(st.over, false);
});

test('standing on the side of the next branch ends the game', () => {
  const st = T.newGame(T.rng(1), 'normal');
  st.trunk[1] = -1;
  assert.strictEqual(T.chop(st, -1), false);
  assert.ok(st.over);
  assert.strictEqual(st.why, 'hit');
  assert.strictEqual(st.score, 0);
  assert.strictEqual(T.chop(st, 1), false);                      // 끝난 뒤에는 못 벤다
});

test('the branch on the other side is safe', () => {
  const st = T.newGame(T.rng(1), 'normal');
  st.trunk[1] = -1;
  assert.deepStrictEqual(T.safeSides(st), [1]);
  assert.ok(T.chop(st, 1));
  assert.strictEqual(st.over, false);
});

test('bad side values are ignored', () => {
  const st = T.newGame(T.rng(1), 'easy');
  assert.strictEqual(T.chop(st, 0), false); assert.strictEqual(T.chop(st, 2), false); assert.strictEqual(T.chop(st, NaN), false);
  assert.strictEqual(st.score, 0);
});

test('the time gauge drains, refills on each chop but never above full, and empties to end the game', () => {
  const st = T.newGame(T.rng(2), 'normal');
  T.step(st, 1);
  assert.ok(st.gauge < 1 && st.gauge > 0.8);
  const low = st.gauge; T.chop(st, T.safeSides(st)[0]);
  assert.ok(st.gauge > low);
  for (let i = 0; i < 40; i++) T.chop(st, T.safeSides(st)[0]);
  assert.ok(st.gauge <= 1);
  for (let i = 0; i < 600 && !st.over; i++) T.step(st, 0.1);
  assert.ok(st.over); assert.strictEqual(st.why, 'time'); assert.strictEqual(st.gauge, 0);
});

test('the drain speeds up with the score and has a ceiling', () => {
  const st = T.newGame(T.rng(1), 'normal');
  const a = T.drainRate(st); st.score = 50; const b = T.drainRate(st); st.score = 100000;
  assert.ok(b > a); assert.strictEqual(T.drainRate(st), T.LEVELS.normal.rmax);
});

test('tutorial mode never ends and bumping into a branch just bounces', () => {
  const st = T.newGame(T.rng(1), 'easy', { tutorial: true });
  T.step(st, 100); assert.strictEqual(st.over, false); assert.strictEqual(st.gauge, 1);
  st.trunk[1] = 1;
  assert.strictEqual(T.chop(st, 1), false);
  assert.strictEqual(st.over, false); assert.strictEqual(st.bonks, 1); assert.strictEqual(st.score, 0);
  assert.ok(T.chop(st, -1)); assert.strictEqual(st.score, 1);
});

test('same seed gives the same tree', () => {
  const a = T.newGame(T.rng(8), 'hard'), b = T.newGame(T.rng(8), 'hard');
  for (let i = 0; i < 50; i++) { T.chop(a, T.safeSides(a)[0]); T.chop(b, T.safeSides(b)[0]); }
  assert.deepStrictEqual(a.trunk, b.trunk);
});

test('harder levels end sooner for the same player', () => {
  const med = (level, tc) => { const a = []; for (let s = 1; s <= 30; s++) a.push(run(level, tc, 0.005, s).score); a.sort((x, y) => x - y); return a[15]; };
  for (const tc of [0.4, 0.3]) { const e = med('easy', tc), n = med('normal', tc), h = med('hard', tc); assert.ok(e > n && n > h, `tc ${tc}: ${e} ${n} ${h}`); }
});

test('even a very fast player (6 chops per second) cannot go on forever', () => {
  for (const level of Object.keys(T.LEVELS)) for (let s = 1; s <= 5; s++) assert.ok(run(level, 1 / 6, 0, s, 3000).over, level + ' ' + s);
  for (let s = 1; s <= 5; s++) assert.ok(run('easy', 0.2, 0, s, 3000).over, 'easy at 5 per second ' + s);        // 쉬움도 초당 5번이면 결국 끝난다
});

test('a wrong tap ends the run', () => {
  let ended = 0; for (let s = 1; s <= 20; s++) if (run('normal', 0.4, 0.2, s).why === 'hit') ended++;
  assert.ok(ended >= 15);
});
