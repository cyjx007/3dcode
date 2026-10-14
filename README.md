# zoo-3dcube

简体中文 | [English](./README.en.md)

萌宠 3D 魔方游戏 —— **PWA · 可安装 · 支持求解提示与教学引导**

> 由于萌宠图片地址存于 GitHub 中，项目部署于 GitHub Pages 上，请确保当前网络环境流畅！

## 🔥 预览图
![](./cube.png)

## ✨ 功能特性

- 🧊 **3D 魔方**：鼠标 / 触屏拖拽拧动，也支持键盘（`R` `L` `U` `D` `F` `B` 及对应小写）
- 🎲 **打乱 / 还原**：一键随机打乱 22 步、一键回到复原态
- ⏱ **计时 + 步数**：从你第一次拧动开始计时，复原成功即停止（`MM:SS.d`）
- 🎉 **复原弹窗**：显示用时与步数，**无需刷新页面**即可继续下一局
- 💡 **思考**：随时推荐下一步该怎么拧，并**说明为什么这么做**
- 🎓 **教学**：提示面板常驻，每拧一步自动刷新推荐
- 📱 **PWA**：可安装到手机主屏，Service Worker 离线缓存
- 🐱 **萌宠贴纸**：由 [zoo-js/zoo](https://github.com/zoo-js/zoo) 提供，可通过 URL 参数自定义
- 📲 **移动端适配**：防误触下拉刷新、视口自适应、安全区适配

## 🎮 玩法

页面底部提供一条控制栏：

| 控件 | 说明 |
| --- | --- |
| 计时器 | 从你第一次拧动开始计时，复原成功即停止（`MM:SS.d`） |
| 步数 | 本局已用步数 |
| **打乱** | 随机打乱 22 步，打乱完成后自动开始新一局 |
| **还原** | 一键把方块还原回初始状态，可直接重新开始 |
| **思考** | 打开提示面板，给出下一步该怎么拧并解释原因 |
| **教学** | 打开后提示面板常驻，每拧一步都自动刷新推荐 |

### 💡 思考 / 教学

点「思考」会打开提示面板，它会：

- 指出**现在处在哪一步**（底层十字 / 底层角块 / 中层棱块 / 顶层十字 / 顶面同色 / 顶层角块归位 / 顶层棱块归位）
- 给出**这一步的具体招式**（例如 `R U R′ U′`），并用一句话解释**为什么要这么做**
- 顶部进度条显示整份计划走到哪了；点「下一步 ›」可以**预览**后面的步骤（预览时面板会明确提示「得先把前面 N 步做完」，并禁用演示，避免在错误的前置状态下演示）
- 点「演示这一步」可以直接在方块上把这一步演出来，演完自动推进到下一步

打乱之后你可以**随便自己拧**：想自己解、想随时看提示、想直接还原都行。打开「教学」后，面板会跟着你每一步自动更新。

复原成功后弹出成绩卡片（用时 / 步数），点「再来一局」即可**无需刷新页面**继续下一局。

键盘：`Enter` 打乱 / 再来一局，`Esc` 关闭成绩卡片。

## 🧠 求解器

`assets/scripts/cube-solver.js` 是一个**零依赖、纯逻辑**的三阶魔方状态引擎 + 层先法（LBL）求解器，采用 UMD 包装，浏览器与 Node 都能用。

**解法流程**（共七步，每一步都附中文讲解）：

```
底层十字 → 底层角块 → 中层棱块 → 顶层十字 → 顶面同色 → 顶层角块归位 → 顶层棱块归位
```

**接口一览：**

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
// 例：
// 底层十字 · 底面·前面 -> U2 F2
// 为什么：这条棱块同时带「底色」「前色」。把它转到 底面·前面 的位置，
//        让两种颜色分别和这两面的中心块对齐 —— 底层十字就多一条了。
```

**引擎实现要点：**

- 54 贴纸置换表：`buildFacePerm` 由坐标旋转自动生成 18 个招式（含逆与 180°）的置换，无需手写
- 角块 / 棱块位置表：`CORNERS` / `EDGES` 记录每块的贴纸位置与颜色，供「找到某块在哪」使用
- 受限 IDA*：底层十字 / 角块 / 中层棱块用 IDA* 搜索（禁止同面连转、对面固定顺序），预算受控，单步通常几毫秒
- 宏招式 BFS：顶层用「U 对齐 + 公式」打包成宏，做广度优先搜索，按状态串去重，保证收敛
- 招式归一化：自动合并相邻同面招式（`U U` → `U2`、`U U′` → 去掉）

**性能**：100 局随机 20 步打乱，**100/100 全部正确求解**，平均约 0.3 秒 / 约 120 步。

## 📁 目录结构

```
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
│       ├── cuber.min.js        # ERNO 魔方引擎（ERNO.Cube 等）
│       ├── main3.js            # 初始化 / 交互 / 相机自适应 / 通关判定
│       ├── cube-solver.js      # ⭐ 三阶求解器（纯逻辑，零依赖）
│       ├── game.js             # 游戏层：打乱 / 还原 / 计时 / 提示面板
│       └── ...                 # 原版其余脚本（tween / frames / certificate 等）
├── changelog.md                # 更新日志
└── README.md
```

## 🛠 本地开发

这是个纯静态项目，任何静态服务器都能跑：

```bash
# 方式一：Python
python -m http.server 9090

# 方式二：Node
npx serve .
```

然后打开 http://localhost:9090/ 即可。

> 注意：不要用 `file://` 直接打开，Service Worker 与模块加载都需要 http 环境。

## 📦 如何使用

### 在线预览

https://zoo-js.github.io/3dcube/?red=cat&white=dog&blue=pig&green=sheep&orange=koala&yellow=ant&bg=*ffd8bf

### 项目引入

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

更多关于 `iframe` 查看：https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/iframe

### 支持参数

```js
red     // 红色面
white   // 白色面
blue    // 蓝色面
green   // 绿色面
orange  // 橙色面
yellow  // 黄色面
bg      // 背景色
/*
  背景色支持直接英文，如 red、blue。
  也支持十六进制色值，如 #ffccc7 #ffd8bf #f4ffb8，注意将 `#` 替换为 `*` 使用。
*/
```

## 🏗 技术实现要点

这些是改造过程中踩到的比较有意思的坑，记录下来方便后来者：

### 移动端防下拉刷新

手机上「往下滑 = 刷新重开」是这类游戏最要命的问题。这里用了 CSS + JS 双保险：

- CSS：`overscroll-behavior: none`、`touch-action: none`、`position: fixed`、`overflow: hidden`
- JS：全局 `touchmove` 的 `preventDefault()`（`{ passive: false }`），以及双击防缩放
- 提示面板内部需要滚动，所以在全局拦截时放行 `#hintpanel` 内部的手势

### Service Worker 缓存策略

- `install` 时用 `Promise.allSettled` 逐个预缓存核心资源，单个失败不阻塞安装
- `fetch`：同源用 **stale-while-revalidate**（有缓存先回缓存，后台更新），跨域用 **network-first**
- `activate` 时清理旧版本缓存，配合 `skipWaiting()` + `clients.claim()` 让新版本尽快生效
- 改了任何静态文件都要**手动升级 `CACHE_NAME`**（当前 v4），否则老用户会一直用旧缓存

### 读魔方状态：重放转动历史

为了给求解器提供当前状态，一开始想直接读 `cubelet.matrix` / `addressX/Y/Z` / `face.color`，**实测发现这些在扭转之后全都不可靠**（贴纸位置和颜色对不上，甚至同一个块的「颜色」都会变）。

最终方案是**重放转动历史**：把 `cube.twistQueue.history` 里的每一次转动（`twist.command`，单字母，大写 = 顺时针、小写 = 逆时针，`x/y/z` 整体旋转需忽略）依次作用到复原态上，就得到当前状态。`resetCube` 与通关时恰好都会清空历史，而那两个时刻方块正是复原态，所以不会失真。

### ERNO 引擎的几个坑

- **不要用 `cube.shuffle()`**：它会把转动标记 `isShuffle` 并从 history 中 purge 掉，导致之后无法撤销。自己生成随机序列再 `twist()` 即可
- **`undo()` 会把被撤销的原始转动 unshift 回 `twistQueue.future`**：撤销结束后必须 `twistQueue.empty()` 再解除 `undoing`，否则残留转动会被当成新转动重放一遍 —— 表现就是「点了还原之后方块自己乱动」
- **ERNO 不认撇号语法**：`twist("R'")` 里的撇号会被忽略、当成 `R`。逆时针必须写小写 `r`
- **`twist()` 不要一次喂超长指令串**：超过百步时结果会错，分小块提交并等 `twistQueue.future.length === 0 && isTweening() === 0`
- **拆 UI 步骤必须保证每一步都达成某个目标**：把一条完整解法拆成多个「下一步」时，如果某个步骤只做了一半（比如顶层公式自带 U 对齐，只执行第一个会把刚摆好的块转歪），「执行一步 → 重新分析」就会来回震荡，永远解不完

## 🗒 更新日志

见 [changelog.md](./changelog.md)。

## 🎗 Tip

- 魔方源码来源于互联网
- 仅限娱乐分享
