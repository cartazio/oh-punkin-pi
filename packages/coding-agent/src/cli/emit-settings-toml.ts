import { writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { APP_NAME } from "@oh-my-pi/pi-utils";
import { getUi, type SettingPath, settings } from "../config/settings";
import { SETTINGS_SCHEMA } from "../config/settings-schema";

// ─────────────────────────────────────────────────────────────────────────────
// Lex-sort + run-group emitter.
//
// Algorithm:
//   1. Collect every (path, value) from SETTINGS_SCHEMA, sort lexicographically.
//   2. Run-group adjacent paths sharing the same first dot-segment.
//   3. Group of size >=2  -> emit `[prefix]` section header (blank line above).
//                            Each child emits its bare relative tail.
//      Group of size 1    -> emit the fully-qualified flat key (no header).
//   4. Arrays-of-objects always emit inline (`= [ {…}, {…} ]`).
//      Records always emit as inline tables (`= { … }`).
//      No `[[x]]` headers, no nested `[x.y]` sub-headers; absorption-by-scope
//      is structurally impossible.
//
// Live ~/.agent/ohp-settings.toml is NEVER written here. Emit only produces the
// dated reference template at ~/.agent/ohp-settings-template-YYYY-MM-DD.toml.
// User-level live config is sovereign; seed it once via `config init-xdg` then
// hand-edit. The legacy `outputActive` field on EmitTomlOptions is preserved
// for caller compat but ignored.
// ─────────────────────────────────────────────────────────────────────────────

export type EmitLayout = "grouped" | "flat";

export interface EmitTomlOptions {
	layout: EmitLayout;
	includeComments: boolean;
	templateDate: string;
	outputTemplate: string;
	/** @deprecated Live ohp-settings.toml is user-sovereign. This field is ignored. */
	outputActive: string;
}

interface SettingMeta {
	path: string;
	description: string;
	value: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOML value formatting
// ─────────────────────────────────────────────────────────────────────────────

function tomlEscape(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function formatScalar(value: unknown): string {
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : '""';
	if (typeof value === "string") return `"${tomlEscape(value)}"`;
	if (Array.isArray(value)) return `[${value.map(item => formatScalar(item)).join(", ")}]`;
	if (value === null || value === undefined) return '""';
	throw new Error(`Unsupported scalar type: ${typeof value}`);
}

function isBareKeySafe(k: string): boolean {
	return /^[A-Za-z0-9_-]+$/.test(k);
}

function formatInlineRecord(record: Record<string, unknown>): string {
	const keys = Object.keys(record).sort();
	if (keys.length === 0) return "{}";
	const parts = keys.map(k => `${isBareKeySafe(k) ? k : `"${tomlEscape(k)}"`} = ${formatValue(record[k])}`);
	return `{ ${parts.join(", ")} }`;
}

function formatInlineAoT(value: Array<Record<string, unknown>>): string {
	if (value.length === 0) return "[]";
	if (value.length === 1) return `[${formatInlineRecord(value[0])}]`;
	// Multi-line inline AoT: one record per line, trailing comma on each entry.
	// Preserves the no-`[[…]]`-scope-leak guarantee while staying diff-readable.
	const inner = value.map(r => `\t${formatInlineRecord(r)},`).join("\n");
	return `[\n${inner}\n]`;
}

function formatValue(value: unknown): string {
	if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
		return formatInlineAoT(value as Array<Record<string, unknown>>);
	}
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		return formatInlineRecord(value as Record<string, unknown>);
	}
	return formatScalar(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Emit
// ─────────────────────────────────────────────────────────────────────────────

function collectSettings(): SettingMeta[] {
	return (Object.keys(SETTINGS_SCHEMA) as SettingPath[])
		.map(key => ({
			path: key,
			description: getUi(key)?.description ?? "",
			value: settings.get(key),
		}))
		.sort((a, b) => a.path.localeCompare(b.path));
}

function pushFileHeader(lines: string[], options: EmitTomlOptions): void {
	if (!options.includeComments) return;
	lines.push(`# ${APP_NAME.toUpperCase()} settings reference template`);
	lines.push("# Lex-sorted by full path. Prefixes with >=2 keys form a [section] block;");
	lines.push("# single-key prefixes emit as fully-qualified flat keys. No nested sections,");
	lines.push("# no [[array]] headers — absorption-by-scope is structurally impossible.");
	lines.push("");
}

export function renderSettingsToml(items: SettingMeta[], options: EmitTomlOptions): string {
	const lines: string[] = [];
	pushFileHeader(lines, options);

	let i = 0;
	while (i < items.length) {
		const prefix = items[i].path.split(".", 1)[0];
		let j = i;
		while (j < items.length && items[j].path.split(".", 1)[0] === prefix) j++;
		const run = items.slice(i, j);
		if (run.length >= 2) {
			// Section block
			lines.push(""); // blank line before header
			lines.push(`[${prefix}]`);
			for (const item of run) {
				if (options.includeComments && item.description) lines.push(`# ${item.description}`);
				const tail = item.path.slice(prefix.length + 1);
				// Tail may itself be dotted (e.g. `isolation.mode` under [task]); TOML
				// interprets bare-dotted keys within an open section scope as nested
				// table assignments, which is exactly what we want.
				lines.push(`${tail} = ${formatValue(item.value)}`);
			}
		} else {
			// Singleton — flat fully-qualified
			const item = run[0];
			if (options.includeComments && item.description) lines.push(`# ${item.description}`);
			lines.push(`"${item.path}" = ${formatValue(item.value)}`);
		}
		i = j;
	}

	return `${lines.join("\n").trimEnd()}\n`;
}

export async function emitSettingsToml(options: EmitTomlOptions): Promise<string> {
	const items = collectSettings();
	const content = renderSettingsToml(items, options);
	// Only write the dated reference template. The live file is user-sovereign.
	await writeFile(options.outputTemplate, content, "utf8");
	return content;
}

export function defaultEmitOptions(templateDate: string): EmitTomlOptions {
	const tplPath = path.join(os.homedir(), ".agent", `ohp-settings-template-${templateDate}.toml`);
	return {
		layout: "grouped",
		includeComments: true,
		templateDate,
		outputTemplate: tplPath,
		outputActive: tplPath, // legacy field; ignored by emitSettingsToml
	};
}
