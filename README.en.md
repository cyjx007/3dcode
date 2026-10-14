# zoo-3dcube

[简体中文](./README.md) | English

Cute pet 3D cube game — **PWA · installable · with solver hints & guided tutorial**

> Since the cute pet picture address is stored in GitHub, and the project is deployed on GitHub Pages, please ensure that the current network environment is smooth!

## 🔥 Preview
![](./cube.png)

## ✨ Features

- 🧊 **3D cube**: drag with mouse / touch, plus keyboard (`R` `L` `U` `D` `F` `B` and lowercase for inverse)
- 🎲 **Scramble / Reset**: one-click random 22-move scramble, one-click back to solved
- ⏱ **Timer + move count**: starts on your first twist, stops when solved (`MM:SS.d`)
- 🎉 **Win dialog**: shows time & moves, continue to the next round **without a page refresh**
- 💡 **Think**: recommends the next move at any time, **and explains why**
- 🎓 **Tutorial**: keeps the hint panel open and refreshes the recommendation after every move
- 📱 **PWA**: installable to the home screen, offline via Service Worker
- 🐱 **Cute pet stickers** by [zoo-js/zoo](https://github.com/zoo-js/zoo), customizable via URL params
- 📲 **Mobile friendly**: pull-to-refresh prevention, viewport auto-fit, safe-area support

## 🎮 How to play

A control bar sits at the bottom of the page:

| Control | Description |
| --- | --- |
| Timer | Starts on your first twist, stops when solved (`MM:SS.d`) |
| Moves | Number of moves in this round |
| **Scramble** | Random 22-move scramble, then starts a new round |
| **Reset** | Bring the cube back to solved state |
| **Think** | Opens the hint panel: what to do next and why |
| **Tutorial** | Keeps the panel open and auto-refreshes the recommendation after each move |

### 💡 Think / Tutorial

Tap "Think" to open the hint panel. It will:

- Tell you **which stage you are on** (bottom cross / bottom corners / middle edges / top cross / top face / corner permutation / edge permutation)
- Give you **the exact moves** for this step (e.g. `R U R′ U′`) plus a one-sentence **explanation of why**
- Show a progress bar of the whole plan; tap "Next ›" to **preview** later steps (it clearly warns that earlier steps must be done first, and disables the demo button to avoid demonstrating under a wrong prior state)
- Tap "Demo this step" to perform the step on the cube, then it moves on to the next one

After scrambling you can twist freely: solve it yourself, ask for hints, or just reset. Turn on "Tutorial" and the panel follows every move you make.

When solved, a result card pops up with your time and move count — tap "Play again" to keep going **without refreshing**.

Keyboard: `Enter` to scramble / play again, `Esc` to close the result card.

## 🧠 Solver

`assets/scripts/cube-solver.js` is a **zero-dependency, pure-logic** 3x3 state engine + layer-by-layer (LBL) solver, wrapped in UMD so it works in both the browser and Node.

**Stages** (seven steps, each with a human-readable explanation):

```
bottom cross → bottom corners → middle edges → top cross → top face → corner perm → edge perm
```

**API:**

```js
// State string: 54 chars in U/R/F/D/L/B face order, e.g. 'UUUUUUUUURRRRRRRRR...'
const SOLVED = CubeSolver.SOLVED;

CubeSolver.stateFromString(SOLVED);        // string -> array of 54
CubeSolver.stringFromState(arr);           // array -> string
CubeSolver.applyMove(state, 'R');          // apply one move ('R' / "R'" / 'R2')
CubeSolver.applySeq(state, "R U R' U'");   // apply a sequence
CubeSolver.isSolved(state);                // solved?

// Solve: returns [{ moves, title, why }, ...]
const plan = CubeSolver.solve(stateString);
```

**Engine notes:**

- 54-sticker permutation tables, generated from coordinate rotation — no hand-written move tables
- Corner / edge position tables for "where is this piece"
- Bounded IDA* for cross / corners / middle edges (no same-face repeats, fixed opposite-face order)
- Macro-move BFS for the last layer ("U-alignment + algorithm" bundled as one macro, deduped by state string, guaranteed to converge)
- Move normalization (`U U` → `U2`, `U U′` → removed)

**Performance**: 100 random 20-move scrambles — **100/100 solved**, ~0.3s / ~120 moves on average.

## 🛠 Local development

This is a fully static project — any static server works:

```bash
python -m http.server 9090
# or
npx serve .
```

Then open http://localhost:9090/.

> Don't open it via `file://` — the Service Worker needs an http environment.

## 📦 How to use

### Online preview

https://zoo-js.github.io/3dcube/?red=cat&white=dog&blue=pig&green=sheep&orange=koala&yellow=ant&bg=*ffd8bf

### Project introduction

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

More about `iframe` view：https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe

### Support

```js
red     // red face
white   // white face
blue    // blue face
green   // green face
orange  // orange face
yellow  // yellow face
bg      // background color
/*
  The background color supports direct English，like red or blue.
  Hex color values are also supported, such as #ffccc7 #ffd8bf #f4ffb8. Note `#` replaced with `*`.
*/
```

## 🗒 Changelog

See [changelog.md](./changelog.md).

## 🎗 Tip

- The Rubik's Cube source code comes from the Internet
- Entertainment sharing only
