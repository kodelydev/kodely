import { Anthropic } from "@anthropic-ai/sdk"
import { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"
import { CacheControlEphemeral } from "@anthropic-ai/sdk/resources"
import { anthropicDefaultModelId, anthropicModels, ApiHandlerOptions, ModelInfo } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import { ANTHROPIC_DEFAULT_MAX_TOKENS } from "./constants"
import { SingleCompletionHandler } from "../index"
import { KodelyOpenrouterHandler } from "./kodely-openrouter"
import { getModelParams } from "../getModelParams"

export class KodelyHandler extends BaseProvider implements SingleCompletionHandler {
	private handler: BaseProvider & SingleCompletionHandler
	private options: ApiHandlerOptions

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		const modelType = options.kodelyModel || "claude37"

		const openrouterModels = ["gemini25", "gpt41", "gemini25flashpreview"]

		if (modelType === "claude37") {
			this.handler = new KodelyAnthropicHandler(options)
		} else if (openrouterModels.includes(modelType)) {
			// Determine the correct OpenRouter model ID based on the selected Kodely model type
			const baseUri = getKodelyBaseUri(options)
			const openrouterOptions = {
				...options,
				openRouterBaseUrl: `${baseUri}/api/openrouter/`,
				openRouterApiKey: options.kodelyToken,
			}

			this.handler = new KodelyOpenrouterHandler(openrouterOptions)
		} else {
			throw new Error("Invalid Kodely provider")
		}
	}

	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		yield* this.handler.createMessage(systemPrompt, messages)
	}

	getModel(): { id: string; info: ModelInfo } {
		return this.handler.getModel()
	}

	override countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		if (this.handler.countTokens) {
			return this.handler.countTokens(content)
		} else {
			// Fallback to the base provider's implementation
			return super.countTokens(content)
		}
	}

	async completePrompt(prompt: string) {
		return this.handler.completePrompt(prompt)
	}
}

