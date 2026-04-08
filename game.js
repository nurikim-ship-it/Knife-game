// ============================================================
// 나이프 게임 (Five Finger Fillet) - 유럽식 룰
// ============================================================

(() => {
  'use strict';

  // --- 상수 ---
  const SEQUENCE = [1,2,1,3,1,4,1,5,1,6,1,5,1,4,1,3,1,2,1];
  const P = 5; // 픽셀 단위 (도트 크기)

  // 캔버스 내부 해상도 (픽셀 단위로 그린 뒤 확대)
  const CW = 120; // 내부 너비
  const CH = 120; // 내부 높이
  const SCALE = 4; // 표시 배율

  // 색상 팔레트
  const COL = {
    bg:       '#1a0f0a',
    table:    '#2d1a0f',
    skin:     '#e8b88a',
    skinMid:  '#d4a070',
    skinDark: '#b8845a',
    nail:     '#f0d0b8',
    outline:  '#5a3a20',
    zone:     '#251810',
    zoneHi:   '#ffcc00',
    zoneOk:   '#44cc44',
    zoneFail: '#cc2222',
    knife:    '#c8c8d0',
    knifeDk:  '#808088',
    knifeHnd: '#6b3a1f',
    blood:    '#bb0000',
    bloodDk:  '#880000',
  };

  // --- 손 & 영역 정의 (내부 좌표 기준) ---
  // 각 손가락: { x, y, w, h }
  const FINGERS = [
    { name: 'pinky',  x: 12, y: 36, w: 10, h: 38 },
    { name: 'ring',   x: 30, y: 26, w: 10, h: 48 },
    { name: 'middle', x: 48, y: 20, w: 11, h: 54 },
    { name: 'index',  x: 67, y: 26, w: 10, h: 48 },
    { name: 'thumb',  x: 87, y: 44, w: 12, h: 30 },
  ];

  const PALM = { x: 10, y: 74, w: 91, h: 30 };
  const WRIST = { x: 28, y: 104, w: 56, h: 14 };

  // 영역 (찍기 대상) - zone ID : rect
  const ZONES = {
    6: { x: 2,  y: 36, w: 10, h: 38 },   // 새끼 왼쪽
    5: { x: 22, y: 26, w: 8,  h: 48 },    // 새끼-약지 사이
    4: { x: 40, y: 20, w: 8,  h: 54 },    // 약지-중지 사이
    3: { x: 59, y: 20, w: 8,  h: 54 },    // 중지-검지 사이
    2: { x: 77, y: 26, w: 10, h: 48 },    // 검지-엄지 사이
    1: { x: 99, y: 44, w: 14, h: 30 },    // 엄지 오른쪽
  };

  // --- 상태 ---
  let state = 'title'; // title | playing | gameover | clear | ranking
  let seqIndex = 0;
  let timerStart = 0;
  let elapsed = 0;
  let timerRAF = null;
  let stabAnim = null; // { x, y, frame, success }
  let bloodSplats = [];

  // --- DOM ---
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const screens = {
    title:    document.getElementById('screen-title'),
    game:     document.getElementById('screen-game'),
    gameover: document.getElementById('screen-gameover'),
    clear:    document.getElementById('screen-clear'),
    ranking:  document.getElementById('screen-ranking'),
  };

  const hudTimer    = document.getElementById('hud-timer');
  const hudProgress = document.getElementById('hud-progress');
  const seqBar      = document.getElementById('sequence-bar');
  const clearTime   = document.getElementById('clear-time');
  const inputName   = document.getElementById('input-name');
  const rankingList = document.getElementById('ranking-list');

  // --- 초기화 ---
  function init() {
    canvas.width = CW;
    canvas.height = CH;
    canvas.style.width = (CW * SCALE) + 'px';
    canvas.style.height = (CH * SCALE) + 'px';

    ctx.imageSmoothingEnabled = false;

    bindEvents();
    showScreen('title');
    drawHand();
  }

  // --- 화면 전환 ---
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    state = name;
  }

  // --- 이벤트 바인딩 ---
  function bindEvents() {
    // 버튼들
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-retry').addEventListener('click', startGame);
    document.getElementById('btn-retry-from-clear').addEventListener('click', startGame);
    document.getElementById('btn-ranking-from-title').addEventListener('click', () => {
      renderRanking();
      showScreen('ranking');
    });
    document.getElementById('btn-title-from-gameover').addEventListener('click', () => showScreen('title'));
    document.getElementById('btn-title-from-clear').addEventListener('click', () => showScreen('title'));
    document.getElementById('btn-title-from-ranking').addEventListener('click', () => showScreen('title'));
    document.getElementById('btn-save-score').addEventListener('click', saveScore);

    // 캔버스 클릭
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      const x = (touch.clientX - rect.left) / SCALE;
      const y = (touch.clientY - rect.top) / SCALE;
      handleStab(x, y);
    });
  }

  function onCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / SCALE;
    const y = (e.clientY - rect.top) / SCALE;
    handleStab(x, y);
  }

  // --- 게임 시작 ---
  function startGame() {
    seqIndex = 0;
    elapsed = 0;
    timerStart = 0;
    stabAnim = null;
    bloodSplats = [];

    if (timerRAF) cancelAnimationFrame(timerRAF);
    timerRAF = null;

    hudTimer.textContent = '0.000s';
    hudProgress.textContent = '0 / 19';

    buildSequenceBar();
    showScreen('game');
    drawHand();
    playSound(440, 0.1, 'square');
  }

  // --- 시퀀스 바 생성 ---
  function buildSequenceBar() {
    seqBar.innerHTML = '';
    SEQUENCE.forEach((zone, i) => {
      const dot = document.createElement('div');
      dot.className = 'seq-dot';
      dot.textContent = zone;
      if (i === 0) dot.classList.add('current');
      dot.id = 'seq-' + i;
      seqBar.appendChild(dot);
    });
  }

  // --- 시퀀스 바 업데이트 ---
  function updateSequenceBar() {
    SEQUENCE.forEach((_, i) => {
      const dot = document.getElementById('seq-' + i);
      dot.classList.remove('done', 'current', 'fail');
      if (i < seqIndex) dot.classList.add('done');
      else if (i === seqIndex) dot.classList.add('current');
    });
  }

  // --- 찌르기 판정 ---
  function handleStab(x, y) {
    if (state !== 'game' && state !== 'playing') return;

    const targetZone = SEQUENCE[seqIndex];

    // 어떤 영역을 클릭했는지 판별
    let clickedZone = null;
    let clickedFinger = false;

    // 영역(zone) 체크
    for (const [id, rect] of Object.entries(ZONES)) {
      if (hitTest(x, y, rect)) {
        clickedZone = parseInt(id);
        break;
      }
    }

    // 손가락 체크
    if (!clickedZone) {
      for (const f of FINGERS) {
        if (hitTest(x, y, f)) {
          clickedFinger = true;
          break;
        }
      }
      // 손바닥/손목도 체크
      if (!clickedFinger) {
        if (hitTest(x, y, PALM) || hitTest(x, y, WRIST)) {
          clickedFinger = true;
        }
      }
    }

    // 손 바깥 클릭 → 무시
    if (!clickedZone && !clickedFinger) return;

    // 손가락 클릭 → 게임 오버
    if (clickedFinger) {
      gameOver(x, y);
      return;
    }

    // 잘못된 영역 클릭 → 게임 오버
    if (clickedZone !== targetZone) {
      gameOver(x, y);
      return;
    }

    // 정확한 영역 클릭 → 성공
    stabSuccess(x, y, clickedZone);
  }

  function hitTest(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w &&
           y >= rect.y && y <= rect.y + rect.h;
  }

  // --- 성공 처리 ---
  function stabSuccess(x, y, zone) {
    // 첫 클릭 시 타이머 시작
    if (seqIndex === 0) {
      timerStart = performance.now();
      state = 'playing';
      startTimer();
    }

    // 찌르기 애니메이션
    const zr = ZONES[zone];
    stabAnim = {
      x: zr.x + zr.w / 2,
      y: zr.y + zr.h / 2,
      frame: 0,
      success: true,
    };

    playSound(600 + seqIndex * 30, 0.05, 'square');

    seqIndex++;
    hudProgress.textContent = seqIndex + ' / 19';
    updateSequenceBar();
    drawHand();

    // 완주 체크
    if (seqIndex >= SEQUENCE.length) {
      gameClear();
    }
  }

  // --- 게임 오버 ---
  function gameOver(x, y) {
    state = 'gameover';
    if (timerRAF) cancelAnimationFrame(timerRAF);

    // 실패 위치에 피 효과
    bloodSplats.push({ x, y });
    stabAnim = { x, y, frame: 0, success: false };

    // 시퀀스 바에 실패 표시
    const dot = document.getElementById('seq-' + seqIndex);
    if (dot) dot.classList.add('fail');

    drawHand();
    playSound(150, 0.3, 'sawtooth');

    // 화면 흔들림
    const wrapper = document.getElementById('game-wrapper');
    wrapper.classList.add('shake');
    setTimeout(() => wrapper.classList.remove('shake'), 400);

    setTimeout(() => showScreen('gameover'), 800);
  }

  // --- 게임 클리어 ---
  function gameClear() {
    state = 'clear';
    if (timerRAF) cancelAnimationFrame(timerRAF);

    elapsed = performance.now() - timerStart;
    clearTime.textContent = formatTime(elapsed);

    playSound(880, 0.1, 'square');
    setTimeout(() => playSound(1100, 0.1, 'square'), 100);
    setTimeout(() => playSound(1320, 0.15, 'square'), 200);

    setTimeout(() => showScreen('clear'), 600);
  }

  // --- 타이머 ---
  function startTimer() {
    function tick() {
      if (state !== 'playing') return;
      elapsed = performance.now() - timerStart;
      hudTimer.textContent = formatTime(elapsed);
      timerRAF = requestAnimationFrame(tick);
    }
    timerRAF = requestAnimationFrame(tick);
  }

  function formatTime(ms) {
    return (ms / 1000).toFixed(3) + 's';
  }

  // --- 캔버스 렌더링 ---
  function drawHand() {
    // 배경 (나무 테이블)
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, CW, CH);

    // 나무결 라인
    ctx.fillStyle = COL.table;
    for (let y = 0; y < CH; y += 8) {
      ctx.fillRect(0, y, CW, 1);
    }

    // 현재 타겟 영역 하이라이트
    if (state === 'game' || state === 'playing') {
      const targetZone = SEQUENCE[seqIndex] || null;
      if (targetZone !== null) {
        const zr = ZONES[targetZone];
        ctx.fillStyle = COL.zoneHi;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(zr.x, zr.y, zr.w, zr.h);
        ctx.globalAlpha = 1;
      }
    }

    // 영역 표시 (얇은 라인)
    for (const [id, zr] of Object.entries(ZONES)) {
      ctx.strokeStyle = '#332211';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(zr.x + 0.5, zr.y + 0.5, zr.w - 1, zr.h - 1);
    }

    // 손바닥
    drawPixelRect(PALM.x, PALM.y, PALM.w, PALM.h, COL.skin);
    drawPixelRect(PALM.x, PALM.y, PALM.w, 2, COL.skinMid);
    drawPixelRect(PALM.x + 2, PALM.y + PALM.h - 2, PALM.w - 4, 2, COL.skinDark);

    // 손목
    drawPixelRect(WRIST.x, WRIST.y, WRIST.w, WRIST.h, COL.skinMid);

    // 손가락 그리기
    FINGERS.forEach((f, i) => {
      // 본체
      drawPixelRect(f.x, f.y, f.w, f.h, COL.skin);

      // 그림자 (오른쪽)
      drawPixelRect(f.x + f.w - 1, f.y + 2, 1, f.h - 4, COL.skinMid);

      // 그림자 (아래)
      drawPixelRect(f.x + 1, f.y + f.h - 1, f.w - 2, 1, COL.skinDark);

      // 손톱
      const nailY = f.y + 2;
      const nailW = f.w - 4;
      const nailX = f.x + 2;
      drawPixelRect(nailX, nailY, nailW, 6, COL.nail);
      drawPixelRect(nailX, nailY, nailW, 1, '#ffffff');

      // 마디 라인
      const knuckle1 = f.y + Math.floor(f.h * 0.4);
      const knuckle2 = f.y + Math.floor(f.h * 0.65);
      drawPixelRect(f.x + 1, knuckle1, f.w - 2, 1, COL.skinMid);
      drawPixelRect(f.x + 1, knuckle2, f.w - 2, 1, COL.skinMid);

      // 외곽선
      ctx.strokeStyle = COL.outline;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(f.x, f.y, f.w, f.h);
    });

    // 손바닥 외곽선
    ctx.strokeStyle = COL.outline;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(PALM.x, PALM.y, PALM.w, PALM.h);
    ctx.strokeRect(WRIST.x, WRIST.y, WRIST.w, WRIST.h);

    // 성공한 찌르기 자국 표시
    for (let i = 0; i < seqIndex; i++) {
      const zone = SEQUENCE[i];
      const zr = ZONES[zone];
      const cx = zr.x + zr.w / 2;
      const cy = zr.y + zr.h / 2;
      ctx.fillStyle = '#443322';
      ctx.fillRect(Math.floor(cx) - 1, Math.floor(cy) - 1, 2, 2);
    }

    // 피 효과
    bloodSplats.forEach(bp => {
      drawBlood(bp.x, bp.y);
    });

    // 칼 애니메이션
    if (stabAnim) {
      drawKnife(stabAnim.x, stabAnim.y, stabAnim.success);
      stabAnim = null;
    }
  }

  function drawPixelRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  }

  // --- 칼 그리기 (성공: 작은 칼 / 실패: 손 크기 대형 칼) ---
  function drawKnife(x, y, success) {
    const kx = Math.floor(x);
    const ky = Math.floor(y);

    if (success) {
      // 성공: 중형 칼 (칼날 아래, 손잡이 위 — 내리꽂힌 형태)
      const sBladeW = 4;
      const sBladeH = 30;
      const sHandleW = 7;
      const sHandleH = 15;

      // 폼멜
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(kx - sHandleW / 2 + 1, ky - sHandleH - sBladeH - 5, sHandleW - 2, 2);

      // 손잡이
      ctx.fillStyle = COL.knifeHnd;
      ctx.fillRect(kx - sHandleW / 2, ky - sHandleH - sBladeH - 3, sHandleW, sHandleH);

      // 손잡이 디테일
      ctx.fillStyle = '#4a2510';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(kx - sHandleW / 2, ky - sHandleH - sBladeH + i * 5, sHandleW, 1);
      }

      // 손잡이 하이라이트
      ctx.fillStyle = '#8b5a30';
      ctx.fillRect(kx - sHandleW / 2, ky - sHandleH - sBladeH - 3, 2, sHandleH);

      // 가드
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(kx - sHandleW / 2 - 1, ky - sBladeH - 2, sHandleW + 2, 2);
      ctx.fillStyle = COL.knifeDk;
      ctx.fillRect(kx - sHandleW / 2 - 1, ky - sBladeH, sHandleW + 2, 1);

      // 칼날 본체
      ctx.fillStyle = COL.knife;
      ctx.fillRect(kx - sBladeW / 2, ky - sBladeH, sBladeW, sBladeH);

      // 칼날 하이라이트
      ctx.fillStyle = '#e8e8f0';
      ctx.fillRect(kx - sBladeW / 2, ky - sBladeH, 1, sBladeH);

      // 칼날 어두운 면
      ctx.fillStyle = COL.knifeDk;
      ctx.fillRect(kx + sBladeW / 2 - 1, ky - sBladeH, 1, sBladeH);

      // 칼끝
      ctx.fillStyle = COL.knife;
      ctx.fillRect(kx - 1, ky, 2, 2);

      // 찌른 지점
      ctx.fillStyle = COL.zoneOk;
      ctx.fillRect(kx - 2, ky, 4, 3);
    } else {
      // 실패: 대형 칼 (칼날 아래, 손잡이 위 — 내리꽂힌 형태)
      const bladeW = 6;
      const bladeH = 50;
      const handleW = 10;
      const handleH = 24;

      // 손잡이 끝 (폼멜) — 최상단
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(kx - handleW / 2 + 1, ky - handleH - bladeH - 6, handleW - 2, 2);

      // 손잡이
      ctx.fillStyle = COL.knifeHnd;
      ctx.fillRect(kx - handleW / 2, ky - handleH - bladeH - 4, handleW, handleH);

      // 손잡이 디테일 (가로줄)
      ctx.fillStyle = '#4a2510';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(kx - handleW / 2, ky - handleH - bladeH + i * 5, handleW, 1);
      }

      // 손잡이 하이라이트
      ctx.fillStyle = '#8b5a30';
      ctx.fillRect(kx - handleW / 2, ky - handleH - bladeH - 4, 2, handleH);

      // 가드 (손잡이-칼날 경계)
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(kx - handleW / 2 - 1, ky - bladeH - 3, handleW + 2, 3);
      ctx.fillStyle = COL.knifeDk;
      ctx.fillRect(kx - handleW / 2 - 1, ky - bladeH, handleW + 2, 1);

      // 칼날 본체
      ctx.fillStyle = COL.knife;
      ctx.fillRect(kx - bladeW / 2, ky - bladeH, bladeW, bladeH);

      // 칼날 하이라이트 (왼쪽 밝은 면)
      ctx.fillStyle = '#e8e8f0';
      ctx.fillRect(kx - bladeW / 2, ky - bladeH, 2, bladeH);

      // 칼날 어두운 면 (오른쪽)
      ctx.fillStyle = COL.knifeDk;
      ctx.fillRect(kx + bladeW / 2 - 2, ky - bladeH, 2, bladeH);

      // 칼끝 (뾰족) — 찌른 지점 바로 위
      ctx.fillStyle = COL.knife;
      ctx.fillRect(kx - 1, ky, 2, 2);
      ctx.fillStyle = '#e8e8f0';
      ctx.fillRect(kx - 1, ky, 1, 2);

      // 찌른 지점 — 피
      ctx.fillStyle = COL.blood;
      ctx.fillRect(kx - 3, ky, 6, 6);
      ctx.fillStyle = COL.bloodDk;
      ctx.fillRect(kx - 2, ky + 1, 4, 4);
    }
  }

  // --- 피 효과 (대형 — 사방으로 튀김) ---
  function drawBlood(x, y) {
    const bx = Math.floor(x);
    const by = Math.floor(y);

    // 중심 큰 웅덩이
    ctx.fillStyle = COL.blood;
    ctx.fillRect(bx - 6, by - 4, 12, 8);
    ctx.fillRect(bx - 4, by - 6, 8, 12);

    // 중심부 진한 부분
    ctx.fillStyle = COL.bloodDk;
    ctx.fillRect(bx - 3, by - 2, 6, 5);

    // 튀긴 핏방울들 (8방향 + 추가)
    ctx.fillStyle = COL.blood;
    // 위쪽
    ctx.fillRect(bx - 1, by - 10, 3, 3);
    ctx.fillRect(bx + 3, by - 14, 2, 2);
    // 아래쪽
    ctx.fillRect(bx - 2, by + 8, 3, 3);
    ctx.fillRect(bx + 2, by + 12, 2, 2);
    // 왼쪽
    ctx.fillRect(bx - 12, by - 1, 3, 3);
    ctx.fillRect(bx - 16, by + 2, 2, 2);
    // 오른쪽
    ctx.fillRect(bx + 10, by, 3, 3);
    ctx.fillRect(bx + 14, by - 2, 2, 2);
    // 대각선
    ctx.fillRect(bx - 9, by - 8, 2, 2);
    ctx.fillRect(bx + 8, by - 9, 2, 2);
    ctx.fillRect(bx - 10, by + 7, 2, 2);
    ctx.fillRect(bx + 9, by + 8, 2, 2);

    // 흘러내리는 핏줄기
    ctx.fillStyle = COL.blood;
    ctx.fillRect(bx - 1, by + 5, 2, 8);
    ctx.fillRect(bx + 3, by + 4, 2, 6);
    ctx.fillRect(bx - 4, by + 3, 2, 5);

    // 작은 핏방울 (먼 거리)
    ctx.fillStyle = COL.bloodDk;
    ctx.fillRect(bx - 15, by - 5, 1, 1);
    ctx.fillRect(bx + 16, by + 4, 1, 1);
    ctx.fillRect(bx + 5, by - 16, 1, 1);
    ctx.fillRect(bx - 6, by + 15, 1, 1);
    ctx.fillRect(bx + 12, by + 11, 1, 1);
    ctx.fillRect(bx - 13, by - 12, 1, 1);
  }

  // --- 랭킹 시스템 (Firebase Realtime Database REST API) ---
  const FIREBASE_DB_URL = 'https://rsp-game-af99b-default-rtdb.firebaseio.com';

  function saveScore() {
    const name = inputName.value.trim() || 'AAA';
    const btn = document.getElementById('btn-save-score');
    btn.disabled = true;
    btn.textContent = 'SAVING...';

    fetch(`${FIREBASE_DB_URL}/knife-ranking.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        time: elapsed,
        date: new Date().toLocaleDateString('ko-KR'),
        timestamp: Date.now(),
      }),
    })
    .then(res => {
      if (!res.ok) throw new Error('저장 실패');
      inputName.value = '';
      btn.disabled = false;
      btn.textContent = 'SAVE';
      renderRanking();
      showScreen('ranking');
      playSound(660, 0.1, 'square');
    })
    .catch(() => {
      btn.disabled = false;
      btn.textContent = 'SAVE';
      alert('저장에 실패했습니다. 다시 시도해주세요.');
    });
  }

  function renderRanking() {
    rankingList.innerHTML = '<div class="rank-empty">불러오는 중...</div>';

    fetch(`${FIREBASE_DB_URL}/knife-ranking.json`)
      .then(res => res.json())
      .then(data => {
        rankingList.innerHTML = '';

        if (!data) {
          rankingList.innerHTML = '<div class="rank-empty">NO RECORDS</div>';
          return;
        }

        const rankings = Object.values(data)
          .filter(r => r && typeof r.time === 'number' && r.time > 0)
          .sort((a, b) => a.time - b.time)
          .slice(0, 20);

        if (rankings.length === 0) {
          rankingList.innerHTML = '<div class="rank-empty">NO RECORDS</div>';
          return;
        }

        rankings.forEach((r, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
          const row = document.createElement('div');
          row.className = 'rank-row';
          row.innerHTML = `
            <span class="rank-num">${medal || (i + 1) + '.'}</span>
            <span class="rank-name">${escapeHTML(r.name)}</span>
            <span class="rank-time">${formatTime(r.time)}</span>
          `;
          rankingList.appendChild(row);
        });
      })
      .catch(() => {
        rankingList.innerHTML = '<div class="rank-empty">불러오기 실패</div>';
      });
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- 사운드 (Web Audio API) ---
  let audioCtx = null;

  function playSound(freq, duration, type) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // 사운드 실패 시 무시
    }
  }

  // --- 시작 ---
  init();
})();
