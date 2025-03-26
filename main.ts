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

export type LLMProvider = "openai" | "anthropic" | "deepseek" | "gemini" | "mistral";

interface ObsidianTestPluginSettings {
	mySetting: string;
	llmProvider: LLMProvider;
	apiKeys: {
		openai: string;
		anthropic: string;
		deepseek: string;
		gemini: string;
		mistral: string;
	};
	models: {
		openai: string;
		anthropic: string;
		deepseek: string;
		gemini: string;
		mistral: string;
	};
}

const DEFAULT_SETTINGS: ObsidianTestPluginSettings = {
	mySetting: "default",
	llmProvider: "openai",
	apiKeys: {
		openai: "",
		anthropic: "",
		deepseek: "",
		gemini: "",
		mistral: ""
	},
	models: {
		openai: "gpt-4",
		anthropic: "claude-3-opus-20240229",
		deepseek: "deepseek-chat",
		gemini: "gemini-pro",
		mistral: "mistral-medium"
	}
};

export interface TestDocumentState {
	description: string;
	questions: GeneratedTest[];
	answers: { [key: number]: string };
	score?: number;
	markResults?: Array<{ marks: number; maxMarks: number; feedback: string } | null>;
}

interface ObsidianTestPluginData {
	settings: ObsidianTestPluginSettings;
	persistedIndex: IndexedNote[];
	testDocuments: { [filePath: string]: TestDocumentState };
}

export default class ObsidianTestPlugin extends Plugin {
	settings: ObsidianTestPluginSettings;
	indexedNotes: IndexedNote[] = [];
	testDocuments: { [filePath: string]: TestDocumentState } = {};

	async onload() {
		// Load CSS
		await this.loadStyles();
		
		await this.loadSettings();
		this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new TestDashboardView(leaf, this.app, this.indexedNotes, this));
		this.registerView(QUESTION_VIEW_TYPE, (leaf) => new QuestionDocumentView(leaf, this.app, this, { description: "", questions: [] }));
		
		this.addRibbonIcon("flask-conical", "Test dashboard", () => this.openTestDashboard());
		
		this.addCommand({
			id: "open-test-dashboard",
			name: "Open test dashboard",
			callback: () => {
				this.openTestDashboard();
			},
		});
	
		this.addSettingTab(new SettingsTab(this.app, this));
		this.registerInterval(window.setInterval(() => {}, 5 * 60 * 1000));
	}

	onunload() {
		// Do not detach leaves in onunload - this is considered an antipattern
	}

    async loadStyles() {
        // Load styles directly from the CSS file via Obsidian API
        await this.loadData();
    }

	async loadSettings() {
		const data = (await this.loadData()) as ObsidianTestPluginData | null;
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
		const data: ObsidianTestPluginData = {
			settings: this.settings,
			persistedIndex: this.indexedNotes,
			testDocuments: this.testDocuments
		};
		await this.saveData(data);
	}

	async indexTestNotes() {
		this.indexedNotes = [];
		const markdownFiles = this.app.vault.getFiles();
	
		for (const file of markdownFiles) {
			if (!file.path.endsWith(".md")) continue;
			const content = await this.app.vault.read(file);
			
			this.indexedNotes.push({
				filePath: file.path,
				content,
				testStatus: { testsReady: true, passed: 0, total: 0 }
			});
		}
	
		await this.saveSettings();
	
		const dashLeaf = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
		if (dashLeaf?.view instanceof TestDashboardView) {
			dashLeaf.view.pluginData = this.indexedNotes;
			dashLeaf.view.render();
		}
	
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

	public markFileAnswered(filePath: string): void {
		const dashLeaf = this.app.workspace.getLeavesOfType("rag-test-view")[0];
		if (dashLeaf?.view instanceof TestDashboardView) {
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
			
			if (response.markResults && response.markResults.length > 0) {
				view.markResults = response.markResults;
				
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