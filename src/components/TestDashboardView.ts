/*
This file implements a custom sidebar view (dashboard) for the Obsidian RAG Test Plugin.
It displays a list of all indexed notes with checkboxes for selection and a "Create Tests" button.
When "Create Tests" is clicked, an OpenAI API call is made for each selected note (using that note's full content)
to generate test questions. While tests are being generated, a spinner is shown next to the respective file name.
Once the tests are generated for a file, the spinner is replaced by a clickable icon which, when clicked,
opens a full-screen view displaying the generated tests.
*/

import { App, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { IndexedNote } from "../models/types";
import { generateTestQuestions } from "../services/llm";
import { QUESTION_VIEW_TYPE } from "./QuestionDocumentView";

export const VIEW_TYPE = "rag-test-view";

/**
 * Custom dashboard view for selecting notes and generating tests.
 */
export default class TestDashboardView extends ItemView {
	pluginData: IndexedNote[];

	/**
	 * Constructs the dashboard view.
	 * @param leaf - The workspace leaf to attach the view.
	 * @param app - The Obsidian application instance.
	 * @param pluginData - The array of indexed notes.
	 */
	constructor(leaf: WorkspaceLeaf, app: App, pluginData: IndexedNote[]) {
		super(leaf);
		this.pluginData = pluginData;
	}

	/**
	 * Returns the view type identifier.
	 * @returns The view type string.
	 */
	getViewType(): string {
		return VIEW_TYPE;
	}

	/**
	 * Returns the display text for the view.
	 * @returns The display text.
	 */
	getDisplayText(): string {
		return "Test Dashboard";
	}

	/**
	 * Called when the view is opened; triggers rendering.
	 */
	async onOpen(): Promise<void> {
		this.render();
	}

	/**
	 * Called when the view is closed.
	 */
	async onClose(): Promise<void> {
		// No cleanup needed.
	}

	/**
	 * Renders the dashboard: a list of notes with selection checkboxes and a "Create Tests" button.
	 */
	async render(): Promise<void> {
		const container = this.containerEl;
		container.empty();

		// Header with "Create Tests" button
		const headerEl = container.createEl("div", { cls: "test-view-header" });
		const createTestsButton = headerEl.createEl("button", { text: "Create Tests" });
		createTestsButton.disabled = true;
		createTestsButton.addEventListener("click", async () => {
			await this.createTests();
		});

		// Container for the list of notes
		const listEl = container.createEl("ul");
		this.pluginData.forEach((note) => {
			const itemEl = listEl.createEl("li");
			const checkbox = itemEl.createEl("input", { type: "checkbox" });
			checkbox.dataset.filePath = note.filePath;
			itemEl.createEl("span", { text: ` ${note.filePath}` });
			// Create spinner element (hidden by default)
			const spinnerEl = itemEl.createEl("div", { cls: "spinner" });
			spinnerEl.style.display = "none";
			spinnerEl.style.marginLeft = "0.5em";
			checkbox.addEventListener("change", () => {
				this.updateCreateTestsButtonState(createTestsButton, listEl);
			});
		});

		this.updateCreateTestsButtonState(createTestsButton, listEl);
	}

	/**
	 * Updates the enabled state of the "Create Tests" button based on selection.
	 * @param button - The button element.
	 * @param listEl - The container element for the checkboxes.
	 */
	updateCreateTestsButtonState(button: HTMLButtonElement, listEl: HTMLElement): void {
		const checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
		let anyChecked = false;
		checkboxes.forEach((cb) => {
			if ((cb as HTMLInputElement).checked) {
				anyChecked = true;
			}
		});
		button.disabled = !anyChecked;
	}

	/**
	 * For each selected note, calls the LLM API to generate test questions,
	 * and replaces the spinner with an icon that, when clicked, opens the full-screen view for that file's tests.
	 */
	async createTests(): Promise<void> {
		const container = this.containerEl;
		const checkboxes = container.querySelectorAll('input[type="checkbox"]');
		// Retrieve API key from plugin settings stored in the main plugin instance.
		const plugin = (this.app as any).plugins.plugins["obsidian-rag-test-plugin"] as any;
		const apiKey = plugin?.settings?.apiKey;
		if (!apiKey) {
			new Notice("❌ OpenAI API Key is missing! Please set it in the plugin settings.");
			return;
		}
		for (const checkbox of Array.from(checkboxes)) {
			const input = checkbox as HTMLInputElement;
			if (input.checked) {
				const filePath = input.dataset.filePath;
				const note = this.pluginData.find(n => n.filePath === filePath);
				if (!note) continue;
				console.log(`Generating tests for: ${filePath}`);
				const listItem = input.parentElement;
				const spinnerEl = listItem?.querySelector(".spinner");
				if (spinnerEl) {
					spinnerEl.style.display = "inline-block";
				}
				try {
					// Generate tests for this note.
					const response = await generateTestQuestions([note], apiKey);
					console.log(`Generated tests for ${filePath}:`, response);
					// Remove spinner and add a view icon.
					if (spinnerEl) {
						spinnerEl.style.display = "none";
						// Create a button with a document icon.
						const iconBtn = document.createElement("button");
						iconBtn.classList.add("view-tests-icon");
						iconBtn.title = "View Generated Tests";
						// Example inline SVG for a document icon (adjust as needed).
						iconBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-text" viewBox="0 0 16 16">
  <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5.5L9.5 0H4z"/>
  <path d="M9.5 0v4a1 1 0 0 0 1 1h4"/>
  <path fill-rule="evenodd" d="M4.5 7a.5.5 0 0 1 .5.5v.5h5v-1h-5V7.5a.5.5 0 0 1 .5-.5z"/>
</svg>`;
						// Append the icon button to the list item.
						listItem?.appendChild(iconBtn);
						// When clicked, open a full-screen view for this file's tests.
						iconBtn.addEventListener("click", () => {
							(plugin as any).openQuestionDocument(response);
						});
					}
				} catch (error) {
					console.error(`Error generating tests for ${filePath}:`, error);
					if (spinnerEl) {
						spinnerEl.style.display = "none";
					}
				}
			}
		}
	}
}