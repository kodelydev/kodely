import { vscode } from "@src/utils/vscode"

export function showSystemNotification(message: string) {
  vscode.postMessage({ type: "showSystemNotification", text: message })
}
