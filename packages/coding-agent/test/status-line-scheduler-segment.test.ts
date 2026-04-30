import { beforeAll, describe, expect, it } from "bun:test";
import { renderSegment, type SegmentContext } from "@ohp/coding-agent/modes/components/status-line/segments";
import { getThemeByName, setThemeInstance } from "@ohp/coding-agent/modes/theme/theme";

beforeAll(async () => {
	const theme = await getThemeByName("dark");
	if (!theme) {
		throw new Error("Failed to load dark theme for tests");
	}
	setThemeInstance(theme);
});

function createContext(mode: ReturnType<SegmentContext["session"]["getSchedulerMode"]>): SegmentContext {
	return {
		session: {
			getSchedulerMode: () => mode,
		} as SegmentContext["session"],
		width: 120,
		options: {},
		planMode: null,
		usageStats: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			premiumRequests: 0,
			cost: 0,
			tokensPerSecond: null,
		},
		contextPercent: 0,
		contextWindow: 0,
		autoCompactEnabled: false,
		subagentCount: 0,
		sessionStartTime: Date.now(),
		git: {
			branch: null,
			status: null,
			pr: null,
		},
	};
}

describe("scheduler status-line segment", () => {
	it("renders eager mode as eager_beaver_mode", () => {
		const rendered = renderSegment("scheduler", createContext({ tag: "eager_beaver", source: "harness" }));

		expect(rendered.visible).toBe(true);
		expect(rendered.content).toContain("eager_beaver_mode");
		expect(rendered.content).not.toContain("Auto");
	});

	it("renders co-design mode as Collab with reason", () => {
		const rendered = renderSegment(
			"scheduler",
			createContext({ tag: "co_design", reason: "design_review", source: "user_toggled" }),
		);

		expect(rendered.visible).toBe(true);
		expect(rendered.content).toContain("Collab:design_review");
	});
});
