import { useCallback, useState } from "react"
import { useExtensionState } from "../../../context/ExtensionStateContext"
import { validateApiConfiguration } from "../../../utils/validate"
import { vscode } from "../../../utils/vscode"
import { Tab, TabContent } from "../../common/Tab"
import { useAppTranslation } from "../../../i18n/TranslationContext"
import { ButtonPrimary } from "../common/ButtonPrimary"
import { ButtonSecondary } from "../common/ButtonSecondary"
import { ButtonLink } from "../common/ButtonLink"
import ApiOptions from "../../settings/ApiOptions"
import { getKodelyBackendAuthUrl } from "../helpers"

const WelcomeView = () => {
	const { apiConfiguration, currentApiConfigName, setApiConfiguration, uriScheme } = useExtensionState()
	const [errorMessage, setErrorMessage] = useState<string | undefined>()
	const [manualConfig, setManualConfig] = useState(false)
	const { t } = useAppTranslation()

	const handleSubmit = useCallback(() => {
		const error = validateApiConfiguration(apiConfiguration)

		if (error) {
			setErrorMessage(error)
			return
		}

		setErrorMessage(undefined)
		vscode.postMessage({ type: "upsertApiConfiguration", text: currentApiConfigName, apiConfiguration })
	}, [apiConfiguration, currentApiConfigName])

	return (
		<Tab>
			<TabContent className="flex flex-col gap-5">
				<h2 className="m-0 p-0">{t("kodely:welcome.greeting")}</h2>
				<div>{t("kodely:welcome.introText")}</div>
				{manualConfig ? (
					<>
						<ApiOptions
							fromWelcomeView
							apiConfiguration={apiConfiguration || {}}
							uriScheme={uriScheme}
							setApiConfigurationField={(field, value) => setApiConfiguration({ [field]: value })}
							errorMessage={errorMessage}
							setErrorMessage={setErrorMessage}
							hideKodelyButton
						/>
						{!apiConfiguration?.apiProvider || apiConfiguration?.apiProvider === "kodely" ? (
							<ButtonLink href={getKodelyBackendAuthUrl(uriScheme)}>
								{t("kodely:welcome.ctaButton")}
							</ButtonLink>
						) : (
							<ButtonPrimary onClick={handleSubmit}>{t("welcome:start")}</ButtonPrimary>
						)}
					</>
				) : (
					<div className="bg-vscode-sideBar-background">
						<div className="flex flex-col gap-5">
							<ButtonLink href={getKodelyBackendAuthUrl(uriScheme)}>
								{t("kodely:welcome.ctaButton")}
							</ButtonLink>
							<ButtonSecondary onClick={() => setManualConfig(true)}>
								{t("kodely:welcome.manualModeButton")}
							</ButtonSecondary>
						</div>
					</div>
				)}
			</TabContent>
		</Tab>
	)
}

export default WelcomeView
