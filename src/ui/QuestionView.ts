import { App, ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type MyPlugin from "../../main";
import { markTestAnswers, ContextLengthExceededError } from "../services/llm";

export const QUESTION_VIEW_TYPE = "question-document-view";

export default class QuestionDocumentView extends ItemView {
  plugin: MyPlugin;
  description: string;
  generatedTests: { question: string }[];
  filePath: string;

  // Map index => user's typed answer.
  answers: { [key: number]: string } = {};

  // For marking: each index => { marks, maxMarks, feedback } or null.
  markResults: Array<{ marks: number; maxMarks: number; feedback: string } | null> = [];

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
    
    // Apply the container class for styling and ensure scrolling works
    container.addClass("test-document-container");
    
    // Ensure container has scrolling - this is critical!
    container.style.overflowY = "auto";
    container.style.maxHeight = "calc(100vh - 100px)";

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
    
    // Make sure the form doesn't interfere with container scrolling
    formEl.style.overflowY = "visible";

    // Create each question with new styling
    this.generatedTests.forEach((test, index) => {
      const questionDiv = formEl.createEl("div", { cls: "question-item" });
      
      // Question label with number badge
      const label = questionDiv.createEl("label", { cls: "question-label" });
      
      // Add number badge
      const numberBadge = label.createSpan({ cls: "question-number", text: `${index + 1}` });
      
      // Add the question text (without the Q# prefix, since we have the badge)
      label.createSpan({ text: test.question });

      // Styled answer input - CHANGED TO TEXTAREA
      const textarea = questionDiv.createEl("textarea", { 
        cls: "answer-input",
        attr: { 
          placeholder: "Type your answer here",
          rows: "3" // Start with 3 rows, will auto-expand if needed
        }
      }) as HTMLTextAreaElement;

      // Restore previously typed answer
      if (this.answers[index]) {
        textarea.value = this.answers[index];
      }

      // Apply styling for marking results
      const result = this.markResults[index];
      if (result) {
        // Determine styling based on marks received
        const scorePercentage = (result.marks / result.maxMarks) * 100;
        
        if (scorePercentage >= 80) {
          textarea.addClass("correct"); // Full or near-full marks
        } else if (scorePercentage > 0) { 
          textarea.addClass("partial"); // Partial marks
        } else {
          textarea.addClass("incorrect"); // No marks
        }
      }

      // Adjust textarea height based on content
      const adjustTextareaHeight = () => {
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';
      };

      // Run once initially
      setTimeout(adjustTextareaHeight, 0);

      // Input change handler
      textarea.addEventListener("input", () => {
        this.answers[index] = textarea.value;
        this.saveAnswers();
        adjustTextareaHeight();
      });

      // Feedback element with proper styling
      const feedbackEl = questionDiv.createEl("div", { cls: "feedback" });
      if (result) {
        // Add mark indicator
        const marksDisplay = feedbackEl.createEl("div", { 
          cls: "marks-display",
          text: `${result.marks}/${result.maxMarks} marks` 
        });
        
        // Determine feedback class based on score
        const scorePercentage = (result.marks / result.maxMarks) * 100;
        if (scorePercentage >= 80) {
          feedbackEl.addClass("correct");
        } else if (scorePercentage > 0) {
          feedbackEl.addClass("partial");
        } else {
          feedbackEl.addClass("incorrect");
        }
        
        feedbackEl.addClass("visible");
        
        // Feedback text
        feedbackEl.createEl("div", { 
          cls: "feedback-text",
          text: result.feedback 
        });
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
   *  3) Sum marks from feedback
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
      // 1) Call the LLM for marking
      const feedbackArray = await markTestAnswers(noteContent, qnaPairs, apiKey);
      
      // 2) Set local markResults
      this.markResults = new Array(this.generatedTests.length).fill(null);
      feedbackArray.forEach(item => {
        const i = item.questionNumber - 1;
        if (i >= 0 && i < this.generatedTests.length) {
          this.markResults[i] = {
            marks: item.marks,
            maxMarks: item.maxMarks,
            feedback: item.feedback
          };
        }
      });

      // 3) Calculate total marks earned and total possible marks
      let totalPossibleMarks = 0;
      let totalEarnedMarks = 0;

      for (let i = 0; i < this.markResults.length; i++) {
        const result = this.markResults[i];
        if (result) {
          totalPossibleMarks += result.maxMarks;
          totalEarnedMarks += result.marks;
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
      
      // Check for context length error and display specific message
      if (err instanceof ContextLengthExceededError) {
        // Show a more detailed notice with the error message and keep it visible longer
        new Notice(`❌ Context Length Error: ${err.message}`, 10000); // Show for 10 seconds
        
        // Create an error message element at the top of the view for better visibility
        const errorContainer = this.containerEl.createDiv({
          cls: "error-message",
        });
        
        errorContainer.createEl("h3", {
          text: "Document Too Large for GPT-4",
        });
        
        errorContainer.createEl("p", {
          text: err.message,
        });
        
        errorContainer.createEl("p", {
          cls: "suggestion",
          text: "Suggestions: Split your document into smaller parts, or use a different model with larger context window.",
        });
        
        // Re-render the rest of the content
        this.render();
      } else {
        new Notice("Error marking answers. Check console for details.");
      }
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