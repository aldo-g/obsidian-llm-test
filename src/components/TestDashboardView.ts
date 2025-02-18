import { App, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { IndexedNote } from "../models/types";
import { generateTestQuestions } from "../services/llm";

export const VIEW_TYPE = "rag-test-view";

/**
 * Custom dashboard for selecting notes and generating tests.
 * Icon colors:
 * - Gray: no tests generated
 * - White: tests generated, no answers
 * - Orange: partial answers
 * - Green: all answered
 * 
 * The gray icon is NOT clickable;
 * for white/orange/green, it's wrapped in a <button> so the user can open the doc.
 */
export default class TestDashboardView extends ItemView {
	pluginData: IndexedNote[];

	constructor(leaf: WorkspaceLeaf, app: App, pluginData: IndexedNote[]) {
		super(leaf);
		this.pluginData = pluginData;
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Test Dashboard";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		console.log("TestDashboardView closed");
	}

	async render(): Promise<void> {
		const container = this.containerEl;
		container.empty();

		const plugin = (this.app as any).plugins.plugins["obsidian-rag-test-plugin"];
		if (!plugin) {
			container.createEl("p", { text: "RAG Test Plugin not found." });
			return;
		}

		const headerEl = container.createEl("div", { cls: "test-view-header" });
		const createTestsButton = headerEl.createEl("button", { text: "Create Tests" });
		createTestsButton.disabled = true;
		createTestsButton.addEventListener("click", async () => {
			await this.createTests();
		});

		const listEl = container.createEl("ul");
		this.pluginData.forEach((note) => {
			const itemEl = listEl.createEl("li");
			const checkbox = itemEl.createEl("input", { type: "checkbox" });
			checkbox.dataset.filePath = note.filePath;
			itemEl.createEl("span", { text: ` ${note.filePath}` });

			const docState = plugin.testDocuments[note.filePath];
			let fillColor = "gray"; // no tests => gray
			let clickable = false;  // not clickable if gray

			if (docState) {
				// tests exist => white/orange/green
				const totalQ = docState.questions.length;
				const answersArr = Object.values(docState.answers || {});
				const answeredCount = answersArr.filter(a => a.trim().length > 0).length;

				if (answeredCount === 0) {
					// no answers => white
					fillColor = "white";
				} else if (answeredCount < totalQ) {
					// partial => orange
					fillColor = "orange";
				} else {
					// all answered => green
					fillColor = "green";
				}
				clickable = true; // user can open doc
			}

			const statusIconEl = itemEl.createEl("span", { cls: "status-icon" });
			statusIconEl.style.marginLeft = "0.5em";

			if (!clickable) {
				// Gray icon, no tests => not a button
				statusIconEl.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${fillColor}" class="bi bi-file-text" viewBox="0 0 16 16">
  <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5.5L9.5 0H4z"/>
  <path d="M9.5 0v4a1 1 0 0 0 1 1h4"/>
  <path d="M4.5 7a.5.5 0 0 1 .5.5v.5h5v-1h-5V7.5a.5.5 0 0 1 .5-.5z"/>
</svg>`;
			} else {
				// White/orange/green => clickable <button>
				statusIconEl.innerHTML = `
<button class="view-tests-icon" title="Open Test Document">
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${fillColor}" class="bi bi-file-text" viewBox="0 0 16 16">
    <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5.5L9.5 0H4z"/>
    <path d="M9.5 0v4a1 1 0 0 0 1 1h4"/>
    <path d="M4.5 7a.5.5 0 0 1 .5.5v.5h5v-1h-5V7.5a.5.5 0 0 1 .5-.5z"/>
  </svg>
</button>`;
				const iconBtn = statusIconEl.querySelector("button.view-tests-icon") as HTMLButtonElement;
				iconBtn.addEventListener("click", () => {
					plugin.openQuestionDoc(note.filePath);
				});
			}

			checkbox.addEventListener("change", () => {
				this.updateCreateTestsButtonState(createTestsButton, listEl);
			});
		});
		this.updateCreateTestsButtonState(createTestsButton, listEl);
	}

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
	 * For each selected note, sends an OpenAI request to generate tests CONCURRENTLY,
	 * instead of waiting for each request to finish before starting the next.
	 */
	async createTests(): Promise<void> {
		const plugin = (this.app as any).plugins.plugins["obsidian-rag-test-plugin"];
		if (!plugin) {
			new Notice("❌ RAG Test Plugin not found.");
			return;
		}
		const apiKey = plugin.settings?.apiKey;
		if (!apiKey) {
			new Notice("❌ OpenAI API Key is missing! Please set it in the plugin settings.");
			return;
		}

		// Gather all selected checkboxes
		const container = this.containerEl;
		const checkboxes = container.querySelectorAll('input[type="checkbox"]');
		const tasks: Promise<void>[] = []; // We'll store each note's "test generation" promise here

		for (const checkbox of Array.from(checkboxes)) {
			const input = checkbox as HTMLInputElement;
			if (input.checked) {
				const filePath = input.dataset.filePath;
				const note = this.pluginData.find((n) => n.filePath === filePath);
				if (!note) continue;

				console.log(`Preparing to generate tests concurrently for: ${filePath}`);

				const listItem = input.parentElement;
				const statusIconEl = listItem?.querySelector(".status-icon");
				if (statusIconEl) {
					statusIconEl.innerHTML = `<div class="spinner"></div>`;
				}

				// Create an async task for *this* file
				const task = (async () => {
					try {
						const response = await generateTestQuestions([note], apiKey);
						console.log(`Generated tests for ${filePath}`, response);

						plugin.testDocuments[filePath] = {
							description: response.description,
							questions: response.questions,
							answers: {}
						};
						await plugin.saveSettings();
						console.log("createTests (concurrent): Saved test doc under path:", filePath);

						if (statusIconEl) {
							// By default, no answers => white
							statusIconEl.innerHTML = `
	<button class="view-tests-icon" title="Open Test Document">
	<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="white" class="bi bi-file-text" viewBox="0 0 16 16">
		<path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5.5L9.5 0H4z"/>
		<path d="M9.5 0v4a1 1 0 0 0 1 1h4"/>
		<path d="M4.5 7a.5.5 0 0 1 .5.5v.5h5v-1h-5V7.5a.5.5 0 0 1 .5-.5z"/>
	</svg>
	</button>
	`;
							const iconBtn = statusIconEl.querySelector("button.view-tests-icon") as HTMLButtonElement;
							iconBtn.addEventListener("click", () => {
								plugin.openQuestionDoc(filePath);
							});
						}
					} catch (error) {
						console.error(`Error generating tests for ${filePath}`, error);
						if (statusIconEl) {
							statusIconEl.innerHTML = `
	<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="gray" class="bi bi-file-text" viewBox="0 0 16 16">
	<path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5.5L9.5 0H4z"/>
	<path d="M9.5 0v4a1 1 0 0 0 1 1h4"/>
	<path d="M4.5 7a.5.5 0 0 1 .5.5v.5h5v-1h-5V7.5a.5.5 0 0 1 .5-.5z"/>
	</svg>`;
						}
					}
				})(); // immediately invoke

				tasks.push(task);
			}
		}

		// Now wait for all tasks concurrently with Promise.all
		await Promise.all(tasks);
		console.log("All concurrent test generation tasks finished!");
	}
}