/**
 * Carter Kit — behavioral layer for the coding agent.
 *
 * Provides:
 * - Ethos (operational philosophy)
 * - Boot sequence (session initialization)
 * - Context pressure warnings
 * - Handle tools documentation (if handles enabled)
 */

import { loadTemplate } from "./prompts/loader.js";

// ============================================================================
// Loaded prompt fragments
// ============================================================================

/**
 * Operational ethos — anti-zombie principles baked into base prompt.
 * Verify-Act-Verify, loop detection, xinmo awareness, data integrity.
 */
export const ETHOS_PROMPT = loadTemplate("ethos.md").trim();

/**
 * Boot sequence instructions. Tells the model to paraphrase AGENTS.md
 * and loaded skills on first turn before responding.
 */
export const BOOT_SEQUENCE_PROMPT = loadTemplate("boot-sequence.md").trim();

// TODO: Enable when handles are implemented
// /**
//  * Handle tools documentation. Teaches the model about handles
//  * and the push-down DSL for operating on stored content.
//  */
// export const HANDLE_TOOLS_PROMPT = loadTemplate("handle-tools.md").trim();

// ============================================================================
// Context pressure warnings
// ============================================================================

export type PressureLevel = "low" | "medium" | "high" | "critical";

/**
 * Get the pressure level based on context usage.
 */
export function pressureLevel(contextTokens: number, contextWindow: number): PressureLevel {
	const ratio = contextTokens / contextWindow;
	if (ratio >= 0.9) return "critical";
	if (ratio >= 0.75) return "high";
	if (ratio >= 0.5) return "medium";
	return "low";
}

/**
 * Get a context pressure warning to inject into the conversation.
 * Returns undefined if pressure is low (no warning needed).
 */
export function pressureWarning(contextTokens: number, contextWindow: number): string | undefined {
	const level = pressureLevel(contextTokens, contextWindow);

	switch (level) {
		case "low":
			return undefined;
		case "medium":
			return loadTemplate("pressure-medium.md").trim();
		case "high":
			return loadTemplate("pressure-high.md").trim();
		case "critical":
			return loadTemplate("pressure-critical.md").trim();
	}
}
