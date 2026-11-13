# Office assets

## Baseline (shipped)

| Asset                   | Source                                          | Licence |
| ----------------------- | ----------------------------------------------- | ------- |
| `office/tiles.png`      | Original — `scripts/generate-office-assets.mjs` | CC0 1.0 |
| `office/characters.png` | Original — `scripts/generate-office-assets.mjs` | CC0 1.0 |

The baseline art is drawn by code in this repository rather than vendored from a pack, so
the repository and the packaged `.vsix` carry no third-party asset licence. Regenerate it
with `node scripts/generate-office-assets.mjs`. Dedication: `resources/office/LICENSE-ASSETS.txt`, which ships in the `.vsix` as
`dist/office/LICENSE-ASSETS.txt`.

## Sprite sheet layout

Both tiers must match this exactly — no code branches on which tier is active.

- `tiles.png` — 16×16 tiles, 8 columns, 22 frames. Frame indices are defined by `FRAME`
  in `src/webview/simulation/tiles.ts`:

  | Frames | Contents                                         |
  | ------ | ------------------------------------------------ |
  | 0–2    | floor A, floor B, rug                            |
  | 3–5    | wall top, wall face (3/4 view), door mat         |
  | 6–9    | desk left / middle / right (with monitor), chair |
  | 10–12  | meeting table left / middle / right              |
  | 13     | plant                                            |
  | 14–16  | sofa left / middle / right                       |
  | 17–19  | coffee counter left / machine / right            |
  | 20–21  | bookshelf A, B                                   |

  Furniture frames are drawn over a floor frame, so their empty pixels must be transparent.

- `characters.png` — 16×24 frames, 16 columns × 8 rows. Each row is one character set:
  columns 0–3 walk down, 4–7 left, 8–11 right, 12–15 up; column 0 of each direction is the
  standing pose. Rows 0–3 are session characters, rows 4–7 subagent characters (cap and
  headset). Feet rest on the frame's bottom rows.

## Premium override (local only, NOT in this repository)

Dropping a licensed commercial pack into `resources/office-premium/`, using the same
filenames and layout as above, makes the build copy it over the baseline into `dist/office/`. The
directory is gitignored.

**Status: not cleared for release.** The candidate pack (LimeZu _Modern Interiors_)
permits "edit and use the asset in any commercial or non commercial project" and forbids
"resell or distribute the asset to others". A `.vsix` is a plain ZIP with extractable
PNGs, which sits between those two clauses.

Before any release ships a commercial pack:

1. Obtain written confirmation from the pack's author that bundling in a freely
   distributed VS Code extension is permitted.
2. Record that confirmation — date, channel, exact wording — in this file.
3. Add the required credit and link to `NOTICE` and `README.md`.

Until all three are done, releases ship the CC0 baseline.
