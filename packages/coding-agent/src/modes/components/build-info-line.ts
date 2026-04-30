import type { Component } from "@ohp/tui";
import { BUILD_INFO as buildInfo, formatBuildTimestamp } from "../../build-info";
import { theme } from "../../modes/theme/theme";

export class BuildInfoLine implements Component {
	invalidate(): void {
		// Static content — nothing to invalidate
	}

	render(width: number): string[] {
		if (!buildInfo) return [];

		const parts: string[] = [buildInfo.projectName, buildInfo.gitHash];
		if (buildInfo.dirty) parts.push("dirty");

		parts.push(`Built ${formatBuildTimestamp(buildInfo.buildTimestamp)}`);

		const line = parts.join(" \u00b7 "); // middle dot
		return [theme.fg("dim", line.length > width ? `${line.slice(0, width - 1)}\u2026` : line)];
	}
}
