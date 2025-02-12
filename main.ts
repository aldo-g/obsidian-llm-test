/*
This file is the main plugin file for the Obsidian RAG Test Plugin.
It registers a ribbon icon that, when clicked, opens the custom sidebar view (Test Dashboard).
It also handles indexing of test notes in the "Test" folder and persisting the index.
*/

import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian';
import TestView, { VIEW_TYPE } from './TestView';

/**
 * Interface for test status.
 */
export interface TestStatus {
	testsReady: boolean;
	passed: number;
	total: number;
}

/**
 * Interface for an indexed note.
 */
export interface IndexedNote {
	filePath: string;
	content: string;
	testStatus: TestStatus;
}

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
};

/**
 * Interface for storing plugin data, including settings and the persisted index.
 */
interface MyPluginData {
	settings: MyPluginSettings;
	persistedIndex: IndexedNote[];
}

/**
 * Main plugin class for the Obsidian RAG Test Plugin.
 */
export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	indexedNotes: IndexedNote[] = [];
	testViewLeaf: WorkspaceLeaf | null = null;

	/**
	 * Called when the plugin is loaded.
	 */
	async onload() {
		await this.loadSettings();
		this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new TestView(leaf, this.app, this.indexedNotes));
		this.addRibbonIcon('dice', 'Test Dashboard', (evt: MouseEvent) => {
			this.openTestDashboard();
		});
		this.addStatusBarItem().setText('RAG Test Plugin Active');
		this.addCommand({
			id: 'open-test-dashboard',
			name: 'Open Test Dashboard',
			callback: () => {
				this.openTestDashboard();
			}
		});
		this.addSettingTab(new SampleSettingTab(this.app, this));
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('Document clicked', evt);
		});
		this.registerInterval(window.setInterval(() => console.log('Interval log'), 5 * 60 * 1000));
	}

	/**
	 * Called when the plugin is unloaded.
	 */
	onunload() {
		if (this.testViewLeaf) {
			this.app.workspace.detachLeavesOfType(VIEW_TYPE);
		}
	}

	/**
	 * Loads plugin settings and the persisted index from disk.
	 */
	async loadSettings() {
		const data = (await this.loadData()) as MyPluginData | null;
		if (data) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
			this.indexedNotes = data.persistedIndex || [];
		} else {
			this.settings = DEFAULT_SETTINGS;
			this.indexedNotes = [];
		}
	}

	/**
	 * Saves plugin settings and the current index to disk.
	 */
	async saveSettings() {
		const data: MyPluginData = {
			settings: this.settings,
			persistedIndex: this.indexedNotes
		};
		await this.saveData(data);
	}

	/**
	 * Indexes Markdown files in the "Test" folder, extracts test readiness data, and persists the index.
	 */
	async indexTestNotes() {
		this.indexedNotes = [];
		const markdownFiles = this.app.vault.getMarkdownFiles().filter((file: TFile) => file.path.startsWith("Test/"));
		for (const file of markdownFiles) {
			const content = await this.app.vault.read(file);
			const testsReady = content.includes("## Test");
			let total = 0;
			let passed = 0;
			if (testsReady) {
				const regex = /- \[( |x)\]/g;
				let match;
				while ((match = regex.exec(content)) !== null) {
					total++;
					if (match[1] === "x") passed++;
				}
			}
			const testStatus = { testsReady, passed, total };
			this.indexedNotes.push({ filePath: file.path, content, testStatus });
			console.log(`Indexed: ${file.path}`);
		}
		await this.saveSettings();
		new Notice(`Indexed ${this.indexedNotes.length} test notes`);
	}

	/**
	 * Opens the test dashboard view in the left sidebar.
	 */
	openTestDashboard() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE);
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (!leaf) {
			new Notice('Could not obtain workspace leaf.');
			return;
		}
		leaf.setViewState({
			type: VIEW_TYPE,
			active: true
		});
		this.app.workspace.revealLeaf(leaf);
		this.testViewLeaf = leaf;
	}
}

/**
 * Settings tab for the RAG Test Plugin.
 */
class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	/**
	 * Constructs the settings tab.
	 * @param app The Obsidian application instance.
	 * @param plugin The plugin instance.
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
			.setName('Setting #1')
			.setDesc("It's a secret")
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value: string) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}