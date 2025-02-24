import { Notice, Plugin } from "obsidian";
import TestDashboardView, { VIEW_TYPE as DASHBOARD_VIEW_TYPE } from "./src/ui/DashboardView";
import QuestionDocumentView, { QUESTION_VIEW_TYPE } from "./src/ui/QuestionView";
import SettingsTab from "./src/ui/SettingsTab";

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
	score?: number;
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
		this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new TestDashboardView(leaf, this.app, this.indexedNotes));
		this.registerView(QUESTION_VIEW_TYPE, (leaf) => new QuestionDocumentView(leaf, this.app, this, { description: "", questions: [] }));
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
		this.registerInterval(window.setInterval(() => {}, 5 * 60 * 1000));
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
		} else {
			this.settings = DEFAULT_SETTINGS;
			this.indexedNotes = [];
			this.testDocuments = {};
		}
	}

	async saveSettings() {
		const data: MyPluginData = {
			settings: this.settings,
			persistedIndex: this.indexedNotes,
			testDocuments: this.testDocuments
		};
		await this.saveData(data);
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
		leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	public markFileAnswered(filePath: string): void {
		const dashLeaf = this.app.workspace.getLeavesOfType("rag-test-view")[0];
		if (dashLeaf.view instanceof TestDashboardView) {
			dashLeaf.view.render();
		}
	}

	public openQuestionDoc(filePath: string): void {
		if (!this.testDocuments[filePath]) {
			new Notice("No tests found for this note. Generate tests first.");
			return;
		}
		const response = this.testDocuments[filePath];
		this.app.workspace.detachLeavesOfType(QUESTION_VIEW_TYPE);
		const leaf = this.app.workspace.getLeaf("tab");
		leaf.setViewState({ type: QUESTION_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
		setTimeout(() => {
			const view = leaf.view as QuestionDocumentView;
			if (view) {
				view.filePath = filePath;
				view.description = response.description;
				view.generatedTests = response.questions;
				view.answers = response.answers || {};
				view.render();
			}
		}, 200);
	}
}