'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 나무꾼: 화면·입력·소리. 규칙은 logic.js (LOGIC_TIMBER).
const T = LOGIC_TIMBER;
const $ = (id) => document.getElementById(id);
const W = 360, H = 640;
const canvas = $('game'), ctx = canvas.getContext('2d');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
const TUTORIAL = new URLSearchParams(location.search).get('tutorial') === '1';
const SEG_H = 48, GROUND = 548, TRUNK_X = 180, TRUNK_W = 60;

let audio = null, muted = store.get('timberMuted') === '1';
function ac() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); return audio; } catch (_) { return null; } }
function tone(freq, dur, type = 'triangle', vol = 0.05, slide = 0) {
  if (muted) return;
  const a = ac(); if (!a) return;
  try {
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (_) {}
}
const sfx = {
  chop(n) { tone(180 + (n % 5) * 14, 0.07, 'square', 0.05, -60); },
  hit() { tone(140, 0.3, 'sawtooth', 0.07, -100); },
  time() { tone(300, 0.35, 'triangle', 0.06, -200); },
  best() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.07), i * 90)); },
  bonk() { tone(200, 0.12, 'square', 0.05, -80); },
};
function toggleMute() { muted = !muted; store.set('timberMuted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').textContent = muted ? '🔇' : '🔊';

let daily = false;
let G = null, level = 'normal', started = false, paused = false, flyers = [], chips = [], dropOff = 0, swing = 0, shake = 0, flash = 0, lastTs = 0, bonkT = 0;

/* @test-hooks:start */
window.__tb = { get G() { return G; }, get started() { return started; }, T, step: (dt) => update(dt), draw: () => draw(), tap: (side) => tap(side) };
/* @test-hooks:end */

function showOverlay(html) {
  const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden');
  o.querySelectorAll('button[data-level]').forEach((b) => { b.onclick = () => start(b.dataset.level); });
  o.querySelectorAll('button[data-act]').forEach((b) => { b.onclick = () => act(b.dataset.act); });
}
function hideOverlay() { $('overlay').classList.add('hidden'); }
const lvButtons = (withDaily) => `<div class="lv"><button data-level="easy">쉬움<small>가지 적음</small></button><button data-level="normal">보통<small>보통 속도</small></button><button data-level="hard">어려움<small>가지 많음·빠름</small></button>${withDaily && window.arcadeDaily ? arcadeDaily.buttonHtml() : ''}</div>`;
function showTitle() {
  G = null; paused = false;
  const best = +store.get('timberBest') || 0;
  showOverlay(`<h1>나무꾼</h1><div class="big">🪓🌲</div>
    <p>화면 <b>왼쪽·오른쪽</b>을 눌러 나무를 베며 올라가요<br><b>가지가 있는 쪽</b>에 서면 부딪혀요!</p>
    <p class="help">시간 게이지가 다 닳아도 끝나요.<br>베면 게이지가 차고, 갈수록 빨리 닳아요</p>
    ${best ? `<p class="note">최고 기록 ${best}번</p>` : ''}
    ${lvButtons(true)}`);
}
function act(a) { if (a === 'again') start(level); else if (a === 'menu') showTitle(); else if (a === 'resume') resume(); }
function start(lv) {
  level = lv; paused = false; started = false; flyers = []; chips = []; dropOff = 0; swing = 0; shake = 0; flash = 0; bonkT = 0;
  daily = !TUTORIAL && lv === 'normal' && !!(window.arcadeDaily && arcadeDaily.take());          // 오늘의 판: 날짜가 시드라 누구나 같은 나무
  G = T.newGame(daily ? arcadeDaily.rng() : Math.random, lv, { tutorial: TUTORIAL }); hideOverlay();
}
function pauseGame() {
  if (paused || !G || G.over || TUTORIAL || !started || !$('overlay').classList.contains('hidden')) return;
  paused = true; showOverlay('<h2>⏸ 일시정지</h2><p class="help">돌아오면 이어서 해요</p><button data-act="resume">계속하기</button>');
}
function resume() { paused = false; hideOverlay(); lastTs = 0; }
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
addEventListener('blur', pauseGame);

// ---------- 입력 ----------
function tap(side) {
  if (!G || G.over || paused) return;
  const bottom = G.trunk[0], branchNext = G.trunk[1];
  started = true;
  const ok = T.chop(G, side);
  if (ok) {
    swing = 1; dropOff = SEG_H; flyers.push({ x: TRUNK_X, y: GROUND - SEG_H / 2, vx: -side * 520, vy: -260, rot: 0, vr: -side * 9, branch: bottom, life: 1 });
    for (let i = 0; i < 4; i++) chips.push({ x: TRUNK_X + side * -20, y: GROUND - 30, vx: -side * (80 + Math.random() * 200), vy: -120 - Math.random() * 180, life: 0.7 });
    sfx.chop(G.score); tutorialSignal('chop');
    if (G.score === 5) tutorialSignal('chop5'); else if (G.score === 12) tutorialSignal('chop12');
  } else if (G.over) { shake = 0.4; flash = 1; sfx.hit(); finish(); }
  else if (G.tutorial) { bonkT = 0.4; sfx.bonk(); }
}
function pos(e) { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
canvas.addEventListener('pointerdown', (e) => { const [x] = pos(e); tap(x < W / 2 ? -1 : 1); e.preventDefault(); });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); tap(-1); }
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); tap(1); }
  else if (e.key === 'm' || e.key === 'M') toggleMute();
});
function finish() {
  const s = G.score, old = +store.get('timberBest') || 0, rec = s > old;
  if (rec) store.set('timberBest', String(s));
  const why = G.why === 'hit' ? '가지에 부딪혔어요!' : '시간이 다 됐어요!';
  const lvl = level, wasDaily = daily;
  if (!TUTORIAL && window.arcadeRun) arcadeRun({ level: lvl === 'easy' ? 'easy' : 'normal', bad: s < (lvl === 'hard' ? 10 : 15) });          // 연패 구제(로비): 15번도 못 베면 나쁜 판
  setTimeout(() => {
    if (!G || !G.over) return;
    if (rec && s >= 5) sfx.best();
    showOverlay(`<h2>${why}</h2><p class="big">🪓 ${s}번</p><p class="help">${rec ? '🏆 최고 기록!' : `최고 ${Math.max(old, s)}번`} · ${T.LEVELS[level].label}</p>${wasDaily && window.arcadeDaily ? arcadeDaily.result('나무꾼', s, '번') : ''}
      <button data-act="again">한 번 더</button>${lvButtons(false)}<button class="sub" data-act="menu">메뉴</button>`);
  }, 900);
}
function fit() { const s = Math.min(innerWidth / W, innerHeight / H); canvas.style.width = `${Math.floor(W * s)}px`; canvas.style.height = `${Math.floor(H * s)}px`; $('wrap').style.width = canvas.style.width; $('wrap').style.height = canvas.style.height; }
addEventListener('resize', fit); fit();
$('muteBtn').onclick = toggleMute;

