import * as assert from "assert"
import * as vscode from "vscode"

suite("Kodely Extension", () => {
	test("Commands should be registered", async () => {
		const expectedCommands = [
			"kodely.plusButtonClicked",
			"kodely.mcpButtonClicked",
			"kodely.historyButtonClicked",
			"kodely.popoutButtonClicked",
			"kodely.settingsButtonClicked",
			"kodely.openInNewTab",
			"kodely.explainCode",
			"kodely.fixCode",
			"kodely.improveCode",
		]

		const commands = await vscode.commands.getCommands(true)

		for (const cmd of expectedCommands) {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`)
		}
	})
})
