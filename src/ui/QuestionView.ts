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

  async onClose() {
    // Cleanup if needed
  }

  /**
   * Shows a spinner overlay during an async operation (e.g., marking).
   */
  private showSpinner(): HTMLDivElement {
    const spinnerOverlay = this.containerEl.createDiv({ cls: "spinner-overlay" });
    spinnerOverlay.createDiv({ cls: "spinner" });
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
    
    // Apply the container class for styling
    container.addClass("test-document-container");

    if (!this.generatedTests?.length) {
      container.createEl("p", { text: "No test questions available." });
      return;
    }

    // Test description with proper styling
    const descEl = container.createEl("p", { 
      text: this.description,
      cls: "test-description" 
    });

    const formEl = container.createEl("form");

    // Create each question with new styling
    this.generatedTests.forEach((test, index) => {
      const questionDiv = formEl.createEl("div", { cls: "question-item" });
      
      // Question label with number badge
      const label = questionDiv.createEl("label", { cls: "question-label" });
      
      // Add number badge
      const numberBadge = label.createSpan({ cls: "question-number", text: `${index + 1}` });
      
      // Add the question text (without the Q# prefix, since we have the badge)
      label.createSpan({ text: test.question });

      // Styled answer input
      const input = questionDiv.createEl("input", { 
        type: "text",
        cls: "answer-input",
        attr: { placeholder: "Type your answer here" }
      }) as HTMLInputElement;

      // Restore previously typed answer
      if (this.answers[index]) {
        input.value = this.answers[index];
      }

      // Apply styling for marking results
      const result = this.markResults[index];
      if (result) {
        input.addClass(result.correct ? "correct" : "incorrect");
      }

      // Input change handler
      input.addEventListener("input", () => {
        this.answers[index] = input.value;
        this.saveAnswers();
      });

      // Feedback element with proper styling
      const feedbackEl = questionDiv.createEl("p", { cls: "feedback" });
      if (result) {
        feedbackEl.addClass(result.correct ? "correct" : "incorrect");
        feedbackEl.addClass("visible");
        feedbackEl.textContent = result.feedback;
      }
    });

    // Styled button row
    const buttonRow = formEl.createEl("div", { cls: "test-document-actions" });

    // Mark button with styling
    const markButton = buttonRow.createEl("button", { 
      text: "Mark",
      cls: "test-button mark-button" 
    });
    markButton.type = "button";
    markButton.onclick = () => this.handleMarkButtonClick();

    // Reset button with styling
    const resetButton = buttonRow.createEl("button", { 
      text: "Reset",
      cls: "test-button reset-button" 
    });
    resetButton.type = "button";
    resetButton.onclick = () => this.handleResetButtonClick();

    // Only show score summary if we have one
    if (this.scoreSummary) {
      const scoreEl = formEl.createEl("div", { 
        text: this.scoreSummary,
        cls: "score-summary" 
      });
    }

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