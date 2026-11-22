# zoo-3dcube

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A cute 3D Rubik's cube game — installable PWA with solver hints and a guided tutorial.**

English · [中文](README.zh-CN.md)

> The repository is named `3dcode`; the application itself is called
> **zoo-3dcube**. It is a modified version of
> [zoo-js/3dcube](https://github.com/zoo-js/3dcube) (MIT, © 2020 zoo-js).
> This repository adds the layer-by-layer solver, the hint/tutorial panel and
> the mobile/PWA fixes described below.

You can twist the cube by dragging, play on a phone, ask for the next move with
an explanation of *why*, or turn on tutorial mode and let the hint panel follow
every move. The app is a static site with a Service Worker; it can be installed
to a home screen and works offline after the first visit.

## Features

- **3D cube** — drag with mouse or touch; keyboard support with `R` `L` `U` `D`
  `F` `B` and lowercase letters for counter-clockwise turns.
- **Scramble / reset** — one-click 22-move scramble, one-click return to solved.
- **Timer and move count** — starts on your first twist and stops when solved
  (`MM:SS.d`).
- **Result card** — shows time and moves; play again without refreshing.
- **Think** — recommends the next move and explains why it is needed.
- **Tutorial** — keeps the hint panel open and refreshes the recommendation
  after every move.
- **PWA** — installable, with offline caching through a Service Worker.
- **Custom stickers** — face images come from
  [zoo-js/zoo](https://github.com/zoo-js/zoo) and can be changed with URL
  parameters.
- **Mobile friendly** — pull-to-refresh prevention, viewport fitting and safe
  areas.

## Requirements

- A modern browser with WebGL and Service Worker support.
- Python 3 or Node.js for a local static server (any static server works).
- No build step and no package installation.

## Run locally

```bash
# Python
python3 -m http.server 9090

# or Node.js
npx serve .
```

Open <http://localhost:9090/>.

Do not open `index.html` through `file://`: the Service Worker and module
loading require an HTTP origin.

## How to play

The control bar at the bottom contains:

| Control | Description |
| --- | --- |
| Timer | Starts on your first twist, stops when solved (`MM:SS.d`). |
| Moves | Moves used in this round. |
| **Scramble** | Random 22-move scramble, then starts a new round. |
| **Reset** | Returns the cube to the solved state. |
| **Think** | Opens the hint panel with the next move and its explanation. |
| **Tutorial** | Keeps the panel open and refreshes it after every move. |

### Think and tutorial

The hint panel:

- names the current stage (bottom cross, bottom corners, middle edges, top
  cross, top face, corner permutation, edge permutation);
- gives the exact moves for the step (for example `R U R' U'`) and a one-sentence
  explanation;
- shows overall progress; **Next** previews later steps and warns that earlier
  steps must be completed first;
- **Demo this step** performs the step on the cube.

After a scramble you can twist freely: solve it yourself, ask for hints, or
reset. When solved, a result card shows the time and move count; **Play again**
starts a new round without a page refresh.

Keyboard: `Enter` scrambles or starts the next round; `Esc` closes the result
card.

## Solver

`assets/scripts/cube-solver.js` is a zero-dependency 3×3 state engine and
layer-by-layer (LBL) solver wrapped in UMD, so it runs in both the browser and
Node.

Stages:

```text
bottom cross → bottom corners → middle edges → top cross → top face
→ corner permutation → edge permutation
```

API:

```js
// State string: 54 characters in U/R/F/D/L/B face order.
const SOLVED = CubeSolver.SOLVED;

CubeSolver.stateFromString(SOLVED);        // string -> 54-element array
CubeSolver.stringFromState(arr);           // array -> string
CubeSolver.applyMove(state, 'R');          // one move ('R', "R'", 'R2')
CubeSolver.applySeq(state, "R U R' U'");   // a sequence
CubeSolver.isSolved(state);

const plan = CubeSolver.solve(stateString);
// [{ moves: [...], title: "...", why: "..." }, ...]
```

Implementation notes:

- 54-sticker permutation tables are generated from coordinate rotation; the 18
  moves (including inverse and 180°) are not hand-written.
- `CORNERS` / `EDGES` tables locate each piece and its stickers.
- Bounded IDA* is used for the cross, corners and middle edges (no consecutive
  same-face turns; fixed order for opposite faces).
- Last-layer macros ("U alignment + algorithm") are searched with BFS, deduped
  by state string.
- Adjacent same-face moves are normalised (`U U` → `U2`, `U U'` → removed).

Performance: 100 random 20-move scrambles solved 100/100, averaging about 0.3 s
and 120 moves per solve on the development machine.

## Embedding and URL parameters

The upstream demo is at
<https://zoo-js.github.io/3dcube/?red=cat&white=dog&blue=pig&green=sheep&orange=koala&yellow=ant&bg=*ffd8bf>.
It is the upstream build and **does not include this repository's solver and
hint changes**. This repository does not currently publish its own hosted demo.

Embed it with an iframe:

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

Supported parameters:

```js
red     // red face sticker
white   // white face sticker
blue    // blue face sticker
green   // green face sticker
orange  // orange face sticker
yellow  // yellow face sticker
bg      // background colour
```

Colours accept English names (`red`, `blue`) or hex values with `#` replaced by
`*` (`*ffccc7`, `*ffd8bf`, `*f4ffb8`).

## Project layout

```text
index.html                 page entry point
sw.js                      Service Worker (precache + stale-while-revalidate)
manifest.json              PWA manifest
cube.png                   icon and preview image
assets/
  styles/
    cube.css               cube styling
    doodle2.css            original Google Doodle style
    certificate2.css       sticker CSS variables
    game.css               control bar, hint panel, result card
  scripts/
    three.js               three.js
    cuber.min.js           ERNO cube engine
    main3.js               initialisation, interaction, camera, win detection
    cube-solver.js         zero-dependency LBL solver
    game.js                game layer: scramble, reset, timer, hints
    ...                    other upstream scripts
changelog.md               release history
```

## Implementation notes

- **Pull-to-refresh prevention** — `overscroll-behavior: none`, `touch-action:
  none`, fixed positioning and a non-passive `touchmove` handler; the hint panel
  is allowed to scroll.
- **Service Worker** — same-origin requests use stale-while-revalidate,
  cross-origin requests use network-first, and old caches are removed on
  activation. `CACHE_NAME` must be bumped manually when static files change.
- **Reading the cube state** — the ERNO engine's internal matrices are not
  reliable after twists, so the app replays `twistQueue.history` from the solved
  state. Reset and win both clear the history at a solved state.
- **ERNO pitfalls** — `cube.shuffle()` purges history and breaks undo; `undo()`
  re-queues the undone move, so the queues must be emptied before clearing the
  undo flag; the engine ignores apostrophes (`R'` is treated as `R`), so
  counter-clockwise turns use lowercase letters; very long twist strings must be
  split into chunks.

## Limitations

- No automated tests or CI workflow.
- No build system; files are served as-is.
- The upstream hosted demo does not include the solver/hint additions.
- The Service Worker cache version is manual and must be updated with every
  static asset change.
- The cube renderer and sticker assets come from the upstream project.

## Changelog

See [changelog.md](changelog.md).

## Credits and license

- Original game: [zoo-js/3dcube](https://github.com/zoo-js/3dcube), MIT,
  © 2020 zoo-js.
- Sticker art: [zoo-js/zoo](https://github.com/zoo-js/zoo).
- Solver, hint panel, tutorial mode and mobile/PWA fixes: this repository.

Released under the [MIT License](LICENSE).
