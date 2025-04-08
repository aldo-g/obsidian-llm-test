import { App, ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type { IndexedNote } from "../models/types";
import { generateTestQuestions, ContextLengthExceededError, markTestAnswers } from "../services/llm";
import type ObsidianTestPlugin from "../../main";

export const VIEW_TYPE = "rag-test-view";

interface FileTreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: FileTreeNode[];
  expanded?: boolean;
  note?: IndexedNote;
}

export default class TestDashboardView extends ItemView {
  pluginData: IndexedNote[];
  plugin: ObsidianTestPlugin;
  isRefreshing = false;
  fileTreeRoot: FileTreeNode = { name: "root", path: "", isFolder: true, children: [] };
  expandedFolders: Set<string> = new Set();

  constructor(leaf: WorkspaceLeaf, app: App, pluginData: IndexedNote[], plugin: ObsidianTestPlugin) {
    super(leaf);
    this.pluginData = pluginData;
    this.plugin = plugin;
    this.buildFileTree();
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Test dashboard"; }

  async onOpen() { 
    if (!this.pluginData || this.pluginData.length === 0) {
      this.handleRefresh();
    } else {
      this.render();
    }
  }
  
  /**
   * Creates a refresh icon using Obsidian's createEl
   */
  private createRefreshIcon(element: HTMLElement): void {
    const svgContainer = element.createEl("span", { cls: "icon-container" });
    setIcon(svgContainer, "refresh-cw");
    element.createEl("span", { text: "Refresh" });
  }

  /**
   * Creates a folder toggle icon
   */
  private createFolderToggleIcon(element: HTMLElement, expanded: boolean): void {
    setIcon(element, expanded ? "chevron-down" : "chevron-right");
  }

  /**
   * Creates a folder icon
   */
  private createFolderIcon(element: HTMLElement): void {
    setIcon(element, "folder");
  }

  /**
   * Creates a file icon
   */
  private createFileIcon(element: HTMLElement): void {
    setIcon(element, "file-text");
  }

  /**
   * Creates a file with lines icon
   */
  private createFileWithLinesIcon(element: HTMLElement): void {
    setIcon(element, "file-text");
  }

  /**
   * Creates a badge with icon and text
   */
  private createBadge(element: HTMLElement, text: string, colorClass: string = "none"): void {
    const badge = element.createEl("div", { cls: `status-badge ${colorClass}` });
    const iconContainer = badge.createEl("span", { cls: "badge-icon" });
    this.createFileIcon(iconContainer);
    badge.createEl("span", { text: text });
  }

  private createProgressRing(element: HTMLElement, percent: number, color: string): void {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "progress-ring");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    
    const radius = 8;
    const circumference = 2 * Math.PI * radius;
    const dashoffset = circumference * (1 - percent / 100);
    
    const circle1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle1.setAttribute("class", "progress-ring-circle");
    circle1.setAttribute("cx", "12");
    circle1.setAttribute("cy", "12");
    circle1.setAttribute("r", radius.toString());
    
    const circle2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle2.setAttribute("class", "progress-ring-progress");
    circle2.setAttribute("cx", "12");
    circle2.setAttribute("cy", "12");
    circle2.setAttribute("r", radius.toString());
    circle2.setAttribute("stroke", color);
    circle2.setAttribute("stroke-dasharray", `${circumference} ${circumference}`);
    circle2.setAttribute("stroke-dashoffset", dashoffset.toString());
    
    svg.appendChild(circle1);
    svg.appendChild(circle2);
    element.appendChild(svg);
    
    element.createEl("span", {
      text: `${Math.round(percent)}%`
    });
  }


  private createProgressCount(element: HTMLElement, current: number, total: number, color: string): void {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "progress-ring");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    
    const radius = 8;
    const circumference = 2 * Math.PI * radius;
    const percent = (current / total) * 100;
    const dashoffset = circumference * (1 - percent / 100);
    
