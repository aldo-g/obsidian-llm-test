/*
This file implements a full-page view for displaying generated test questions.
It renders an interactive document where each question is displayed with an input field for the user's answer,
and includes a "Mark Test" button to submit the answers.
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
	 * @param questions - An array of test questions.
	 */
	constructor(leaf: WorkspaceLeaf, app: App, questions: string[]) {
		super(leaf);
		this.questions = questions;
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
	 * Called when the view is opened; triggers rendering.
	 */
	async onOpen(): Promise<void> {
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

		const titleEl = container.createEl("h1", { text: "Generated Test Questions" });
		const formEl = container.createEl("form");

		this.questions.forEach((question, index) => {
			const questionDiv = formEl.createEl("div", { cls: "question-item" });
			const label = questionDiv.createEl("label", { text: `Q${index + 1}: ${question}` });
			label.style.display = "block";
			const input = questionDiv.createEl("input", { type: "text" }) as HTMLInputElement;
			input.placeholder = "Type your answer here";
			input.style.width = "100%";
			(input as HTMLElement).dataset.questionIndex = index.toString();
		});

		const markButton = formEl.createEl("button", { text: "Mark Test" });
		markButton.type = "button";
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
