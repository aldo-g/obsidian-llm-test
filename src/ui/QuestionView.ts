import { App, ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type MyPlugin from "../../main";
import { markTestAnswers, ContextLengthExceededError } from "../services/llm";
import type { GeneratedTest } from "../models/types";

export const QUESTION_VIEW_TYPE = "question-document-view";

export default class QuestionDocumentView extends ItemView {
  plugin: MyPlugin;
  description: string;
  generatedTests: GeneratedTest[] = [];
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
    state: { description: string; questions: GeneratedTest[] }
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
    // Get the content container (where all questions are displayed)
    const container = this.containerEl.querySelector(".test-document-container") || this.containerEl;
    
    // Create the spinner overlay
    const spinnerOverlay = container.createDiv({ cls: "spinner-overlay-question" });
    
    // Get the full height of the container including all content
    const contentHeight = Math.max(
      container.scrollHeight || 0
    );
    
    // Set explicit dimensions to cover the entire content area
    spinnerOverlay.style.position = "absolute";
    spinnerOverlay.style.top = "0";
    spinnerOverlay.style.left = "0";
    spinnerOverlay.style.width = "100%";
    spinnerOverlay.style.height = contentHeight + "px";
    spinnerOverlay.style.zIndex = "1000";
    
    // Create spinner and text in a fixed positioned inner container
    // This stays in viewport while allowing scrolling of the underlying content
    const spinnerFixed = spinnerOverlay.createDiv({ cls: "spinner-fixed" });
    spinnerFixed.style.position = "fixed";
    spinnerFixed.style.top = "50%";
    spinnerFixed.style.left = "50%";
    spinnerFixed.style.transform = "translate(-50%, -50%)";
    spinnerFixed.style.zIndex = "1001";
    spinnerFixed.style.textAlign = "center";
    
    // Add spinner and text
    const spinner = spinnerFixed.createDiv({ cls: "spinner" });
    spinnerFixed.createEl("p", { 
      text: "Marking in progress...",
      cls: "loading-text"
    });
    
    // Allow scrolling during marking - the overlay will still intercept clicks
    // but we'll preserve the user's ability to see all content
    
    return spinnerOverlay;
  }
  
  /**
   * Hides the spinner overlay.
   */
  private hideSpinner(spinnerOverlay: HTMLDivElement) {
    // Just remove the overlay
    spinnerOverlay.remove();
  }

  /**
   * Renders the questions, inputs, buttons, and current score summary.
   */
  render(): void {
    const container = this.containerEl;
    container.empty();
    
    // Important: Set position to relative to properly contain the overlay
    container.style.position = 'relative';
    
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
  
    // Get current provider and API key
    const provider = this.plugin.settings.llmProvider;
    const apiKeys = this.plugin.settings.apiKeys;
    
    if (!apiKeys[provider]) {
      new Notice(`${this.getProviderDisplayName(provider)} API key missing. Please set it in plugin settings.`);
      return;
    }
  
    const noteContent = indexedNote.content;
    const qnaPairs = this.generatedTests.map((test, idx) => ({
      question: test.question,
      answer: this.answers[idx] || "",
      type: test.type
    }));
  
    const spinnerOverlay = this.showSpinner();
    
    // Start a periodic check to update the overlay height as content may change
    const heightUpdateInterval = window.setInterval(() => {
      const container = this.containerEl.querySelector(".test-document-container") || this.containerEl;
      const contentHeight = Math.max(container.scrollHeight || 0, container.offsetHeight || 0);
      spinnerOverlay.style.height = contentHeight + "px";
    }, 200);
    
    new Notice(`Marking in progress using ${this.getProviderDisplayName(provider)}...`);
  
    try {
      // Call the LLM for marking with the current provider
      const feedbackArray = await markTestAnswers(
        noteContent, 
        qnaPairs, 
        provider,
        apiKeys
      );
      
      // Set local markResults
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
  
      // Calculate total marks earned and total possible marks
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
  
      // Store in plugin doc
      if (!this.plugin.testDocuments[this.filePath]) {
        this.plugin.testDocuments[this.filePath] = {
          description: this.description,
          questions: this.generatedTests,
          answers: {}
        };
      }
      
      // Store the full marking results in the document state
      this.plugin.testDocuments[this.filePath] = {
        ...this.plugin.testDocuments[this.filePath],
        score: parseFloat(percentage),
        markResults: this.markResults,
        answers: this.answers
      };
      
      await this.plugin.saveSettings();
      this.plugin.markFileAnswered(this.filePath);
  
      this.render();
      new Notice("Marking complete!");
    } catch (err) {
      console.error("Error marking answers:", err);
      
      // Check for context length error and display specific message
      if (err instanceof ContextLengthExceededError) {
        // Show a more detailed notice with the error message
        new Notice(`❌ Context Length Error: ${err.message}`, 10000);
        
        // Create an error message element at the top of the view
        const errorContainer = this.containerEl.createDiv({
          cls: "error-message",
        });
        
        errorContainer.createEl("h3", {
          text: `Document Too Large for ${this.getProviderDisplayName(provider)}`,
        });
        
        errorContainer.createEl("p", {
          text: err.message,
        });
        
        errorContainer.createEl("p", {
          cls: "suggestion",
          text: "Suggestions: Split your document into smaller parts, or try a different LLM provider with a larger context window.",
        });
        
        // Re-render the rest of the content
        this.render();
      } else {
        new Notice(`Error marking answers with ${this.getProviderDisplayName(provider)}. Check console for details.`);
      }
    } finally {
      // Clear the height update interval
      window.clearInterval(heightUpdateInterval);
      
      // Hide the spinner
      this.hideSpinner(spinnerOverlay);
    }
  }
  
  /**
   * Get a user-friendly display name for the provider
   */
  private getProviderDisplayName(provider: string): string {
    switch (provider) {
      case "openai":
        return "OpenAI GPT-4";
      case "anthropic":
        return "Claude";
      case "deepseek":
        return "DeepSeek";
      case "gemini":
        return "Gemini";
      default:
        return provider.charAt(0).toUpperCase() + provider.slice(1);
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