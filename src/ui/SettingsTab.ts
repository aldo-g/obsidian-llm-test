import { App, PluginSettingTab, Setting, DropdownComponent, Notice } from "obsidian";
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
					.addOption("deepseek", "DeepSeek")
					.addOption("gemini", "Google (Gemini)")
					.addOption("mistral", "Mistral AI")
					.addOption("ollama", "Ollama (Local)")
					.setValue(this.plugin.settings.llmProvider === "anthropic" ? "openai" : this.plugin.settings.llmProvider)
					.onChange(async (value: LLMProvider) => {
						this.plugin.settings.llmProvider = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});
		
		// OpenAI Settings
		if (this.plugin.settings.llmProvider === "openai") {
			// Model selection
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
				
			// API Key
			new Setting(containerEl)
				.setName("OpenAI API key")
				.setDesc("Enter your OpenAI API key for test generation and marking")
				.addText((text) =>
					text
						.setPlaceholder("sk-...")
						.setValue(this.plugin.settings.apiKeys.openai)
						.inputEl.type = "password" // Make this a password field
				)
				.addExtraButton((button) => {
					button
						.setIcon("eye")
						.setTooltip("Toggle visibility")
						.onClick(() => {
							const inputEl = button.extraSettingsEl.parentElement?.querySelector("input");
							if (inputEl) {
								if (inputEl.type === "password") {
									inputEl.type = "text";
									button.setIcon("eye-off");
								} else {
									inputEl.type = "password";
									button.setIcon("eye");
								}
							}
						});
				})
				.addExtraButton((button) => {
					button
						.setIcon("save")
						.setTooltip("Save")
						.onClick(async () => {
							const inputEl = button.extraSettingsEl.parentElement?.querySelector("input");
							if (inputEl) {
								this.plugin.settings.apiKeys.openai = inputEl.value;
								await this.plugin.saveSettings();
								new Notice("OpenAI API key saved");
							}
						});
				});
		}
		
		// DeepSeek Settings
		if (this.plugin.settings.llmProvider === "deepseek") {
			// Model selection
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
				
			// API Key
			new Setting(containerEl)
				.setName("DeepSeek API key")
				.setDesc("Enter your DeepSeek API key")
				.addText((text) =>
					text
						.setPlaceholder("sk-...")
						.setValue(this.plugin.settings.apiKeys.deepseek)
						.inputEl.type = "password" // Make this a password field
				)
				.addExtraButton((button) => {
					button
						.setIcon("eye")
						.setTooltip("Toggle visibility")
						.onClick(() => {
							const inputEl = button.extraSettingsEl.parentElement?.querySelector("input");
							if (inputEl) {
								if (inputEl.type === "password") {
									inputEl.type = "text";
									button.setIcon("eye-off");
								} else {
									inputEl.type = "password";
									button.setIcon("eye");
								}
							}
						});
				})
				.addExtraButton((button) => {
					button
						.setIcon("save")
						.setTooltip("Save")
						.onClick(async () => {
							const inputEl = button.extraSettingsEl.parentElement?.querySelector("input");
							if (inputEl) {
								this.plugin.settings.apiKeys.deepseek = inputEl.value;
								await this.plugin.saveSettings();
								new Notice("DeepSeek API key saved");
							}
						});
				});
		}
		
		// Gemini Settings
		if (this.plugin.settings.llmProvider === "gemini") {
			// Model selection
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
				
			// API Key
			new Setting(containerEl)
				.setName("Google Gemini API key")
				.setDesc("Enter your Google API key for Gemini")
				.addText((text) =>
					text
						.setPlaceholder("API key...")
						.setValue(this.plugin.settings.apiKeys.gemini)
						.inputEl.type = "password" // Make this a password field
				)
				.addExtraButton((button) => {
					button
						.setIcon("eye")
						.setTooltip("Toggle visibility")
						.onClick(() => {
							const inputEl = button.extraSettingsEl.parentElement?.querySelector("input");
							if (inputEl) {
								if (inputEl.type === "password") {
									inputEl.type = "text";
									button.setIcon("eye-off");
								} else {
									inputEl.type = "password";
									button.setIcon("eye");
								}
							}
						});
				})
				.addExtraButton((button) => {
					button
						.setIcon("save")
						.setTooltip("Save")
						.onClick(async () => {
							const inputEl = button.extraSettingsEl.parentElement?.querySelector("input");
							if (inputEl) {
								this.plugin.settings.apiKeys.gemini = inputEl.value;
								await this.plugin.saveSettings();
								new Notice("Gemini API key saved");
							}
						});
				});
		}
		
		// Mistral Settings
		if (this.plugin.settings.llmProvider === "mistral") {
			// Model selection
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
				
			// API Key
			new Setting(containerEl)
				.setName("Mistral API key")
				.setDesc("Enter your Mistral API key")
				.addText((text) =>
					text
						.setPlaceholder("...")
						.setValue(this.plugin.settings.apiKeys.mistral)
						.inputEl.type = "password" // Make this a password field
				)
				.addExtraButton((button) => {
					button
						.setIcon("eye")
						.setTooltip("Toggle visibility")
						.onClick(() => {
							const inputEl = button.extraSettingsEl.parentElement?.querySelector("input");
							if (inputEl) {
								if (inputEl.type === "password") {
									inputEl.type = "text";
									button.setIcon("eye-off");
								} else {
									inputEl.type = "password";
									button.setIcon("eye");
								}
							}
						});
				})
				.addExtraButton((button) => {
					button
						.setIcon("save")
						.setTooltip("Save")
						.onClick(async () => {
							const inputEl = button.extraSettingsEl.parentElement?.querySelector("input");
							if (inputEl) {
								this.plugin.settings.apiKeys.mistral = inputEl.value;
								await this.plugin.saveSettings();
								new Notice("Mistral API key saved");
							}
						});
				});
		}

		// Ollama Settings
		if (this.plugin.settings.llmProvider === "ollama") {
			// Ollama Server URL
			new Setting(containerEl)
				.setName("Ollama server URL")
				.setDesc("Enter the URL of your Ollama server")
				.addText((text) =>
					text
						.setPlaceholder("http://localhost:11434")
						.setValue(this.plugin.settings.ollamaSettings?.url || "http://localhost:11434")
						.onChange(async (value) => {
							if (!this.plugin.settings.ollamaSettings) {
								this.plugin.settings.ollamaSettings = { url: value };
							} else {
								this.plugin.settings.ollamaSettings.url = value;
							}
							await this.plugin.saveSettings();
						})
				);
			
			// Model selection
			new Setting(containerEl)
				.setName("Ollama model")
				.setDesc("Enter the name of the Ollama model to use")
				.addText((text) =>
					text
						.setPlaceholder("llama3")
						.setValue(this.plugin.settings.models.ollama || "llama3")
						.onChange(async (value) => {
							this.plugin.settings.models.ollama = value;
							await this.plugin.saveSettings();
						})
				);
			
			// Add information about Ollama models
			const providerInfoDiv = containerEl.createDiv({ cls: "provider-info" });
			providerInfoDiv.createEl("p", { 
				text: "Ollama lets you run LLMs locally. Make sure Ollama is installed and running before using this option."
			});
			providerInfoDiv.createEl("p", { 
				text: "Download Ollama from: https://ollama.com/"
			});
			providerInfoDiv.createEl("p", { 
				text: "Common models: llama3, mistral, gemma, codellama, llama3:8b, etc."
			});
			providerInfoDiv.createEl("p", { 
				text: "Run 'ollama pull [model]' in your terminal to download models before using them with this plugin."
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
				text: "WARNING: Mistral is currently not effective at marking answers"
			});
			providerInfoDiv.createEl("p", { 
				text: "Mistral API keys can be obtained from: https://console.mistral.ai/api-keys/"
			});
			providerInfoDiv.createEl("p", { 
				text: "Mistral offers several model sizes with different capabilities and pricing. Mistral Medium provides a good balance of performance and cost."
			});
		}
	}
}