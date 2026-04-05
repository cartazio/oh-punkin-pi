/**
 * CarterKit Interceptor — tool call interception, handle lifecycle, CoT capture.
 *
 * Responsibilities:
 *   - Decide whether to serve a tool call from cache or execute it fresh
 *   - Capture tool results into the content-addressed store
 *   - Materialise or summarise results based on context pressure
 *   - Execute handle operations (lines, grep, slice, head, tail, count)
 *   - Capture chain-of-thought thinking blocks into the store
 *
 * Design: every decision is a pure data value (InterceptDecision, CaptureResult).
 * The caller drives execution; this module only classifies and records.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Store } from "./store.js";
import { cacheHandle, getBlobContent, hash, lookupCachedHandle, putBlob, putHandle } from "./store.js";
import type { ContentHash, Handle, HandleId, Idempotency } from "./types.js";
import { classifyBash, classifyTool, freshHandleId, handleCacheKey, Pending, Resolved } from "./types.js";

// ============================================================================
// Internal helpers
// ============================================================================

/** Tools whose primary argument is a filesystem path. */
const FILE_TOOLS = new Set(["read", "grep", "find", "ls"]);

/**
 * extractFilePath :: Text -> Value -> Maybe FilePath
 *
 * Returns the resolved, existing filesystem path from a tool call's args,
 * or undefined if the tool is not path-based or the path does not exist.
 * Expands leading ~ via homedir().
 */
function extractFilePath(toolName: string, args: unknown): string | undefined {
	if (!FILE_TOOLS.has(toolName)) return undefined;
	if (typeof args !== "object" || args === null) return undefined;

	const a = args as Record<string, unknown>;
	const rawPath = typeof a.path === "string" ? a.path : undefined;
	if (!rawPath) return undefined;

	const resolved = rawPath.startsWith("~") ? resolve(homedir(), rawPath.slice(2)) : resolve(rawPath);
	return existsSync(resolved) ? resolved : undefined;
}

/**
 * validateCachedContent :: FilePath -> Text -> Bool
 *
 * Re-reads the file and compares its hash to the hash of the cached content.
 * Returns false on any read error (treat missing/changed file as invalid).
 * Hashes both sides — never compares raw strings (avoids timing/normalisation issues).
 */
function validateCachedContent(filePath: string, cachedContent: string): boolean {
	try {
		const current = readFileSync(filePath, "utf-8");
		return hash(current) === hash(cachedContent);
	} catch {
		return false;
	}
}

/**
 * mkHandleSummary :: HandleId -> Text -> Int -> Text -> Text
 *
 * Formats a human-readable summary for a result too large to materialise.
 * Shows identity, size, a preview of the first 3 lines, and the last line
 * when the content has more than 4 lines. Closes with handle operation hints.
 */
function mkHandleSummary(handleId: HandleId, toolName: string, totalTokens: number, content: string): string {
	const lines = content.split("\n");
	const lineCount = lines.length;

	// First 3 lines as preview
	const preview = lines.slice(0, 3).join("\n");
	// Last line as tail
	const tail = lineCount > 4 ? lines[lineCount - 1] : "";

	return [
		`[Handle ${handleId}: ${toolName} result, ${totalTokens} tokens, ${lineCount} lines]`,
		`Preview:`,
		preview,
		lineCount > 4 ? `... (${lineCount - 4} more lines)` : "",
		tail ? `Last: ${tail}` : "",
		``,
		`Use handle_lines("${handleId}", start, end) to read specific lines.`,
		`Use handle_grep("${handleId}", "pattern") to search.`,
		`Use handle_slice("${handleId}", offset, length) to read a byte range.`,
	]
		.filter(Boolean)
		.join("\n");
}

// ============================================================================
// InterceptDecision — what the caller should do with a tool call
// ============================================================================

/**
 * data InterceptDecision
 *   = UseCached HandleId Text   -- serve from store, no execution needed
 *   | Execute   HandleId Idempotency  -- go ahead and run the tool
 */
export type InterceptDecision =
	| { readonly tag: "UseCached"; readonly handleId: HandleId; readonly resultText: string }
	| { readonly tag: "Execute"; readonly handleId: HandleId; readonly idempotency: Idempotency };

/**
 * decideIntercept :: Store -> Text -> Value -> InterceptDecision
 *
 * Core interception logic:
 *   1. Classify idempotency (bash is special-cased through classifyBash)
 *   2. For pure calls, check the dedup cache
 *   3. If cached and valid, return UseCached
 *   4. For file-backed results, re-validate; invalidate cache on mismatch
 *   5. Otherwise allocate a fresh Pending handle and return Execute
 *
 * The returned handle always has turnIndex = -1; the caller sets it on resolution.
 */
