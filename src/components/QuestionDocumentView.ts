import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type MyPlugin from "../../main";
import { markTestAnswers } from "../services/llm";

export const QUESTION_VIEW_TYPE = "question-document-view";

export default class QuestionDocumentView extends ItemView {
	plugin: MyPlugin;
	description: string;
	generatedTests: { question: string }[];
	filePath: string;
	answers: { [key: number]: string };

	/**
	 * markResults => For each question i, we store { correct: boolean, feedback: string } after LLM marking.
	 * If null => not yet marked. This is cleared if we “Reset.”
	 */
	markResults: Array<{ correct: boolean; feedback: string } | null> = [];

	/**
	 * We also keep track of the final score after marking. E.g. "You scored X% (Y / Z correct)."
	 */
	scoreSummary: string = "";

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
		return this.filePath
			? `Test: ${this.filePath}`
			: "Generated Test Questions";
	}

	async onOpen(): Promise<void> {
		console.log(`QuestionDocumentView onOpen: filePath='${this.filePath}'`);
		this.render();
	}

	async onClose(): Promise<void> {
		console.log(`QuestionDocumentView closed: ${this.filePath}`);
	}

	render(): void {
		console.log(
			`QuestionDocumentView render: filePath='${this.filePath}', #questions=${this.generatedTests?.length || 0}`
		);

		const container = this.containerEl;
		container.empty();

		// Scrolling
		container.style.overflowY = "auto";
		container.style.maxHeight = "calc(100vh - 100px)";

		if (!this.generatedTests || !this.generatedTests.length) {
			container.createEl("p", { text: "No test questions available." });
			return;
		}

		// Show description
		const descEl = container.createEl("p", { text: this.description });
		descEl.style.fontStyle = "italic";
		descEl.style.marginBottom = "1em";

		// Create a form for the Q&A
		const formEl = container.createEl("form");

		this.generatedTests.forEach((test, index) => {
			const questionDiv = formEl.createEl("div", { cls: "question-item" });
			questionDiv.style.marginBottom = "1em";

			const label = questionDiv.createEl("label", {
				text: `Q${index + 1}: ${test.question}`
			});
			label.style.display = "block";
			label.style.fontWeight = "bold";

			// The user’s typed answer
			const input = questionDiv.createEl("input", { type: "text" }) as HTMLInputElement;
			input.placeholder = "Type your answer here";
			input.style.width = "100%";
			input.style.marginTop = "0.5em";

			if (this.answers[index]) {
				input.value = this.answers[index];
			}

			let borderColor = "";
			let feedbackColor = "";
			let feedbackText = "";

			// Only color if we have a marking result
			const result = this.markResults[index];
			if (result) {
				// If markResults is non-null, we have a boolean correct + feedback
				if (result.correct === true) {
					borderColor = "green";
					feedbackColor = "green";
				} else {
					borderColor = "red";
					feedbackColor = "red";
				}
				feedbackText = result.feedback;
			}
			if (borderColor) {
				input.style.border = `2px solid ${borderColor}`;
			} else {
				input.style.border = "";
			}

			input.addEventListener("input", () => {
				this.answers[index] = input.value;
				this.saveAnswers();
			});

			// Feedback paragraph
			const feedbackEl = questionDiv.createEl("p");
			feedbackEl.style.marginTop = "0.25em";
			feedbackEl.style.color = feedbackColor;
			feedbackEl.style.fontWeight = feedbackText ? "bold" : "normal";
			feedbackEl.textContent = feedbackText;
		});

		// Container for Mark/Reset buttons
		const buttonRow = formEl.createEl("div", { cls: "test-document-actions" });
		buttonRow.style.marginTop = "1em";
		buttonRow.style.display = "flex";
		buttonRow.style.gap = "1em";

		// “Mark” button
		const markButton = buttonRow.createEl("button", { text: "Mark" });
		markButton.type = "button";
		markButton.addEventListener("click", async () => {
			await this.handleMarkButtonClick();
		});

		// “Reset” button
		const resetButton = buttonRow.createEl("button", { text: "Reset" });
		resetButton.type = "button";
		resetButton.addEventListener("click", () => {
			this.handleResetButtonClick();
		});

		// A place to display the final score summary after marking
		const scoreEl = formEl.createEl("p", { text: this.scoreSummary });
		scoreEl.style.marginTop = "1em";
		scoreEl.style.fontWeight = "bold";

		container.appendChild(formEl);
	}

	/**
	 * Called when user clicks “Mark”:
	 * 1. Retrieve note content
	 * 2. Build Q&A
	 * 3. Call markTestAnswers
	 * 4. Store results => color-coded highlight
	 * 5. Compute overall score => show a summary
	 */
	private async handleMarkButtonClick(): Promise<void> {
		if (!this.filePath) {
			new Notice("No file path found for this test document.");
			return;
		}

		const indexedNote = this.plugin.indexedNotes.find(n => n.filePath === this.filePath);
		if (!indexedNote) {
			new Notice("No indexed content found for this file. Cannot mark answers.");
			return;
		}
		const noteContent = indexedNote.content;

		const qnaPairs: { question: string; answer: string }[] = [];
		this.generatedTests.forEach((test, idx) => {
			qnaPairs.push({
				question: test.question,
				answer: this.answers[idx] || ""
			});
		});

		const apiKey = this.plugin.settings.apiKey;
		if (!apiKey) {
			new Notice("OpenAI API key missing. Please set it in plugin settings.");
			return;
		}

		new Notice("Marking in progress...");
		try {
			const feedbackArray = await markTestAnswers(noteContent, qnaPairs, apiKey);
			console.log("LLM Marking feedback array:", feedbackArray);

			// Clear old results
			this.markResults = new Array(this.generatedTests.length).fill(null);

			// E.g. feedbackArray => [{ questionNumber, correct, feedback }, ...]
			feedbackArray.forEach(item => {
				const qIndex = item.questionNumber - 1;
				if (qIndex >= 0 && qIndex < this.generatedTests.length) {
					this.markResults[qIndex] = {
						correct: item.correct,
						feedback: item.feedback
					};
				}
			});

			// Compute overall score
			let correctCount = 0;
			this.markResults.forEach((result) => {
				if (result?.correct === true) {
					correctCount++;
				}
			});
			const total = this.generatedTests.length;
			const percentage = ((correctCount / total) * 100).toFixed(1); // e.g. "66.7"
			this.scoreSummary = `You scored ${percentage}% (${correctCount} / ${total} correct)`;

			this.render(); // Re-render with color-coded results + score summary
			new Notice("Marking complete!");
		} catch (err) {
			console.error("Error marking answers:", err);
			new Notice("Error marking answers. Check console for details.");
		}
	}

	/**
	 * Called when user clicks “Reset”:
	 * Clears typed answers & marking results => re-render unmarked doc
	 */
	private handleResetButtonClick(): void {
		// Clear all user answers
		this.answers = {};
		// Clear marking results
		this.markResults = [];
		// Clear score summary
		this.scoreSummary = "";
		// Re-save to plugin docs so we don't reload with old data
		if (this.filePath) {
			if (!this.plugin.testDocuments[this.filePath]) {
				this.plugin.testDocuments[this.filePath] = {
					description: this.description,
					questions: this.generatedTests,
					answers: {}
				};
			} else {
				this.plugin.testDocuments[this.filePath].answers = {};
			}
			this.plugin.saveSettings();
		}
		this.render();
	}

	/**
	 * Saves user answers so they're not lost upon leaving/re-entering the doc.
	 */
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