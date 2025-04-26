import { useEffect, useMemo, useState, useRef } from "react"
import {
	VSCodeButton,
	VSCodeProgressRing,
	VSCodeRadioGroup,
	VSCodeRadio,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"
import { McpMarketplaceItem } from "../../../../../src/shared/kodely/mcp"
import { useExtensionState } from "../../../context/ExtensionStateContext"
import { vscode } from "../../../utils/vscode"
import McpMarketplaceCard from "./McpMarketplaceCard"
import McpSubmitCard from "./McpSubmitCard"
const McpMarketplaceView = () => {
	const { mcpServers } = useExtensionState()
	const [items, setItems] = useState<McpMarketplaceItem[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
	const [sortBy, setSortBy] = useState<"newest" | "stars" | "name">("newest")

	// Use refs to track loading state for timeout
	const isLoadingRef = useRef(true)
	const isRefreshingRef = useRef(false)
	const timeoutRef = useRef<number | null>(null)
	const hasInitialDataRef = useRef(false)

	const categories = useMemo(() => {
		const uniqueCategories = new Set(items.map((item) => item.category))
		return Array.from(uniqueCategories).sort()
	}, [items])

	const filteredItems = useMemo(() => {
		return items
			.filter((item) => {
				const matchesSearch =
					searchQuery === "" ||
					item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
					item.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
				const matchesCategory = !selectedCategory || item.category === selectedCategory
				return matchesSearch && matchesCategory
			})
			.sort((a, b) => {
				switch (sortBy) {
					// case "downloadCount":
					// 	return b.downloadCount - a.downloadCount
					case "stars":
						return b.githubStars - a.githubStars
					case "name":
						return a.name.localeCompare(b.name)
					case "newest":
						return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
					default:
						return 0
				}
			})
	}, [items, searchQuery, selectedCategory, sortBy])

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			console.log("McpMarketplaceView received message:", message.type)
			if (message.type === "mcpMarketplaceCatalog") {
				// Clear timeout if it exists
				if (timeoutRef.current !== null) {
					clearTimeout(timeoutRef.current)
					timeoutRef.current = null
				}

				if (message.error) {
					console.error("McpMarketplaceView received error:", message.error)
					setError(message.error)
				} else {
					console.log("McpMarketplaceView received catalog items:", message.mcpMarketplaceCatalog?.items?.length || 0)
					const catalogItems = message.mcpMarketplaceCatalog?.items || []
					setItems(catalogItems)
					setError(null)

					// Mark that we have received initial data
					if (catalogItems.length > 0) {
						hasInitialDataRef.current = true
					}
				}

				// Update both state and refs
				setIsLoading(false)
				setIsRefreshing(false)
				isLoadingRef.current = false
				isRefreshingRef.current = false
			} else if (message.type === "mcpDownloadDetails") {
				if (message.error) {
					console.error("McpMarketplaceView received download error:", message.error)
					setError(message.error)
				}
			}
		}

		window.addEventListener("message", handleMessage)

		// Fetch marketplace catalog only if we don't have data yet
		if (!hasInitialDataRef.current) {
			console.log("McpMarketplaceView mounted, fetching marketplace...")
			fetchMarketplace()
		} else {
			console.log("McpMarketplaceView mounted, using existing data")
		}

		return () => {
			// Clear timeout on unmount
			if (timeoutRef.current !== null) {
				clearTimeout(timeoutRef.current)
				timeoutRef.current = null
			}
			window.removeEventListener("message", handleMessage)
		}
	}, [])

	const fetchMarketplace = (forceRefresh: boolean = false) => {
		console.log("McpMarketplaceView.fetchMarketplace called, forceRefresh:", forceRefresh)

		// If we already have data and this isn't a forced refresh, don't fetch again
		if (hasInitialDataRef.current && !forceRefresh) {
			console.log("Already have marketplace data, skipping fetch")
			return
		}

		// Update state and refs
		if (forceRefresh) {
			setIsRefreshing(true)
			isRefreshingRef.current = true
		} else {
			setIsLoading(true)
			isLoadingRef.current = true
		}
		setError(null)

		// Clear any existing timeout
		if (timeoutRef.current !== null) {
			clearTimeout(timeoutRef.current)
			timeoutRef.current = null
		}

		console.log("Sending fetchMcpMarketplace message to extension")
		vscode.postMessage({ type: "fetchMcpMarketplace", bool: forceRefresh })

		// Set a timeout to prevent infinite loading if the response never comes
		timeoutRef.current = window.setTimeout(() => {
			if (isLoadingRef.current || isRefreshingRef.current) {
				console.log("Marketplace fetch timeout - ensuring loading state is cleared")
				setIsLoading(false)
				setIsRefreshing(false)
				isLoadingRef.current = false
				isRefreshingRef.current = false
				setError("Marketplace fetch timed out. Please try refreshing again.")
			}
			timeoutRef.current = null
		}, 15000) // 15 second timeout
	}

	if (isLoading || isRefreshing) {
		return (
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					height: "100%",
					padding: "20px",
				}}>
				<VSCodeProgressRing />
			</div>
		)
	}

	if (error) {
		return (
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					alignItems: "center",
					height: "100%",
					padding: "20px",
					gap: "12px",
				}}>
				<div style={{ color: "var(--vscode-errorForeground)" }}>{error}</div>
				<VSCodeButton appearance="secondary" onClick={() => fetchMarketplace(true)}>
					<span className="codicon codicon-refresh" style={{ marginRight: "6px" }} />
					Retry
				</VSCodeButton>
			</div>
		)
	}

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
			}}>
			<div style={{ padding: "20px 20px 5px", display: "flex", flexDirection: "column", gap: "16px" }}>
				{/* Search row */}
				<VSCodeTextField
					style={{ width: "100%" }}
					placeholder="Search MCPs..."
					value={searchQuery}
					onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}>
					<div
						slot="start"
						className="codicon codicon-search"
						style={{
							fontSize: 13,
							opacity: 0.8,
						}}
					/>
					{searchQuery && (
						<div
							className="codicon codicon-close"
							aria-label="Clear search"
							onClick={() => setSearchQuery("")}
							slot="end"
							style={{
								display: "flex",
								justifyContent: "center",
								alignItems: "center",
								height: "100%",
								cursor: "pointer",
							}}
						/>
					)}
				</VSCodeTextField>

				{/* Filter row */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "8px",
					}}>
					<span
						style={{
							fontSize: "11px",
							color: "var(--vscode-descriptionForeground)",
							textTransform: "uppercase",
							fontWeight: 500,
							flexShrink: 0,
						}}>
						Filter:
					</span>
					<div
						style={{
							position: "relative",
							zIndex: 2,
							flex: 1,
						}}>
						<VSCodeDropdown
							style={{
								width: "100%",
							}}
							value={selectedCategory || ""}
							onChange={(e) => setSelectedCategory((e.target as HTMLSelectElement).value || null)}>
							<VSCodeOption value="">All Categories</VSCodeOption>
							{categories.map((category) => (
								<VSCodeOption key={category} value={category}>
									{category}
								</VSCodeOption>
							))}
						</VSCodeDropdown>
					</div>
				</div>

				{/* Sort row */}
				<div
					style={{
						display: "flex",
						gap: "8px",
					}}>
					<span
						style={{
							fontSize: "11px",
							color: "var(--vscode-descriptionForeground)",
							textTransform: "uppercase",
							fontWeight: 500,
							marginTop: "3px",
						}}>
						Sort:
					</span>
					<VSCodeRadioGroup
						style={{
							display: "flex",
							flexWrap: "wrap",
							marginTop: "-2.5px",
						}}
						value={sortBy}
						onChange={(e) => setSortBy((e.target as HTMLInputElement).value as typeof sortBy)}>
						{/* <VSCodeRadio value="downloadCount">Most Installs</VSCodeRadio> */}
						<VSCodeRadio value="newest">Newest</VSCodeRadio>
						<VSCodeRadio value="stars">GitHub Stars</VSCodeRadio>
						<VSCodeRadio value="name">Name</VSCodeRadio>
					</VSCodeRadioGroup>
				</div>
			</div>

			<style>
				{`
				.mcp-search-input,
				.mcp-select {
				box-sizing: border-box;
				}
				.mcp-search-input {
				min-width: 140px;
				}
				.mcp-search-input:focus,
				.mcp-select:focus {
				border-color: var(--vscode-focusBorder) !important;
				}
				.mcp-search-input:hover,
				.mcp-select:hover {
				opacity: 0.9;
				}
			`}
			</style>
			<div style={{ display: "flex", flexDirection: "column" }}>
				{filteredItems.length === 0 ? (
					<div
						style={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							height: "100%",
							padding: "20px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{searchQuery || selectedCategory
							? "No matching MCP servers found"
							: "No MCP servers found in the marketplace"}
					</div>
				) : (
					filteredItems.map((item) => (
						<McpMarketplaceCard key={item.mcpId} item={item} installedServers={mcpServers} />
					))
				)}
				<McpSubmitCard />
			</div>
		</div>
	)
}

export default McpMarketplaceView
