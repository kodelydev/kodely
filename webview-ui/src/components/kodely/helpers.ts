export function getKodelyBackendAuthUrl(uriScheme: string = "vscode") {
	return `https://kodely.dev/auth/signin?source=${uriScheme}`
}
