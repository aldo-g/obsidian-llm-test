import { App, ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type MyPlugin from "../../main";
import { markTestAnswers } from "../services/llm";

export const QUESTION_VIEW_TYPE = "question-document-view";

export default class QuestionDocumentView extends ItemView {
  plugin: MyPlugin;
  description: string;
  generatedTests: { question: string }[];
  filePath: string;

  // Map index => user's typed answer.
  answers: { [key: number]: string } = {};

  // For marking: each index => { correct: boolean; feedback: string } or null.
  markResults: Array<{ correct: boolean; feedback: string } | null> = [];

  // Final summary string shown at the bottom after marking.
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

  getViewType() {
    return QUESTION_VIEW_TYPE;
  }

  getDisplayText() {
    return this.filePath ? `Test: ${this.filePath}` : "Generated Test Questions";
  }

  async onOpen() {
    this.render();
  }

  async onClose() {}

  /**
   * Shows a spinner overlay during an async operation (e.g., marking).
   */
  private showSpinner(): HTMLDivElement {
    const spinnerOverlay = this.containerEl.createDiv({ cls: "spinner-overlay" });
    spinnerOverlay.innerHTML = `<div class="spinner"></div>`;
    Object.assign(spinnerOverlay.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.3)",
    });

    const spinnerEl = spinnerOverlay.querySelector(".spinner") as HTMLDivElement;
    if (spinnerEl) {
      Object.assign(spinnerEl.style, {
        width: "50px",
        height: "50px",
        border: "8px solid #ccc",
        borderTopColor: "#888",
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
      });
    }
    return spinnerOverlay;
  }

  /**
   * Hides the spinner overlay.
   */
  private hideSpinner(spinner: HTMLDivElement) {
    spinner.remove();
  }

  /**
   * Renders the questions, inputs, buttons, and current score summary.
   */
  render(): void {
    const container = this.containerEl;
    container.empty();
    Object.assign(container.style, {
      overflowY: "auto",
      maxHeight: "calc(100vh - 100px)",
    });

    if (!this.generatedTests?.length) {
      container.createEl("p", { text: "No test questions available." });
      return;
    }

    const descEl = container.createEl("p", { text: this.description });
    Object.assign(descEl.style, {
      fontStyle: "italic",
      marginBottom: "1em",
    });

    const formEl = container.createEl("form");

    this.generatedTests.forEach((test, index) => {
      const questionDiv = formEl.createEl("div", { cls: "question-item" });
      questionDiv.style.marginBottom = "1em";

      const label = questionDiv.createEl("label", {
        text: `Q${index + 1}: ${test.question}`,
      });
      Object.assign(label.style, { display: "block", fontWeight: "bold" });

      const input = questionDiv.createEl("input", { type: "text" }) as HTMLInputElement;
      Object.assign(input.style, {
        width: "100%",
        marginTop: "0.5em",
      });
      input.placeholder = "Type your answer here";

      // Restore previously typed answer if any.
      if (this.answers[index]) {
        input.value = this.answers[index];
      }

      // If there's a marking result => color + feedback
      let borderColor = "";
      let feedbackColor = "";
      let feedbackText = "";
      const result = this.markResults[index];
      if (result) {
        borderColor = result.correct ? "green" : "red";
        feedbackColor = borderColor;
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
      Object.assign(feedbackEl.style, {
        marginTop: "0.25em",
        color: feedbackColor,
        fontWeight: feedbackText ? "bold" : "normal",
      });
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

    // Score summary element
    const scoreEl = formEl.createEl("p", { text: this.scoreSummary });
    Object.assign(scoreEl.style, { marginTop: "1em", fontWeight: "bold" });

    formEl.appendChild(buttonRow);
    container.appendChild(formEl);
  }

  /**
   * Called when user clicks "Mark". We'll:
   *  1) Show spinner
   *  2) Do the LLM marking
   *  3) Sum marks from (1)/(2)/(3)
   *  4) Store + show final result
   */
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
      // 1) Call the LLM
      const feedbackArray = await markTestAnswers(noteContent, qnaPairs, apiKey);
      // 2) Set local markResults
      this.markResults = new Array(this.generatedTests.length).fill(null);
      feedbackArray.forEach(item => {
        const i = item.questionNumber - 1;
        if (i >= 0 && i < this.generatedTests.length) {
          this.markResults[i] = { correct: item.correct, feedback: item.feedback };
        }
      });

      // 3) Summation: parse how many marks from (X) at the end
      let totalPossibleMarks = 0;
      let totalEarnedMarks = 0;

      for (let i = 0; i < this.generatedTests.length; i++) {
        const qText = this.generatedTests[i].question;
        const match = qText.match(/\((\d)\)\s*$/); // e.g. "What is... (3)"
        let questionMarks = 1;
        if (match) {
          const parsedVal = parseInt(match[1], 10);
          if ([1, 2, 3].includes(parsedVal)) {
            questionMarks = parsedVal;
          }
        }
        totalPossibleMarks += questionMarks;

        // If correct => add questionMarks
        if (this.markResults[i]?.correct) {
          totalEarnedMarks += questionMarks;
        }
      }

      const percentage = totalPossibleMarks
        ? ((totalEarnedMarks / totalPossibleMarks) * 100).toFixed(1)
        : "0.0";

      this.scoreSummary = `You scored ${totalEarnedMarks} / ${totalPossibleMarks} marks (${percentage}%)`;

      // 4) Store in plugin doc => triggers the dashboard to show final % icon
      if (!this.plugin.testDocuments[this.filePath]) {
        this.plugin.testDocuments[this.filePath] = {
          description: this.description,
          questions: this.generatedTests,
          answers: {}
        };
      }
      this.plugin.testDocuments[this.filePath].score = parseFloat(percentage);
      await this.plugin.saveSettings();
      this.plugin.markFileAnswered(this.filePath);

      this.render();
      new Notice("Marking complete!");
    } catch (err) {
      console.error("Error marking answers:", err);
      new Notice("Error marking answers. Check console for details.");
    } finally {
      this.hideSpinner(spinnerOverlay);
    }
  }

  /**
   * Clears all user answers, feedback, and final score. Reverts doc to unmarked.
   */
  private handleResetButtonClick(): void {
    this.answers = {};
    this.markResults = [];
    this.scoreSummary = "";

    if (!this.filePath) return;
    // Ensure doc state exists
    if (!this.plugin.testDocuments[this.filePath]) {
      this.plugin.testDocuments[this.filePath] = {
        description: this.description,
        questions: this.generatedTests,
        answers: {},
      };
    } else {
      this.plugin.testDocuments[this.filePath].answers = {};
    }
    delete this.plugin.testDocuments[this.filePath].score;
    this.plugin.saveSettings();
    this.plugin.markFileAnswered(this.filePath);

    this.render();
  }

  /**
   * Saves typed answers into plugin state so they're reloaded next time user opens.
   */
  saveAnswers(): void {
    if (!this.filePath) return;
    if (!this.plugin.testDocuments[this.filePath]) {
      this.plugin.testDocuments[this.filePath] = {
        description: this.description,
        questions: this.generatedTests,
        answers: {},
      };
    }
    this.plugin.testDocuments[this.filePath].answers = this.answers;
    this.plugin.saveSettings();
    this.plugin.markFileAnswered(this.filePath);
  }
}