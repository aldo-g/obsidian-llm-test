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
  answers: { [key: number]: string } = {};
  markResults: Array<{ marks: number; maxMarks: number; feedback: string } | null> = [];
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

  async onClose() {}

  private showSpinner(): HTMLDivElement {
    const container = this.containerEl.querySelector(".test-document-container") || this.containerEl;
    const spinnerOverlay = container.createDiv({ cls: "spinner-overlay-question" });
    
    const contentHeight = Math.max(container.scrollHeight || 0);
    
    spinnerOverlay.style.position = "absolute";
    spinnerOverlay.style.top = "0";
    spinnerOverlay.style.left = "0";
    spinnerOverlay.style.width = "100%";
    spinnerOverlay.style.height = contentHeight + "px";
    spinnerOverlay.style.zIndex = "1000";
    
    const spinnerFixed = spinnerOverlay.createDiv({ cls: "spinner-fixed" });
    spinnerFixed.style.position = "fixed";
    spinnerFixed.style.top = "50%";
    spinnerFixed.style.left = "50%";
    spinnerFixed.style.transform = "translate(-50%, -50%)";
    spinnerFixed.style.zIndex = "1001";
    spinnerFixed.style.textAlign = "center";
    
    spinnerFixed.createDiv({ cls: "spinner" });
    spinnerFixed.createEl("p", { 
      text: "Marking in progress...",
      cls: "loading-text"
    });
    
    return spinnerOverlay;
  }
  
  private hideSpinner(spinnerOverlay: HTMLDivElement) {
    spinnerOverlay.remove();
  }

  render(): void {
    const container = this.containerEl;
    container.empty();
    
    container.style.position = 'relative';
    container.addClass("test-document-container");
    container.style.overflowY = "auto";
    container.style.maxHeight = "calc(100vh - 100px)";
  
    if (!this.generatedTests?.length) {
      container.createEl("p", { text: "No test questions available." });
      return;
    }
  
    container.createEl("p", { 
      text: this.description,
      cls: "test-description" 
    });
  
    const formEl = container.createEl("form");
    formEl.style.overflowY = "visible";
  
    this.generatedTests.forEach((test, index) => {
      const questionDiv = formEl.createEl("div", { cls: "question-item" });
      const label = questionDiv.createEl("label", { cls: "question-label" });
      
      label.createSpan({ cls: "question-number", text: `${index + 1}` });
      label.createSpan({ text: test.question });
  
      const textarea = questionDiv.createEl("textarea", { 
        cls: "answer-input",
        attr: { 
          placeholder: "Type your answer here",
          rows: "3"
        }
      }) as HTMLTextAreaElement;
  
      if (this.answers[index]) {
        textarea.value = this.answers[index];
      }
  
      const result = this.markResults[index];
      if (result) {
        const scorePercentage = (result.marks / result.maxMarks) * 100;
        
        if (scorePercentage >= 80) {
          textarea.addClass("correct");
        } else if (scorePercentage > 0) { 
          textarea.addClass("partial");
        } else {
          textarea.addClass("incorrect");
        }
      }
  
      const adjustTextareaHeight = () => {
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';
      };
  
      setTimeout(adjustTextareaHeight, 0);
  
      textarea.addEventListener("input", () => {
        this.answers[index] = textarea.value;
        this.saveAnswers();
        adjustTextareaHeight();
      });
  
      const feedbackEl = questionDiv.createEl("div", { cls: "feedback" });
      if (result) {
        feedbackEl.createEl("div", { 
          cls: "marks-display",
          text: `${result.marks}/${result.maxMarks} marks` 
        });
        
        const scorePercentage = (result.marks / result.maxMarks) * 100;
        if (scorePercentage >= 80) {
          feedbackEl.addClass("correct");
        } else if (scorePercentage > 0) {
          feedbackEl.addClass("partial");
        } else {
          feedbackEl.addClass("incorrect");
        }
        
        feedbackEl.addClass("visible");
        
        feedbackEl.createEl("div", { 
          cls: "feedback-text",
          text: result.feedback 
        });
      }
    });
  
    const buttonRow = formEl.createEl("div", { cls: "test-document-actions" });
  
    const markButton = buttonRow.createEl("button", { 
      text: "Mark",
      cls: "test-button mark-button" 
    });
    markButton.type = "button";
    markButton.onclick = () => this.handleMarkButtonClick();
  
    const resetButton = buttonRow.createEl("button", { 
      text: "Reset",
      cls: "test-button reset-button" 
    });
    resetButton.type = "button";
    resetButton.onclick = () => this.handleResetButtonClick();
  
    if (this.scoreSummary) {
      formEl.createEl("div", { 
        text: this.scoreSummary,
        cls: "score-summary" 
      });
    }
  
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
    
    const heightUpdateInterval = window.setInterval(() => {
      const container = this.containerEl.querySelector(".test-document-container") || this.containerEl;
      const contentHeight = Math.max(container.scrollHeight || 0);
      spinnerOverlay.style.height = contentHeight + "px";
    }, 200);
    
    new Notice(`Marking in progress using ${this.getProviderDisplayName(provider)}...`);
  
    try {
      const feedbackArray = await markTestAnswers(
        noteContent, 
        qnaPairs, 
        provider,
        apiKeys,
        this.plugin.settings.models
      );
      
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
  
      if (!this.plugin.testDocuments[this.filePath]) {
        this.plugin.testDocuments[this.filePath] = {
          description: this.description,
          questions: this.generatedTests,
          answers: {}
        };
      }
      
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
      
      if (err instanceof ContextLengthExceededError) {
        new Notice(`❌ Context Length Error: ${err.message}`, 10000);
        
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
        
        this.render();
      } else {
        new Notice(`Error marking answers with ${this.getProviderDisplayName(provider)}. Check console for details.`);
      }
    } finally {
      window.clearInterval(heightUpdateInterval);
      this.hideSpinner(spinnerOverlay);
    }
  }
  
  private getProviderDisplayName(provider: string): string {
    switch (provider) {
      case "openai":
        return "OpenAI";
      case "anthropic":
        return "Claude";
      case "deepseek":
        return "DeepSeek";
      case "gemini":
        return "Gemini";
      case "mistral":
        return "Mistral";
      default:
        return provider.charAt(0).toUpperCase() + provider.slice(1);
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