export function decideIntercept(store: Store, toolName: string, args: unknown): InterceptDecision {
	// Classify: bash gets command-level classification, all others tool-level
	const idempotency: Idempotency =
		toolName === "bash" && typeof args === "object" && args !== null && "command" in args
			? classifyBash((args as { command: string }).command)
			: classifyTool(toolName);

	// handleCacheKey returns undefined for non-pure calls — acts as guard
	const cacheKey = handleCacheKey(toolName, args);

	if (cacheKey !== undefined) {
		const existingId = lookupCachedHandle(store, cacheKey);
		if (existingId !== undefined) {
			const existing = store.pageTable.handles.get(existingId);
			if (existing !== undefined && existing.status.tag === "Resolved" && existing.resultHash !== undefined) {
				const cachedContent = getBlobContent(store, existing.resultHash);
				if (cachedContent !== undefined) {
					// For file-backed tools, re-validate content hash
					const filePath = extractFilePath(toolName, args);
					if (filePath !== undefined) {
						if (!validateCachedContent(filePath, cachedContent)) {
							// File changed — invalidate this cache entry
							store.handleCache.delete(cacheKey);
							// Fall through to create a fresh handle
						} else {
							return { tag: "UseCached", handleId: existingId, resultText: cachedContent };
						}
					} else {
						return { tag: "UseCached", handleId: existingId, resultText: cachedContent };
					}
				}
			}
		}
	}

	// Allocate a fresh Pending handle
	const handleId = freshHandleId();
	const handle: Handle = {
		id: handleId,
		sourceTool: toolName,
		sourceArgs: args,
		status: Pending,
		idempotency,
		resultHash: undefined,
		totalTokens: undefined,
		materializedTokens: 0,
		chunkId: undefined,
		turnIndex: -1, // caller fills this in on resolution
		createdAt: Date.now(),
	};
	putHandle(store, handle);

	// Register in dedup cache for future pure calls
	if (cacheKey !== undefined) {
		cacheHandle(store, cacheKey, handleId);
	}

	return { tag: "Execute", handleId, idempotency };
}

// ============================================================================
// CaptureResult — outcome of storing a tool result
// ============================================================================

/**
 * data CaptureResult
 *   = Materialized Text          -- full result is safe to inline in context
 *   | Summarized HandleId Text   -- result stored; summary replaces it
 */
export type CaptureResult =
	| { readonly tag: "Materialized"; readonly text: string }
	| { readonly tag: "Summarized"; readonly handleId: HandleId; readonly summary: string };

/**
 * captureResult :: Store -> HandleId -> Text -> PressureLevel -> Int -> CaptureResult
 *
 * Stores the result blob, transitions the handle to Resolved, then decides
 * whether to materialise the full text or return a summary token.
 *
 * Token estimate: Math.ceil(length / 4) — rough but consistent.
 *
 * putHandle is called twice when materialising:
 *   1. status → Resolved  (with resultHash + totalTokens)
 *   2. materializedTokens set  (records how many tokens entered context)
 */
export function captureResult(store: Store, handleId: HandleId, resultText: string, turnIndex: number): CaptureResult {
	const resultHash = putBlob(store, "ToolResult", resultText);
	const totalTokens = Math.ceil(resultText.length / 4);

	// Retrieve existing handle — may be undefined if caller is sloppy, but should exist
	const existing = store.pageTable.handles.get(handleId);

	// First putHandle: Resolved with result metadata
	if (existing) {
		const resolvedHandle: Handle = {
			...existing,
			status: Resolved(Date.now()),
			resultHash,
			totalTokens,
			turnIndex,
		};
		putHandle(store, resolvedHandle);
	}

	const budget = 1000; //materializationBudget(pressure);

	if (totalTokens <= budget) {
		// Small enough to inline
		if (existing) {
			putHandle(store, {
				...existing,
				status: Resolved(Date.now()),
				resultHash,
				totalTokens,
				materializedTokens: totalTokens,
				turnIndex,
			});
		}
		return { tag: "Materialized", text: resultText };
	}

	// Too big — return handle summary
	const summary = mkHandleSummary(handleId, existing?.sourceTool ?? "unknown", totalTokens, resultText);

	return { tag: "Summarized", handleId, summary };
}

// ============================================================================
// Chain-of-thought capture
// ============================================================================

