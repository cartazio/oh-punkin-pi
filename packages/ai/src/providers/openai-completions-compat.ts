import type { Model, ModelCapabilities, ModelRoutingPolicy, OpenAIProtocolHints } from "../types";

type OpenAIReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export type ResolvedOpenAIModelSettings = Required<Omit<OpenAIProtocolHints, "extraBody">> & {
	extraBody?: OpenAIProtocolHints["extraBody"];
	toolChoice: boolean;
	strictToolSchemas: boolean;
	openrouter?: ModelRoutingPolicy["openrouter"];
	vercel?: ModelRoutingPolicy["vercel"];
};

function detectStrictModeSupport(provider: string, baseUrl: string): boolean {
	if (
		provider === "openai" ||
		provider === "cerebras" ||
		provider === "together" ||
		provider === "github-copilot" ||
		provider === "zenmux"
	) {
		return true;
	}

	const normalizedBaseUrl = baseUrl.toLowerCase();
	return (
		normalizedBaseUrl.includes("api.openai.com") ||
		normalizedBaseUrl.includes(".openai.azure.com") ||
		normalizedBaseUrl.includes("models.inference.ai.azure.com") ||
		normalizedBaseUrl.includes("api.cerebras.ai") ||
		normalizedBaseUrl.includes("api.together.xyz") ||
		normalizedBaseUrl.includes("api.deepseek.com") ||
		normalizedBaseUrl.includes("deepseek.com")
	);
}

/**
 * Detect compatibility settings from provider and baseUrl for known providers.
 * Provider takes precedence over URL-based detection since it's explicitly configured.
 * @param model - The model configuration
 * @param resolvedBaseUrl - Optional resolved base URL (e.g., after GitHub Copilot proxy-ep resolution).
 *                           If provided, this takes precedence over model.baseUrl for URL-based checks.
 */
export function detectOpenAIModelSettings(
	model: Model<"openai-completions">,
	resolvedBaseUrl?: string,
): ResolvedOpenAIModelSettings {
	const provider = model.provider;
	// Use resolvedBaseUrl if provided (e.g., after GitHub Copilot proxy-ep resolution)
	const baseUrl = resolvedBaseUrl ?? model.baseUrl;

	const isCerebras = provider === "cerebras" || baseUrl.includes("cerebras.ai");
	const isZai = provider === "zai" || baseUrl.includes("api.z.ai");
	const isKimiModel = model.id.includes("moonshotai/kimi");
	const isAlibaba = provider === "alibaba-coding-plan" || baseUrl.includes("dashscope");
	const isQwen = model.id.toLowerCase().includes("qwen");

	const isNonStandard =
		isCerebras ||
		provider === "xai" ||
		baseUrl.includes("api.x.ai") ||
		provider === "mistral" ||
		baseUrl.includes("mistral.ai") ||
		baseUrl.includes("chutes.ai") ||
		baseUrl.includes("deepseek.com") ||
		isAlibaba ||
		isZai ||
		isQwen ||
		provider === "opencode-zen" ||
		provider === "opencode-go" ||
		baseUrl.includes("opencode.ai");

	const useMaxTokens = provider === "mistral" || baseUrl.includes("mistral.ai") || baseUrl.includes("chutes.ai");
	const isGrok = provider === "xai" || baseUrl.includes("api.x.ai");
	const isMistral = provider === "mistral" || baseUrl.includes("mistral.ai");

	const reasoningEffortMap: NonNullable<OpenAIProtocolHints["reasoningEffortMap"]> =
		provider === "groq" && model.id === "qwen/qwen3-32b"
			? ({
					minimal: "default",
					low: "default",
					medium: "default",
					high: "default",
					xhigh: "default",
				} satisfies Partial<Record<OpenAIReasoningEffort, string>>)
			: {};

	return {
		supportsStore: !isNonStandard,
		supportsDeveloperRole: !isNonStandard,
		supportsReasoningEffort: !isGrok && !isZai,
		reasoningEffortMap,
		supportsUsageInStreaming: !isCerebras,
		toolChoice: true,
		maxTokensField: useMaxTokens ? "max_tokens" : "max_completion_tokens",
		requiresToolResultName: isMistral,
		requiresAssistantAfterToolResult: false,
		requiresThinkingAsText: isMistral,
		requiresMistralToolIds: isMistral,
		thinkingFormat: isZai
			? "zai"
			: provider === "openrouter" || baseUrl.includes("openrouter.ai")
				? "openrouter"
				: isAlibaba || isQwen
					? "qwen"
					: "openai",
		reasoningContentField: "reasoning_content",
		requiresReasoningContentForToolCalls: isKimiModel,
		requiresAssistantContentForToolCalls: isKimiModel,
		openrouter: undefined,
		vercel: undefined,
		strictToolSchemas: detectStrictModeSupport(provider, baseUrl),
		extraBody: undefined,
	};
}

/**
 * Resolve OpenAI-compatible model settings by layering explicit model mixins onto
 * the detected defaults. This is the canonical view for both metadata and transport.
 * @param model - The model configuration
 * @param resolvedBaseUrl - Optional resolved base URL (e.g., after GitHub Copilot proxy-ep resolution).
 *                           If provided, this takes precedence over model.baseUrl for URL-based checks.
 */
export function resolveOpenAIModelSettings(
	model: Model<"openai-completions">,
	resolvedBaseUrl?: string,
): ResolvedOpenAIModelSettings {
	const detected = detectOpenAIModelSettings(model, resolvedBaseUrl);
	const protocol = model.protocol?.openai;
	const capabilities: ModelCapabilities | undefined = model.capabilities;
	const routing: ModelRoutingPolicy | undefined = model.routing;
	if (!protocol && !capabilities && !routing) {
		return detected;
	}

	return {
		supportsStore: protocol?.supportsStore ?? detected.supportsStore,
		supportsDeveloperRole: protocol?.supportsDeveloperRole ?? detected.supportsDeveloperRole,
		supportsReasoningEffort: protocol?.supportsReasoningEffort ?? detected.supportsReasoningEffort,
		reasoningEffortMap: protocol?.reasoningEffortMap ?? detected.reasoningEffortMap,
		supportsUsageInStreaming: protocol?.supportsUsageInStreaming ?? detected.supportsUsageInStreaming,
		toolChoice: capabilities?.toolChoice ?? detected.toolChoice,
		maxTokensField: protocol?.maxTokensField ?? detected.maxTokensField,
		requiresToolResultName: protocol?.requiresToolResultName ?? detected.requiresToolResultName,
		requiresAssistantAfterToolResult:
			protocol?.requiresAssistantAfterToolResult ?? detected.requiresAssistantAfterToolResult,
		requiresThinkingAsText: protocol?.requiresThinkingAsText ?? detected.requiresThinkingAsText,
		requiresMistralToolIds: protocol?.requiresMistralToolIds ?? detected.requiresMistralToolIds,
		thinkingFormat: protocol?.thinkingFormat ?? detected.thinkingFormat,
		reasoningContentField: protocol?.reasoningContentField ?? detected.reasoningContentField,
		requiresReasoningContentForToolCalls:
			protocol?.requiresReasoningContentForToolCalls ?? detected.requiresReasoningContentForToolCalls,
		requiresAssistantContentForToolCalls:
			protocol?.requiresAssistantContentForToolCalls ?? detected.requiresAssistantContentForToolCalls,
		openrouter: routing?.openrouter ?? detected.openrouter,
		vercel: routing?.vercel ?? detected.vercel,
		strictToolSchemas: capabilities?.strictToolSchemas ?? detected.strictToolSchemas,
		extraBody: protocol?.extraBody,
	};
}
