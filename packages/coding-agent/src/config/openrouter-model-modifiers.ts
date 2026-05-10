import type { Api, Model, OpenRouterRouting } from "@ohp/ai";

type OpenRouterModelModifierKind = "routing-shortcut" | "model-variant" | "server-feature";

type OpenRouterModelModifier = {
	suffix: string;
	visible: boolean;
	description: string;
	kind: OpenRouterModelModifierKind;
	providerSort?: OpenRouterRouting["sort"];
};

const OPENROUTER_MODEL_MODIFIERS: readonly OpenRouterModelModifier[] = [
	{
		suffix: "nitro",
		visible: true,
		description: "Prefer higher-throughput OpenRouter endpoints.",
		kind: "routing-shortcut",
		providerSort: "throughput",
	},
	{
		suffix: "floor",
		visible: true,
		description: "Prefer lower-price OpenRouter endpoints.",
		kind: "routing-shortcut",
		providerSort: "price",
	},
] as const;

function findOpenRouterModelModifier(suffix: string): OpenRouterModelModifier | undefined {
	return OPENROUTER_MODEL_MODIFIERS.find(modifier => modifier.suffix === suffix.toLowerCase());
}

export function findOpenRouterModelModifierMatch(
	provider: string,
	modelId: string,
	availableModels: readonly Model<Api>[],
): Model<Api> | undefined {
	if (provider.toLowerCase() !== "openrouter") return undefined;
	const colonIndex = modelId.lastIndexOf(":");
	if (colonIndex <= 0 || colonIndex === modelId.length - 1) return undefined;

	const baseId = modelId.slice(0, colonIndex);
	const modifier = findOpenRouterModelModifier(modelId.slice(colonIndex + 1));
	if (!modifier?.visible) return undefined;

	const baseModel = availableModels.find(
		model => model.provider.toLowerCase() === "openrouter" && model.id.toLowerCase() === baseId.toLowerCase(),
	);
	return baseModel ? withOpenRouterModelModifier(baseModel, modelId, modifier) : undefined;
}

function withOpenRouterModelModifier(
	model: Model<Api>,
	requestedId: string,
	modifier: OpenRouterModelModifier,
): Model<Api> {
	return {
		...model,
		id: requestedId,
		name: `${model.name} (:${modifier.suffix})`,
		routing: {
			...model.routing,
			openrouter: {
				...model.routing?.openrouter,
				...(modifier.providerSort ? { sort: modifier.providerSort } : {}),
			},
		},
	};
}
