import { App, PluginSettingTab, Setting, DropdownComponent } from "obsidian";
import type MyPlugin from "../../main";
import type { LLMProvider } from "../../main";

export default class SettingsTab extends PluginSettingTab {
	plugin: MyPlugin;
	
	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
				
		new Setting(containerEl)
			.setName("LLM provider")
			.setDesc("Select which LLM provider you want to use for generating and marking tests")
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOption("openai", "OpenAI")
					.addOption("anthropic", "Anthropic (Claude)")
					.addOption("deepseek", "DeepSeek")
					.addOption("gemini", "Google (Gemini)")
					.addOption("mistral", "Mistral AI")
					.setValue(this.plugin.settings.llmProvider)
					.onChange(async (value: LLMProvider) => {
						this.plugin.settings.llmProvider = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});
		
		// OpenAI API Key and Models
		if (this.plugin.settings.llmProvider === "openai") {
			new Setting(containerEl)
				.setName("OpenAI API key")
				.setDesc("Enter your OpenAI API key for test generation and marking")
				.addText((text) =>
					text
						.setPlaceholder("sk-...")
						.setValue(this.plugin.settings.apiKeys.openai)
						.onChange(async (value: string) => {
							this.plugin.settings.apiKeys.openai = value;
							await this.plugin.saveSettings();
						})
				);
				
			new Setting(containerEl)
				.setName("OpenAI model")
				.setDesc("Select which OpenAI model to use")
				.addDropdown((dropdown: DropdownComponent) => {
					dropdown
						.addOption("gpt-3.5-turbo", "GPT-3.5 Turbo")
						.addOption("gpt-4", "GPT-4")
						.addOption("gpt-4-turbo", "GPT-4 Turbo")
						.addOption("gpt-4o", "GPT-4o")
						.setValue(this.plugin.settings.models.openai || "gpt-4")
						.onChange(async (value: string) => {
							this.plugin.settings.models.openai = value;
							await this.plugin.saveSettings();
						});
				});
		}
		
		// Anthropic (Claude) API Key and Models
		if (this.plugin.settings.llmProvider === "anthropic") {
			new Setting(containerEl)
				.setName("Anthropic Claude API key")
				.setDesc("Enter your Anthropic API key for Claude")
				.addText((text) =>
					text
						.setPlaceholder("sk-ant-...")
						.setValue(this.plugin.settings.apiKeys.anthropic)
						.onChange(async (value: string) => {
							this.plugin.settings.apiKeys.anthropic = value;
							await this.plugin.saveSettings();
						})
				);
				
			new Setting(containerEl)
				.setName("Claude model")
				.setDesc("Select which Claude model to use")
				.addDropdown((dropdown: DropdownComponent) => {
					dropdown
						.addOption("claude-3-opus-20240229", "Claude 3 Opus")
						.addOption("claude-3-sonnet-20240229", "Claude 3 Sonnet")
						.addOption("claude-3-haiku-20240307", "Claude 3 Haiku")
						.addOption("claude-3-5-sonnet-20240620", "Claude 3.5 Sonnet")
						.setValue(this.plugin.settings.models.anthropic || "claude-3-opus-20240229")
						.onChange(async (value: string) => {
							this.plugin.settings.models.anthropic = value;
							await this.plugin.saveSettings();
						});
				});
		}
		
		// DeepSeek API Key and Models
		if (this.plugin.settings.llmProvider === "deepseek") {
			new Setting(containerEl)
				.setName("DeepSeek API key")
				.setDesc("Enter your DeepSeek API key")
				.addText((text) =>
					text
						.setPlaceholder("sk-...")
						.setValue(this.plugin.settings.apiKeys.deepseek)
						.onChange(async (value: string) => {
							this.plugin.settings.apiKeys.deepseek = value;
							await this.plugin.saveSettings();
						})
				);
				
			new Setting(containerEl)
				.setName("DeepSeek model")
				.setDesc("Select which DeepSeek model to use")
				.addDropdown((dropdown: DropdownComponent) => {
					dropdown
						.addOption("deepseek-chat", "DeepSeek Chat")
						.addOption("deepseek-coder", "DeepSeek Coder")
						.setValue(this.plugin.settings.models.deepseek || "deepseek-chat")
						.onChange(async (value: string) => {
							this.plugin.settings.models.deepseek = value;
							await this.plugin.saveSettings();
						});
				});
		}
		
