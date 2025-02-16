import { App, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { IndexedNote } from "../models/types";
import { generateTestQuestions } from "../services/llm";

export const VIEW_TYPE = "rag-test-view";

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

			const statusIconEl = itemEl.createEl("span", { cls: "status-icon" });
			statusIconEl.style.marginLeft = "0.5em";
			statusIconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="gray" class="bi bi-file-text" viewBox="0 0 16 16">
  <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5.5L9.5 0H4z"/>
  <path d="M9.5 0v4a1 1 0 0 0 1 1h4"/>
  <path d="M4.5 7a.5.5 0 0 1 .5.5v.5h5v-1h-5V7.5a.5.5 0 0 1 .5-.5z"/>
</svg>`;

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

	async createTests(): Promise<void> {
		const container = this.containerEl;
		const checkboxes = container.querySelectorAll('input[type="checkbox"]');

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
						statusIconEl.innerHTML = `
<button class="view-tests-icon" title="View Generated Tests">
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-text" viewBox="0 0 16 16">
    <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5.5L9.5 0H4z"/>
    <path d="M9.5 0v4a1 1 0 0 0 1 1h4"/>
    <path d="M4.5 7a.5.5 0 0 1 .5.5v.5h5v-1h-5V7.5a.5.5 0 0 1 .5-.5z"/>
  </svg>
</button>
`;
						const iconBtn = statusIconEl.querySelector("button.view-tests-icon") as HTMLButtonElement;
						if (iconBtn) {
							iconBtn.addEventListener("click", () => {
								plugin.openQuestionDoc(filePath);
							});
						}
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