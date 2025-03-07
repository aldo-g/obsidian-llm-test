import { App, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { IndexedNote } from "../models/types";
import { generateTestQuestions, ContextLengthExceededError, markTestAnswers } from "../services/llm";
import type MyPlugin from "../../main";

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
  plugin: MyPlugin;
  isRefreshing = false;
  fileTreeRoot: FileTreeNode = { name: "root", path: "", isFolder: true, children: [] };
  expandedFolders: Set<string> = new Set();

  constructor(leaf: WorkspaceLeaf, app: App, pluginData: IndexedNote[], plugin: MyPlugin) {
    super(leaf);
    this.pluginData = pluginData;
    this.plugin = plugin;
    this.buildFileTree();
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Test Dashboard"; }

  async onOpen() { 
    if (!this.pluginData || this.pluginData.length === 0) {
      this.handleRefresh();
    } else {
      this.render();
    }
  }
  
  private showFullPageSpinner(loadingText: string): HTMLDivElement {
    const container = this.containerEl;
    const loadingOverlay = container.createDiv({ cls: "loading-container" });
    loadingOverlay.style.position = "fixed";
    loadingOverlay.style.top = "0";
    loadingOverlay.style.left = "0";
    loadingOverlay.style.width = "100%";
    loadingOverlay.style.height = "100%";
    loadingOverlay.style.zIndex = "1000";
    loadingOverlay.style.display = "flex";
    loadingOverlay.style.justifyContent = "center";
    loadingOverlay.style.alignItems = "center";
    loadingOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    
    const spinnerContainer = loadingOverlay.createDiv({ cls: "loading-container" });
    spinnerContainer.createDiv({ cls: "spinner" });
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
        text: "Test Plugin not found." 
      });
      return;
    }

    const header = container.createEl("div", { cls: "dashboard-header" });
    
    header.createEl("h2", { 
      text: "Test Dashboard",
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
      refreshBtn.createDiv({ cls: "spinner" });
      refreshBtn.createSpan({ text: " Refreshing..." });
    } else {
      refreshBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-refresh-cw">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        <span>Refresh</span>
      `;
    }
    refreshBtn.disabled = this.isRefreshing;
    refreshBtn.onclick = () => this.handleRefresh();
    
    const createBtn = buttonContainer.createEl("button", { 
      text: "Create Tests",
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
      text: "Mark All Tests"
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
    item.style.paddingLeft = `${level * 20}px`;
    
    if (node.isFolder) {
      const folderRow = item.createEl("div", { cls: "folder-row" });
      
      const toggleBtn = folderRow.createEl("div", { 
        cls: `folder-toggle ${node.expanded ? 'expanded' : 'collapsed'}` 
      });
      
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="${node.expanded ? '6 9 12 15 18 9' : '9 18 15 12 9 6'}"></polyline>
        </svg>
      `;
      
      const folderIcon = folderRow.createEl("span", { cls: "folder-icon" });
      folderIcon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      `;
      
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
      fileIcon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      `;
      
      fileRow.createEl("span", { text: node.name, cls: "file-name" });
      
      const docState = this.plugin.testDocuments[node.path];
      const statusSpan = fileRow.createEl("span", { cls: "status-icon" });
      
      if (!docState) {
        const badge = statusSpan.createEl("div", { cls: "status-badge none" });
        badge.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="badge-icon">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
          </svg>
          <span>No Tests</span>
        `;
      } else if (typeof docState.score === "number") {
        const score = docState.score;
        const colorClass = score >= 80 ? "complete" : "partial";
        
        const button = statusSpan.createEl("button", { 
          attr: { title: "Open Test Document" } 
        });
        
        const badge = button.createEl("div", { cls: `status-badge ${colorClass}` });
        
        const percent = Math.round(score);
        const radius = 8;
        const circumference = 2 * Math.PI * radius;
        const dashoffset = circumference * (1 - percent / 100);
        
        badge.innerHTML = `
          <svg class="progress-ring" width="18" height="18" viewBox="0 0 24 24">
            <circle class="progress-ring-circle" cx="12" cy="12" r="${radius}"/>
            <circle class="progress-ring-progress" 
              cx="12" cy="12" r="${radius}"
              stroke="${score >= 80 ? '#22c55e' : '#f59e0b'}"
              stroke-dasharray="${circumference} ${circumference}"
              stroke-dashoffset="${dashoffset}"/>
          </svg>
          <span>${percent}%</span>
        `;
        
        button.onclick = (e) => {
          this.plugin.openQuestionDoc(node.path);
          e.stopPropagation();
        };
      } else {
        const totalQ = docState.questions.length;
        const answeredCount = Object.values(docState.answers || {}).filter(val => (val as string).trim()).length;
        
        const percentComplete = Math.round((answeredCount / totalQ) * 100);
        const colorClass = answeredCount === 0 ? "none" : (answeredCount === totalQ ? "complete" : "in-progress");
        
        const button = statusSpan.createEl("button", { 
          attr: { title: "Open Test Document" } 
        });
        
        const badge = button.createEl("div", { cls: `status-badge ${colorClass}` });
        
        if (answeredCount === 0) {
          badge.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="badge-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span>Start</span>
          `;
        } else {
          const radius = 8;
          const circumference = 2 * Math.PI * radius;
          const dashoffset = circumference * (1 - percentComplete / 100);
          
          badge.innerHTML = `
            <svg class="progress-ring" width="18" height="18" viewBox="0 0 24 24">
              <circle class="progress-ring-circle" cx="12" cy="12" r="${radius}"/>
              <circle class="progress-ring-progress" 
                cx="12" cy="12" r="${radius}"
                stroke="#f59e0b"
                stroke-dasharray="${circumference} ${circumference}"
                stroke-dashoffset="${dashoffset}"/>
            </svg>
            <span>${answeredCount}/${totalQ}</span>
          `;
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
    
    if (!apiKey) {
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
          icon.innerHTML = `<div class="spinner"></div>`;
        }
  
        tasks.push((async () => {
          try {
            const res = await generateTestQuestions(
              [note], 
              ragPlugin.settings.llmProvider,
              ragPlugin.settings.apiKeys,
              ragPlugin.settings.models
            );
            
            ragPlugin.testDocuments[filePath] = { 
              description: res.description, 
              questions: res.questions, 
              answers: {} 
            };
            await ragPlugin.saveSettings();
            
            if (icon) {
              const button = document.createElement('button');
              button.title = "Open Test Document";
              
              const badge = document.createElement('div');
              badge.className = "status-badge none";
              badge.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="badge-icon">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span>Start</span>
              `;
              
              button.appendChild(badge);
              icon.innerHTML = '';
              icon.appendChild(button);
              button.onclick = (e) => {
                ragPlugin.openQuestionDoc(filePath);
                e.stopPropagation();
              };
            }
          } catch (error) {
            console.error("Error generating tests:", error);
            
            if (icon) {
              const badge = document.createElement('div');
              badge.className = "status-badge none";
              badge.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="badge-icon">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                  <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
                <span>No Tests</span>
              `;
              
              icon.innerHTML = '';
              icon.appendChild(badge);
            }
            
            if (error instanceof ContextLengthExceededError) {
              new Notice(`❌ ${filePath}: ${error.message}`, 10000);
            } else {
              new Notice(`❌ Error generating tests for ${filePath}`);
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
    
    if (!apiKeys[provider]) {
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
    const loadingOverlay = container.createDiv({ cls: "loading-container" });
    loadingOverlay.style.position = "fixed";
    loadingOverlay.style.top = "0";
    loadingOverlay.style.left = "0";
    loadingOverlay.style.width = "100%";
    loadingOverlay.style.height = "100%";
    loadingOverlay.style.zIndex = "1000";
    loadingOverlay.style.display = "flex";
    loadingOverlay.style.justifyContent = "center";
    loadingOverlay.style.alignItems = "center";
    loadingOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    
    const spinnerContainer = loadingOverlay.createDiv({ cls: "loading-container" });
    spinnerContainer.createDiv({ cls: "spinner" });
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
            this.plugin.settings.models
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