		// Gemini API Key and Models
		if (this.plugin.settings.llmProvider === "gemini") {
			new Setting(containerEl)
				.setName("Google Gemini API key")
				.setDesc("Enter your Google API key for Gemini")
				.addText((text) =>
					text
						.setPlaceholder("API key...")
						.setValue(this.plugin.settings.apiKeys.gemini)
						.onChange(async (value: string) => {
							this.plugin.settings.apiKeys.gemini = value;
							await this.plugin.saveSettings();
						})
				);
				
			new Setting(containerEl)
				.setName("Gemini model")
				.setDesc("Select which Gemini model to use")
				.addDropdown((dropdown: DropdownComponent) => {
					dropdown
						.addOption("gemini-1.5-pro", "Gemini 1.5 Pro")
						.addOption("gemini-1.5-flash", "Gemini 1.5 Flash")
						.setValue(this.plugin.settings.models.gemini || "gemini-pro")
						.onChange(async (value: string) => {
							this.plugin.settings.models.gemini = value;
							await this.plugin.saveSettings();
						});
				});
		}
		
		// Mistral API Key and Models
		if (this.plugin.settings.llmProvider === "mistral") {
			new Setting(containerEl)
				.setName("Mistral API key")
				.setDesc("Enter your Mistral API key")
				.addText((text) =>
					text
						.setPlaceholder("...")
						.setValue(this.plugin.settings.apiKeys.mistral)
						.onChange(async (value: string) => {
							this.plugin.settings.apiKeys.mistral = value;
							await this.plugin.saveSettings();
						})
				);
				
			new Setting(containerEl)
				.setName("Mistral model")
				.setDesc("Select which Mistral model to use")
				.addDropdown((dropdown: DropdownComponent) => {
					dropdown
						.addOption("mistral-tiny", "Mistral Tiny")
						.addOption("mistral-small", "Mistral Small")
						.addOption("mistral-medium", "Mistral Medium")
						.addOption("mistral-large-latest", "Mistral Large (Latest)")
						.setValue(this.plugin.settings.models.mistral || "mistral-medium")
						.onChange(async (value: string) => {
							this.plugin.settings.models.mistral = value;
							await this.plugin.saveSettings();
						});
				});
		}
		
		// About section
		new Setting(containerEl).setName("About API keys").setHeading();
		const apiInfoDiv = containerEl.createDiv({ cls: "api-key-info" });
		apiInfoDiv.createEl("p", { 
			text: "Your API keys are stored locally in your vault and are only used to communicate with the selected LLM provider."
		});
		
		// Provider-specific info
		const providerInfoDiv = containerEl.createDiv({ cls: "provider-info" });
		
		if (this.plugin.settings.llmProvider === "openai") {
			providerInfoDiv.createEl("p", { 
				text: "OpenAI API keys can be obtained from: https://platform.openai.com/account/api-keys"
			});
			providerInfoDiv.createEl("p", { 
				text: "GPT-4 and GPT-4o provide the best results but require a higher API usage tier."
			});
		} else if (this.plugin.settings.llmProvider === "anthropic") {
			providerInfoDiv.createEl("p", { 
				text: "Anthropic API keys can be obtained from: https://console.anthropic.com/settings/keys"
			});
			providerInfoDiv.createEl("p", { 
				text: "Claude models excel at understanding context and providing helpful feedback. Claude 3 Opus has the largest context window."
			});
		} else if (this.plugin.settings.llmProvider === "deepseek") {
			providerInfoDiv.createEl("p", { 
				text: "DeepSeek API keys can be obtained from the DeepSeek website."
			});
		} else if (this.plugin.settings.llmProvider === "gemini") {
			providerInfoDiv.createEl("p", { 
				text: "Google Gemini API keys can be obtained from Google AI Studio: https://makersuite.google.com/app/apikey"
			});
			providerInfoDiv.createEl("p", { 
				text: "Gemini 1.5 Pro offers a larger context window and improved capabilities over Gemini Pro."
			});
		} else if (this.plugin.settings.llmProvider === "mistral") {
			providerInfoDiv.createEl("p", { 
				text: "Mistral API keys can be obtained from: https://console.mistral.ai/api-keys/"
			});
			providerInfoDiv.createEl("p", { 
				text: "Mistral offers several model sizes with different capabilities and pricing. Mistral Medium provides a good balance of performance and cost."
			});
		}
	}
}