import { describe, expect, it } from "bun:test";
import { liftSyntheticDefault, normalizeDottedKeys } from "../../src/config/settings";

describe("normalizeDottedKeys", () => {
	it("inverts quoted-dotted top-level keys into nested objects", () => {
		const input = {
			"toolServices.webSearch": "brave",
			"toolServices.parallelFetch": true,
			"llmProviders.kimiApiFormat": "openai",
		};
		const result = normalizeDottedKeys(input as Record<string, unknown>) as Record<string, Record<string, unknown>>;
		expect(result.toolServices).toEqual({ webSearch: "brave", parallelFetch: true });
		expect(result.llmProviders).toEqual({ kimiApiFormat: "openai" });
	});

	it("passes through undotted scalar keys unchanged", () => {
		const input = { defaultThinkingLevel: "minimal", hideThinkingBlock: false };
		const result = normalizeDottedKeys(input as Record<string, unknown>);
		expect(result).toEqual(input);
	});

	it("preserves nested object values as-is under dotted keys", () => {
		const input = {
			"default.modelRoles": { default: "anthropic/claude-opus-4-7", task: "anthropic/claude-opus-4-7:medium" },
		};
		const result = normalizeDottedKeys(input as Record<string, unknown>) as {
			default: { modelRoles: Record<string, string> };
		};
		expect(result.default.modelRoles).toEqual({
			default: "anthropic/claude-opus-4-7",
			task: "anthropic/claude-opus-4-7:medium",
		});
	});

	it("merges multiple keys sharing a prefix without clobbering", () => {
		const input = {
			"toolServices.webSearch": "brave",
			"toolServices.image": "gemini",
		};
		const result = normalizeDottedKeys(input as Record<string, unknown>) as {
			toolServices: Record<string, string>;
		};
		expect(result.toolServices).toEqual({ webSearch: "brave", image: "gemini" });
	});
});

describe("liftSyntheticDefault", () => {
	it("promotes default.* bucket contents to root", () => {
		const input = {
			default: {
				modelRoles: { default: "anthropic/claude-opus-4-7" },
				defaultThinkingLevel: "minimal",
			},
			toolServices: { webSearch: "brave" },
		};
		const result = liftSyntheticDefault(input as Record<string, unknown>) as Record<string, unknown>;
		expect(result.modelRoles).toEqual({ default: "anthropic/claude-opus-4-7" });
		expect(result.defaultThinkingLevel).toBe("minimal");
		expect(result.toolServices).toEqual({ webSearch: "brave" });
		expect(result.default).toBeUndefined();
	});

	it("is a no-op when there is no default bucket", () => {
		const input = { toolServices: { webSearch: "brave" } };
		const result = liftSyntheticDefault(input as Record<string, unknown>);
		expect(result).toEqual(input);
	});

	it("deep-merges object collisions between root and default.* (hand-edit edge case)", () => {
		// The emitter only produces one or the other — this case arises only via hand-edit.
		const input = {
			modelRoles: { default: "anthropic/claude-opus-4-7" },
			default: { modelRoles: { task: "anthropic/claude-opus-4-7:medium" } },
		};
		const result = liftSyntheticDefault(input as Record<string, unknown>) as {
			modelRoles: Record<string, string>;
		};
		expect(result.modelRoles).toEqual({
			default: "anthropic/claude-opus-4-7",
			task: "anthropic/claude-opus-4-7:medium",
		});
	});

	it("ignores a non-object default value (e.g. user-set scalar) without throwing", () => {
		const input = { default: "some-scalar", toolServices: { webSearch: "brave" } };
		const result = liftSyntheticDefault(input as Record<string, unknown>);
		expect(result).toEqual(input);
	});
});
