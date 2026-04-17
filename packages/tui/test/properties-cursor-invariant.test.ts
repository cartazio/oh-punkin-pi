/**
 * Property test: cursor invariant.
 *
 * After any sequence of ops (setLines / setCursor / showOverlay / hideOverlay /
 * nop), the live harness terminal's hardware cursor + viewport must match what
 * a fresh render of the same final state produces.
 *
 * Locks in commit 587428b87 (absolute CUP): cursor position after interleaved
 * overlay + content mutations must match a fresh full render — relative-move
 * drift would shift cursor.y on a subset of the generated op sequences.
 *
 * Manual revert check (DO NOT automate): swap TUI's #hardwareCursorEscape back
 * to relative moves and this suite is expected to fail on at least one seed
 * in [1, 20] — the interleaved showOverlay / hideOverlay / setLines ops
 * accumulate drift that a fresh full render does not have.
 */
import { describe, expect, it } from "bun:test";
import { freshRender, Harness, MarkerFocusableComponent, mulberry32, pickInt } from "./properties/harness";

// ────────────────────────────────────────────────────────────────────────────
// Op types
// ────────────────────────────────────────────────────────────────────────────

type Op =
	| { kind: "setLines"; lines: string[] }
	| { kind: "setCursor"; row: number; col: number }
	| { kind: "showOverlay"; lines: string[]; row: number; col: number }
	| { kind: "hideOverlay" }
	| { kind: "nop" };

// ────────────────────────────────────────────────────────────────────────────
// Random generators
// ────────────────────────────────────────────────────────────────────────────

const ASCII = "abcdefghijklmno ";

function randString(rng: () => number, maxLen: number): string {
	const n = pickInt(rng, 0, maxLen);
	let s = "";
	for (let i = 0; i < n; i++) s += ASCII[pickInt(rng, 0, ASCII.length - 1)];
	return s;
}

function randLines(rng: () => number, minLines: number, maxLines: number, maxLen: number): string[] {
	const n = pickInt(rng, minLines, maxLines);
	return Array.from({ length: n }, () => randString(rng, maxLen));
}

function genOp(rng: () => number, cols: number, rows: number): Op {
	const r = pickInt(rng, 0, 99);
	if (r < 25) return { kind: "setLines", lines: randLines(rng, 1, 5, Math.min(cols - 2, 8)) };
	if (r < 45) return { kind: "setCursor", row: pickInt(rng, 0, 5), col: pickInt(rng, 0, 8) };
	if (r < 75)
		return {
			kind: "showOverlay",
			lines: randLines(rng, 1, 3, Math.min(cols - 4, 6)),
			row: pickInt(rng, 0, Math.max(0, rows - 3)),
			col: pickInt(rng, 0, Math.max(0, cols - 6)),
		};
	if (r < 92) return { kind: "hideOverlay" };
	return { kind: "nop" };
}

function genSequence(rng: () => number, cols: number, rows: number): Op[] {
	const count = pickInt(rng, 8, 16);
	return Array.from({ length: count }, () => genOp(rng, cols, rows));
}

// ────────────────────────────────────────────────────────────────────────────
// Final-state tracking (applied to oracle mount)
// ────────────────────────────────────────────────────────────────────────────

interface OverlayState {
	lines: string[];
	row: number;
	col: number;
}

interface FinalState {
	baseLines: string[];
	baseCursor: { row: number; col: number };
	overlays: OverlayState[];
}

function clampCursor(lines: string[], cursor: { row: number; col: number }): { row: number; col: number } {
	const row = Math.max(0, Math.min(cursor.row, Math.max(0, lines.length - 1)));
	const line = lines[row] ?? "";
	const col = Math.max(0, Math.min(cursor.col, line.length));
	return { row, col };
}

// ────────────────────────────────────────────────────────────────────────────
// Main property
// ────────────────────────────────────────────────────────────────────────────

describe("cursor invariant: live harness converges with fresh render", () => {
	it("snapshot matches fresh render for random op sequences", async () => {
		const SEEDS = 20;
		for (let seed = 1; seed <= SEEDS; seed++) {
			const rng = mulberry32(seed);
			const cols = pickInt(rng, 20, 60);
			const rows = pickInt(rng, 6, 12);
			const ops = genSequence(rng, cols, rows);

			const baseLines0 = ["hello"];
			const baseCursor0 = { row: 0, col: 0 };

			const h = new Harness(cols, rows, true);
			const base = new MarkerFocusableComponent(baseLines0, baseCursor0.row, baseCursor0.col);
			h.tui.addChild(base);
			h.tui.setFocus(base);
			h.start();
			await h.settle();

			const state: FinalState = {
				baseLines: [...baseLines0],
				baseCursor: { ...baseCursor0 },
				overlays: [],
			};

			try {
				for (const op of ops) {
					switch (op.kind) {
						case "setLines": {
							base.setLines(op.lines);
							state.baseLines = [...op.lines];
							state.baseCursor = clampCursor(state.baseLines, state.baseCursor);
							h.tui.requestRender();
							break;
						}
						case "setCursor": {
							base.setCursor(op.row, op.col);
							state.baseCursor = clampCursor(state.baseLines, { row: op.row, col: op.col });
							h.tui.requestRender();
							break;
						}
						case "showOverlay": {
							const oc = new MarkerFocusableComponent(op.lines, 0, 0);
							h.tui.showOverlay(oc, { row: op.row, col: op.col, anchor: "top-left" });
							state.overlays.push({ lines: [...op.lines], row: op.row, col: op.col });
							break;
						}
						case "hideOverlay": {
							// TUI.hideOverlay is a no-op when the stack is empty — mirror that in our tracking.
							h.tui.hideOverlay();
							if (state.overlays.length > 0) state.overlays.pop();
							break;
						}
						case "nop":
							break;
					}
					await h.settle();
				}

				const liveSnap = h.snapshot();
				h.stop();

				const freshSnap = await freshRender(cols, rows, fh => {
					const fbase = new MarkerFocusableComponent(state.baseLines, state.baseCursor.row, state.baseCursor.col);
					fh.tui.addChild(fbase);
					fh.tui.setFocus(fbase);
					for (const ov of state.overlays) {
						const oc = new MarkerFocusableComponent(ov.lines, 0, 0);
						fh.tui.showOverlay(oc, { row: ov.row, col: ov.col, anchor: "top-left" });
					}
				});

				try {
					expect(liveSnap.cursor).toEqual(freshSnap.cursor);
					expect(liveSnap.viewport).toEqual(freshSnap.viewport);
				} catch (err) {
					// eslint-disable-next-line no-console
					console.error(
						"cursor-invariant failure:\n",
						JSON.stringify(
							{
								seed,
								cols,
								rows,
								ops,
								finalState: state,
								liveSnap,
								freshSnap,
							},
							null,
							2,
						),
					);
					throw err;
				}
			} finally {
				try {
					h.stop();
				} catch {
					// harness may already be stopped — ignore.
				}
			}
		}
	});
});
