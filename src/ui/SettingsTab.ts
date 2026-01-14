import { App, PluginSettingTab, Setting, DropdownComponent, Notice } from "obsidian";
import type MyPlugin from "../../main";
import type { LLMProvider } from "../../main";
import { fetchProviderModels, fetchCommunityModels } from "../services/llm";

export default class SettingsTab extends PluginSettingTab {
	plugin: MyPlugin;
	fetchedModels: Record<string, Array<{ id: string; name: string }>> = {};
	modelFilter: string = "";

	static readonly CORE_MODELS: Record<string, Array<{ id: string; name: string }>> = {
		openai: [
			{ id: "gpt-4o", name: "GPT-4o (Latest)" },
			{ id: "gpt-4o-2024-08-06", name: "GPT-4o (2024-08-06)" },
			{ id: "gpt-4o-2024-05-13", name: "GPT-4o (2024-05-13)" },
			{ id: "gpt-4o-mini", name: "GPT-4o Mini" },
			{ id: "o1-preview", name: "o1 Preview" },
			{ id: "o1-mini", name: "o1 Mini" },
			{ id: "o3-mini", name: "o3 Mini" },
			{ id: "gpt-4-turbo", name: "GPT-4 Turbo" },
			{ id: "gpt-4", name: "GPT-4" },
			{ id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" }
		],
		anthropic: [
			{ id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet (Latest)" },
			{ id: "claude-3-5-sonnet-20240620", name: "Claude 3.5 Sonnet (2024-06-20)" },
			{ id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
			{ id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
			{ id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" }
		],
		deepseek: [
			{ id: "deepseek-chat", name: "DeepSeek Chat (DeepSeek-V3)" },
			{ id: "deepseek-coder", name: "DeepSeek Coder" }
		],
		gemini: [
			{ id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
			{ id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
			{ id: "gemini-1.5-flash-8b", name: "Gemini 1.5 Flash-8B" },
			{ id: "gemini-1.0-pro", name: "Gemini 1.0 Pro" }
		],
		mistral: [
			{ id: "mistral-large-latest", name: "Mistral Large (Latest)" },
			{ id: "mistral-medium-latest", name: "Mistral Medium (Latest)" },
			{ id: "mistral-small-latest", name: "Mistral Small (Latest)" },
			{ id: "codestral-latest", name: "Codestral" },
			{ id: "pixtral-12b-2409", name: "Pixtral 12B" }
		]
	};

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

		// Cloud Provider Model Settings
		if (["openai", "anthropic", "deepseek", "gemini", "mistral"].includes(this.plugin.settings.llmProvider)) {
			const provider = this.plugin.settings.llmProvider;
			const apiKey = this.plugin.settings.apiKeys[provider];

			// Model Filter
			new Setting(containerEl)
				.setName("Filter models")
				.setDesc("Type to filter the available models list")
				.addSearch((search) => {
					search
						.setPlaceholder("Filter models...")
						.setValue(this.modelFilter)
						.onChange((value) => {
							this.modelFilter = value.toLowerCase();
							this.display();
						});
				})
				.addExtraButton((button) => {
					button
						.setIcon("x-circle")
						.setTooltip("Clear filter")
						.onClick(() => {
							this.modelFilter = "";
							this.display();
						});
				});

			// Model selection
			const modelSetting = new Setting(containerEl)
				.setName(`${provider.charAt(0).toUpperCase() + provider.slice(1)} model`)
				.setDesc(`Select which ${provider} model to use`);

			modelSetting.addDropdown(async (dropdown: DropdownComponent) => {
				const currentModel = this.plugin.settings.models[provider];

				// Combined list: defaults + any newly fetched models
				const coreModels = SettingsTab.CORE_MODELS[provider] || [];
				const fetched = this.fetchedModels[provider] || [];

				// Create a unique list of models
				const modelMap = new Map<string, string>();
				coreModels.forEach(m => modelMap.set(m.id, m.name));
				fetched.forEach(m => modelMap.set(m.id, m.name));
				if (currentModel && !modelMap.has(currentModel)) {
					modelMap.set(currentModel, currentModel);
				}

				// Apply filter
				let visibleModelsCount = 0;
				modelMap.forEach((name, id) => {
					if (!this.modelFilter || id.toLowerCase().includes(this.modelFilter) || name.toLowerCase().includes(this.modelFilter)) {
						dropdown.addOption(id, name);
						visibleModelsCount++;
					}
				});

				if (visibleModelsCount === 0 && this.modelFilter) {
					dropdown.addOption("", "No models match filter");
					dropdown.setDisabled(true);
				} else {
					dropdown.setDisabled(false);
					dropdown.setValue(currentModel);
				}

				// Auto-fetch in background if we have an API key and haven't fetched yet
				if (fetched.length === 0 && apiKey) {
					fetchProviderModels(provider, apiKey).then(newModels => {
						if (newModels && newModels.length > 0) {
							this.fetchedModels[provider] = newModels;
							// We don't call this.display() here to avoid infinite loops, 
							// but the next time they open the tab it will be populated.
						}
					});
				}

				dropdown.onChange(async (value: string) => {
					this.plugin.settings.models[provider] = value;
					await this.plugin.saveSettings();
				});
			});

			modelSetting.addExtraButton(button => {
				button.setIcon("refresh-cw")
					.setTooltip("Refresh models list")
					.onClick(async () => {
						if (provider === "ollama") {
							new Notice(`Fetching local models from Ollama...`);
							const models = await fetchProviderModels(provider, "", this.plugin.settings.ollamaSettings?.url);
							if (models.length > 0) {
								this.fetchedModels[provider] = models;
								this.display();
								new Notice(`Updated models from Ollama`);
							} else {
								new Notice(`Could not connect to Ollama. Check your URL.`);
							}
							return;
						}

						if (!apiKey) {
							new Notice(`Fetching latest community models list...`);
							const models = await fetchCommunityModels(provider);
							if (models.length > 0) {
								this.fetchedModels[provider] = models;
								this.display();
								new Notice(`Updated with community model list`);
							} else {
								new Notice(`Could not fetch community list. Enter an API key to fetch directly from ${provider}.`);
							}
							return;
						}

						new Notice(`Fetching live models from ${provider}...`);
						const models = await fetchProviderModels(provider, apiKey);
						if (models.length > 0) {
							this.fetchedModels[provider] = models;
							this.display();
							new Notice(`Updated model list from ${provider}`);
						} else {
							new Notice(`Failed to fetch models from ${provider}. Check your API key.`);
						}
					});
			});

			// API Key
			new Setting(containerEl)
				.setName(`${provider.charAt(0).toUpperCase() + provider.slice(1)} API key`)
				.setDesc(`Enter your ${provider} API key`)
				.addText((text) =>
					text
						.setPlaceholder("sk-...")
						.setValue(apiKey)
						.inputEl.type = "password"
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
								this.plugin.settings.apiKeys[provider] = inputEl.value;
								await this.plugin.saveSettings();
								new Notice(`${provider.charAt(0).toUpperCase() + provider.slice(1)} API key saved`);
								this.display(); // Refresh to trigger model fetch
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