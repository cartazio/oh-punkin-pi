import { describe, expect, it } from "bun:test";
import { getThemeByName } from "@ohp/coding-agent/modes/theme/theme";
import { taskToolRenderer } from "../../src/task/render";

describe("taskToolRenderer partial call safety", () => {
	it("renders a partial task call without tasks while arguments stream", async () => {
		const theme = await getThemeByName("dark");
		expect(theme).toBeDefined();
		const uiTheme = theme!;

		const rendered = taskToolRenderer.renderCall(
			{ agent: "codebase-minimap" },
			{ expanded: false, isPartial: true },
			uiTheme,
		);

		const output = rendered.render(120).join("\n");
		expect(output).toContain("codebase-minimap");
		expect(output).toContain("streaming");
	});

	it("renders malformed task call args without throwing", async () => {
		const theme = await getThemeByName("dark");
		expect(theme).toBeDefined();
		const uiTheme = theme!;

		const rendered = taskToolRenderer.renderCall(undefined, { expanded: false, isPartial: true }, uiTheme);

		expect(() => rendered.render(120)).not.toThrow();
		expect(rendered.render(120).join("\n")).toContain("streaming");
	});
});
