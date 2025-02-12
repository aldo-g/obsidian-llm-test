/*
This file is the main plugin file for the Obsidian RAG Test Plugin.
It registers a ribbon icon that, when clicked, opens the dashboard view for selecting notes.
It also registers the full-screen Question Document view and exposes a method to open that view.
It handles indexing of notes, persisting settings, and provides a settings tab for configuration.
*/

import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";
import TestDashboardView, { VIEW_TYPE as DASHBOARD_VIEW_TYPE } from "./src/components/TestDashboardView";
import QuestionDocumentView, { QUESTION_VIEW_TYPE } from "./src/components/QuestionDocumentView";
import SettingsTab from "./src/components/SettingsTab";

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
	apiKey: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: "default",
	apiKey: ""
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
	testDashboardLeaf: WorkspaceLeaf | null = null;

	/**
	 * Called when the plugin is loaded.
	 */
	async onload() {
		await this.loadSettings();
		// Register dashboard view for note selection.
		this.registerView(DASHBOARD_VIEW_TYPE, (leaf: WorkspaceLeaf) => new TestDashboardView(leaf, this.app, this.indexedNotes));
		// Register full-screen question document view.
		this.registerView(QUESTION_VIEW_TYPE, (leaf: WorkspaceLeaf) => new QuestionDocumentView(leaf, this.app, []));
		
		this.addRibbonIcon("dice", "Test Dashboard", (evt: MouseEvent) => {
			this.openTestDashboard();
		});
		this.addStatusBarItem().setText("RAG Test Plugin Active");
		this.addCommand({
			id: "open-test-dashboard",
			name: "Open Test Dashboard",
			callback: () => {
				this.openTestDashboard();
			}
		});
		this.addSettingTab(new SettingsTab(this.app, this));
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			console.log("Document clicked", evt);
		});
		this.registerInterval(window.setInterval(() => console.log("Interval log"), 5 * 60 * 1000));
	}

	/**
	 * Called when the plugin is unloaded.
	 */
	onunload() {
		this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(QUESTION_VIEW_TYPE);
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
	 * Indexes all Markdown files in the vault, extracts test readiness data, and persists the index.
	 */
	async indexTestNotes() {
		this.indexedNotes = [];
		// Scan all Markdown files without filtering by folder.
		const markdownFiles = this.app.vault.getMarkdownFiles();
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
		new Notice(`Indexed ${this.indexedNotes.length} notes`);
	}

	/**
	 * Opens the test dashboard view in the left sidebar.
	 */
	openTestDashboard() {
		this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (!leaf) {
			new Notice("Could not obtain workspace leaf.");
			return;
		}
		leaf.setViewState({
			type: DASHBOARD_VIEW_TYPE,
			active: true
		});
		this.app.workspace.revealLeaf(leaf);
		this.testDashboardLeaf = leaf;
	}

	/**
	 * Opens a full-screen question document view with the provided test questions.
	 * @param questions - An array of test question strings.
	 */
	public openQuestionDocument(questions: string[]): void {
		this.app.workspace.detachLeavesOfType(QUESTION_VIEW_TYPE);
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			new Notice("Could not obtain workspace leaf for question document.");
			return;
		}
		leaf.setViewState({
			type: QUESTION_VIEW_TYPE,
			active: true
		});
		this.app.workspace.revealLeaf(leaf);
		// Instantiate the full-screen view with the questions.
		new QuestionDocumentView(leaf, this.app, questions);
	}
}