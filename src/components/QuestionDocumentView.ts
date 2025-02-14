/*
This file implements a full-page view for displaying generated test questions.
It renders an interactive document that shows a description (context) at the top,
followed by each test question (with an input field for the user's answer) and a "Mark Test" button.
It expects a TestQuestionsResponse object.
*/

import { App, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { GeneratedTest, TestQuestionsResponse } from "../models/types";

export const QUESTION_VIEW_TYPE = "question-document-view";

/**
 * A full-page view for displaying test questions.
 */
export default class QuestionDocumentView extends ItemView {
	description: string;
	generatedTests: GeneratedTest[];

	/**
	 * Constructs the QuestionDocumentView.
	 * @param leaf - The workspace leaf to attach the view.
	 * @param app - The Obsidian application instance.
	 * @param response - A TestQuestionsResponse object containing a description and an array of test questions.
	 */
	constructor(leaf: WorkspaceLeaf, app: App, response: TestQuestionsResponse) {
		super(leaf);
		this.description = response.description || "";
		// Safely assign generatedTests by defaulting to an empty array if undefined.
		this.generatedTests = (response.questions || []).filter(item => item && item.question && item.question.trim() !== "");
		console.log("QuestionDocumentView constructor: generatedTests =", this.generatedTests);
		console.log("QuestionDocumentView constructor: description =", this.description);
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
		const state = this.getState() as { response?: TestQuestionsResponse } | undefined;
		console.log("QuestionDocumentView onOpen: retrieved state =", state);
		if (state && state.response) {
			this.description = state.response.description || "";
			this.generatedTests = (state.response.questions || []).filter(item => item && item.question && item.question.trim() !== "");
		}
		console.log("QuestionDocumentView onOpen: final generatedTests length =", this.generatedTests.length);
		this.render();
	}

	/**
	 * Called when the view is closed.
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
		container.appendChild(titleEl);

		// Display the context description if available.
		if (this.description.trim() !== "") {
			const contextEl = container.createEl("p", { text: this.description });
			contextEl.style.fontStyle = "italic";
			contextEl.style.marginBottom = "1em";
		}

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

				const label = questionDiv.createEl("label", { text: `Q${index + 1}: ${item.question}` });
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