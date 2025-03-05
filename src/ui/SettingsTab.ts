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
		
		containerEl.createEl("h2", { text: "RAG Test Plugin Settings" });
		
		new Setting(containerEl)
			.setName("LLM Provider")
			.setDesc("Select which LLM provider you want to use for generating and marking tests")
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOption("openai", "OpenAI (GPT-4)")
					.addOption("anthropic", "Anthropic (Claude)")
					.addOption("deepseek", "DeepSeek")
					.addOption("gemini", "Google (Gemini)")
					.setValue(this.plugin.settings.llmProvider)
					.onChange(async (value: LLMProvider) => {
						this.plugin.settings.llmProvider = value;
						await this.plugin.saveSettings();
						// Refresh the view to update which API key field is shown
						this.display();
					});
			});
		
		// OpenAI API Key
		if (this.plugin.settings.llmProvider === "openai") {
			new Setting(containerEl)
				.setName("OpenAI API Key")
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
		}
		
		// Anthropic (Claude) API Key
		if (this.plugin.settings.llmProvider === "anthropic") {
			new Setting(containerEl)
				.setName("Anthropic Claude API Key")
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
		}
		
		// DeepSeek API Key
		if (this.plugin.settings.llmProvider === "deepseek") {
			new Setting(containerEl)
				.setName("DeepSeek API Key")
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
		}
		
		// Gemini API Key
		if (this.plugin.settings.llmProvider === "gemini") {
			new Setting(containerEl)
				.setName("Google Gemini API Key")
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
		}
		
		// Add a section explaining API key usage
		containerEl.createEl("h3", { text: "About API Keys" });
		const apiInfoDiv = containerEl.createDiv({ cls: "api-key-info" });
		apiInfoDiv.createEl("p", { 
			text: "Your API keys are stored locally in your vault and are only used to communicate with the selected LLM provider."
		});
		apiInfoDiv.createEl("p", { 
			text: "This plugin will use the selected provider to generate test questions from your notes and to mark your answers."
		});
		
		// Add provider-specific info
		const providerInfoDiv = containerEl.createDiv({ cls: "provider-info" });
		
		if (this.plugin.settings.llmProvider === "openai") {
			providerInfoDiv.createEl("p", { 
				text: "OpenAI API keys can be obtained from: https://platform.openai.com/account/api-keys"
			});
			providerInfoDiv.createEl("p", { 
				text: "This provider uses the GPT-4 model for high-quality test generation and marking."
			});
		} else if (this.plugin.settings.llmProvider === "anthropic") {
			providerInfoDiv.createEl("p", { 
				text: "Anthropic API keys can be obtained from: https://console.anthropic.com/settings/keys"
			});
			providerInfoDiv.createEl("p", { 
				text: "This provider uses Claude models which excel at understanding context and providing helpful feedback."
			});
		} else if (this.plugin.settings.llmProvider === "deepseek") {
			providerInfoDiv.createEl("p", { 
				text: "DeepSeek API keys can be obtained from the DeepSeek website."
			});
			providerInfoDiv.createEl("p", { 
				text: "DeepSeek models provide excellent reasoning capabilities for test generation and marking."
			});
		} else if (this.plugin.settings.llmProvider === "gemini") {
			providerInfoDiv.createEl("p", { 
				text: "Google Gemini API keys can be obtained from Google AI Studio: https://makersuite.google.com/app/apikey"
			});
			providerInfoDiv.createEl("p", { 
				text: "Gemini models from Google provide strong capabilities for understanding your notes and generating relevant tests."
			});
		}
	}
}