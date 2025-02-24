import { App, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { IndexedNote } from "../models/types";
import { generateTestQuestions } from "../services/llm";

export const VIEW_TYPE = "rag-test-view";

interface RagTestPlugin {
  settings: {
    apiKey?: string;
  };
  testDocuments: Record<string, {
    description: string;
    questions: { question: string }[];
    answers: Record<number, string>;
    score?: number;
  }>;
  openQuestionDoc: (filePath: string) => void;
  saveSettings: () => Promise<void>;
}

interface PluginSystem {
  plugins: {
    getPlugin: (id: string) => RagTestPlugin | undefined; 
    plugins: Record<string, RagTestPlugin>; // fallback
  };
}

export default class TestDashboardView extends ItemView {
  pluginData: IndexedNote[];

  constructor(leaf: WorkspaceLeaf, app: App, pluginData: IndexedNote[]) {
    super(leaf);
    this.pluginData = pluginData;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Test Dashboard"; }

  async onOpen() { this.render(); }
  async onClose() {}

  async render() {
    const container = this.containerEl;
    container.empty();

    const typedApp = this.app as unknown as PluginSystem;
    const ragPlugin = typedApp.plugins.plugins["obsidian-rag-test-plugin"]; 
    if (!ragPlugin) {
      container.createEl("p", { text: "RAG Test Plugin not found." });
      return;
    }

    const header = container.createEl("div", { cls: "test-view-header" });
    const createBtn = header.createEl("button", { text: "Create Tests" });
    createBtn.disabled = true;
    createBtn.onclick = () => this.createTests();

    const ul = container.createEl("ul");
    this.pluginData.forEach(note => {
      const li = ul.createEl("li");
      const cb = li.createEl("input", { type: "checkbox" });
      cb.dataset.filePath = note.filePath;
      li.createEl("span", { text: " " + note.filePath });

      const docState = ragPlugin.testDocuments[note.filePath];
      let iconHTML = "";
      let extraText = "";

      if (!docState) {
iconHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="gray" class="bi bi-file-text" viewBox="0 0 16 16">
  <path d="M4 0a2 2 0 0 0-2 2v12a2 2
    0 0 0 2 2h8a2 2 0 0
    0 2-2V5.5L9.5 0H4z"/>
  <path d="M9.5 0v4a1 1 0
    0 0 1 1h4"/>
  <path d="M4.5 7a.5.5 0 0
    1 .5.5v.5h5v-1h-5V7.5a.5.5
    0 0 1 .5-.5z"/>
</svg>`;
      } else if (typeof docState.score === "number") {
        const percentStr = docState.score.toFixed(1) + "%";
iconHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="green" class="bi bi-check2-square" viewBox="0 0 16 16">
  <path d="M14 1a1 1 0 0 1 1 1v12a1
    1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1
    1 0 0 1 1-1h12zm-2.354 4.646-3.889
    3.889-1.888-1.889a.5.5 0 1
    0-.707.708l2.239
    2.239a.5.5 0 0 0 .707 0l4.243-4.242a.5.5
    0 0 0-.707-.708z"/>
</svg>`;
        extraText = percentStr;
      } else {
        const totalQ = docState.questions.length;
        const answeredCount = Object.values(docState.answers || {}).filter(val => (val as string).trim()).length;
        let fillColor = "white";
        if (answeredCount === 0) fillColor = "white";
        else if (answeredCount < totalQ) fillColor = "orange";
        else fillColor = "green";
iconHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${fillColor}" class="bi bi-file-text" viewBox="0 0 16 16">
  <path d="M4 0a2 2 0 0 0-2 2v12a2 2
    0 0 0 2 2h8a2 2 0 0
    0 2-2V5.5L9.5 0H4z"/>
  <path d="M9.5 0v4a1 1 0
    0 0 1 1h4"/>
  <path d="M4.5 7a.5.5 0
    0 1 .5.5v.5h5v-1h-5V7.5a.5.5
    0 0 1 .5-.5z"/>
</svg>`;
      }

      const statusSpan = li.createEl("span", { cls: "status-icon" });
      statusSpan.style.marginLeft = "0.5em";

      if (!docState) {
        statusSpan.innerHTML = iconHTML;
      } else {
        statusSpan.innerHTML = `
<button style="display: inline-flex; align-items: center; gap: 6px;" title="Open Test Document">
  ${iconHTML}
  ${extraText ? `<span style="font-weight: bold;">${extraText}</span>` : ""}
</button>`;
        const btn = statusSpan.querySelector<HTMLButtonElement>("button");
        if (btn) {
          btn.onclick = () => ragPlugin.openQuestionDoc(note.filePath);
        }
      }

      cb.onchange = () => this.updateCreateBtn(createBtn, ul);
    });

    this.updateCreateBtn(createBtn, ul);
  }

  private updateCreateBtn(btn: HTMLButtonElement, ul: HTMLElement) {
    const boxes = ul.querySelectorAll('input[type="checkbox"]');
    btn.disabled = !Array.from(boxes).some(b => (b as HTMLInputElement).checked);
  }

  async createTests() {
    const typedApp = this.app as unknown as PluginSystem;
    const ragPlugin = typedApp.plugins.plugins["obsidian-rag-test-plugin"];
    if (!ragPlugin) {
      new Notice("❌ RAG Test Plugin not found.");
      return;
    }
    const key = ragPlugin.settings.apiKey;
    if (!key) {
      new Notice("❌ OpenAI API Key is missing! Please set it in the plugin settings.");
      return;
    }

    const boxes = this.containerEl.querySelectorAll('input[type="checkbox"]');
    const tasks: Promise<void>[] = [];

    for (const box of Array.from(boxes)) {
      const input = box as HTMLInputElement;
      if (input.checked) {
        const filePath = input.dataset.filePath;
        if (!filePath) continue;

        const note = this.pluginData.find(n => n.filePath === filePath);
        if (!note) continue;

        const li = input.parentElement;
        const icon = li?.querySelector<HTMLSpanElement>(".status-icon");
        if (icon) icon.innerHTML = `<div class="spinner"></div>`;

        tasks.push((async () => {
          try {
            const res = await generateTestQuestions([note], key);
            ragPlugin.testDocuments[filePath] = { description: res.description, questions: res.questions, answers: {} };
            await ragPlugin.saveSettings();
            if (icon) {
              icon.innerHTML = `
<button title="Open Test Document">
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="white" class="bi bi-file-text" viewBox="0 0 16 16">
  <path d="M4 0a2 2 0 0
   0-2 2v12a2 2 0 0
   0 2 2h8a2 2 0 0
   0 2-2V5.5L9.5 0H4z"/>
  <path d="M9.5 0v4a1 1 0
   0 0 1 1h4"/>
  <path d="M4.5 7a.5.5 0 0
   1 .5.5v.5h5v-1h-5V7.5a.5.5
   0 0 1 .5-.5z"/>
</svg>
</button>
              `;
              const btn = icon.querySelector<HTMLButtonElement>("button");
              if (btn) btn.onclick = () => ragPlugin.openQuestionDoc(filePath);
            }
          } catch {
            if (icon) {
              icon.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="gray" class="bi bi-file-text" viewBox="0 0 16 16">
  <path d="M4 0a2 2 0 0
   0-2 2v12a2 2 0 0
   0 2 2h8a2 2 0 0
   0 2-2V5.5L9.5 0H4z"/>
  <path d="M9.5 0v4a1 1 0 0
   0 1 1h4"/>
  <path d="M4.5 7a.5.5 0 0
   1 .5.5v.5h5v-1h-5V7.5a.5.5
   0 0 1 .5-.5z"/>
</svg>`;
            }
          }
        })());
      }
    }
    await Promise.all(tasks);
  }
}

interface RagTestPlugin {
  settings: { apiKey?: string };
  testDocuments: Record<string, {
    description: string;
    questions: { question: string }[];
    answers: Record<number, string>;
    score?: number;
  }>;
  openQuestionDoc: (filePath: string) => void;
  saveSettings: () => Promise<void>;
}
