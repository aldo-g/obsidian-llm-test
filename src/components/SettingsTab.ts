/*
This file implements the settings tab for the Obsidian RAG Test Plugin.
It allows the user to configure plugin options, including setting the OpenAI API key.
*/

import { App, PluginSettingTab, Setting } from "obsidian";
import type { IndexedNote } from "../models/types";
import type MyPlugin from "../../main";

/**
 * Settings tab for the RAG Test Plugin.
 */
export default class SettingsTab extends PluginSettingTab {
	plugin: MyPlugin;

	/**
	 * Constructs the settings tab.
	 * @param app - The Obsidian application instance.
	 * @param plugin - The main plugin instance.
	 */
	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Renders the settings tab.
	 */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value: string) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("OpenAI API Key")
			.setDesc("Enter your OpenAI API key for test generation.")
			.addText((text) =>
				text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value: string) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