export class KodelyAnthropicHandler extends BaseProvider implements SingleCompletionHandler {
	private options: ApiHandlerOptions
	private client: Anthropic

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		const baseUri = getKodelyBaseUri(options)
		this.client = new Anthropic({
			authToken: this.options.kodelyToken,
			baseURL: `${baseUri}/api/claude/`,
			apiKey: null, //ignore anthropic apiKey, even if set in env vars - it's not valid for Kodely anyhow
		})
	}

	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		let stream: AnthropicStream<Anthropic.Messages.RawMessageStreamEvent>
		const cacheControl: CacheControlEphemeral = { type: "ephemeral" }
		let { id: modelId, maxTokens, thinking, temperature, virtualId } = this.getModel()

		const userMsgIndices = messages.reduce(
			(acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
			[] as number[],
		)

		const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
		const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

		try {
			stream = await this.client.messages.create(
				{
					model: modelId,
					max_tokens: maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
					temperature,
					thinking,
					// Setting cache breakpoint for system prompt so new tasks can reuse it.
					system: [{ text: systemPrompt, type: "text", cache_control: cacheControl }],
					messages: messages.map((message, index) => {
						if (index === lastUserMsgIndex || index === secondLastMsgUserIndex) {
							return {
								...message,
								content:
									typeof message.content === "string"
										? [{ type: "text", text: message.content, cache_control: cacheControl }]
										: message.content.map((content, contentIndex) =>
												contentIndex === message.content.length - 1
													? { ...content, cache_control: cacheControl }
													: content,
											),
							}
						}
						return message
					}),
					// tools, // cache breakpoints go from tools > system > messages, and since tools dont change, we can just set the breakpoint at the end of system (this avoids having to set a breakpoint at the end of tools which by itself does not meet min requirements for haiku caching)
					// tool_choice: { type: "auto" },
					// tools: tools,
					stream: true,
				},
				(() => {
					// prompt caching: https://x.com/alexalbert__/status/1823751995901272068
					// https://github.com/anthropics/anthropic-sdk-typescript?tab=readme-ov-file#default-headers
					// https://github.com/anthropics/anthropic-sdk-typescript/commit/c920b77fc67bd839bfeb6716ceab9d7c9bbe7393

					const betas = []

					// // Check for the thinking-128k variant first
					// if (virtualId === "claude-3-7-sonnet-20250219:thinking") {
					// 	betas.push("output-128k-2025-02-19")
					// }

					// Then check for models that support prompt caching
					switch (modelId) {
						case "claude-3-7-sonnet-20250219":
						case "claude-3-5-sonnet-20241022":
						case "claude-3-5-haiku-20241022":
						case "claude-3-opus-20240229":
						case "claude-3-haiku-20240307":
							betas.push("prompt-caching-2024-07-31")
							return {
								headers: { "anthropic-beta": betas.join(",") },
							}
						default:
							return undefined
					}
				})(),
			)

			for await (const chunk of stream) {
				switch (chunk.type) {
					case "message_start":
						// Tells us cache reads/writes/input/output.
						const usage = chunk.message.usage

						yield {
							type: "usage",
							inputTokens: usage.input_tokens || 0,
							outputTokens: usage.output_tokens || 0,
							cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
							cacheReadTokens: usage.cache_read_input_tokens || undefined,
						}

						break
					case "message_delta":
						// Tells us stop_reason, stop_sequence, and output tokens
						// along the way and at the end of the message.
						yield {
							type: "usage",
							inputTokens: 0,
							outputTokens: chunk.usage.output_tokens || 0,
						}

						break
					case "message_stop":
						// No usage data, just an indicator that the message is done.
						break
					case "content_block_start":
						switch (chunk.content_block.type) {
							case "thinking":
								// We may receive multiple text blocks, in which
								// case just insert a line break between them.
								if (chunk.index > 0) {
									yield { type: "reasoning", text: "\n" }
								}

								yield { type: "reasoning", text: chunk.content_block.thinking }
								break
							case "text":
								// We may receive multiple text blocks, in which
								// case just insert a line break between them.
								if (chunk.index > 0) {
									yield { type: "text", text: "\n" }
								}

								yield { type: "text", text: chunk.content_block.text }
								break
						}
						break
					case "content_block_delta":
						switch (chunk.delta.type) {
							case "thinking_delta":
								yield { type: "reasoning", text: chunk.delta.thinking }
								break
							case "text_delta":
								yield { type: "text", text: chunk.delta.text }
								break
						}

						break
					case "content_block_stop":
						break
				}
			}
		} catch (error: any) {
			if (error.status === 401) {
				yield {
					type: "text",
					text:
						"ERROR: Not logged in to Kodely.\n\n" +
						"Please log in to Kodely from the extension settings.\n" +
						"Kodely has a free tier with $20 worth of Claude 3.7 Sonnet tokens.\n" +
						"We'll give out more free tokens if you leave useful feedback.",
				}
			}
			if (error.status === 402) {
				yield {
					type: "text",
					text: "Go to https://kodely.dev/profile to purchase more credits.",
				}
			} else {
				yield {
					type: "text",
					text:
						`ERROR: ${error.message || "Failed to communicate with Kodely API"}\n\n` +
						"If you need any help please check https://kodely.dev to reach out to us",
				}
			}

			// Rethrow so that Cline class can break off API attempts
			throw error
		}
	}

	getModel() {
		// This handler is specifically for the 'claude37' Kodely model type,
		// which maps to the standard Anthropic default model.
		const id = anthropicDefaultModelId // Currently 'claude-3-7-sonnet-20250219'
		const info: ModelInfo = anthropicModels[id]

		// Track the original model ID for special variant handling
		const virtualId = id

		return {
			id,
			info,
			virtualId,
			...getModelParams({ options: this.options, model: info, defaultMaxTokens: ANTHROPIC_DEFAULT_MAX_TOKENS }),
		}
	}

	async completePrompt(prompt: string) {
		let { id: modelId, temperature } = this.getModel()

		const message = await this.client.messages.create({
			model: modelId,
			max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
			thinking: undefined,
			temperature,
			messages: [{ role: "user", content: prompt }],
			stream: false,
		})

		const content = message.content.find(({ type }) => type === "text")
		return content?.type === "text" ? content.text : ""
	}

	/**
	 * Counts tokens for the given content using Anthropic's API
	 *
	 * @param content The content blocks to count tokens for
	 * @returns A promise resolving to the token count
	 */
	override async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		try {
			// Use the current model
			const actualModelId = this.getModel().id

			const response = await this.client.messages.countTokens({
				model: actualModelId,
				messages: [
					{
						role: "user",
						content: content,
					},
				],
			})

			return response.input_tokens
		} catch (error) {
			// Log error but fallback to tiktoken estimation
			console.warn("Anthropic token counting failed, using fallback", error)

			// Use the base provider's implementation as fallback
			return super.countTokens(content)
		}
	}
}

function getKodelyBaseUri(options: ApiHandlerOptions) {
	try {
		const token = options.kodelyToken as string
		const payload_string = token.split(".")[1]
		const payload = JSON.parse(Buffer.from(payload_string, "base64").toString())
		//note: this is UNTRUSTED, so we need to make sure we're OK with this being manipulated by an attacker; e.g. we should not read uri's from the JWT directly.
		if (payload.env === "development") return "http://localhost:3000"
	} catch (_error) {
		console.warn("Failed to get base URL from Kodely token")
	}
	return "https://kodely.dev"
}
