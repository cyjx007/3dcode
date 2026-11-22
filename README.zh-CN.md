# zoo-3dcube

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**萌宠 3D 魔方游戏 —— 可安装的 PWA，带求解提示与教学引导。**

[English](README.md) · 中文

> 仓库名是 `3dcode`，应用名是 **zoo-3dcube**。它基于
> [zoo-js/3dcube](https://github.com/zoo-js/3dcube)（MIT，© 2020 zoo-js）修改，
> 本仓库增加了层先法求解器、提示/教学面板，以及下面提到的移动端与 PWA 修复。

可以用鼠标或触屏拧魔方，在手机上玩，随时让「思考」给出下一步并解释原因；打开「教学」后，
提示面板会跟着每一步自动刷新。项目是纯静态站点 + Service Worker，首次访问后可离线使用，
也可以安装到手机主屏。

## 功能

- **3D 魔方**：鼠标 / 触屏拖拽拧动，也支持键盘（`R` `L` `U` `D` `F` `B` 及对应小写）
- **打乱 / 还原**：一键随机打乱 22 步、一键回到复原态
- **计时 + 步数**：从第一次拧动开始计时，复原成功即停止（`MM:SS.d`）
- **复原弹窗**：显示用时与步数，无需刷新页面即可继续下一局
- **思考**：随时推荐下一步，并说明为什么这么做
- **教学**：提示面板常驻，每拧一步自动刷新推荐
- **PWA**：可安装到手机主屏，Service Worker 离线缓存
- **萌宠贴纸**：由 [zoo-js/zoo](https://github.com/zoo-js/zoo) 提供，可通过 URL 参数自定义
- **移动端适配**：防误触下拉刷新、视口自适应、安全区适配

## 依赖

- 支持 WebGL 与 Service Worker 的现代浏览器。
- 本地预览只需要 Python 3 或 Node.js，任意静态服务器都可以。
- 没有构建步骤，不需要安装依赖。

## 本地开发

```bash
# 方式一：Python
python3 -m http.server 9090

# 方式二：Node
npx serve .
```

然后打开 <http://localhost:9090/>。

不要用 `file://` 直接打开 `index.html`：Service Worker 与模块加载都需要 HTTP 环境。

## 玩法

页面底部提供一条控制栏：

| 控件 | 说明 |
| --- | --- |
| 计时器 | 从第一次拧动开始计时，复原成功即停止（`MM:SS.d`） |
| 步数 | 本局已用步数 |
| **打乱** | 随机打乱 22 步，打乱完成后自动开始新一局 |
| **还原** | 一键把方块还原回初始状态 |
| **思考** | 打开提示面板，给出下一步该怎么拧并解释原因 |
| **教学** | 打开后提示面板常驻，每拧一步都自动刷新推荐 |

### 思考 / 教学

点「思考」会打开提示面板，它会：

- 告诉你**当前处在哪个阶段**（底层十字 / 底层角块 / 中层棱块 / 顶层十字 / 顶面同色 /
  顶层角块归位 / 顶层棱块归位）
- 给出这一步的**具体招式**（如 `R U R' U'`），并用一句话说明**为什么**
- 显示整份计划的进度条；点「下一步 ›」可以预览后续步骤（会提示必须先把前面的步骤做完，
  并禁用演示，避免在错误的前置状态下演示）
- 点「演示这一步」直接在方块上执行该步骤

打乱之后可以**随便自己拧**：想自己解、想随时看提示、想直接还原都行。打开「教学」后，
面板会跟着每一步自动更新。

复原成功后弹出成绩卡片（用时 / 步数），点「再来一局」即可**无需刷新页面**继续下一局。

键盘：`Enter` 打乱 / 再来一局，`Esc` 关闭成绩卡片。

## 求解器

`assets/scripts/cube-solver.js` 是一个**零依赖、纯逻辑**的三阶魔方状态引擎 + 层先法（LBL）
求解器，采用 UMD 包装，浏览器与 Node 都能用。

解法流程（共七步，每一步都附中文讲解）：

```text
底层十字 → 底层角块 → 中层棱块 → 顶层十字 → 顶面同色 → 顶层角块归位 → 顶层棱块归位
```

接口：

```js
// 状态串：54 个字符，按 U/R/F/D/L/B 六面顺序，如 'UUUUUUUUURRRRRRRRR...'
const SOLVED = CubeSolver.SOLVED;

CubeSolver.stateFromString(SOLVED);   // 状态串 -> 54 长度的数组
CubeSolver.stringFromState(arr);      // 数组 -> 状态串
CubeSolver.applyMove(state, 'R');     // 施加单个招式（支持 'R' "R'" 'R2'）
CubeSolver.applySeq(state, "R U R' U'"); // 施加一串招式
CubeSolver.isSolved(state);           // 是否复原

// 求解：返回 [{ moves, title, why }, ...]
const plan = CubeSolver.solve(stateString);
plan.forEach(step => {
  console.log(step.title, '->', step.moves.join(' '));
  console.log('为什么：', step.why);
});
```

实现要点：

- 54 贴纸置换表由坐标旋转自动生成 18 个招式（含逆与 180°）的置换，无需手写
- 角块 / 棱块位置表：`CORNERS` / `EDGES` 记录每块的贴纸位置与颜色
- 受限 IDA*：底层十字 / 角块 / 中层棱块用 IDA* 搜索（禁止同面连转、对面固定顺序）
- 宏招式 BFS：顶层用「U 对齐 + 公式」打包成宏，广度优先搜索，按状态串去重
- 招式归一化：自动合并相邻同面招式（`U U` → `U2`、`U U′` → 去掉）

性能：100 局随机 20 步打乱，**100/100 全部正确求解**，平均约 0.3 秒 / 约 120 步。

## 目录结构

```text
.
├── index.html                  # 页面入口
├── sw.js                       # Service Worker（预缓存 + stale-while-revalidate）
├── manifest.json               # PWA 清单
├── cube.png                    # 图标 / 预览图
├── assets/
│   ├── styles/
│   │   ├── cube.css            # 魔方本体样式
│   │   ├── doodle2.css         # 原版 Google Doodle 风格
│   │   ├── certificate2.css    # 萌宠贴纸 CSS 变量
│   │   └── game.css            # 控制栏 / 提示面板 / 通关弹窗
│   └── scripts/
│       ├── three.js            # three.js
│       ├── cuber.min.js        # ERNO 魔方引擎
│       ├── main3.js            # 初始化 / 交互 / 相机自适应 / 通关判定
│       ├── cube-solver.js      # 三阶求解器（纯逻辑，零依赖）
│       ├── game.js             # 游戏层：打乱 / 还原 / 计时 / 提示面板
│       └── ...                 # 原版其余脚本（tween / frames / certificate 等）
├── changelog.md                # 更新日志
└── README.md
```

## 嵌入与 URL 参数

上游演示地址：
<https://zoo-js.github.io/3dcube/?red=cat&white=dog&blue=pig&green=sheep&orange=koala&yellow=ant&bg=*ffd8bf>。
它是上游构建，**不包含本仓库的求解器与提示功能**。本仓库目前没有自己的线上演示。

用 iframe 嵌入：

```html
<iframe
  id="zoo-3dcube"
  src="https://zoo-js.github.io/3dcube/?red=cat&white=dog&blue=pig&green=sheep&orange=koala&yellow=ant&bg=*ffd8bf"
  name="3dcube"
  width="100%"
  height="100%"
  scrolling="no"
  frameborder="0">
</iframe>
```

支持的参数：

```js
red     // 红色面
white   // 白色面
blue    // 蓝色面
green   // 绿色面
orange  // 橙色面
yellow  // 黄色面
bg      // 背景色
```

背景色支持英文名（`red`、`blue`），也支持十六进制（如 `*ffccc7`、`*ffd8bf`、
`*f4ffb8`），注意把 `#` 换成 `*`。

## 技术实现要点

### 移动端防下拉刷新

- CSS：`overscroll-behavior: none`、`touch-action: none`、`position: fixed`、
  `overflow: hidden`
- JS：全局 `touchmove` 的 `preventDefault()`（`{ passive: false }`），以及双击防缩放
- 提示面板内部需要滚动，所以在全局拦截时放行 `#hintpanel` 内部的手势

### Service Worker 缓存策略

- `install` 时用 `Promise.allSettled` 逐个预缓存核心资源，单个失败不阻塞安装
- `fetch`：同源用 **stale-while-revalidate**，跨域用 **network-first**
- `activate` 时清理旧版本缓存，配合 `skipWaiting()` + `clients.claim()` 让新版本尽快生效
- 改了任何静态文件都要**手动升级 `CACHE_NAME`**，否则老用户会一直用旧缓存

### 读魔方状态：重放转动历史

ERNO 引擎的 `cubelet.matrix` / `addressX/Y/Z` / `face.color` 在扭转后不可靠，贴纸位置
和颜色会对不上。最终方案是重放 `cube.twistQueue.history`：把每次转动依次作用到复原态。
`resetCube` 与通关时都会清空历史，而那两个时刻方块正是复原态，所以不会失真。

### ERNO 引擎的几个坑

- **不要用 `cube.shuffle()`**：它会把转动标记 `isShuffle` 并从 history 中 purge 掉，
  导致之后无法撤销。自己生成随机序列再 `twist()` 即可
- **`undo()` 会把被撤销的原始转动 unshift 回 `twistQueue.future`**：撤销结束后必须
  `twistQueue.empty()` 再解除 `undoing`，否则残留转动会被当成新转动重放一遍
- **ERNO 不认撇号语法**：`twist("R'")` 里的撇号会被忽略、当成 `R`。逆时针必须写小写 `r`
- **`twist()` 不要一次喂超长指令串**：超过百步时结果会错，分小块提交并等待队列清空
- **拆 UI 步骤必须保证每一步都达成某个目标**：顶层公式自带 U 对齐，只执行一半会来回震荡

## 限制

- 没有自动化测试或 CI
- 没有构建系统，文件按原样提供
- 上游线上演示不包含本仓库的求解器 / 提示改动
- Service Worker 缓存版本靠手动维护，每次改静态资源都要升级
- 魔方渲染器与贴纸素材来自上游项目

## 更新日志

见 [changelog.md](changelog.md)。

## 致谢与许可证

- 原项目：[zoo-js/3dcube](https://github.com/zoo-js/3dcube)，MIT，© 2020 zoo-js
- 贴纸素材：[zoo-js/zoo](https://github.com/zoo-js/zoo)
- 求解器、提示面板、教学模式与移动端 / PWA 修复：本仓库

以 [MIT License](LICENSE) 发布。