// ---------- 갱신·그리기 ----------
function update(dt) {
  if (paused) return;
  if (G && started) T.step(G, dt);
  dropOff = Math.max(0, dropOff - dt * 700);
  swing = Math.max(0, swing - dt * 7); shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 2); bonkT = Math.max(0, bonkT - dt);
  for (const f of flyers) { f.vy += 1400 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; f.life -= dt * 1.6; }
  flyers = flyers.filter((f) => f.life > 0);
  for (const c of chips) { c.vy += 900 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; }
  chips = chips.filter((c) => c.life > 0);
}
function seg(y, branch, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(TRUNK_X - TRUNK_W / 2, y, TRUNK_W, SEG_H);
  ctx.fillStyle = '#a06c36'; ctx.fillRect(TRUNK_X - TRUNK_W / 2 + 6, y, 10, SEG_H);
  ctx.fillStyle = '#6a4220'; ctx.fillRect(TRUNK_X - TRUNK_W / 2, y + SEG_H - 4, TRUNK_W, 4);
  if (branch) {
    const x0 = branch < 0 ? TRUNK_X - TRUNK_W / 2 - 92 : TRUNK_X + TRUNK_W / 2;
    ctx.fillStyle = '#6a4220'; ctx.fillRect(x0, y + 16, 92, 10);
    ctx.fillStyle = '#2f8a3c';
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x0 + (branch < 0 ? 18 + k * 18 : 74 - k * 18), y + 12 + (k % 2) * 10, 17, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#3fae4e'; ctx.beginPath(); ctx.arc(x0 + (branch < 0 ? 24 : 68), y + 8, 11, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function player(side, sw) {
  const x = TRUNK_X + side * 76, y = GROUND;
  ctx.save(); ctx.translate(x, y); ctx.scale(-side, 1);                  // 나무를 바라보게
  ctx.fillStyle = '#c43b3b'; ctx.fillRect(-16, -62, 32, 40);               // 몸 (빨간 셔츠)
  ctx.fillStyle = '#2b3f7a'; ctx.fillRect(-14, -22, 28, 22);               // 바지
  ctx.fillStyle = '#f2c79a'; ctx.beginPath(); ctx.arc(0, -78, 15, 0, 7); ctx.fill();   // 머리
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-16, -96, 32, 10);               // 모자
  ctx.fillStyle = '#222'; ctx.fillRect(4, -80, 4, 4);
  ctx.translate(14, -52); ctx.rotate(-1.1 + sw * 1.9);                      // 도끼
  ctx.fillStyle = '#7a5226'; ctx.fillRect(0, -3, 44, 6);
  ctx.fillStyle = '#c9d2dc'; ctx.fillRect(34, -14, 16, 20);
  ctx.restore();
}
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#9ed7f0'); g.addColorStop(0.7, '#d8f0d0'); g.addColorStop(1, '#4a9a4a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.7)'; for (const [x, y] of [[50, 150], [250, 110], [320, 220]]) { ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.arc(x + 24, y + 4, 17, 0, 7); ctx.arc(x - 22, y + 6, 15, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#3d7d3a'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#2f6a2e'; ctx.fillRect(0, GROUND, W, 8);
  if (!G) { ctx.restore(); return; }
  // 나무 (베면 한 칸씩 내려온다)
  for (let i = 0; i < G.trunk.length; i++) seg(GROUND - SEG_H * (i + 1) - dropOff + (dropOff ? 0 : 0), G.trunk[i]);
  for (const f of flyers) { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.translate(-TRUNK_X, -(GROUND - SEG_H / 2)); seg(GROUND - SEG_H, f.branch, Math.max(0, f.life)); ctx.restore(); }
  for (const c of chips) { ctx.fillStyle = '#d9a35a'; ctx.globalAlpha = Math.max(0, c.life * 1.4); ctx.fillRect(c.x, c.y, 6, 4); ctx.globalAlpha = 1; }
  player(G.side, bonkT > 0 ? 0 : swing);
  if (bonkT > 0) { ctx.fillStyle = '#ff6a5a'; ctx.font = '900 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('앗, 가지!', TRUNK_X + G.side * 76, GROUND - 120); }
  // 위쪽 표시
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(40, 30, 280, 20);
  const gw = 276 * Math.max(0, G.gauge); ctx.fillStyle = G.gauge > 0.3 ? '#ffd23a' : '#ff5a4a'; ctx.fillRect(42, 32, gw, 16);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(40, 30, 280, 20);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 6; ctx.font = '900 56px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeText(String(G.score), W / 2, 100); ctx.fillText(String(G.score), W / 2, 100);
  ctx.font = '800 14px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.textBaseline = 'middle';
  ctx.fillText(started ? '' : '화면 왼쪽·오른쪽을 눌러 시작', W / 2, 150);
  ctx.font = '900 22px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText('◀', 40, 600); ctx.fillText('▶', 320, 600);
  if (flash > 0) { ctx.fillStyle = `rgba(255,60,40,${flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}
function frame(ts) {
  const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000); lastTs = ts;
  update(dt); draw(); requestAnimationFrame(frame);
}
showTitle();
requestAnimationFrame(frame);
