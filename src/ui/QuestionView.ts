import { App, ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type MyPlugin from "../../main";
import { markTestAnswers } from "../services/llm";

export const QUESTION_VIEW_TYPE = "question-document-view";

export default class QuestionDocumentView extends ItemView {
  plugin: MyPlugin;
  description: string;
  generatedTests: { question: string }[];
  filePath: string;
  answers: { [key: number]: string } = {};
  markResults: Array<{ correct: boolean; feedback: string } | null> = [];
  scoreSummary = "";

  constructor(
    leaf: WorkspaceLeaf,
    app: App,
    plugin: MyPlugin,
    state: { description: string; questions: { question: string }[] }
  ) {
    super(leaf);
    this.app = app;
    this.plugin = plugin;
    this.description = state.description;
    this.generatedTests = state.questions;
    this.filePath = "";
  }

  getViewType() { return QUESTION_VIEW_TYPE; }
  getDisplayText() { return this.filePath ? `Test: ${this.filePath}` : "Generated Test Questions"; }

  async onOpen() { this.render(); }
  async onClose() {}

  private showSpinner(): HTMLDivElement {
    const spinnerOverlay = this.containerEl.createDiv({ cls: "spinner-overlay" });
    spinnerOverlay.innerHTML = `
      <div class="spinner"></div>
    `;
    spinnerOverlay.style.position = "absolute";
    spinnerOverlay.style.top = "0";
    spinnerOverlay.style.left = "0";
    spinnerOverlay.style.width = "100%";
    spinnerOverlay.style.height = "100%";
    spinnerOverlay.style.display = "flex";
    spinnerOverlay.style.alignItems = "center";
    spinnerOverlay.style.justifyContent = "center";
    spinnerOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.3)";

    const spinnerEl = spinnerOverlay.querySelector(".spinner") as HTMLDivElement;
    if (spinnerEl) {
      spinnerEl.style.width = "50px";
      spinnerEl.style.height = "50px";
      spinnerEl.style.border = "8px solid #ccc";
      spinnerEl.style.borderTopColor = "#888";
      spinnerEl.style.borderRadius = "50%";
      spinnerEl.style.animation = "spin 1s linear infinite";
    }

    return spinnerOverlay;
  }

  private hideSpinner(spinner: HTMLDivElement) {
    spinner.remove();
  }

  render(): void {
    const container = this.containerEl;
    container.empty();
    container.style.overflowY = "auto";
    container.style.maxHeight = "calc(100vh - 100px)";

    if (!this.generatedTests?.length) {
      container.createEl("p", { text: "No test questions available." });
      return;
    }

    const descEl = container.createEl("p", { text: this.description });
    descEl.style.fontStyle = "italic";
    descEl.style.marginBottom = "1em";

    const formEl = container.createEl("form");
    this.generatedTests.forEach((test, index) => {
      const questionDiv = formEl.createEl("div", { cls: "question-item" });
      questionDiv.style.marginBottom = "1em";

      const label = questionDiv.createEl("label", {
        text: `Q${index + 1}: ${test.question}`,
      });
      label.style.display = "block";
      label.style.fontWeight = "bold";

      const input = questionDiv.createEl("input", { type: "text" }) as HTMLInputElement;
      input.placeholder = "Type your answer here";
      input.style.width = "100%";
      input.style.marginTop = "0.5em";

      if (this.answers[index]) {
        input.value = this.answers[index];
      }

      let borderColor = "", feedbackColor = "", feedbackText = "";
      const result = this.markResults[index];
      if (result) {
        if (result.correct) {
          borderColor = "green";
          feedbackColor = "green";
        } else {
          borderColor = "red";
          feedbackColor = "red";
        }
        feedbackText = result.feedback;
      }
      if (borderColor) {
        input.style.border = `2px solid ${borderColor}`;
      }

      input.addEventListener("input", () => {
        this.answers[index] = input.value;
        this.saveAnswers();
      });

      const feedbackEl = questionDiv.createEl("p");
      feedbackEl.style.marginTop = "0.25em";
      feedbackEl.style.color = feedbackColor;
      feedbackEl.style.fontWeight = feedbackText ? "bold" : "normal";
      feedbackEl.textContent = feedbackText;
    });

    const buttonRow = formEl.createEl("div", { cls: "test-document-actions" });
    Object.assign(buttonRow.style, { marginTop: "1em", display: "flex", gap: "1em" });

    const markButton = buttonRow.createEl("button", { text: "Mark" });
    markButton.type = "button";
    markButton.onclick = () => this.handleMarkButtonClick();

    const resetButton = buttonRow.createEl("button", { text: "Reset" });
    resetButton.type = "button";
    resetButton.onclick = () => this.handleResetButtonClick();

    formEl.appendChild(buttonRow);

    const scoreEl = formEl.createEl("p", { text: this.scoreSummary });
    Object.assign(scoreEl.style, { marginTop: "1em", fontWeight: "bold" });

    container.appendChild(formEl);
  }

  private async handleMarkButtonClick(): Promise<void> {
    if (!this.filePath) {
      new Notice("No file path found for this test document.");
      return;
    }
    const indexedNote = this.plugin.indexedNotes.find(n => n.filePath === this.filePath);
    if (!indexedNote) {
      new Notice("No indexed content found for this file. Cannot mark answers.");
      return;
    }
    const noteContent = indexedNote.content;
    const qnaPairs = this.generatedTests.map((test, idx) => ({
      question: test.question,
      answer: this.answers[idx] || ""
    }));

    const apiKey = this.plugin.settings.apiKey;
    if (!apiKey) {
      new Notice("OpenAI API key missing. Please set it in plugin settings.");
      return;
    }

    const spinnerOverlay = this.showSpinner();
    new Notice("Marking in progress...");

    try {
      const feedbackArray = await markTestAnswers(noteContent, qnaPairs, apiKey);
      this.markResults = new Array(this.generatedTests.length).fill(null);
      feedbackArray.forEach(item => {
        const i = item.questionNumber - 1;
        if (i >= 0 && i < this.generatedTests.length) {
          this.markResults[i] = { correct: item.correct, feedback: item.feedback };
        }
      });

      let correctCount = 0;
      for (const r of this.markResults) {
        if (r?.correct) correctCount++;
      }
      const total = this.generatedTests.length;
      const pct = ((correctCount / total) * 100).toFixed(1);
      this.scoreSummary = `You scored ${pct}% (${correctCount} / ${total} correct)`;

      if (!this.plugin.testDocuments[this.filePath]) {
        this.plugin.testDocuments[this.filePath] = {
          description: this.description,
          questions: this.generatedTests,
          answers: {}
        };
      }
      this.plugin.testDocuments[this.filePath].score = parseFloat(pct);
      await this.plugin.saveSettings();

      this.plugin.markFileAnswered(this.filePath);

      this.render();

      new Notice("Marking complete!");
    } catch (err) {
      new Notice("Error marking answers. Check console for details.");
      console.error(err);
    } finally {
      this.hideSpinner(spinnerOverlay);
    }
  }

  private handleResetButtonClick(): void {
    this.answers = {};
    this.markResults = [];
    this.scoreSummary = "";
    if (!this.filePath) return;

    if (!this.plugin.testDocuments[this.filePath]) {
      this.plugin.testDocuments[this.filePath] = {
        description: this.description,
        questions: this.generatedTests,
        answers: {}
      };
    } else {
      this.plugin.testDocuments[this.filePath].answers = {};
    }
    delete this.plugin.testDocuments[this.filePath].score;
    this.plugin.saveSettings();
    this.plugin.markFileAnswered(this.filePath);
    this.render();
  }

  saveAnswers(): void {
    if (!this.filePath) return;
    if (!this.plugin.testDocuments[this.filePath]) {
      this.plugin.testDocuments[this.filePath] = {
        description: this.description,
        questions: this.generatedTests,
        answers: {}
      };
    }
    this.plugin.testDocuments[this.filePath].answers = this.answers;
    this.plugin.saveSettings();
    this.plugin.markFileAnswered(this.filePath);
  }
}