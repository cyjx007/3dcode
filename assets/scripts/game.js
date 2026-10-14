/* ==========================================================================
   game.js — 打乱 / 还原 / 计时 / 通关弹窗
   --------------------------------------------------------------------------
   依赖 main3.js 暴露的全局 `cube`，以及 main3.js 中的两个钩子：
     window.onCubeReady()  —— 开场动画结束、方块可以操作时调用
     window.onCubeSolved() —— 方块被还原（已解开）时调用
   ========================================================================== */
(function () {
  'use strict';

  var c = window.cube;
  if (!c) {
    return;
  }

  // ---------------------------- 常量 & 状态 -------------------------------

  var SCRAMBLE_LENGTH = 22;                       // 打乱步数
  var FACE_MOVES = ['R', 'L', 'U', 'D', 'F', 'B']; // 六个面（大小写代表方向）
  var NORMAL_TWIST_MS = 500;                      // 玩家操作时的转动时长
  var SCRAMBLE_TWIST_MS = 110;                    // 打乱时的转动时长
  // 还原时把每步压到 1ms：队列每帧处理一步，整体约 1~2 秒内完成
  var RESET_TWIST_MS = 1;
  var WIN_SETTLE_MS = 420;                        // 复原后稍等一下再弹窗

  var gameState = 'idle';  // idle | armed | playing | scrambling | resetting | won
  var busy = false;        // 打乱/还原进行中，屏蔽按钮
  var scrambleRemaining = 0;
  // 回合令牌：任何一次打乱 / 还原 / 新回合都会让它 +1，
  // 从而作废尚未触发的通关判定，避免「刚还原完就被判定通关」。
  var roundToken = 0;

  var timer = {
    running: false,
    startAt: 0,
    elapsed: 0,   // 毫秒
    raf: 0
  };

  // ------------------------------- DOM -----------------------------------

  var timerEl = document.getElementById('gametimer');
  var movesEl = document.getElementById('gamemoves');
  var scrambleBtn = document.getElementById('scramblebtn');
  var resetBtn = document.getElementById('resetbtn');
  var overlayEl = document.getElementById('winoverlay');
  var overlayTimeEl = document.getElementById('wintime');
  var overlayMovesEl = document.getElementById('winmoves');
  var playAgainBtn = document.getElementById('playagainbtn');
  var closeWinBtn = document.getElementById('closewinbtn');

  // 思考 / 教学
  var thinkBtn = document.getElementById('thinkbtn');
  var teachBtn = document.getElementById('teachbtn');
  var hintPanel = document.getElementById('hintpanel');
  var hintStageEl = document.getElementById('hintstage');
  var hintProgressEl = document.getElementById('hintprogress');
  var hintMovesEl = document.getElementById('hintmoves');
  var hintStripEl = document.getElementById('hintstrip');
  var hintWhyEl = document.getElementById('hintwhy');
  var hintCloseBtn = document.getElementById('hintclose');
  var hintDemoBtn = document.getElementById('hintdemo');
  var hintNextBtn = document.getElementById('hintnext');

  // ------------------------------ 工具函数 --------------------------------

  function now() {
    return (window.performance && window.performance.now)
      ? window.performance.now()
      : Date.now();
  }

  function pad(n, width) {
    var s = '' + n;
    while (s.length < width) {
      s = '0' + s;
    }
    return s;
  }

  function formatTime(ms) {
    if (ms < 0) {
      ms = 0;
    }
    var total = ms / 1000;
    var minutes = Math.floor(total / 60);
    var seconds = Math.floor(total % 60);
    var tenths = Math.floor(total * 10) % 10;
    return pad(minutes, 2) + ':' + pad(seconds, 2) + '.' + tenths;
  }

  // ------------------------------- 计时器 ---------------------------------

  function renderTimer() {
    if (!timerEl) {
      return;
    }
    timerEl.textContent = formatTime(timer.elapsed);
  }

  function tickTimer() {
    if (!timer.running) {
      return;
    }
    timer.elapsed = now() - timer.startAt;
    renderTimer();
    timer.raf = window.requestAnimationFrame(tickTimer);
  }

  function startTimer() {
    if (timer.running) {
      return;
    }
    timer.running = true;
    timer.startAt = now() - timer.elapsed;
    if (timerEl) {
      timerEl.classList.add('running');
      timerEl.classList.remove('done');
    }
    timer.raf = window.requestAnimationFrame(tickTimer);
  }

  function stopTimer() {
    timer.running = false;
    if (timer.raf) {
      window.cancelAnimationFrame(timer.raf);
      timer.raf = 0;
    }
  }

  function resetTimer() {
    stopTimer();
    timer.elapsed = 0;
    renderTimer();
    if (timerEl) {
      timerEl.classList.remove('running', 'done');
    }
  }

  // ------------------------------- 步数 -----------------------------------

  function renderMoves() {
    if (!movesEl) {
      return;
    }
    var n = c.moveCounter > 0 ? c.moveCounter : 0;
    movesEl.innerHTML = '<b>' + n + '</b> 步';
  }

  // ------------------------------- 按钮态 ---------------------------------

  function setButtonsEnabled(enabled) {
    [scrambleBtn, resetBtn, thinkBtn, teachBtn].forEach(function (btn) {
      if (!btn) {
        return;
      }
      if (enabled) {
        btn.removeAttribute('disabled');
        btn.removeAttribute('aria-disabled');
      } else {
        btn.setAttribute('disabled', 'disabled');
        btn.setAttribute('aria-disabled', 'true');
      }
    });
  }

  // 打乱 / 还原期间锁住方块，避免玩家中途拧动打乱节奏或干扰撤销
  function setCubeControlsEnabled(enabled) {
    c.mouseControlsEnabled = enabled;
    c.keyboardControlsEnabled = enabled;
  }

  // ------------------------------- 打乱 -----------------------------------

  function generateScramble(length) {
    var moves = [];
    var lastIndex = -1;
    while (moves.length < length) {
      var i = Math.floor(Math.random() * FACE_MOVES.length);
      // 避免相邻两步是同一个面（无意义且影响观感）
      if (i === lastIndex) {
        continue;
      }
      lastIndex = i;
      var face = FACE_MOVES[i];
      // 大小写即顺时针 / 逆时针
      moves.push(Math.random() < 0.5 ? face : face.toLowerCase());
    }
    return moves.join('');
  }

  function startScramble() {
    if (busy) {
      return;
    }
    busy = true;
    roundToken++;
    setButtonsEnabled(false);
    setCubeControlsEnabled(false);
    hideWinOverlay();
    hideHintPanel();

    gameState = 'scrambling';
    resetTimer();
    c.moveCounter = 0;
    renderMoves();

    c.twistDuration = SCRAMBLE_TWIST_MS;
    var sequence = generateScramble(SCRAMBLE_LENGTH);
    scrambleRemaining = sequence.length;
    c.twist(sequence);
  }

  function finishScramble() {
    c.twistDuration = NORMAL_TWIST_MS;
    c.moveCounter = 0;
    renderMoves();
    busy = false;
    setButtonsEnabled(true);
    setCubeControlsEnabled(true);
    armRound();
    // 打乱后自动给一次提示（教学模式）
    scheduleHintRefresh();
  }

  // ------------------------------- 还原 -----------------------------------

  // 把所有已记录的转动逆序撤销，方块即回到还原状态
  function resetCube() {
    if (busy) {
      return;
    }
    busy = true;
    roundToken++;
    setButtonsEnabled(false);
    setCubeControlsEnabled(false);
    hideWinOverlay();
    hideHintPanel();

    gameState = 'resetting';
    resetTimer();
    c.moveCounter = 0;
    renderMoves();

    c.twistDuration = RESET_TWIST_MS;

    var guard = 0;
    while (c.twistQueue.history.length > 0 && guard++ < 2000) {
      c.undo();
    }

    waitUntilIdle(function () {
      // undo() 会把被撤销的原始转动留在 twistQueue.future 里（设计如此），
      // 这里必须清掉它们再解除 undoing，否则它们会被当成新转动重放一遍。
      c.twistQueue.empty();
      if (c.historyQueue) {
        c.historyQueue.empty();
      }
      c.undoing = false;

      c.twistDuration = NORMAL_TWIST_MS;
      c.moveCounter = 0;
      renderMoves();
      busy = false;
      setButtonsEnabled(true);
      setCubeControlsEnabled(true);
      armRound();
      if (teachMode) {
        refreshHint();
      }
    });
  }

  // 轮询直到转动队列清空、动画结束
  function waitUntilIdle(callback) {
    (function poll() {
      var idle = c.twistQueue.history.length === 0 &&
        (!c.historyQueue || c.historyQueue.future.length === 0) &&
        c.isTweening() === 0;
      if (idle) {
        callback();
      } else {
        window.requestAnimationFrame(poll);
      }
    })();
  }

  // ------------------------------- 回合 -----------------------------------

  // 准备好一局：计时归零、等待玩家第一步操作才开始计时
  function armRound() {
    roundToken++;
    gameState = 'armed';
    c.moveCounter = 0;
    renderMoves();
    resetTimer();
  }

  // ---------------------------- 通关弹窗 ----------------------------------

  function triggerWin() {
    gameState = 'won';
    stopTimer();
    if (timerEl) {
      timerEl.classList.remove('running');
      timerEl.classList.add('done');
    }
    renderMoves();
    showWinOverlay();

    // 以「已还原」为新基线清空转动记录：
    // 之后点「还原」就只是回到这个基线，不会再把整局历史倒放一遍，
    // 记录也不会随着一局局累积越来越长。
    if (c.twistQueue.future.length === 0 &&
        (!c.historyQueue || c.historyQueue.future.length === 0)) {
      c.twistQueue.empty(true);
    }

    // 通知 iframe 宿主（保留原版行为）
    if (typeof postParentMessage === 'function') {
      postParentMessage({ 'certificate': 1 });
    }
  }

  function showWinOverlay() {
    if (!overlayEl) {
      return;
    }
    if (overlayTimeEl) {
      overlayTimeEl.textContent = formatTime(timer.elapsed);
    }
    if (overlayMovesEl) {
      overlayMovesEl.textContent = c.moveCounter > 0 ? c.moveCounter : 0;
    }
    overlayEl.classList.add('show');
  }

  function hideWinOverlay() {
    if (overlayEl) {
      overlayEl.classList.remove('show');
    }
  }

  // ============================ 思考 / 教学 ===============================

  var SOLVER = window.CubeSolver || null;

  var DEMO_TWIST_MS = 260;   // 「演示这一步」时的转动时长

  var teachMode = false;     // 教学模式：面板常驻，每走一步自动刷新
  var demoing = false;       // 正在演示：期间不计时、不判通关、不计步
  var hintPlan = null;       // { steps: [{ moves, title, why }], index }
  var hintDebounceId = 0;

  // ERNO 单字母指令 -> 求解器招式。
  // x/y/z 是整体旋转（不改变魔方状态），直接忽略。
  function ernoCmdToMove(cmd) {
    if (!cmd) {
      return null;
    }
    var ch = cmd.charAt(0);
    if ('xyzXYZ'.indexOf(ch) >= 0) {
      return null;
    }
    var up = ch.toUpperCase();
    if ('RLUDFB'.indexOf(up) < 0) {
      return null;
    }
    return ch === up ? up : up + "'";
  }

  // 求解器招式 -> ERNO 指令（180° 拆成两次，ERNO 只认单字母大小写）
  function moveToErnoCmd(m) {
    var f = m.charAt(0);
    if (m.length === 1) {
      return f;
    }
    if (m.charAt(1) === "'") {
      return f.toLowerCase();
    }
    return f + f;
  }

  /**
   * 读取当前魔方状态（求解器标准帧的 54 贴纸数组）。
   *
   * 注意：不能直接读 cubelet 的 matrix / address / color —— ERNO 在扭转后
   * 这些内部表示会重排，读出来的贴纸位置和颜色都对不上（实测过）。
   * 这里改为「重放转动历史」：twistQueue.history 按顺序记录了每一次转动，
   * 把它依次作用在已复原状态上，就得到当前状态。
   * resetCube / 通关时会清空历史，而那两个时刻魔方恰好是复原态，所以不会失真。
   */
  function readCubeState() {
    if (!SOLVER) {
      return null;
    }
    var hist = (c.twistQueue && c.twistQueue.history) || [];
    var s = SOLVER.stateFromString(SOLVER.SOLVED);
    for (var i = 0; i < hist.length; i++) {
      var mv = ernoCmdToMove(hist[i] && hist[i].command);
      if (mv) {
        s = SOLVER.applyMove(s, mv);
      }
    }
    return s;
  }

  function computePlan() {
    if (!SOLVER) {
      return null;
    }
    var state = readCubeState();
    if (SOLVER.isSolved(state)) {
      return { steps: [], index: 0, view: 0 };
    }
    return { steps: SOLVER.solve(state), index: 0, view: 0 };
  }

  // 轮询直到转动队列清空（与 waitUntilIdle 不同：这里不要求历史为空）
  function waitForQueueEmpty(callback) {
    var seenPending = false;
    var started = now();
    (function poll() {
      var pending = c.twistQueue.future.length > 0 ||
        (c.historyQueue && c.historyQueue.future.length > 0) ||
        c.isTweening() !== 0;
      if (pending) {
        seenPending = true;
      }
      if ((seenPending && !pending) || (!seenPending && now() - started > 1500)) {
        callback();
      } else {
        window.requestAnimationFrame(poll);
      }
    })();
  }

  function showHintPanel() {
    if (hintPanel) {
      hintPanel.classList.add('show');
    }
  }

  function hideHintPanel() {
    if (hintPanel) {
      hintPanel.classList.remove('show');
    }
  }

  function renderHintThinking() {
    if (hintStageEl) {
      hintStageEl.textContent = '计算中…';
    }
    if (hintProgressEl) {
      hintProgressEl.textContent = '';
    }
    if (hintStripEl) {
      hintStripEl.innerHTML = '';
    }
    if (hintMovesEl) {
      hintMovesEl.innerHTML = '<span class="hint-done" style="color:rgba(255,255,255,.55)">正在分析魔方…</span>';
    }
    if (hintWhyEl) {
      hintWhyEl.textContent = '';
    }
    if (hintDemoBtn) {
      hintDemoBtn.disabled = true;
    }
    if (hintNextBtn) {
      hintNextBtn.disabled = true;
    }
  }

  // 顶部进度条：每段代表计划中的一个阶段
  //   index = 下一步该做的，view = 当前正在看的（预览时会跑到前面）
  function renderHintStrip(steps, index, view) {
    if (!hintStripEl) {
      return;
    }
    if (!steps.length || steps.length > 40) {
      hintStripEl.innerHTML = '';
      return;
    }
    var html = '';
    for (var k = 0; k < steps.length; k++) {
      var cls = '';
      if (k < index) {
        cls = 'done';
      } else if (k === index) {
        cls = 'cur';
      } else if (k === view) {
        cls = 'peek';
      }
      html += '<i' + (cls ? ' class="' + cls + '"' : '') + '></i>';
    }
    hintStripEl.innerHTML = html;
  }

  function renderHint() {
    if (!hintPlan) {
      return;
    }
    var steps = hintPlan.steps;

    if (!steps.length) {
      if (hintStageEl) {
        hintStageEl.textContent = '已复原';
      }
      if (hintProgressEl) {
        hintProgressEl.textContent = '';
      }
      renderHintStrip([], 0, 0);
      if (hintMovesEl) {
        hintMovesEl.innerHTML = '<span class="hint-done">🎉 魔方已经复原啦</span>';
      }
      if (hintWhyEl) {
        hintWhyEl.textContent = '点「打乱」开一局新的，或者直接用手拧也行。想随时看提示，就打开「教学」。';
        hintWhyEl.style.whiteSpace = 'normal';
      }
      if (hintDemoBtn) {
        hintDemoBtn.disabled = true;
        hintDemoBtn.textContent = '演示这一步';
      }
      if (hintNextBtn) {
        hintNextBtn.disabled = true;
        hintNextBtn.textContent = '下一步 ›';
      }
      return;
    }

    var last = steps.length - 1;
    var index = Math.max(0, Math.min(hintPlan.index, last));   // 下一步该做的
    var view = Math.max(0, Math.min(hintPlan.view, last));     // 当前展示的
    hintPlan.index = index;
    hintPlan.view = view;

    var step = steps[view];
    var isPreview = view !== index;

    if (hintStageEl) {
      hintStageEl.textContent = step.title;
    }
    if (hintProgressEl) {
      hintProgressEl.textContent = isPreview
        ? ('预览 ' + (view + 1) + '/' + steps.length)
        : ('第 ' + (index + 1) + '/' + steps.length + ' 步');
    }
    renderHintStrip(steps, index, view);

    if (hintMovesEl) {
      var html = '';
      for (var k = 0; k < step.moves.length; k++) {
        html += '<span class="hint-move">' + step.moves[k].replace("'", '\u2032') + '</span>';
      }
      hintMovesEl.innerHTML = html;
    }
    if (hintWhyEl) {
      var why = step.why || '';
      if (isPreview) {
        // 预览时明确说明：这些招式要等前面的步骤做完才轮得到
        why = (view > index
          ? '⚠️ 这是后面第 ' + (view + 1) + ' 步的预览，得先把前面 ' + view + ' 步做完。'
          : '⚠️ 这一步已经做过了，点「回到当前步」看现在该做什么。') + '\n' + why;
      }
      hintWhyEl.textContent = why;
      hintWhyEl.style.whiteSpace = isPreview ? 'pre-line' : 'normal';
    }

    // 只有「当前该做的那一步」才允许演示，避免在错误的前置状态下演示
    if (hintDemoBtn) {
      hintDemoBtn.disabled = isPreview;
      hintDemoBtn.textContent = isPreview ? '先回到当前步' : '演示这一步';
    }
    if (hintNextBtn) {
      var canNext = view < last;
      var canBack = view !== index;
      hintNextBtn.disabled = (!canNext && !canBack);
      hintNextBtn.innerHTML = canNext ? '下一步 &rsaquo;' : (canBack ? '&laquo; 回到当前步' : '已是最后一步');
    }
  }

  // 求解可能耗时几百毫秒：先让「计算中…」渲染出来，再推迟一帧求解
  function refreshHint() {
    if (busy || demoing) {
      return;
    }
    showHintPanel();
    if (!SOLVER) {
      if (hintStageEl) {
        hintStageEl.textContent = '提示不可用';
      }
      if (hintProgressEl) {
        hintProgressEl.textContent = '';
      }
      if (hintMovesEl) {
        hintMovesEl.innerHTML = '<span class="hint-done" style="color:#ff8f8f">求解器没能加载</span>';
      }
      if (hintWhyEl) {
        hintWhyEl.textContent = '刷新页面再试一次；其余玩法（打乱 / 还原 / 计时）不受影响。';
      }
      return;
    }
    renderHintThinking();
    window.setTimeout(function () {
      if (busy || demoing) {
        return;
      }
      hintPlan = computePlan();
      renderHint();
    }, 40);
  }

  // 教学模式下，每走一步都自动刷新（防抖，避免连续拧动时反复求解）
  function scheduleHintRefresh() {
    if (!teachMode) {
      return;
    }
    if (hintDebounceId) {
      window.clearTimeout(hintDebounceId);
    }
    hintDebounceId = window.setTimeout(function () {
      hintDebounceId = 0;
      if (!teachMode || busy || demoing) {
        return;
      }
      showHintPanel();
      hintPlan = computePlan();
      renderHint();
    }, 300);
  }

  function setTeachMode(on) {
    teachMode = !!on;
    if (teachBtn) {
      if (teachMode) {
        teachBtn.classList.add('on');
      } else {
        teachBtn.classList.remove('on');
      }
      teachBtn.setAttribute('aria-pressed', teachMode ? 'true' : 'false');
    }
    if (teachMode) {
      refreshHint();
    }
  }

  // 「下一步 ›」只是预览：移动 view，不动 index（真正该做的那一步）
  function advanceHint() {
    if (!hintPlan || !hintPlan.steps.length) {
      return;
    }
    var last = hintPlan.steps.length - 1;
    if (hintPlan.view < last) {
      hintPlan.view++;
    } else {
      hintPlan.view = hintPlan.index;
    }
    renderHint();
  }

  // 把当前推荐的一步直接在魔方上演示出来，然后顺着计划往下走
  function demoHintStep() {
    if (!hintPlan || !hintPlan.steps.length || busy || demoing) {
      return;
    }
    // 正在预览别的步骤时不允许演示（前置状态不对，演示出来是错的）
    if (hintPlan.view !== hintPlan.index) {
      return;
    }
    var step = hintPlan.steps[hintPlan.index];
    if (!step) {
      return;
    }

    demoing = true;
    setButtonsEnabled(false);
    setCubeControlsEnabled(false);
    if (hintDemoBtn) {
      hintDemoBtn.disabled = true;
    }
    if (hintNextBtn) {
      hintNextBtn.disabled = true;
    }

    c.twistDuration = DEMO_TWIST_MS;
    var seq = '';
    for (var i = 0; i < step.moves.length; i++) {
      seq += moveToErnoCmd(step.moves[i]);
    }
    c.twist(seq);

    waitForQueueEmpty(function () {
      c.twistDuration = NORMAL_TWIST_MS;
      demoing = false;
      setButtonsEnabled(true);
      setCubeControlsEnabled(true);
      // 顺着当前计划往下走，不要每一步都重新规划：
      // 顶层公式自带 U 对齐，中途重新分析容易得到「回头」的步骤，来回震荡解不完。
      // 计划走完（或玩家自己拧过）才重新分析。
      if (hintPlan && hintPlan.index < hintPlan.steps.length - 1) {
        hintPlan.index++;
        hintPlan.view = hintPlan.index;
        renderHint();
      } else {
        hintPlan = computePlan();
        renderHint();
      }
    });
  }

  if (thinkBtn) {
    thinkBtn.addEventListener('click', function () {
      if (demoing) {
        return;
      }
      refreshHint();
    });
  }
  if (teachBtn) {
    teachBtn.addEventListener('click', function () {
      setTeachMode(!teachMode);
    });
  }
  if (hintCloseBtn) {
    hintCloseBtn.addEventListener('click', hideHintPanel);
  }
  if (hintDemoBtn) {
    hintDemoBtn.addEventListener('click', demoHintStep);
  }
  if (hintNextBtn) {
    hintNextBtn.addEventListener('click', advanceHint);
  }

  // --------------------------- 对外钩子 -----------------------------------

  // 开场动画结束 —— 可以开始玩了
  window.onCubeReady = function () {
    setButtonsEnabled(true);
    armRound();
  };

  // 方块被还原（由 main3.js 在每次转动后判定并回调）
  window.onCubeSolved = function () {
    // 「演示这一步」过程中不算玩家通关
    if (demoing) {
      return;
    }
    if (gameState !== 'playing' && gameState !== 'armed') {
      return;
    }
    if (c.undoing) {
      return;
    }
    if (c.moveCounter <= 0) {
      return;
    }
    // 稍等片刻，让最后一步转动稳定下来再弹窗；
    // 期间若玩家继续操作或点了打乱/还原，令牌失效，弹窗取消。
    var token = ++roundToken;
    window.setTimeout(function () {
      if (token !== roundToken) {
        return;
      }
      if (gameState !== 'playing' && gameState !== 'armed') {
        return;
      }
      if (c.undoing || !c.isSolved() || c.moveCounter <= 0) {
        return;
      }
      triggerWin();
    }, WIN_SETTLE_MS);
  };

  // ------------------------- 方块事件：计时 / 打乱计数 ----------------------

  c.addEventListener('onTwistComplete', function () {
    // 打乱过程中不刷新步数显示（内部计数器会随打乱自增，避免数字闪动）
    if (scrambleRemaining > 0) {
      scrambleRemaining--;
      if (scrambleRemaining === 0) {
        finishScramble();
      }
      return;
    }

    renderMoves();

    // 「演示这一步」：只更新方块，不计时 / 不计步 / 不判通关
    if (demoing) {
      return;
    }

    if (busy) {
      return;
    }

    // 教学模式下自动刷新推荐
    scheduleHintRefresh();

    // 通关后继续拧 —— 视为新的一局
    if (gameState === 'won' && !c.undoing) {
      gameState = 'playing';
      c.moveCounter = 1;
      renderMoves();
      resetTimer();
      startTimer();
      return;
    }

    // 第一下操作才开始计时
    if (gameState === 'armed' && !c.undoing) {
      gameState = 'playing';
      startTimer();
    }
  });

  // ------------------------------- 交互 -----------------------------------

  if (scrambleBtn) {
    scrambleBtn.addEventListener('click', startScramble);
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', resetCube);
  }
  if (playAgainBtn) {
    playAgainBtn.addEventListener('click', function () {
      hideWinOverlay();
      // 稍等一下让弹窗淡出，再开始打乱
      window.setTimeout(startScramble, 180);
    });
  }
  if (closeWinBtn) {
    closeWinBtn.addEventListener('click', hideWinOverlay);
  }
  if (overlayEl) {
    overlayEl.addEventListener('click', function (e) {
      if (e.target === overlayEl) {
        hideWinOverlay();
      }
    });
  }

  // 键盘快捷键
  // 注意：魔方本身把 XxRrMmLlYyUuEeDdZzFfSsBb 都映射成了拧面操作，
  // 所以这里刻意避开这些字母，只用 Esc / Enter。
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) {
      return;
    }
    var key = e.key || (e.keyCode === 27 ? 'Escape' : (e.keyCode === 13 ? 'Enter' : ''));

    if (key === 'Escape' || key === 'Esc') {
      hideWinOverlay();
      return;
    }
    if (key !== 'Enter') {
      return;
    }
    // 焦点在按钮 / 输入框上时交给浏览器默认行为，避免重复触发
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'button' || tag === 'a') {
      return;
    }
    if (gameState === 'won') {
      hideWinOverlay();
      window.setTimeout(startScramble, 180);
    } else {
      startScramble();
    }
  });

  // 初始渲染
  renderTimer();
  renderMoves();
  setButtonsEnabled(false);

  // 轻量调试/自测接口（不影响正常玩法）
  window.__cubeGame = {
    readState: readCubeState,
    plan: computePlan,
    isDemoing: function () { return demoing; },
    isTeaching: function () { return teachMode; }
  };
})();
