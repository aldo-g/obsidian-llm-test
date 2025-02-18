/*
Main plugin file for the Obsidian RAG Test Plugin.
Registers a ribbon icon that opens a dashboard view,
registers both the dashboard and a full‑screen question document view,
handles indexing of notes, persists settings (including test document state),
and tracks test documents across sessions.
*/

import { App, Notice, Plugin } from "obsidian";
import TestDashboardView, { VIEW_TYPE as DASHBOARD_VIEW_TYPE } from "./src/components/TestDashboardView";
import QuestionDocumentView, { QUESTION_VIEW_TYPE } from "./src/components/QuestionDocumentView";
import SettingsTab from "./src/components/SettingsTab";

export interface TestStatus {
	testsReady: boolean;
	passed: number;
	total: number;
}

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

export interface TestDocumentState {
	description: string;
	questions: { question: string }[];
	answers: { [key: number]: string };
}

interface MyPluginData {
	settings: MyPluginSettings;
	persistedIndex: IndexedNote[];
	testDocuments: { [filePath: string]: TestDocumentState };
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	indexedNotes: IndexedNote[] = [];
	testDocuments: { [filePath: string]: TestDocumentState } = {};

	async onload() {
		await this.loadSettings();
		console.log("onload: Loaded settings:", this.settings);
		console.log("onload: Loaded testDocuments keys:", Object.keys(this.testDocuments));

		this.registerView(DASHBOARD_VIEW_TYPE, (leaf) =>
			new TestDashboardView(leaf, this.app, this.indexedNotes)
		);
		this.registerView(QUESTION_VIEW_TYPE, (leaf) =>
			new QuestionDocumentView(leaf, this.app, this, {
				description: "",
				questions: []
			})
		);

		this.addRibbonIcon("dice", "Test Dashboard", () => this.openTestDashboard());
		this.addStatusBarItem().setText("RAG Test Plugin Active");

		this.addCommand({
			id: "open-test-dashboard",
			name: "Open Test Dashboard",
			callback: () => {
				this.openTestDashboard();
			},
		});

		this.addSettingTab(new SettingsTab(this.app, this));

		// Example interval log
		this.registerInterval(window.setInterval(() => console.log("Interval log"), 5 * 60 * 1000));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(QUESTION_VIEW_TYPE);
	}

	async loadSettings() {
		const data = (await this.loadData()) as MyPluginData | null;
		if (data) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
			this.indexedNotes = data.persistedIndex || [];
			this.testDocuments = data.testDocuments || {};
			console.log("loadSettings: data loaded. testDocuments keys:", Object.keys(this.testDocuments));
		} else {
			this.settings = DEFAULT_SETTINGS;
			this.indexedNotes = [];
			this.testDocuments = {};
			console.log("loadSettings: no data found, using defaults");
		}
	}

	async saveSettings() {
		const data: MyPluginData = {
			settings: this.settings,
			persistedIndex: this.indexedNotes,
			testDocuments: this.testDocuments
		};
		await this.saveData(data);
		console.log("saveSettings: data saved. testDocuments keys now:", Object.keys(this.testDocuments));
	}

	async indexTestNotes() {
		this.indexedNotes = [];
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
	}

	/**
	 * Called after user typed an answer in the question doc.
	 * Refreshes the dashboard so it can recolor the icon.
	 */
	public markFileAnswered(filePath: string): void {
		console.log(`File marked as answered: ${filePath}`);
		const dashLeaf = this.app.workspace.getLeavesOfType("rag-test-view")[0];
		if (dashLeaf && dashLeaf.view && dashLeaf.view.render) {
			dashLeaf.view.render();
		}
	}

	/**
	 * Opens the question doc for the given filePath (which must exist in testDocuments).
	 */
	public openQuestionDoc(filePath: string): void {
		console.log(`openQuestionDoc: attempting to open test document for ${filePath}`);
		console.log("Available file paths in testDocuments are:", Object.keys(this.testDocuments));

		if (!this.testDocuments[filePath]) {
			new Notice("No tests found for this note. Generate tests first.");
			return;
		}
		const response = this.testDocuments[filePath];

		this.app.workspace.detachLeavesOfType(QUESTION_VIEW_TYPE);
		const leaf = this.app.workspace.getLeaf("tab");

		leaf.setViewState({
			type: QUESTION_VIEW_TYPE,
			active: true
		});
		this.app.workspace.revealLeaf(leaf);

		setTimeout(() => {
			const view = leaf.view as QuestionDocumentView;
			if (view) {
				console.log(`openQuestionDoc: found question doc view for file: ${filePath}. Setting local props`);
				view.filePath = filePath;
				view.description = response.description;
				view.generatedTests = response.questions;
				view.answers = response.answers || {};

				console.log("openQuestionDoc: calling render() with questions len=", view.generatedTests.length);
				view.render();
			} else {
				console.log("openQuestionDoc: question doc view not available.");
			}
		}, 200);
	}
}