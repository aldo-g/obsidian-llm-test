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
    stylesLoaded = false;

	async onload() {
        // Add plugin styles first
        this.loadStyles();
        
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
        // Remove the custom styles when plugin is disabled
        const styleElement = document.getElementById("obsidian-test-question-styles");
        if (styleElement) {
            styleElement.remove();
        }
        
		this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(QUESTION_VIEW_TYPE);
	}

    /**
     * Loads the custom CSS styles needed for the question view
     */
    loadStyles() {
        // Avoid adding duplicate styles
        if (this.stylesLoaded || document.getElementById("obsidian-test-question-styles")) {
            return;
        }

        // Create style element and add it to the document head
        const styleElement = document.createElement('style');
        styleElement.id = "obsidian-test-question-styles";
        styleElement.textContent = `
/* Test Question View Styles */
.test-document-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: var(--font-text, inherit);
}

.test-description {
  font-style: italic;
  margin-bottom: 2em;
  color: var(--text-muted);
  border-left: 3px solid var(--interactive-accent);
  padding-left: 10px;
  line-height: 1.5;
}

.question-item {
  margin-bottom: 2em;
  padding: 16px;
  border-radius: 8px;
  background-color: var(--background-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: box-shadow 0.3s ease;
}

.question-item:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.question-label {
  display: block;
  font-weight: bold;
  margin-bottom: 0.8em;
  font-size: 1.1em;
}

.question-number {
  display: inline-block;
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
  width: 24px;
  height: 24px;
  text-align: center;
  border-radius: 50%;
  margin-right: 8px;
  font-size: 0.9em;
  line-height: 24px;
}

.answer-input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background-color: var(--background-primary);
  font-family: inherit;
  transition: border 0.2s ease;
}

.answer-input:focus {
  border-color: var(--interactive-accent);
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
}

.answer-input.correct {
  border: 2px solid #4caf50;
  background-color: rgba(76, 175, 80, 0.05);
}

.answer-input.incorrect {
  border: 2px solid #f44336;
  background-color: rgba(244, 67, 54, 0.05);
}

.feedback {
  margin-top: 0.5em;
  font-weight: 500;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 0.9em;
  display: none;
}

.feedback.visible {
  display: block;
}

.feedback.correct {
  color: #2e7d32;
  background-color: rgba(76, 175, 80, 0.1);
}

.feedback.incorrect {
  color: #c62828;
  background-color: rgba(244, 67, 54, 0.1);
}

.test-document-actions {
  margin-top: 2em;
  display: flex;
  justify-content: center;
  gap: 1em;
}

.test-button {
  padding: 8px 16px;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
  border: none;
  font-size: 14px;
}

.test-button:hover {
  transform: translateY(-1px);
}

.test-button:active {
  transform: translateY(1px);
}

.mark-button {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}

.mark-button:hover {
  background-color: var(--interactive-accent-hover);
}

.reset-button {
  background-color: var(--background-modifier-border);
  color: var(--text-normal);
}

.reset-button:hover {
  background-color: var(--background-modifier-border-hover);
}

.score-summary {
  margin-top: 2em;
  padding: 12px;
  border-radius: 6px;
  font-weight: bold;
  text-align: center;
  font-size: 1.1em;
  background-color: var(--background-primary-alt);
  border: 1px solid var(--background-modifier-border);
}

.spinner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.spinner {
  width: 50px;
  height: 50px;
  border: 6px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: var(--interactive-accent);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;

        document.head.appendChild(styleElement);
        this.stylesLoaded = true;
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