/*
This file implements a full-page view for displaying generated test questions.
It renders an interactive document where each question is displayed with an input field for the user's answer,
and includes a "Mark Test" button to submit the answers.
The view expects an array of GeneratedTest objects but displays only the question text.
*/

import { App, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { GeneratedTest } from "../models/types";

export const QUESTION_VIEW_TYPE = "question-document-view";

/**
 * A full-page view for displaying test questions.
 */
export default class QuestionDocumentView extends ItemView {
	generatedTests: GeneratedTest[];

	/**
	 * Constructs the QuestionDocumentView.
	 * @param leaf - The workspace leaf to attach the view.
	 * @param app - The Obsidian application instance.
	 * @param generatedTests - An array of generated test objects.
	 */
	constructor(leaf: WorkspaceLeaf, app: App, generatedTests: GeneratedTest[]) {
		super(leaf);
		this.generatedTests = generatedTests;
		console.log("QuestionDocumentView constructor: initial generatedTests =", this.generatedTests);
	}

	/**
	 * Returns the view type identifier.
	 * @returns The view type string.
	 */
	getViewType(): string {
		return QUESTION_VIEW_TYPE;
	}

	/**
	 * Returns the display text for the view.
	 * @returns The display text.
	 */
	getDisplayText(): string {
		return "Generated Test Questions";
	}

	/**
	 * Called when the view is opened; retrieves state and triggers rendering.
	 */
	async onOpen(): Promise<void> {
		const state = this.getState() as { questions?: GeneratedTest[] } | undefined;
		console.log("QuestionDocumentView onOpen: retrieved state =", state);
		if (state && state.questions) {
			this.generatedTests = state.questions;
		}
		console.log("QuestionDocumentView onOpen: generatedTests length =", this.generatedTests.length);
		if (this.generatedTests.length === 0) {
			new Notice("No test questions available. Please generate tests first.");
		}
		this.render();
	}

	/**
	 * Called when the view is closed.
	 * @returns A promise that resolves when the view is closed.
	 */
	async onClose(): Promise<void> {
		// No additional cleanup required.
	}

	/**
	 * Renders the interactive question document.
	 */
	render(): void {
		const container = this.containerEl;
		container.empty();
		console.log("QuestionDocumentView render: rendering generatedTests, count =", this.generatedTests.length);

		const titleEl = container.createEl("h1", { text: "Generated Test Questions" });
		const formEl = container.createEl("form");
		formEl.style.display = "block";
		formEl.style.width = "100%";

		if (this.generatedTests.length === 0) {
			const emptyEl = container.createEl("p", { text: "No questions to display." });
			console.log("QuestionDocumentView render: no questions found.");
		} else {
			this.generatedTests.forEach((item, index) => {
				const questionDiv = formEl.createEl("div", { cls: "question-item" });
				questionDiv.style.marginBottom = "1em";

				// Display only the question text
				const label = questionDiv.createEl("label", { text: `Q${index + 1}: ${item.question}` });
				label.style.display = "block";
				label.style.fontWeight = "bold";

				const input = questionDiv.createEl("input", { type: "text" }) as HTMLInputElement;
				input.placeholder = "Type your answer here";
				input.style.width = "100%";
				input.style.marginTop = "0.5em";
				(input as HTMLElement).dataset.questionIndex = index.toString();
				// Optionally, store the suggested answer (not displayed)
				(input as HTMLElement).dataset.suggestedAnswer = item.suggestedAnswer;
			});
		}

		const markButton = formEl.createEl("button", { text: "Mark Test" });
		markButton.type = "button";
		markButton.style.marginTop = "1em";
		markButton.addEventListener("click", () => {
			const answers: { [key: number]: { userAnswer: string; suggestedAnswer: string } } = {};
			const inputs = formEl.querySelectorAll("input[type='text']") as NodeListOf<HTMLInputElement>;
			inputs.forEach((input) => {
				const idxStr = input.dataset.questionIndex;
				const suggested = input.dataset.suggestedAnswer || "";
				if (idxStr !== undefined) {
					const idx = parseInt(idxStr, 10);
					answers[idx] = { userAnswer: input.value, suggestedAnswer: suggested };
				}
			});
			new Notice("Test answers submitted!");
			console.log("User Answers:", answers);
		});

		formEl.appendChild(markButton);
		container.appendChild(formEl);
	}
}