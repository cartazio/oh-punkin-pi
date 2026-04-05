/**
 * CarterKit — behavioral layer for the coding agent.
 *
 * This barrel re-exports the CarterKit runtime, data model, store,
 * interception logic, turn-boundary helpers, and session integration hook.
 */

export * from "./interceptor.js";
export * from "./prompts/loader.js";
export {
	BOOT_SEQUENCE_PROMPT,
	type CarterKitRuntime,
	COT_REPLAY_TOOL,
	ETHOS_PROMPT,
	enrichCompactionInput,
	HANDLE_TOOLS_PROMPT,
	initRuntime,
	interceptToolCall,
	interceptToolResult,
	onTurnEnd as onRuntimeTurnEnd,
	PUSHDOWN_TOOLS,
	type PushDownToolDef,
	pressureWarning,
	shutdownRuntime,
	type ToolCallIntercept,
} from "./runtime.js";
export * from "./session-hook.js";
export * from "./store.js";
export {
	initTurnBoundaryState,
	injectTurnBoundaries,
	onTurnEnd as onTurnBoundaryEnd,
	onTurnStart,
	renderTurnEnd,
	renderTurnStart,
	type TurnBoundaryState,
	type TurnEndMessage,
	type TurnStartMessage,
} from "./turn-boundary.js";
export * from "./types.js";
