import { ItemView, WorkspaceLeaf } from "obsidian";
import type MyPlugin from "../../main";

export const QUESTION_VIEW_TYPE = "question-document-view";

export default class QuestionDocumentView extends ItemView {
	plugin: MyPlugin;
	description: string;
	generatedTests: { question: string }[];
	filePath: string;
	answers: { [key: number]: string };

	constructor(
		leaf: WorkspaceLeaf,
		app: any,
		plugin: MyPlugin,
		state: { description: string; questions: { question: string }[] }
	) {
		super(leaf);
		this.app = app;
		this.plugin = plugin;
		this.description = state.description;
		this.generatedTests = state.questions;
		this.filePath = "";
		this.answers = {};
	}

	getViewType(): string {
		return QUESTION_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (this.filePath) {
			return `Test: ${this.filePath}`;
		}
		return "Generated Test Questions";
	}

	async onOpen(): Promise<void> {
		console.log(`QuestionDocumentView onOpen: filePath='${this.filePath}'`);
		this.render();
	}

	async onClose(): Promise<void> {
		console.log(`QuestionDocumentView closed: ${this.filePath}`);
	}

	render(): void {
		console.log(`QuestionDocumentView render: filePath='${this.filePath}', #questions=${this.generatedTests?.length || 0}`);
		const container = this.containerEl;
		container.empty();

		if (!this.generatedTests || !this.generatedTests.length) {
			console.log("QuestionDocumentView render: no questions found.");
			container.createEl("p", { text: "No test questions available." });
			return;
		}

		const descEl = container.createEl("p", { text: this.description });
		descEl.style.fontStyle = "italic";
		descEl.style.marginBottom = "1em";

		const formEl = container.createEl("form");

		this.generatedTests.forEach((test, index) => {
			const qDiv = formEl.createEl("div", { cls: "question-item" });
			qDiv.style.marginBottom = "1em";

			const label = qDiv.createEl("label", {
				text: `Q${index + 1}: ${test.question}`,
			});
			label.style.display = "block";
			label.style.fontWeight = "bold";

			const input = qDiv.createEl("input", { type: "text" }) as HTMLInputElement;
			input.placeholder = "Type your answer here";
			input.style.width = "100%";
			input.style.marginTop = "0.5em";
			input.dataset.questionIndex = index.toString();

			// Restore previously saved answer
			if (this.answers[index]) {
				input.value = this.answers[index];
			}

			// Save on input
			input.addEventListener("input", () => {
				this.answers[index] = input.value;
				this.saveAnswers();
			});
		});
	}

	saveAnswers(): void {
		if (!this.filePath) {
			console.error("saveAnswers: No file path set.");
			return;
		}
		if (!this.plugin.testDocuments[this.filePath]) {
			this.plugin.testDocuments[this.filePath] = {
				description: this.description,
				questions: this.generatedTests,
				answers: {}
			};
		}
		this.plugin.testDocuments[this.filePath].answers = this.answers;
		this.plugin.saveSettings();
		console.log("saveAnswers: Saved answers for", this.filePath, this.answers);

		this.plugin.markFileAnswered(this.filePath);
	}
}