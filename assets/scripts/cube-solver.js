/* ==========================================================================
   cube-solver.js — 三阶魔方状态引擎 + 层先法（LBL）求解器
   --------------------------------------------------------------------------
   纯逻辑，不依赖 DOM / three.js，可在 Node 与浏览器中运行。

   坐标系（标准帧）：x = 右, y = 上, z = 前
   面：U(+y) R(+x) F(+z) D(-y) L(-x) B(-z)
   贴纸编号：U0-8, R9-17, F18-26, D27-35, L36-44, B45-53（标准 net 顺序）

   本模块内部一律使用「标准帧」；与 ERNO 魔方（自身帧）之间的换算由
   game.js 负责（读状态时套用一次旋转置换，输出招式时做面名映射）。
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSolver = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------ 基础

  var FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
  var FACE_INDEX = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

  // 每个面：轴、层坐标、顺时针旋转角
  var MOVE_AXIS = {
    U: ['y', 1, -90], D: ['y', -1, 90],
    R: ['x', 1, -90], L: ['x', -1, 90],
    F: ['z', 1, -90], B: ['z', -1, 90],
  };

  var SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

  // 每个面 9 个贴纸的坐标
  function faceletPos(face, i) {
    var row = Math.floor(i / 3), col = i % 3;
    switch (face) {
      case 'U': return [-1 + col, 1, -1 + row];
      case 'R': return [1, 1 - row, 1 - col];
      case 'F': return [-1 + col, 1 - row, 1];
      case 'D': return [-1 + col, -1, 1 - row];
      case 'L': return [-1, 1 - row, -1 + col];
      case 'B': return [1 - col, 1 - row, -1];
    }
    return null;
  }

  // 由坐标反查贴纸在面内的序号
  function faceletIndex(face, p) {
    var x = p[0], y = p[1], z = p[2];
    switch (face) {
      case 'U': return (z + 1) * 3 + (x + 1);
      case 'R': return (1 - y) * 3 + (1 - z);
      case 'F': return (1 - y) * 3 + (x + 1);
      case 'D': return (1 - z) * 3 + (x + 1);
      case 'L': return (1 - y) * 3 + (z + 1);
      case 'B': return (1 - y) * 3 + (1 - x);
    }
    return 0;
  }

  function normalToFace(n) {
    var x = Math.round(n[0]), y = Math.round(n[1]), z = Math.round(n[2]);
    if (y === 1) return 'U';
    if (y === -1) return 'D';
    if (x === 1) return 'R';
    if (x === -1) return 'L';
    if (z === 1) return 'F';
    if (z === -1) return 'B';
    return null;
  }

  // 绕轴旋转 90°（angle = ±90）
  function rot(p, axis, angle) {
    var x = p[0], y = p[1], z = p[2];
    if (axis === 'x') {
      return angle > 0 ? [x, -z, y] : [x, z, -y];
    }
    if (axis === 'y') {
      return angle > 0 ? [z, y, -x] : [-z, y, x];
    }
    return angle > 0 ? [-y, x, z] : [y, -x, z];
  }

  // 全部 54 个贴纸的 {face, pos, normal}
  var FACELETS = (function () {
    var list = [];
    FACE_ORDER.forEach(function (face) {
      var n = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] }[face];
      for (var i = 0; i < 9; i++) {
        list.push({ face: face, pos: faceletPos(face, i), normal: n.slice() });
      }
    });
    return list;
  })();

  // 生成一个面转动的置换：perm[i] = 贴纸 i 转动后落在的编号
  function buildFacePerm(face) {
    var cfg = MOVE_AXIS[face];
    var axis = cfg[0], layer = cfg[1], angle = cfg[2];
    var perm = new Array(54);
    for (var i = 0; i < 54; i++) {
      var f = FACELETS[i];
      var p = f.pos, n = f.normal;
      var inLayer = (axis === 'x' && p[0] === layer) ||
        (axis === 'y' && p[1] === layer) ||
        (axis === 'z' && p[2] === layer);
      if (inLayer) {
        p = rot(p, axis, angle);
        n = rot(n, axis, angle);
      }
      var nf = normalToFace(n);
      perm[i] = FACE_INDEX[nf] * 9 + faceletIndex(nf, p);
    }
    return perm;
  }

  function invertPerm(perm) {
    var inv = new Array(54);
    for (var i = 0; i < 54; i++) inv[perm[i]] = i;
    return inv;
  }

  // 招式名 -> 置换
  var PERMS = {};
  (function () {
    FACE_ORDER.forEach(function (face) {
      var base = buildFacePerm(face);
      PERMS[face] = base;
      PERMS[face + "'"] = invertPerm(base);
      // 180°：两次
      var twice = new Array(54);
      for (var i = 0; i < 54; i++) twice[i] = base[base[i]];
      PERMS[face + '2'] = twice;
    });
  })();

  var ALL_MOVES = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2',
    'D', "D'", 'D2', 'L', "L'", 'L2', 'B', "B'", 'B2'];

  // ------------------------------------------------------------ 状态操作

  // 状态数组直接存颜色字符（'U','R','F','D','L','B'），便于与 colors 表比较
  function stateFromString(s) {
    var a = new Array(54);
    for (var i = 0; i < 54; i++) a[i] = s.charAt(i);
    return a;
  }

  function stringFromState(a) {
    return a.join('');
  }

  function cloneState(a) {
    return a.slice();
  }

  function applyPermTo(state, perm) {
    var out = new Array(54);
    for (var i = 0; i < 54; i++) out[perm[i]] = state[i];
    return out;
  }

  function applyMove(state, move) {
    return applyPermTo(state, PERMS[move]);
  }

  function parseSeq(seq) {
    if (Array.isArray(seq)) {
      var out = [];
      seq.forEach(function (m) { out = out.concat(parseSeq(m)); });
      return out;
    }
    return String(seq).split(/[\s,]+/).filter(Boolean);
  }

  function applySeq(state, seq) {
    var moves = parseSeq(seq);
    var s = state;
    for (var i = 0; i < moves.length; i++) s = applyMove(s, moves[i]);
    return s;
  }

  // 一个招式转过的「四分之一圈数」：1 = 顺时针，2 = 180°，3 = 逆时针
  function amountOf(m) {
    if (m.length === 1) return 1;
    return m.charAt(1) === "'" ? 3 : 2;
  }

  // 把招式序列归一化：合并相邻同面（U U → U2，U2 U' → U，U U' → 去掉）
  function normalizeMoves(flat) {
    var out = [];
    for (var i = 0; i < flat.length; i++) {
      var f = flat[i].charAt(0);
      var d = amountOf(flat[i]);
      if (out.length && out[out.length - 1].face === f) {
        out[out.length - 1].amt = (out[out.length - 1].amt + d) % 4;
      } else {
        out.push({ face: f, amt: d });
      }
    }
    var res = [];
    for (var j = 0; j < out.length; j++) {
      if (out[j].amt === 0) continue;
      if (out[j].amt === 1) res.push(out[j].face);
      else if (out[j].amt === 2) res.push(out[j].face + '2');
      else res.push(out[j].face + "'");
    }
    return res;
  }

  // 求一个公式的逆（倒序 + 逐个取反），用于生成「另一个方向」的三循环公式
  function invertAlg(seq) {
    var m = parseSeq(seq);
    var out = [];
    for (var i = m.length - 1; i >= 0; i--) {
      var t = m[i];
      if (t.length === 1) out.push(t + "'");
      else if (t.charAt(1) === "'") out.push(t.charAt(0));
      else out.push(t);
    }
    return out;
  }

  // -------------------------------------------------------------- 块位置表

  // 角块：面内序号 与 正确时的颜色
  var CORNERS = {
    URF: { faces: [8, 9, 20], colors: ['U', 'R', 'F'] },
    UFL: { faces: [6, 18, 38], colors: ['U', 'F', 'L'] },
    ULB: { faces: [0, 36, 47], colors: ['U', 'L', 'B'] },
    UBR: { faces: [2, 45, 11], colors: ['U', 'B', 'R'] },
    DFR: { faces: [29, 26, 15], colors: ['D', 'F', 'R'] },
    DLF: { faces: [27, 44, 24], colors: ['D', 'L', 'F'] },
    DBL: { faces: [33, 53, 42], colors: ['D', 'B', 'L'] },
    DRB: { faces: [35, 17, 51], colors: ['D', 'R', 'B'] },
  };

  var EDGES = {
    UR: { faces: [5, 10], colors: ['U', 'R'] },
    UF: { faces: [7, 19], colors: ['U', 'F'] },
    UL: { faces: [3, 37], colors: ['U', 'L'] },
    UB: { faces: [1, 46], colors: ['U', 'B'] },
    DR: { faces: [32, 16], colors: ['D', 'R'] },
    DF: { faces: [28, 25], colors: ['D', 'F'] },
    DL: { faces: [30, 43], colors: ['D', 'L'] },
    DB: { faces: [34, 52], colors: ['D', 'B'] },
    FR: { faces: [23, 12], colors: ['F', 'R'] },
    FL: { faces: [21, 41], colors: ['F', 'L'] },
    BL: { faces: [50, 39], colors: ['B', 'L'] },
    BR: { faces: [48, 14], colors: ['B', 'R'] },
  };

  var CORNER_NAMES = Object.keys(CORNERS);
  var EDGE_NAMES = Object.keys(EDGES);

  function keyOf(list) {
    return list.slice().sort().join('');
  }

  function findCorner(state, colors) {
    var want = keyOf(colors);
    for (var i = 0; i < CORNER_NAMES.length; i++) {
      var n = CORNER_NAMES[i], c = CORNERS[n];
      var got = keyOf([state[c.faces[0]], state[c.faces[1]], state[c.faces[2]]]);
      if (got === want) return n;
    }
    return null;
  }

  function findEdge(state, colors) {
    var want = keyOf(colors);
    for (var i = 0; i < EDGE_NAMES.length; i++) {
      var n = EDGE_NAMES[i], e = EDGES[n];
      var got = keyOf([state[e.faces[0]], state[e.faces[1]]]);
      if (got === want) return n;
    }
    return null;
  }

  function isCornerSolved(state, name) {
    var c = CORNERS[name];
    return state[c.faces[0]] === c.colors[0] &&
      state[c.faces[1]] === c.colors[1] &&
      state[c.faces[2]] === c.colors[2];
  }

  function isEdgeSolved(state, name) {
    var e = EDGES[name];
    return state[e.faces[0]] === e.colors[0] &&
      state[e.faces[1]] === e.colors[1];
  }

  function isSolved(state) {
    if (typeof state === 'string') return state === SOLVED;
    return stringFromState(state) === SOLVED;
  }

  // ---------------------------------------------------------------- 搜索

  var OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
  var FACE_RANK = { U: 0, D: 1, R: 2, L: 3, F: 4, B: 5 };

  function moveFace(m) { return m.charAt(0); }

  function moveAllowed(prevFace, face) {
    if (!prevFace) return true;
    if (prevFace === face) return false;
    // 对面可交换，固定顺序避免重复
    if (OPPOSITE[prevFace] === face && FACE_RANK[prevFace] < FACE_RANK[face]) return false;
    return true;
  }

  /**
   * 受限 IDA*：在给定招式集合中寻找最短序列使 goal(state) 为真。
   * 使用「原地施加 + 逆置换回退」，避免频繁分配。
   */
  function idaSearch(start, goal, moves, maxDepth, budget) {
    var state = cloneState(start);
    var buf = new Array(54);
    var path = [];
    var nodes = 0;
    var n = moves.length;
    var movePerms = new Array(n);
    var invPerms = new Array(n);
    var moveFaces = new Array(n);
    for (var i = 0; i < n; i++) {
      movePerms[i] = PERMS[moves[i]];
      invPerms[i] = invertPerm(PERMS[moves[i]]);
      moveFaces[i] = moveFace(moves[i]);
    }

    function applyInPlace(perm) {
      for (var k = 0; k < 54; k++) buf[perm[k]] = state[k];
      for (var k2 = 0; k2 < 54; k2++) state[k2] = buf[k2];
    }

    function dfs(depth, prevFace) {
      if (goal(state)) return true;
      if (depth === 0) return false;
      if (nodes++ > budget) return false;
      for (var i = 0; i < n; i++) {
        if (!moveAllowed(prevFace, moveFaces[i])) continue;
        applyInPlace(movePerms[i]);
        path.push(moves[i]);
        if (dfs(depth - 1, moveFaces[i])) return true;
        path.pop();
        applyInPlace(invPerms[i]);
      }
      return false;
    }

    for (var d = 0; d <= maxDepth; d++) {
      path.length = 0;
      nodes = 0;
      if (dfs(d, null)) return path.slice();
      if (nodes > budget) break;
    }
    return null;
  }

  // --------------------------------------------------------------- 求解器

  function pushStep(steps, moves, title, why) {
    var flat = normalizeMoves(parseSeq(moves));
    if (!flat.length) return;
    steps.push({ moves: flat, title: title, why: why });
  }

  var CN_FACE = { U: '顶面', R: '右面', F: '前面', D: '底面', L: '左面', B: '后面' };
  var CN_COLOR = { U: '顶色', R: '右色', F: '前色', D: '底色', L: '左色', B: '后色' };

  // 把 ['D','F'] 这样的颜色集合写成「底色」「前色」
  function describePiece(colors) {
    var out = [];
    for (var i = 0; i < colors.length; i++) out.push('「' + CN_COLOR[colors[i]] + '」');
    return out.join('');
  }

  // 把 'DFR' 这样的位置写成 底面·前面·右面
  function describeSlot(name) {
    var out = [];
    for (var i = 0; i < name.length; i++) out.push(CN_FACE[name.charAt(i)]);
    return out.join('·');
  }

  var U_ROT = ['', 'U', 'U2', "U'"];
  var D_CORNERS = ['DFR', 'DLF', 'DBL', 'DRB'];
  var D_EDGES = ['DF', 'DR', 'DB', 'DL'];
  var M_EDGES = ['FR', 'FL', 'BL', 'BR'];
  var U_CORNERS = ['URF', 'UFL', 'ULB', 'UBR'];
  var U_EDGES = ['UR', 'UF', 'UL', 'UB'];

  function countTopEdgeUp(st) {
    return (st[5] === 'U' ? 1 : 0) + (st[7] === 'U' ? 1 : 0) +
      (st[3] === 'U' ? 1 : 0) + (st[1] === 'U' ? 1 : 0);
  }
  function countTopFace(st) {
    var c = 0;
    for (var i = 0; i < 9; i++) if (st[i] === 'U') c++;
    return c;
  }
  function countTopCornersPlaced(st) {
    var c = 0;
    for (var i = 0; i < 4; i++) if (isCornerSolved(st, U_CORNERS[i])) c++;
    return c;
  }
  function countTopEdgesPlaced(st) {
    var c = 0;
    for (var i = 0; i < 4; i++) if (isEdgeSolved(st, U_EDGES[i])) c++;
    return c;
  }
  function f2lIntact(st) {
    for (var i = 0; i < 4; i++) if (!isCornerSolved(st, D_CORNERS[i])) return false;
    for (var j = 0; j < 4; j++) if (!isEdgeSolved(st, D_EDGES[j])) return false;
    for (var k = 0; k < 4; k++) if (!isEdgeSolved(st, M_EDGES[k])) return false;
    return true;
  }

  // 把「U 对齐 + 公式」打包成一个宏招式；顶层所有公式都保持前两层不变
  // withInverse = true 时同时纳入公式的逆，覆盖「另一个方向」的三循环情况
  function buildMacros(algs, withInverse) {
    var list = [];
    for (var a = 0; a < algs.length; a++) {
      list.push(parseSeq(algs[a]));
      if (withInverse) list.push(invertAlg(algs[a]));
    }
    var macros = [];
    for (var i = 0; i < U_ROT.length; i++) {
      var pre = parseSeq(U_ROT[i]);
      for (var j = 0; j < list.length; j++) {
        var mac = normalizeMoves(pre.concat(list[j]));
        if (mac.length) macros.push(mac);
      }
    }
    return macros;
  }

  /**
   * 在宏招式空间里做 BFS，找一串宏使 goalFn 成立。
   * 每层都去重（按状态串），因此节点数很小，且保证收敛。
   */
  function macroSearch(s, macros, goalFn, maxLevels) {
    var seen = {};
    seen[stringFromState(s)] = 1;
    var frontier = [{ st: s, path: [] }];
    for (var lv = 0; lv <= maxLevels; lv++) {
      var next = [];
      for (var i = 0; i < frontier.length; i++) {
        var node = frontier[i];
        if (goalFn(node.st)) return node.path;
        if (lv === maxLevels) continue;
        for (var m = 0; m < macros.length; m++) {
          var st = applySeq(node.st, macros[m]);
          var key = stringFromState(st);
          if (seen[key]) continue;
          seen[key] = 1;
          next.push({ st: st, path: node.path.concat([macros[m]]) });
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return null;
  }

  /**
   * 层先法主流程。
   * 返回 [{ moves: ['R',"U'"], title, why, stage }]
   */
  function solve(startState) {
    if (typeof startState === 'string') startState = stateFromString(startState);
    var steps = [];
    var s = cloneState(startState);

    if (isSolved(s)) return steps;

    // ---------------------------------------------------- 第一步：底层十字
    var crossSlots = ['DF', 'DR', 'DB', 'DL'];
    var crossPlaced = [];
    crossSlots.forEach(function (slot) {
      var target = EDGES[slot].colors;
      if (isEdgeSolved(s, slot)) { crossPlaced.push(slot); return; }
      var keep = crossPlaced.slice();
      var goal = function (st) {
        for (var i = 0; i < keep.length; i++) {
          if (!isEdgeSolved(st, keep[i])) return false;
        }
        return isEdgeSolved(st, slot);
      };
      var seq = idaSearch(s, goal, ALL_MOVES, 6, 150000);
      if (!seq) {
        // 兜底：允许暂时破坏其它十字棱，先把这块放好
        seq = idaSearch(s, function (st) { return isEdgeSolved(st, slot); }, ALL_MOVES, 5, 150000);
      }
      if (seq) {
        pushStep(steps, seq,
          '底层十字 · ' + describeSlot(slot),
          '这条棱块同时带 ' + describePiece(target) + '。把它转到 ' + describeSlot(slot) +
          ' 的位置，让两种颜色分别和这两面的中心块对齐 —— 底层十字就多一条了。');
        s = applySeq(s, seq);
      }
      crossPlaced.push(slot);
    });

    // 十字校正：兜底可能破坏已放好的棱，这里整体补齐
    var crossGuard = 0;
    while (!crossSlots.every(function (n) { return isEdgeSolved(s, n); }) && crossGuard++ < 3) {
      var cseq = idaSearch(s, function (st) {
        return crossSlots.every(function (n) { return isEdgeSolved(st, n); });
      }, ALL_MOVES, 8, 400000);
      if (!cseq) break;
      pushStep(steps, cseq, '底层十字 · 校正', '补齐底层十字剩下的棱块，让底面的十字完整。');
      s = applySeq(s, cseq);
    }

    // -------------------------------------------------- 第二步：底层角块
    var cornerSlots = ['DFR', 'DLF', 'DBL', 'DRB'];
    var cornerPlaced = [];
    cornerSlots.forEach(function (slot) {
      var target = CORNERS[slot].colors;
      var f1 = slot.charAt(1), f2 = slot.charAt(2);
      var moveSet = ['U', "U'", 'U2',
        f1, f1 + "'", f1 + '2', f2, f2 + "'", f2 + '2'];

      var keepCorners = cornerPlaced.slice();
      var goal = function (st) {
        for (var i = 0; i < crossSlots.length; i++) {
          if (!isEdgeSolved(st, crossSlots[i])) return false;
        }
        for (var j = 0; j < keepCorners.length; j++) {
          if (!isCornerSolved(st, keepCorners[j])) return false;
        }
        return isCornerSolved(st, slot);
      };

      // 「顶出来」和「插进去」必须合并成同一步：只有这一步做完才达成该阶段目标。
      // 否则中途停下来重新分析时，会得到一个「回头」的步骤，来回震荡解不完。
      var seq = idaSearch(s, goal, moveSet, 9, 150000);
      var guard = 0;
      var pending = [];
      while (!seq && guard++ < 3) {
        // 目标角块若卡在底层（位置或方向不对），先用公式把它顶到顶层
        var loc = findCorner(s, target);
        var lift = parseSeq((loc && loc.charAt(0) === 'D') ? EJECT_CORNER[loc] : EJECT_CORNER[slot]);
        s = applySeq(s, lift);
        pending = pending.concat(lift);
        seq = idaSearch(s, goal, moveSet, 9, 150000);
      }
      if (seq) {
        pending = pending.concat(seq);
        pushStep(steps, pending, '底层角块 · ' + describeSlot(slot),
          '把同时带 ' + describePiece(target) + ' 的角块转进 ' + describeSlot(slot) +
          ' 的角位。四个角块都插好，第一层就完整了。');
        s = applySeq(s, seq);
      } else if (pending.length) {
        pushStep(steps, pending, '取出底层角块',
          '目标角块还卡在底层或方向不对，先用公式把它换到顶层，再重新插入。');
      }
      cornerPlaced.push(slot);
    });

    // ------------------------------------------------ 第三步：中层棱块
    var middleSlots = ['FR', 'FL', 'BL', 'BR'];
    var middleDone = [];
    middleSlots.forEach(function (slot) {
      var target = EDGES[slot].colors;
      var keepMid = middleDone.slice();
      var goal = function (st) {
        for (var i = 0; i < cornerSlots.length; i++) {
          if (!isCornerSolved(st, cornerSlots[i])) return false;
        }
        for (var j = 0; j < crossSlots.length; j++) {
          if (!isEdgeSolved(st, crossSlots[j])) return false;
        }
        for (var k = 0; k < keepMid.length; k++) {
          if (!isEdgeSolved(st, keepMid[k])) return false;
        }
        return isEdgeSolved(st, slot);
      };
      if (goal(s)) { middleDone.push(slot); return; }

      var f1 = slot.charAt(0), f2 = slot.charAt(1);
      var moveSet = ['U', "U'", 'U2',
        f1, f1 + "'", f1 + '2', f2, f2 + "'", f2 + '2'];

      var seq = null;
      var guard = 0;
      var pending = [];
      while (!seq && guard++ < 5) {
        // 目标棱块若卡在中层（位置或方向不对），先用公式把它顶到顶层；
        // 这个「顶出来」会和随后的「插进去」合并成同一步（见下）
        var loc = findEdge(s, target);
        if (loc && loc.length === 2 && loc.charAt(0) !== 'U') {
          var ej = parseSeq((INSERT_EDGE[loc] || INSERT_EDGE[slot]).right);
          s = applySeq(s, ej);
          pending = pending.concat(ej);
        }
        // 棱块已在顶层：用左右插入公式（含各种 U 对齐）尝试
        var ins = INSERT_EDGE[slot];
        ['', 'U', 'U2', "U'"].forEach(function (u) {
          if (seq) return;
          [ins.right, ins.left].forEach(function (a) {
            if (seq) return;
            var cand = parseSeq((u ? u + ' ' : '') + a);
            if (goal(applySeq(s, cand))) seq = cand;
          });
        });
        if (seq) break;
        // 兜底：受限搜索
        seq = idaSearch(s, goal, moveSet, 9, 150000);
      }
      if (seq) {
        pending = pending.concat(seq);
        pushStep(steps, pending, '中层棱块 · ' + describeSlot(slot),
          '把同时带 ' + describePiece(target) + ' 的棱块插进 ' + describeSlot(slot) +
          ' 的槽位。四条中层棱都归位，前两层就完成了。');
        s = applySeq(s, seq);
      } else if (pending.length) {
        pushStep(steps, pending, '取出中层棱块',
          '目标棱块在中层但位置或方向不对，先用公式把它换到顶层，再重新插入。');
      }
      middleDone.push(slot);
    });

    // 顶层每个阶段都串成「一个完整步骤」。
    // 顶层公式都带一个 U 对齐（AUF），拆开单独执行会把上一步刚摆好的块转歪，
    // 重新分析时就会来回横跳，所以必须整段一起给。
    var crossPath = macroSearch(s, buildMacros(["F R U R' U' F'"]), function (st) {
      return countTopEdgeUp(st) === 4 && f2lIntact(st);
    }, 3);
    if (crossPath && crossPath.length) {
      var crossMoves = [];
      crossPath.forEach(function (mac) { crossMoves = crossMoves.concat(mac); });
      s = applySeq(s, crossMoves);
      pushStep(steps, crossMoves, '顶层十字',
        '用公式 F R U R\' U\' F\' 把顶棱翻上来，先拼出顶面十字（这一步先不管角块）。');
    }

    // ------------------------------------------ 第五步：顶面同色（OLL 角块）
    var facePath = macroSearch(s, buildMacros(["R U R' U R U2 R'", "R U2 R' U' R U' R'"]), function (st) {
      return countTopFace(st) === 9 && f2lIntact(st);
    }, 3);
    if (facePath && facePath.length) {
      var faceMoves = [];
      facePath.forEach(function (mac) { faceMoves = faceMoves.concat(mac); });
      s = applySeq(s, faceMoves);
      pushStep(steps, faceMoves, '顶面同色',
        '用「小鱼公式」R U R\' U R U2 R\' 把顶层四个角块的顶色翻上来，让整个顶面同色。');
    }

    // ------------------------------------------ 第六步：顶层角块归位（PLL 角）
    var cornerPermPath = macroSearch(s, buildMacros(["R' F R' B2 R F' R' B2 R2"], true), function (st) {
      return countTopCornersPlaced(st) === 4 && f2lIntact(st);
    }, 3);
    if (cornerPermPath && cornerPermPath.length) {
      var cpMoves = [];
      cornerPermPath.forEach(function (mac) { cpMoves = cpMoves.concat(mac); });
      s = applySeq(s, cpMoves);
      pushStep(steps, cpMoves, '顶层角块归位',
        '用角块三循环公式把顶层四个角块转到正确的位置（这一步只看位置，不看朝向）。');
    }

    // ------------------------------------------ 第七步：顶层棱块归位（PLL 棱）
    var edgePermPath = macroSearch(s, buildMacros(["R U' R U R U R U' R' U' R2"], true), function (st) {
      return isSolved(st);
    }, 4);
    if (edgePermPath && edgePermPath.length) {
      var epMoves = [];
      edgePermPath.forEach(function (mac) { epMoves = epMoves.concat(mac); });
      s = applySeq(s, epMoves);
      pushStep(steps, epMoves, '顶层棱块归位',
        '用棱块三循环公式把顶层棱块归位，再对齐顶面，魔方就复原了。');
    }

    // 收尾：还差一个顶层旋转就对齐
    if (!isSolved(s)) {
      for (var ai = 1; ai < U_ROT.length; ai++) {
        if (isSolved(applySeq(s, U_ROT[ai]))) {
          s = applySeq(s, U_ROT[ai]);
          pushStep(steps, U_ROT[ai], '对齐顶面', '最后转一下顶层，让六个面的颜色全部对齐。');
          break;
        }
      }
    }

    return steps;
  }

  // 角块“顶出来”公式（把底层角块送到顶层）
  var EJECT_CORNER = {
    DFR: "R U R'",
    DLF: "L' U' L",
    DBL: "L U L'",
    DRB: "R' U' R",
  };

  // 中层棱块插入公式
  var INSERT_EDGE = {
    FR: { right: "U R U' R' U' F' U F", left: "U' F' U F U R U' R'" },
    FL: { right: "U' L' U L U F U' F'", left: "U F U' F' U' L' U L" },
    BL: { right: "U L U' L' U' B' U B", left: "U' B' U B U L U' L'" },
    BR: { right: "U' R' U R U B U' B'", left: "U B U' B' U' R' U R" },
  };

  return {
    SOLVED: SOLVED,
    ALL_MOVES: ALL_MOVES,
    stateFromString: stateFromString,
    stringFromState: stringFromState,
    applyMove: applyMove,
    applySeq: applySeq,
    parseSeq: parseSeq,
    isSolved: isSolved,
    solve: solve,
    PERMS: PERMS,
    FACE_ORDER: FACE_ORDER,
  };
});
