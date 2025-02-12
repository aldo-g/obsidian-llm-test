/*
This file implements a full-page view for displaying generated test questions.
It renders an interactive document where each question is displayed with an input field for the user's answer,
and includes a "Mark Test" button to submit the answers.
Debug logs are added to verify that the questions are correctly passed into the view.
*/

import { App, ItemView, Notice, WorkspaceLeaf } from "obsidian";

export const QUESTION_VIEW_TYPE = "question-document-view";

/**
 * A full-page view for displaying test questions.
 */
export default class QuestionDocumentView extends ItemView {
	questions: string[];

	/**
	 * Constructs the QuestionDocumentView.
	 * @param leaf - The workspace leaf to attach the view.
	 * @param app - The Obsidian application instance.
	 * @param questions - An array of test question strings.
	 */
	constructor(leaf: WorkspaceLeaf, app: App, questions: string[]) {
		super(leaf);
		this.questions = questions;
		console.log("QuestionDocumentView constructor: initial questions =", this.questions);
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
		const state = this.getState() as { questions?: string[] } | undefined;
		console.log("QuestionDocumentView onOpen: retrieved state =", state);
		if (state && state.questions) {
			this.questions = state.questions;
		}
		console.log("QuestionDocumentView onOpen: questions length =", this.questions.length);
		if (this.questions.length === 0) {
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
		console.log("QuestionDocumentView render: rendering questions, count =", this.questions.length);

		const titleEl = container.createEl("h1", { text: "Generated Test Questions" });
		const formEl = container.createEl("form");
		formEl.style.display = "block";
		formEl.style.width = "100%";

		if (this.questions.length === 0) {
			const emptyEl = container.createEl("p", { text: "No questions to display." });
			console.log("QuestionDocumentView render: no questions found.");
		} else {
			this.questions.forEach((question, index) => {
				const questionDiv = formEl.createEl("div", { cls: "question-item" });
				questionDiv.style.marginBottom = "1em";

				const label = questionDiv.createEl("label", { text: `Q${index + 1}: ${question}` });
				label.style.display = "block";
				label.style.fontWeight = "bold";

				const input = questionDiv.createEl("input", { type: "text" }) as HTMLInputElement;
				input.placeholder = "Type your answer here";
				input.style.width = "100%";
				input.style.marginTop = "0.5em";
				(input as HTMLElement).dataset.questionIndex = index.toString();
			});
		}

		const markButton = formEl.createEl("button", { text: "Mark Test" });
		markButton.type = "button";
		markButton.style.marginTop = "1em";
		markButton.addEventListener("click", () => {
			const answers: { [key: number]: string } = {};
			const inputs = formEl.querySelectorAll("input[type='text']") as NodeListOf<HTMLInputElement>;
			inputs.forEach((input) => {
				const idxStr = input.dataset.questionIndex;
				if (idxStr !== undefined) {
					const idx = parseInt(idxStr, 10);
					answers[idx] = input.value;
				}
			});
			new Notice("Test answers submitted!");
			console.log("User Answers:", answers);
		});

		formEl.appendChild(markButton);
		container.appendChild(formEl);
	}
}