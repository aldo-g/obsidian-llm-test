import { App, ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type ObsidianTestPlugin from "../../main";
import { markTestAnswers, ContextLengthExceededError } from "../services/llm";
import type { GeneratedTest } from "../models/types";

export const QUESTION_VIEW_TYPE = "question-document-view";

export default class QuestionDocumentView extends ItemView {
  plugin: ObsidianTestPlugin;
  description: string;
  generatedTests: GeneratedTest[] = [];
  filePath: string;
  answers: { [key: number]: string } = {};
  markResults: Array<{ marks: number; maxMarks: number; feedback: string } | null> = [];
  scoreSummary = "";
  textareaElements: HTMLTextAreaElement[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    app: App,
    plugin: ObsidianTestPlugin,
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
    return this.filePath ? `Test: ${this.filePath}` : "Generated test questions";
  }

  async onOpen() {
    this.render();
  }

  async onClose() {
    // Clean up any event listeners if needed
  }


  private showSpinner(): HTMLDivElement {
    const container = this.containerEl;
    
    const spinnerOverlay = container.createDiv({ cls: "spinner-overlay" });
    
    const contentHeight = Math.max(
      container.scrollHeight,
      container.querySelector(".test-document-container")?.scrollHeight || 0
    );
    
    spinnerOverlay.style.height = `${contentHeight}px`;
    
    const spinnerFixed = spinnerOverlay.createDiv({ cls: "spinner-fixed-center" });
    
    spinnerFixed.createDiv({ cls: "spinner" });
    spinnerFixed.createEl("p", { 
      text: "Marking in progress...",
      cls: "loading-text"
    });
    
    return spinnerOverlay;
  }
  
  private hideSpinner(spinnerOverlay: HTMLDivElement) {
    if (spinnerOverlay) {
      spinnerOverlay.detach();
    }
  }

  private adjustTextareaHeight(textarea: HTMLTextAreaElement): void {
    textarea.addClass("textarea-height-auto");
    
    const scrollHeight = textarea.scrollHeight;
    
    textarea.removeClass("textarea-height-auto");
    
    textarea.setAttribute("data-height", scrollHeight + "px");
    
    textarea.addClass("textarea-expanded");
    
    textarea.style.setProperty("--textarea-height", scrollHeight + "px");
  }

  private setupAutoResizeTextarea(textarea: HTMLTextAreaElement): void {
    this.textareaElements.push(textarea);
    
    textarea.addClass("auto-height-textarea");
    
    this.adjustTextareaHeight(textarea);
    
    textarea.addEventListener("input", () => {
      this.adjustTextareaHeight(textarea);
    });
  }

  render(): void {
    const container = this.containerEl;
    container.empty();
    
    this.textareaElements = [];
    
    container.addClass("test-document-container");
    container.addClass("test-container-relative");
  
    if (!this.generatedTests?.length) {
      container.createEl("p", { text: "No test questions available." });
      return;
    }
  
    container.createEl("p", { 
      text: this.description,
      cls: "test-description" 
    });
  
    const formEl = container.createEl("form");
    formEl.addClass("overflow-visible");
  
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
  
      this.setupAutoResizeTextarea(textarea);
  
      textarea.addEventListener("input", () => {
        this.answers[index] = textarea.value;
        this.saveAnswers();
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
    
    // Initial adjustment for all textareas
    setTimeout(() => {
      this.textareaElements.forEach(textarea => {
        this.adjustTextareaHeight(textarea);
      });
    }, 10);
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
    
    // Skip API key check for Ollama
    if (provider !== "ollama" && !apiKeys[provider]) {
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
    new Notice(`Marking in progress using ${this.getProviderDisplayName(provider)}...`);
  
    try {
      const feedbackArray = await markTestAnswers(
        noteContent, 
        qnaPairs, 
        provider,
        apiKeys,
        this.plugin.settings.models,
        this.plugin.settings.ollamaSettings
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
          text: `Document too large for ${this.getProviderDisplayName(provider)}`,
        });
        
        errorContainer.createEl("p", {
          text: err.message,
        });
        
        errorContainer.createEl("p", {
          cls: "suggestion",
          text: "Suggestions: Split your document into smaller parts, or try a different LLM provider with a larger context window.",
        });
        
        this.render();
      } else if (err.message?.includes("Failed to parse") || err.message?.includes("JSON")) {
        const modelName = this.plugin.settings.models[provider];
        new Notice(`❌ Model Compatibility Error: "${modelName}" failed to generate proper JSON. Try a more advanced model.`, 10000);
        
        const errorContainer = this.containerEl.createDiv({
          cls: "error-message",
        });
        
        errorContainer.createEl("h3", {
          text: `Model Compatibility Issue: ${modelName}`,
        });
        
        errorContainer.createEl("p", {
          text: "The model failed to generate properly structured output required for test marking.",
        });
        
        errorContainer.createEl("p", {
          cls: "suggestion",
          text: "Some models (especially smaller or older ones) struggle with following specific JSON formatting instructions. Try using a more capable model like llama3 or gemma3, which are better at structured outputs.",
        });
        
        this.render();
      } else {
        new Notice(`Error marking answers with ${this.getProviderDisplayName(provider)}: ${err.message}`, 5000);
      }
    } finally {
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
      case "ollama":
        return "Ollama";
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