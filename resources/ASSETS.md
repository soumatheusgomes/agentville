# Office assets

## Baseline (shipped)

| Asset                   | Source                                                                                                                                | Licence |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `office/tiles.png`      | Kenney _Roguelike Indoors_ (floor, rug, desk, chair, table, plant, sofa, shelf, printer) — https://kenney.nl/assets/roguelike-indoors | CC0 1.0 |
| `office/tiles.png`      | Kenney _RPG Urban Pack_ (wall tile only) — https://kenney.nl/assets/rpg-urban-pack                                                    | CC0 1.0 |
| `office/characters.png` | Kenney _RPG Urban Pack_ — https://kenney.nl/assets/rpg-urban-pack                                                                     | CC0 1.0 |

Full licence text: `resources/office/LICENSE-ASSETS.txt`

## Sprite sheet layout

- `tiles.png` — 16×16 tiles, 10 columns, 1 row. Left to right: floor, wall, rug, desk,
  chair, table, plant, sofa, shelf, printer.
- `characters.png` — 16×24 frames, 4 directions × 4 walk frames per character set,
  character sets stacked vertically (6 sets, 64×576 total). Within each set: row 0 = down,
  row 1 = left, row 2 = right, row 3 = up; each row's 4 columns are a walk cycle. The
  source pack only ships 3 native walk poses per direction, so column 4 repeats column 2
  (contact–passing–contact–passing) to complete a smooth 4-frame loop — no invented art,
  one real frame reused.

## Premium override (local only, NOT in this repository)

Dropping a licensed commercial pack into `resources/office-premium/`, using the same
filenames and layout as above, makes the build use it instead of the baseline. The
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
