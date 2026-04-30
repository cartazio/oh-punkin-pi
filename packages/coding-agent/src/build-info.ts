import { BUILD_INFO } from "./build-info.generated";

export function formatBuildTimestamp(timestamp: string): string {
	const date = new Date(timestamp);
	return date.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short",
	});
}

export function formatBuildProvenance(): string {
	const dirty = BUILD_INFO.dirty ? " dirty" : "";
	return `${BUILD_INFO.projectName} ${BUILD_INFO.gitHash}${dirty} · Built ${formatBuildTimestamp(BUILD_INFO.buildTimestamp)}`;
}

export { BUILD_INFO };
