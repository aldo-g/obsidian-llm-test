import { Notice, Plugin } from "obsidian";
import TestDashboardView, { VIEW_TYPE as DASHBOARD_VIEW_TYPE } from "./src/ui/DashboardView";
import QuestionDocumentView, { QUESTION_VIEW_TYPE } from "./src/ui/QuestionView";
import SettingsTab from "./src/ui/SettingsTab";
import { GeneratedTest } from "src/models/types";

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

export type LLMProvider = "openai" | "anthropic" | "deepseek" | "gemini";

interface MyPluginSettings {
	mySetting: string;
	llmProvider: LLMProvider;
	apiKeys: {
		openai: string;
		anthropic: string;
		deepseek: string;
		gemini: string;
	};
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: "default",
	llmProvider: "openai",
	apiKeys: {
		openai: "",
		anthropic: "",
		deepseek: "",
		gemini: ""
	}
};

export interface TestDocumentState {
	description: string;
	questions: GeneratedTest[];
	answers: { [key: number]: string };
	score?: number;
	// Add markResults array to store feedback for each question
	markResults?: Array<{ marks: number; maxMarks: number; feedback: string } | null>;
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
		this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new TestDashboardView(leaf, this.app, this.indexedNotes, this));
		this.registerView(QUESTION_VIEW_TYPE, (leaf) => new QuestionDocumentView(leaf, this.app, this, { description: "", questions: [] }));
		
		// Add Test Dashboard button to ribbon
		this.addRibbonIcon("flask-conical", "Test Dashboard", () => this.openTestDashboard());
		
		// Add status bar item
		this.addStatusBarItem().setText("RAG Test Plugin Active");
		
		// Add Test Dashboard command
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
        const styleElement = document.getElementById("obsidian-test-plugin-styles");
        if (styleElement) {
            styleElement.remove();
        }
        
		this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(QUESTION_VIEW_TYPE);
	}

    /**
     * Loads the custom CSS styles needed for the test views
     */
    loadStyles() {
        // Avoid adding duplicate styles
        if (this.stylesLoaded || document.getElementById("obsidian-test-plugin-styles")) {
            return;
        }

        // Create style element and add it to the document head
        const styleElement = document.createElement('style');
        styleElement.id = "obsidian-test-plugin-styles";
        styleElement.textContent = `
/* Common Styles for Test Plugin */
.test-dashboard-container,
.test-document-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: var(--font-text, inherit);
}

/* Dashboard Specific Styles */
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.dashboard-title {
  margin: 0;
  font-size: 1.5em;
  font-weight: bold;
  color: var(--text-normal);
}

.dashboard-actions {
  display: flex;
  gap: 8px;
}

.file-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 10px;
  margin-bottom: 8px;
  border-radius: 6px;
  background-color: var(--background-secondary);
  transition: background-color 0.2s ease;
}

.file-item:hover {
  background-color: var(--background-secondary-alt);
}

.file-checkbox {
  margin-right: 10px;
}

.file-path {
  flex: 1;
  margin-right: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-icon button {
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.status-icon button:hover {
  background-color: var(--background-modifier-hover);
}

.status-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-on-accent);
  min-width: 60px;
  transition: all 0.2s ease;
}

.status-badge.none {
  background-color: var(--background-modifier-border);
  color: var(--text-muted);
}

.status-badge.in-progress {
  background-color: #f59e0b; /* Amber color */
  color: #fff;
}

.status-badge.partial {
  background: linear-gradient(90deg, #f59e0b 50%, #84cc16 50%);
  color: #fff;
}

.status-badge.complete {
  background-color: #22c55e; /* Green color */
  color: #fff;
}

.badge-icon {
  margin-right: 6px;
}

.progress-ring {
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
  margin-right: 6px;
}

.progress-ring-circle {
  stroke: var(--background-primary);
  stroke-width: 2;
  fill: transparent;
}

.progress-ring-progress {
  stroke-linecap: round;
  stroke-width: 2;
  fill: transparent;
  transition: stroke-dashoffset 0.3s ease;
}

.dashboard-button,
.test-button {
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
  border: none;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dashboard-button:hover,
.test-button:hover {
  transform: translateY(-1px);
}

.dashboard-button:active,
.test-button:active {
  transform: translateY(1px);
}

.dashboard-button.primary,
.mark-button {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}

.dashboard-button.primary:hover,
.mark-button:hover {
  background-color: var(--interactive-accent-hover);
}

.dashboard-button.secondary,
.reset-button {
  background-color: var(--background-modifier-border);
  color: var(--text-normal);
}

.dashboard-button.secondary:hover,
.reset-button:hover {
  background-color: var(--background-modifier-border-hover);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

/* Question Document View Styles */
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
  min-height: 60px; /* Minimum height for textarea */
  resize: vertical; /* Allow vertical resizing */
  line-height: 1.5; /* Better line spacing */
  overflow-y: hidden; /* Hide scrollbar when auto-expanding */
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

.spinner-overlay-question {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  pointer-events: all; /* Capture clicks but allow scrolling */
}

.spinner-fixed {
  position: fixed;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  border-radius: 10px;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: var(--interactive-accent);
  animation: spin 1s linear infinite;
  margin: 0 auto;
}

.loading-text {
  margin-top: 16px;
  color: white;
  font-size: 16px;
  font-weight: 500;
  text-align: center;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  background-color: rgba(220, 38, 38, 0.1);
  color: #dc2626;
  padding: 12px 16px;
  margin-bottom: 20px;
  border-radius: 6px;
  border: 1px solid #dc2626;
  position: relative;
}

.error-message h3 {
  margin: 0 0 8px 0;
  color: #dc2626;
  font-size: 1.1em;
  font-weight: 600;
}

.error-message p {
  margin: 0 0 8px 0;
  font-size: 0.95em;
}

.error-message p:last-child {
  margin-bottom: 0;
}

.error-message .suggestion {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(220, 38, 38, 0.3);
  font-style: italic;
}

/* Partial mark styling */
.answer-input.partial {
  border: 2px solid #f59e0b; /* Amber color for partial marks */
  background-color: rgba(245, 158, 11, 0.05);
}

.feedback.partial {
  color: #92400e; /* Darker amber for text */
  background-color: rgba(245, 158, 11, 0.1);
}

/* Marks display styling */
.marks-display {
  font-weight: 600;
  margin-bottom: 6px;
  padding: 2px 8px;
  display: inline-block;
  border-radius: 4px;
}

.feedback.correct .marks-display {
  background-color: rgba(76, 175, 80, 0.2);
}

.feedback.partial .marks-display {
  background-color: rgba(245, 158, 11, 0.2);
}

.feedback.incorrect .marks-display {
  background-color: rgba(244, 67, 54, 0.2);
}

.feedback-text {
  margin-top: 4px;
}

.file-tree-container {
  margin-top: 16px;
  max-height: calc(100vh - 150px);
  overflow-y: auto;
  border-radius: 8px;
  background-color: var(--background-secondary);
}

.file-tree {
  padding: 8px 0;
}

.file-tree-item {
  overflow: hidden;
}

.folder-row, 
.file-row {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 4px;
  margin: 2px 8px;
  transition: background-color 0.2s ease;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-row:hover,
.file-row:hover {
  background-color: var(--background-modifier-hover);
}

.folder-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: 4px;
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.folder-toggle.expanded svg {
  transform: rotate(0deg);
}

.folder-toggle.collapsed svg {
  transform: rotate(-90deg);
}

.folder-icon, 
.file-icon {
  display: flex;
  align-items: center;
  margin-right: 8px;
  color: var(--text-muted);
}

.folder-name, 
.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-checkbox {
  margin-right: 8px;
}

/* Make the status badges more compact for file tree view */
.file-row .status-badge {
  font-size: 11px;
  padding: 2px 6px;
  margin-left: 8px;
  min-width: 50px;
  display: flex;
  align-items: center;
}

.file-row .badge-icon {
  width: 12px;
  height: 12px;
}

/* Folder highlight when selected */
.folder-row.active {
  background-color: var(--background-modifier-active-hover);
  font-weight: 600;
}

/* Smooth transitions for folder expand/collapse */
.folder-children {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0.5; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.mark-all-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 10;
}

.mark-all-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.2s ease;
  border-radius: 6px;
}

.mark-all-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.mark-all-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: var(--background-primary);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}


.mark-all-button .spinner {
  width: 14px;
  height: 14px;
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
        
        return this.indexedNotes;
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
			
			// Also pass the existing mark results if available
			if (response.markResults && response.markResults.length > 0) {
				view.markResults = response.markResults;
				
				// If there's a score, also set the summary text
				if (typeof response.score === "number") {
				const markResults = response.markResults || [];
				let totalEarnedMarks = 0;
				let totalPossibleMarks = 0;
				
				markResults.forEach(result => {
					if (result) {
					totalEarnedMarks += result.marks;
					totalPossibleMarks += result.maxMarks;
					}
				});
				
				view.scoreSummary = `You scored ${totalEarnedMarks} / ${totalPossibleMarks} marks (${response.score.toFixed(1)}%)`;
				}
			}
			
			view.render();
			}
		}, 200);
	}
}