import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"

const McpSubmitCard = () => {
	return (
		<div
			style={{
				padding: "20px 16px",
				display: "flex",
				flexDirection: "column",
				gap: 12,
				borderTop: "1px solid var(--vscode-panel-border)",
			}}>
			<h3
				style={{
					margin: 0,
					fontSize: "13px",
					fontWeight: 600,
				}}>
				Submit your own MCP server
			</h3>
			<p style={{ fontSize: "13px", margin: 0 }}>
				Have you built an MCP server that you'd like to share with the community? Submit a pull request to the
				MCP servers repository.
			</p>
			<VSCodeLink href="https://github.com/modelcontextprotocol/servers">
				<span className="codicon codicon-github" style={{ marginRight: "6px" }} />
				View MCP Servers Repository
			</VSCodeLink>
		</div>
	)
}

export default McpSubmitCard