/**
 * captureCoT :: Store -> [ContentBlock] -> Maybe Text -> Maybe ContentHash
 *
 * Extracts all thinking blocks from an assistant message's content array,
 * joins them with a separator, stores as a CoT blob, and returns the hash.
 * Returns undefined if the message contains no thinking blocks.
 *
 * messageContent mirrors the Anthropic API shape:
 *   { type: "thinking", thinking: "..." }
 */
export function captureCoT(
	store: Store,
	messageContent: ReadonlyArray<{ type: string; thinking?: string; text?: string }>,
	sessionId?: string,
): ContentHash | undefined {
	const blocks = messageContent
		.filter(b => b.type === "thinking" && typeof b.thinking === "string")
		.map(b => b.thinking as string);

	if (blocks.length === 0) return undefined;

	const joined = blocks.join("\n\n---\n\n");
	return putBlob(store, "CoT", joined, sessionId);
}

// ============================================================================
// HandleOp — operations against stored handle content
// ============================================================================

/**
 * data HandleOp
 *   = HLines  Int Int         -- line range, 1-indexed, inclusive
 *   | HGrep   Text            -- case-insensitive regex line filter
 *   | HSlice  Int Int         -- byte range [offset, offset+length)
 *   | HHead   Int             -- first N lines
 *   | HTail   Int             -- last N lines
 *   | HCount                  -- total line count
 *   | HCountMatches Text      -- total regex match count (gi), string fallback
 */
export type HandleOp =
	| { readonly tag: "HLines"; readonly start: number; readonly end: number }
	| { readonly tag: "HGrep"; readonly pattern: string }
	| { readonly tag: "HSlice"; readonly offset: number; readonly length: number }
	| { readonly tag: "HHead"; readonly n: number }
	| { readonly tag: "HTail"; readonly n: number }
	| { readonly tag: "HCount" }
	| { readonly tag: "HCountMatches"; readonly pattern: string };

/**
 * execHandleOp :: Store -> HandleId -> HandleOp -> Either Text Text
 *
 * Executes a handle operation against the stored result blob.
 * Returns {ok:false} for missing handle, unresolved handle, or missing blob.
 *
 * Line operations treat content as \n-split arrays.
 * HLines uses 1-indexed input; HSlice operates on raw UTF-16 code units
 * (String.slice semantics — consistent with JS string indexing).
 * HGrep and HCountMatches use case-insensitive regex with string fallback
 * on regex parse failure.
 */
export function execHandleOp(
	store: Store,
	handleId: HandleId,
	op: HandleOp,
): { ok: true; result: string } | { ok: false; error: string } {
	const handle = store.pageTable.handles.get(handleId);
	if (!handle) {
		return { ok: false, error: `Handle ${handleId} not found` };
	}
	if (!handle.resultHash) {
		return { ok: false, error: `Handle ${handleId} has no result (still pending?)` };
	}

	const content = getBlobContent(store, handle.resultHash);
	if (!content) {
		return { ok: false, error: `Blob ${handle.resultHash} not found in store` };
	}

	const lines = content.split("\n");

	switch (op.tag) {
		case "HLines": {
			// 1-indexed, inclusive on both ends
			const start = Math.max(0, op.start - 1);
			const end = Math.min(lines.length, op.end);
			return { ok: true, result: lines.slice(start, end).join("\n") };
		}

		case "HGrep": {
			try {
				const re = new RegExp(op.pattern, "i");
				const matches = lines.filter(l => re.test(l));
				if (matches.length === 0) return { ok: true, result: "(no matches)" };
				return { ok: true, result: matches.join("\n") };
			} catch {
				// Fall back to string match
				const matches = lines.filter(l => l.includes(op.pattern));
				if (matches.length === 0) return { ok: true, result: "(no matches)" };
				return { ok: true, result: matches.join("\n") };
			}
		}

		case "HSlice": {
			return { ok: true, result: content.slice(op.offset, op.offset + op.length) };
		}

		case "HHead": {
			return { ok: true, result: lines.slice(0, op.n).join("\n") };
		}

		case "HTail": {
			return { ok: true, result: lines.slice(-op.n).join("\n") };
		}

		case "HCount": {
			return { ok: true, result: String(lines.length) };
		}

		case "HCountMatches": {
			try {
				const re = new RegExp(op.pattern, "gi");
				const count = lines.filter(l => re.test(l)).length;
				return { ok: true, result: String(count) };
			} catch {
				const count = lines.filter(l => l.includes(op.pattern)).length;
				return { ok: true, result: String(count) };
			}
		}
	}
}
