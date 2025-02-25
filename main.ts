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
		
		// 🔄 Add a refresh button to the sidebar
		this.addRibbonIcon("refresh-cw", "Refresh Test Index", async () => {
			new Notice("🔄 Refreshing test index...");
			await this.indexTestNotes();
			new Notice("✅ Test index refreshed!");
		});
	
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

	/**
	 * Index all markdown files in the vault. For each file, we count any checklist items
	 * (- [ ] or - [x]) to determine total/passed and set testsReady=true if total>0.
	 */
	async indexTestNotes() {
		this.indexedNotes = [];
		console.log("🔍 Discovering files...");
	
		const markdownFiles = this.app.vault.getFiles();
		console.log(`📂 Found ${markdownFiles.length} markdown files.`);
	
		for (const file of markdownFiles) {
			if (!file.path.endsWith(".md")) continue;
	
			console.log(`📄 Indexing file: ${file.path}`);
			const content = await this.app.vault.read(file);
			
			this.indexedNotes.push({
				filePath: file.path,
				content,
				testStatus: { testsReady: true, passed: 0, total: 0 }
			});
		}
	
		await this.saveSettings();
	
		// ✅ Force Test View to refresh
		const dashLeaf = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
		if (dashLeaf?.view instanceof TestDashboardView) {
			dashLeaf.view.pluginData = this.indexedNotes;
			dashLeaf.view.render();
		}
	
		console.log(`✅ Indexed ${this.indexedNotes.length} notes.`);
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

	/**
	 * Called after the user types an answer so the dashboard's icons can be updated.
	 */
	public markFileAnswered(filePath: string): void {
		const dashLeaf = this.app.workspace.getLeavesOfType("rag-test-view")[0];
		if (dashLeaf?.view instanceof TestDashboardView) {
			dashLeaf.view.render();
		}
	}

	/**
	 * Opens the question doc for a specific note. Must already have testDocuments data for that path.
	 */
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