    const circle1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle1.setAttribute("class", "progress-ring-circle");
    circle1.setAttribute("cx", "12");
    circle1.setAttribute("cy", "12");
    circle1.setAttribute("r", radius.toString());
    
    const circle2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle2.setAttribute("class", "progress-ring-progress");
    circle2.setAttribute("cx", "12");
    circle2.setAttribute("cy", "12");
    circle2.setAttribute("r", radius.toString());
    circle2.setAttribute("stroke", color);
    circle2.setAttribute("stroke-dasharray", `${circumference} ${circumference}`);
    circle2.setAttribute("stroke-dashoffset", dashoffset.toString());
    
    svg.appendChild(circle1);
    svg.appendChild(circle2);
    element.appendChild(svg);
    
    element.createEl("span", {
      text: `${current}/${total}`
    });
  }

  private createSpinner(element: HTMLElement): void {
    element.createDiv({ cls: "spinner" });
  }
  
  private showFullPageSpinner(loadingText: string): HTMLDivElement {
    const container = this.containerEl;
    const loadingOverlay = container.createDiv({ cls: "full-page-overlay" });
    
    const spinnerContainer = loadingOverlay.createDiv({ cls: "loading-container" });
    this.createSpinner(spinnerContainer);
    spinnerContainer.createEl("p", { text: loadingText, cls: "loading-text" });
    
    return loadingOverlay;
  }
  
  private hideFullPageSpinner(overlay: HTMLDivElement): void {
    if (overlay) {
      overlay.remove();
    }
  }
  
  private async cleanupStaleTestDocuments(): Promise<number> {
    const ragPlugin = this.plugin;
    if (!ragPlugin) {
      return 0;
    }
    
    const validFilePaths = new Set(ragPlugin.indexedNotes.map(note => note.filePath));
    const staleTestPaths: string[] = [];
    
    Object.keys(ragPlugin.testDocuments).forEach(path => {
      if (!validFilePaths.has(path)) {
        staleTestPaths.push(path);
      }
    });
    
    if (staleTestPaths.length > 0) {
      staleTestPaths.forEach(path => {
        delete ragPlugin.testDocuments[path];
      });
      
      await ragPlugin.saveSettings();
    }
    
    return staleTestPaths.length;
  }
  
  async onClose() {}

  buildFileTree() {
    this.fileTreeRoot = { name: "root", path: "", isFolder: true, children: [] };
    
    this.pluginData.forEach(note => {
      const pathParts = note.filePath.split('/');
      let currentNode = this.fileTreeRoot;
      let currentPath = "";
      
      for (let i = 0; i < pathParts.length - 1; i++) {
        const folderName = pathParts[i];
        currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        
        let folderNode = currentNode.children.find(
          child => child.isFolder && child.name === folderName
        );
        
        if (!folderNode) {
          folderNode = {
            name: folderName,
            path: currentPath,
            isFolder: true,
            children: [],
            expanded: this.expandedFolders.has(currentPath)
          };
          currentNode.children.push(folderNode);
        }
        
        currentNode = folderNode;
      }
      
      const fileName = pathParts[pathParts.length - 1];
      currentNode.children.push({
        name: fileName,
        path: note.filePath,
        isFolder: false,
        children: [],
        note: note
      });
    });
    
    this.sortFileTree(this.fileTreeRoot);
  }
  
  sortFileTree(node: FileTreeNode) {
    node.children.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    
    node.children.forEach(child => {
      if (child.isFolder) {
        this.sortFileTree(child);
      }
    });
  }

  async render() {
    const container = this.containerEl;
    container.empty();
    container.addClass("test-dashboard-container");

    const ragPlugin = this.plugin;
    if (!ragPlugin) {
      container.createEl("div", { 
        cls: "empty-state",
        text: "Test plugin not found." 
      });
      return;
    }

    const header = container.createEl("div", { cls: "dashboard-header" });
    
    header.createEl("h2", { 
      text: "Test dashboard",
      cls: "dashboard-title" 
    });
    
    const buttonContainer = header.createEl("div", { cls: "dashboard-actions" });
    
    const refreshBtn = buttonContainer.createEl("button", { 
      cls: "dashboard-button secondary",
      attr: {
        title: "Refresh file index"
      }
    });
    
    if (this.isRefreshing) {
      this.createSpinner(refreshBtn);
      refreshBtn.createSpan({ text: " Refreshing..." });
    } else {
      this.createRefreshIcon(refreshBtn);
    }
    refreshBtn.disabled = this.isRefreshing;
    refreshBtn.onclick = () => this.handleRefresh();
    
    const createBtn = buttonContainer.createEl("button", { 
      text: "Create tests",
      cls: "dashboard-button primary" 
    });
    createBtn.disabled = true;
    createBtn.onclick = () => this.createTests();

    const fileTreeContainer = container.createEl("div", { cls: "file-tree-container" });
    
    if (!this.pluginData || this.pluginData.length === 0) {
      fileTreeContainer.createEl("div", { 
        cls: "empty-state",
        text: "No files found. Click Refresh to scan your vault." 
      });
      return;
    }

    this.buildFileTree();
    this.renderFileTree(fileTreeContainer, this.fileTreeRoot, createBtn);
    this.updateCreateBtn(createBtn);
    
    const markAllContainer = container.createEl("div", { 
      cls: "mark-all-container" 
    });
    
    const markAllBtn = markAllContainer.createEl("button", {
      cls: "dashboard-button primary mark-all-button",
      text: "Mark all tests"
    });
    
    const hasPartialTests = Object.entries(this.plugin.testDocuments).some(([path, doc]) => {
      return doc.answers && 
             Object.values(doc.answers).some(answer => answer && (answer as string).trim().length > 0) && 
             typeof doc.score !== "number";
    });
    
    markAllBtn.disabled = !hasPartialTests;
    markAllBtn.onclick = () => this.markAllTests();
  }

  renderFileTree(container: HTMLElement, node: FileTreeNode, createBtn: HTMLButtonElement, level = 0) {
    if (node === this.fileTreeRoot) {
      const treeRoot = container.createEl("div", { cls: "file-tree" });
      node.children.forEach(child => {
        this.renderFileTree(treeRoot, child, createBtn, level);
      });
      return;
    }
    
    const item = container.createEl("div", { cls: "file-tree-item" });
    
    // Use CSS classes for padding based on level - handle very deep nesting with a max class
    if (level <= 12) {
      item.addClass(`tree-item-padding-level-${level}`);
    } else {
      item.addClass("tree-item-padding-level-max");
    }
    
    if (node.isFolder) {
      const folderRow = item.createEl("div", { cls: "folder-row" });
      
      const toggleBtn = folderRow.createEl("div", { 
        cls: `folder-toggle ${node.expanded ? 'expanded' : 'collapsed'}` 
      });
      
      this.createFolderToggleIcon(toggleBtn, node.expanded || false);
      
      const folderIcon = folderRow.createEl("span", { cls: "folder-icon" });
      this.createFolderIcon(folderIcon);
      
      folderRow.createEl("span", { text: node.name, cls: "folder-name" });
      
      folderRow.onclick = (e) => {
        node.expanded = !node.expanded;
        
        if (node.expanded) {
          this.expandedFolders.add(node.path);
        } else {
          this.expandedFolders.delete(node.path);
        }
        
        this.render();
        e.stopPropagation();
      };
      
      if (node.expanded) {
        const childContainer = item.createEl("div", { cls: "folder-children" });
        node.children.forEach(child => {
          this.renderFileTree(childContainer, child, createBtn, level + 1);
        });
      }
    } else {
      const fileRow = item.createEl("div", { cls: "file-row" });
      
      const checkbox = fileRow.createEl("input", { 
        type: "checkbox",
        cls: "file-checkbox" 
      });
      checkbox.dataset.filePath = node.path;
      
      const fileIcon = fileRow.createEl("span", { cls: "file-icon" });
      this.createFileIcon(fileIcon);
      
      fileRow.createEl("span", { text: node.name, cls: "file-name" });
      
      const docState = this.plugin.testDocuments[node.path];
      const statusSpan = fileRow.createEl("span", { cls: "status-icon" });
      
      if (!docState) {
        this.createBadge(statusSpan, "No Tests", "none");
      } else if (typeof docState.score === "number") {
        const score = docState.score;
        const colorClass = score >= 80 ? "complete" : "partial";
        
        const button = statusSpan.createEl("button", { 
          attr: { title: "Open test document" } 
        });
        
        const badge = button.createEl("div", { cls: `status-badge ${colorClass}` });
        this.createProgressRing(badge, Math.round(score), score >= 80 ? '#22c55e' : '#f59e0b');
        
        button.onclick = (e) => {
          this.plugin.openQuestionDoc(node.path);
          e.stopPropagation();
        };
      } else {
        const totalQ = docState.questions.length;
        const answeredCount = Object.values(docState.answers || {}).filter(val => (val as string).trim()).length;
        
        const colorClass = answeredCount === 0 ? "none" : (answeredCount === totalQ ? "complete" : "in-progress");
        
        const button = statusSpan.createEl("button", { 
          attr: { title: "Open test document" } 
        });
        
        const badge = button.createEl("div", { cls: `status-badge ${colorClass}` });
        
        if (answeredCount === 0) {
          const iconContainer = badge.createEl("span", { cls: "badge-icon" });
          this.createFileWithLinesIcon(iconContainer);
          badge.createEl("span", { text: "Start" });
        } else {
          this.createProgressCount(badge, answeredCount, totalQ, '#f59e0b');
        }
        
        button.onclick = (e) => {
          this.plugin.openQuestionDoc(node.path);
          e.stopPropagation();
        };
      }
      
      checkbox.onchange = () => this.updateCreateBtn(createBtn);
    }
  }

  private updateCreateBtn(btn: HTMLButtonElement) {
    const boxes = this.containerEl.querySelectorAll('input[type="checkbox"]');
    btn.disabled = !Array.from(boxes).some(b => (b as HTMLInputElement).checked);
  }

  async handleRefresh() {
    if (this.isRefreshing) return;
    
    try {
      this.isRefreshing = true;
      this.render();
      
      new Notice("🔄 Refreshing test index...");
      
      const refreshedNotes = await this.plugin.indexTestNotes();
      this.pluginData = refreshedNotes;
      
      const removedCount = await this.cleanupStaleTestDocuments();
      
      this.render();
      
      if (removedCount > 0) {
        new Notice(`✅ Indexed ${refreshedNotes.length} notes and removed ${removedCount} stale test documents.`);
      } else {
        new Notice(`✅ Indexed ${refreshedNotes.length} notes.`);
      }
    } catch (error) {
      console.error("Error refreshing index:", error);
      new Notice("❌ Error refreshing index. Check console for details.");
    } finally {
      this.isRefreshing = false;
      this.render();
    }
  }

  async createTests() {
    const ragPlugin = this.plugin;
    if (!ragPlugin) {
      new Notice("❌ Test Plugin not found.");
      return;
    }
    
    const provider = ragPlugin.settings.llmProvider;
    const apiKey = ragPlugin.settings.apiKeys[provider];
    
    // Skip API key check for Ollama
    if (provider !== "ollama" && !apiKey) {
      new Notice(`❌ ${this.getProviderDisplayName(provider)} API Key is missing! Please set it in the plugin settings.`);
      return;
    }
  
    const boxes = this.containerEl.querySelectorAll('input[type="checkbox"]');
    const tasks: Promise<void>[] = [];
    
    await this.cleanupStaleTestDocuments();
  
    for (const box of Array.from(boxes)) {
      const input = box as HTMLInputElement;
      if (input.checked) {
        const filePath = input.dataset.filePath;
        if (!filePath) continue;
  
        const note = this.pluginData.find(n => n.filePath === filePath);
        if (!note) continue;
  
        const fileRow = input.closest('.file-row');
        const icon = fileRow?.querySelector<HTMLSpanElement>(".status-icon");
        
        if (icon) {
          icon.empty();
          this.createSpinner(icon);
        }
  
        tasks.push((async () => {
          try {
            const res = await generateTestQuestions(
              [note], 
              ragPlugin.settings.llmProvider,
              ragPlugin.settings.apiKeys,
              ragPlugin.settings.models,
              ragPlugin.settings.ollamaSettings
            );
            
            ragPlugin.testDocuments[filePath] = { 
              description: res.description, 
              questions: res.questions, 
              answers: {} 
            };
            await ragPlugin.saveSettings();
            
            if (icon) {
              icon.empty();
              
              const button = icon.createEl('button', {
                attr: { title: "Open test document" }
              });
              
              const badge = button.createEl('div', { cls: "status-badge none" });
              const iconContainer = badge.createEl("span", { cls: "badge-icon" });
              this.createFileWithLinesIcon(iconContainer);
              badge.createEl("span", { text: "Start" });
              
              button.onclick = (e) => {
                ragPlugin.openQuestionDoc(filePath);
                e.stopPropagation();
              };
            }
          } catch (error) {
            console.error("Error generating tests:", error);
            
            if (icon) {
              icon.empty();
              this.createBadge(icon, "No Tests", "none");
            }
            
            if (error instanceof ContextLengthExceededError) {
              new Notice(`❌ ${filePath}: ${error.message}`, 10000);
            } else if (error.message?.includes("Failed to parse JSON")) {
              const modelName = ragPlugin.settings.models[ragPlugin.settings.llmProvider];
              new Notice(`❌ ${filePath}: Model "${modelName}" failed to generate proper JSON. Please try a more capable model.`, 10000);
            } else {
              new Notice(`❌ Error generating tests for ${filePath}: ${error.message}`, 5000);
            }
          }
        })());
      }
    }
    
    try {
      await Promise.all(tasks);
      new Notice("✅ Test generation complete!");
      
      boxes.forEach(box => {
        (box as HTMLInputElement).checked = false;
      });
      
      const createBtn = this.containerEl.querySelector('.dashboard-button.primary') as HTMLButtonElement;
      if (createBtn) {
        createBtn.disabled = true;
      }
    } catch (error) {
      console.error("Error in test generation:", error);
      new Notice("❌ Some tests could not be generated. Check console for details.");
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

  async markAllTests() {
    const ragPlugin = this.plugin;
    if (!ragPlugin) {
      new Notice("❌ Test Plugin not found.");
      return;
    }
    
    const provider = ragPlugin.settings.llmProvider;
    const apiKeys = ragPlugin.settings.apiKeys;
    
    // Skip API key check for Ollama
    if (provider !== "ollama" && !apiKeys[provider]) {
      new Notice(`❌ ${this.getProviderDisplayName(provider)} API Key is missing! Please set it in the plugin settings.`);
      return;
    }
    
    await this.cleanupStaleTestDocuments();
    
    const testsToMark: string[] = [];
    const testsAlreadyMarked: string[] = [];
    
    Object.entries(ragPlugin.testDocuments).forEach(([path, doc]) => {
      if (doc.answers) {
        const hasActualAnswers = Object.values(doc.answers).some(
          answer => answer && (answer as string).trim().length > 0
        );
        
        if (hasActualAnswers) {
          if (typeof doc.score === "number") {
            testsAlreadyMarked.push(path);
          } else {
            testsToMark.push(path);
          }
        }
      }
    });
    
    if (testsToMark.length === 0) {
      if (testsAlreadyMarked.length > 0) {
        new Notice(`✅ All tests with answers (${testsAlreadyMarked.length}) are already marked.`);
      } else {
        new Notice("No tests with answers to mark.");
      }
      return;
    }
    
    const validTestsToMark: string[] = [];
    const missingFromIndex: string[] = [];
    
    for (const filePath of testsToMark) {
      const indexedNote = ragPlugin.indexedNotes.find(n => n.filePath === filePath);
      if (indexedNote) {
        validTestsToMark.push(filePath);
      } else {
        missingFromIndex.push(filePath);
      }
    }
    
    if (missingFromIndex.length > 0) {
      new Notice("There's an issue with the test index. Please restart Obsidian and try again.", 8000);
      return;
    }
    
    if (validTestsToMark.length === 0) {
      if (testsAlreadyMarked.length > 0) {
        new Notice(`✅ All valid tests (${testsAlreadyMarked.length}) are already marked.`);
      } else {
        new Notice("No valid tests with answers found.");
      }
      return;
    }
    
    const container = this.containerEl;
    const loadingOverlay = container.createDiv({ cls: "full-page-overlay" });
    
    const spinnerContainer = loadingOverlay.createDiv({ cls: "loading-container" });
    this.createSpinner(spinnerContainer);
    spinnerContainer.createEl("p", { 
      text: `Marking ${validTestsToMark.length} tests using ${this.getProviderDisplayName(provider)}... This may take a few moments.`, 
      cls: "loading-text" 
    });
    
    try {
      const markingPromises = validTestsToMark.map(async (filePath) => {
        try {
          const indexedNote = ragPlugin.indexedNotes.find(n => n.filePath === filePath);
          
          if (!indexedNote) {
            return { filePath, success: false, error: "Note content not found" };
          }
          
          const docState = ragPlugin.testDocuments[filePath];
          const noteContent = indexedNote.content;
          
          const qnaPairs = docState.questions.map((test, idx) => ({
            question: test.question,
            answer: docState.answers[idx] || "",
            type: test.type
          }));
          
          if (!qnaPairs.some(pair => pair.answer.trim())) {
            return { filePath, success: false, error: "No answers to mark" };
          }
          
          const feedbackArray = await markTestAnswers(
            noteContent, 
            qnaPairs, 
            provider,
            apiKeys,
            this.plugin.settings.models,
            this.plugin.settings.ollamaSettings
          );
          
          let totalPossibleMarks = 0;
          let totalEarnedMarks = 0;
          
          const markResults = new Array(docState.questions.length).fill(null);
          
          feedbackArray.forEach(item => {
            const i = item.questionNumber - 1;
            if (i >= 0 && i < docState.questions.length) {
              markResults[i] = {
                marks: item.marks,
                maxMarks: item.maxMarks,
                feedback: item.feedback
              };
              
              totalPossibleMarks += item.maxMarks;
              totalEarnedMarks += item.marks;
            }
          });
          
          const percentage = totalPossibleMarks
            ? ((totalEarnedMarks / totalPossibleMarks) * 100)
            : 0;
          
          ragPlugin.testDocuments[filePath] = {
            ...ragPlugin.testDocuments[filePath],
            score: percentage,
            markResults: markResults
          };
          
          return { 
            filePath, 
            success: true, 
            score: percentage,
            earnedMarks: totalEarnedMarks,
            possibleMarks: totalPossibleMarks
          };
        } catch (error) {
          console.error(`Error marking test ${filePath}:`, error);
          return { filePath, success: false, error: error.message || "Unknown error" };
        }
      });
      
      const results = await Promise.all(markingPromises);
      
      await ragPlugin.saveSettings();
      this.render();
      
      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;
      
      if (failed > 0) {
        new Notice(`✅ Marked ${successful} tests successfully. ❌ ${failed} tests failed.`);
      } else {
        new Notice(`✅ Successfully marked all ${successful} tests with ${this.getProviderDisplayName(provider)}!`);
      }
    } catch (error) {
      console.error("Error in markAllTests:", error);
      new Notice(`❌ Error marking tests with ${this.getProviderDisplayName(provider)}. Check console for details.`);
    } finally {
      if (loadingOverlay) {
        loadingOverlay.remove();
      }
    }
  }
}