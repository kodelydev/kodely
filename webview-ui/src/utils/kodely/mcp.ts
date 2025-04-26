import { McpMarketplaceCatalog } from "../../../../src/shared/kodely/mcp"

/**
 * Gets a display name for an MCP server
 * If the server is from the marketplace, it will use the name from the catalog
 * Otherwise, it will use the server name
 */
export function getMcpServerDisplayName(
  serverName: string,
  mcpMarketplaceCatalog?: McpMarketplaceCatalog
): string {
  const catalogItem = mcpMarketplaceCatalog?.items.find((item) => item.mcpId === serverName)
  return catalogItem?.name || serverName
}
