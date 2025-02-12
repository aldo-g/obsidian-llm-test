/*
This file implements a custom sidebar view (dashboard) for the Obsidian RAG Test Plugin.
It displays a list of all indexed notes with checkboxes for selection and a "Create Tests" button.
When "Create Tests" is clicked, an OpenAI API call is made for each selected note (using that note's full content)
to generate test questions. All generated questions are then aggregated and displayed in a full-screen question document view.
*/

import { App, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { IndexedNote } from "../models/types";
import { generateTestQuestions } from "../services/llm";

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
	 * @returns A promise that resolves when the view is closed.
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
	 * aggregates all questions, and then opens a full-screen view to display them.
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
		let aggregatedQuestions: string[] = [];
		for (const checkbox of Array.from(checkboxes)) {
			const input = checkbox as HTMLInputElement;
			if (input.checked) {
				const filePath = input.dataset.filePath;
				const note = this.pluginData.find(n => n.filePath === filePath);
				if (!note) continue;
				console.log(`Generating tests for: ${filePath}`);
				try {
					const questions = await generateTestQuestions([note], apiKey);
					console.log(`Generated tests for ${filePath}:`, questions);
					aggregatedQuestions.push(`Questions for ${filePath}:`);
					aggregatedQuestions.push(...questions);
				} catch (error) {
					console.error(`Error generating tests for ${filePath}:`, error);
				}
			}
		}
		if (aggregatedQuestions.length > 0) {
			// Open a full-screen view (new page) to display the aggregated test questions.
			(plugin as any).openQuestionDocument(aggregatedQuestions);
		} else {
			new Notice("No tests generated.");
		}
	}
}