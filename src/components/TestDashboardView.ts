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
 * - Green: all answers
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

			// Make a clickable button for the icon
			const statusIconEl = itemEl.createEl("span", { cls: "status-icon" });
			statusIconEl.style.marginLeft = "0.5em";

			// Determine icon color based on docState
		let fillColor = "gray";
		const docState = plugin.testDocuments[note.filePath];
		if (docState) {
			const totalQuestions = docState.questions.length;
			const allAnswers = Object.values(docState.answers || {});
			// Count how many are non-blank
			const answeredCount = allAnswers.filter(ans => ans.trim().length > 0).length;

			if (answeredCount === 0) {
				// tests generated, no answers
				fillColor = "white";
			} else if (answeredCount < totalQuestions) {
				// partial
				fillColor = "orange";
			} else {
				// all answered
				fillColor = "green";
			}
		}

		statusIconEl.innerHTML = `
<button class="view-tests-icon" title="View/Generate Tests">
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${fillColor}" class="bi bi-file-text" viewBox="0 0 16 16">
    <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5.5L9.5 0H4z"/>
    <path d="M9.5 0v4a1 1 0 0 0 1 1h4"/>
    <path d="M4.5 7a.5.5 0 0 1 .5.5v.5h5v-1h-5V7.5a.5.5 0 0 1 .5-.5z"/>
  </svg>
</button>
`;

			checkbox.addEventListener("change", () => {
				this.updateCreateTestsButtonState(createTestsButton, listEl);
			});

			// Make the icon clickable to open the doc if it exists
			const iconBtn = statusIconEl.querySelector("button.view-tests-icon") as HTMLButtonElement;
			iconBtn.addEventListener("click", () => {
				// If doc doesn't exist, user needs to generate tests first
				if (!plugin.testDocuments[note.filePath]) {
					new Notice("No tests found. Generate them first or check your selection.");
				} else {
					plugin.openQuestionDoc(note.filePath);
				}
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

		const container = this.containerEl;
		const checkboxes = container.querySelectorAll('input[type="checkbox"]');
		for (const checkbox of Array.from(checkboxes)) {
			const input = checkbox as HTMLInputElement;
			if (input.checked) {
				const filePath = input.dataset.filePath;
				const note = this.pluginData.find((n) => n.filePath === filePath);
				if (!note) continue;
				console.log(`Generating tests for: ${filePath}`);

				const listItem = input.parentElement;
				const statusIconEl = listItem?.querySelector(".status-icon");
				if (statusIconEl) {
					statusIconEl.innerHTML = `<div class="spinner"></div>`;
				}
				try {
					const response = await generateTestQuestions([note], apiKey);
					console.log(`Generated tests for ${filePath}`, response);

					plugin.testDocuments[filePath] = {
						description: response.description,
						questions: response.questions,
						answers: {}
					};
					await plugin.saveSettings();
					console.log("createTests: Saved test doc under path:", filePath);

					if (statusIconEl) {
						// tests created, but no answers => icon is a white file
						statusIconEl.innerHTML = `
<button class="view-tests-icon" title="View Generated Tests">
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
			}
		}
	}
}