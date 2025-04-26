import * as vscode from "vscode"
import delay from "delay"

import { ClineProvider } from "../core/webview/ClineProvider"
import { t } from "../i18n" // kodely_change
import { importSettings, exportSettings } from "../core/config/importExport" // kodely_change
/**
 * Helper to get the visible ClineProvider instance or log if not found.
 */
export function getVisibleProviderOrLog(outputChannel: vscode.OutputChannel): ClineProvider | undefined {
	const visibleProvider = ClineProvider.getVisibleInstance()
	if (!visibleProvider) {
		outputChannel.appendLine("Cannot find any visible Kodely instances.")
		return undefined
	}
	return visibleProvider
}

import { registerHumanRelayCallback, unregisterHumanRelayCallback, handleHumanRelayResponse } from "./humanRelay"
import { handleNewTask } from "./handleTask"

// Store panel references in both modes
let sidebarPanel: vscode.WebviewView | undefined = undefined
let tabPanel: vscode.WebviewPanel | undefined = undefined

/**
 * Get the currently active panel
 * @returns WebviewPanel或WebviewView
 */
export function getPanel(): vscode.WebviewPanel | vscode.WebviewView | undefined {
	return tabPanel || sidebarPanel
}

/**
 * Set panel references
 */
export function setPanel(
	newPanel: vscode.WebviewPanel | vscode.WebviewView | undefined,
	type: "sidebar" | "tab",
): void {
	if (type === "sidebar") {
		sidebarPanel = newPanel as vscode.WebviewView
		tabPanel = undefined
	} else {
		tabPanel = newPanel as vscode.WebviewPanel
		sidebarPanel = undefined
	}
}

export type RegisterCommandOptions = {
	context: vscode.ExtensionContext
	outputChannel: vscode.OutputChannel
	provider: ClineProvider
}

export const registerCommands = (options: RegisterCommandOptions) => {
	const { context, outputChannel } = options

	for (const [command, callback] of Object.entries(getCommandsMap(options))) {
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}
}

const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions) => {
	return {
		"kodely.activationCompleted": () => {},
		"kodely.plusButtonClicked": async () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return
			await visibleProvider.removeClineFromStack()
			await visibleProvider.postStateToWebview()
			await visibleProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		},
		"kodely.mcpButtonClicked": () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return
			visibleProvider.postMessageToWebview({ type: "action", action: "mcpButtonClicked" })
		},
		"kodely.promptsButtonClicked": () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return
			visibleProvider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" })
		},
		"kodely.popoutButtonClicked": () => openClineInNewTab({ context, outputChannel }),
		"kodely.openInNewTab": () => openClineInNewTab({ context, outputChannel }),
		"kodely.settingsButtonClicked": () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return
			visibleProvider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
		},
		"kodely.historyButtonClicked": () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return
			visibleProvider.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
		},
		"kodely.helpButtonClicked": () => {
			vscode.env.openExternal(vscode.Uri.parse("https://kodely.dev"))
		},
		"kodely.showHumanRelayDialog": (params: { requestId: string; promptText: string }) => {
			const panel = getPanel()

			if (panel) {
				panel?.webview.postMessage({
					type: "showHumanRelayDialog",
					requestId: params.requestId,
					promptText: params.promptText,
				})
			}
		},
		"kodely.registerHumanRelayCallback": registerHumanRelayCallback,
		"kodely.unregisterHumanRelayCallback": unregisterHumanRelayCallback,
		"kodely.handleHumanRelayResponse": handleHumanRelayResponse,
		"kodely.newTask": handleNewTask,
		"kodely.setCustomStoragePath": async () => {
			const { promptForCustomStoragePath } = await import("../shared/storagePathManager")
			await promptForCustomStoragePath()
		},
		// kodely_change begin
		"kodely.focusChatInput": async () => {
			try {
				await vscode.commands.executeCommand("kodely.SidebarProvider.focus")
				await delay(100)

				let visibleProvider = getVisibleProviderOrLog(outputChannel)

				if (!visibleProvider) {
					// If still no visible provider, try opening in a new tab
					const tabProvider = await openClineInNewTab({ context, outputChannel })
					await delay(100)
					visibleProvider = tabProvider
				}

				visibleProvider?.postMessageToWebview({
					type: "action",
					action: "focusChatInput",
				})
			} catch (error) {
				outputChannel.appendLine(`Error in focusChatInput: ${error}`)
			}
		},
		// kodely_change end
		"kodely.acceptInput": () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return
			visibleProvider.postMessageToWebview({ type: "acceptInput" })
		},
		// kodely_change start
		"kodely.importSettings": async () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return

			const { success } = await importSettings({
				providerSettingsManager: visibleProvider.providerSettingsManager,
				contextProxy: visibleProvider.contextProxy,
			})

			if (success) {
				visibleProvider.settingsImportedAt = Date.now()
				await visibleProvider.postStateToWebview()
				await vscode.window.showInformationMessage(t("kodely:info.settings_imported"))
			}
		},
		"kodely.exportSettings": async () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return

			await exportSettings({
				providerSettingsManager: visibleProvider.providerSettingsManager,
				contextProxy: visibleProvider.contextProxy,
			})
		},
		// kodely_change end
	}
}

export const openClineInNewTab = async ({ context, outputChannel }: Omit<RegisterCommandOptions, "provider">) => {
	// (This example uses webviewProvider activation event which is necessary to
	// deserialize cached webview, but since we use retainContextWhenHidden, we
	// don't need to use that event).
	// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	const tabProvider = new ClineProvider(context, outputChannel, "editor")
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

	// Check if there are any visible text editors, otherwise open a new group
	// to the right.
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0

	if (!hasVisibleEditors) {
		await vscode.commands.executeCommand("workbench.action.newGroupRight")
	}

	const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

	const newPanel = vscode.window.createWebviewPanel(ClineProvider.tabPanelId, "Kodely", targetCol, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [context.extensionUri],
	})

	// Save as tab type panel.
	setPanel(newPanel, "tab")

	// TODO: Use better svg icon with light and dark variants (see
	// https://stackoverflow.com/questions/58365687/vscode-extension-iconpath).
	newPanel.iconPath = {
		light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "kodely.png"),
		dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "kodely.png"),
	}

	await tabProvider.resolveWebviewView(newPanel)

	// Handle panel closing events.
	newPanel.onDidDispose(() => {
		setPanel(undefined, "tab")
	})

	// Lock the editor group so clicking on files doesn't open them over the panel.
	await delay(100)
	await vscode.commands.executeCommand("workbench.action.lockEditorGroup")

	return tabProvider
}
