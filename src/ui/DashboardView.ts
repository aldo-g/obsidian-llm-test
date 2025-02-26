import { App, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { IndexedNote } from "../models/types";
import { generateTestQuestions, ContextLengthExceededError } from "../services/llm";
import type MyPlugin from "../../main";

export const VIEW_TYPE = "rag-test-view";

// File tree node structure
interface FileTreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: FileTreeNode[];
  expanded?: boolean;
  // For files only
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
    // If we don't have any data, automatically refresh
    if (!this.pluginData || this.pluginData.length === 0) {
      this.handleRefresh();
    } else {
      this.render();
    }
  }
  
  async onClose() {}

  /**
   * Builds a file tree structure from the flat list of files
   */
  buildFileTree() {
    // Reset the tree
    this.fileTreeRoot = { name: "root", path: "", isFolder: true, children: [] };
    
    // Process each file path
    this.pluginData.forEach(note => {
      const pathParts = note.filePath.split('/');
      let currentNode = this.fileTreeRoot;
      let currentPath = "";
      
      // Process each path segment except the last one (which is the file name)
      for (let i = 0; i < pathParts.length - 1; i++) {
        const folderName = pathParts[i];
        currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        
        // Check if folder already exists in current node's children
        let folderNode = currentNode.children.find(
          child => child.isFolder && child.name === folderName
        );
        
        // If folder doesn't exist, create it
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
        
        // Move down to this folder
        currentNode = folderNode;
      }
      
      // Add the file to the current folder
      const fileName = pathParts[pathParts.length - 1];
      currentNode.children.push({
        name: fileName,
        path: note.filePath,
        isFolder: false,
        children: [],
        note: note
      });
    });
    
    // Sort folders and files
    this.sortFileTree(this.fileTreeRoot);
  }
  
  /**
   * Recursively sorts the file tree - folders first, then files, both alphabetically
   */
  sortFileTree(node: FileTreeNode) {
    // Sort the children: folders first (alphabetically), then files (alphabetically)
    node.children.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    
    // Sort children of folders recursively
    node.children.forEach(child => {
      if (child.isFolder) {
        this.sortFileTree(child);
      }
    });
  }

  async render() {
    const container = this.containerEl;
    container.empty();
    
    // Apply the container class for styling
    container.addClass("test-dashboard-container");

    // Check if the plugin is available (it should be, since we're passing it in)
    const ragPlugin = this.plugin;
    if (!ragPlugin) {
      container.createEl("div", { 
        cls: "empty-state",
        text: "RAG Test Plugin not found." 
      });
      return;
    }

    // Create header with title and buttons
    const header = container.createEl("div", { cls: "dashboard-header" });
    
    // Title
    header.createEl("h2", { 
      text: "Test Dashboard",
      cls: "dashboard-title" 
    });
    
    // Buttons container
    const buttonContainer = header.createEl("div", { cls: "dashboard-actions" });
    
    // Refresh button
    const refreshBtn = buttonContainer.createEl("button", { 
      cls: "dashboard-button secondary",
      attr: {
        title: "Refresh file index"
      }
    });
    
    // Refresh button content
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
    
    // Create Tests button
    const createBtn = buttonContainer.createEl("button", { 
      text: "Create Tests",
      cls: "dashboard-button primary" 
    });
    createBtn.disabled = true; // Enable when files are selected
    createBtn.onclick = () => this.createTests();

    // File tree container
    const fileTreeContainer = container.createEl("div", { cls: "file-tree-container" });
    
    // If no files found, show empty state
    if (!this.pluginData || this.pluginData.length === 0) {
      fileTreeContainer.createEl("div", { 
        cls: "empty-state",
        text: "No files found. Click Refresh to scan your vault." 
      });
      return;
    }

    // Rebuild the file tree (in case new files were added)
    this.buildFileTree();
    
    // Render the file tree
    this.renderFileTree(fileTreeContainer, this.fileTreeRoot, createBtn);

    // Initialize the Create Tests button state
    this.updateCreateBtn(createBtn);
  }

  /**
   * Recursively renders the file tree
   */
  renderFileTree(container: HTMLElement, node: FileTreeNode, createBtn: HTMLButtonElement, level = 0) {
    if (node === this.fileTreeRoot) {
      // For the root node, just render its children
      const treeRoot = container.createEl("div", { cls: "file-tree" });
      node.children.forEach(child => {
        this.renderFileTree(treeRoot, child, createBtn, level);
      });
      return;
    }
    
    const item = container.createEl("div", { cls: "file-tree-item" });
    
    // Add indentation based on nesting level
    item.style.paddingLeft = `${level * 20}px`;
    
    // Create expand/collapse toggle for folders
    if (node.isFolder) {
      const folderRow = item.createEl("div", { cls: "folder-row" });
      
      // Toggle button
      const toggleBtn = folderRow.createEl("div", { 
        cls: `folder-toggle ${node.expanded ? 'expanded' : 'collapsed'}` 
      });
      
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="${node.expanded ? '6 9 12 15 18 9' : '9 18 15 12 9 6'}"></polyline>
        </svg>
      `;
      
      // Folder icon
      const folderIcon = folderRow.createEl("span", { cls: "folder-icon" });
      folderIcon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      `;
      
      // Folder name
      folderRow.createEl("span", { text: node.name, cls: "folder-name" });
      
      // Click handler for the folder row
      folderRow.onclick = (e) => {
        // Toggle the expanded state
        node.expanded = !node.expanded;
        
        // Update expanded folders set
        if (node.expanded) {
          this.expandedFolders.add(node.path);
        } else {
          this.expandedFolders.delete(node.path);
        }
        
        // Re-render the tree
        this.render();
        
        // Prevent event from bubbling
        e.stopPropagation();
      };
      
      // If expanded, render children
      if (node.expanded) {
        const childContainer = item.createEl("div", { cls: "folder-children" });
        node.children.forEach(child => {
          this.renderFileTree(childContainer, child, createBtn, level + 1);
        });
      }
    } else {
      // This is a file
      const fileRow = item.createEl("div", { cls: "file-row" });
      
      // Checkbox for file selection
      const checkbox = fileRow.createEl("input", { 
        type: "checkbox",
        cls: "file-checkbox" 
      });
      checkbox.dataset.filePath = node.path;
      
      // File icon
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
      
      // File name
      fileRow.createEl("span", { text: node.name, cls: "file-name" });
      
      // Status indicator for the file
      const docState = this.plugin.testDocuments[node.path];
      const statusSpan = fileRow.createEl("span", { cls: "status-icon" });
      
      // Determine the icon and text based on the document state
      if (!docState) {
        // No tests yet
        const badge = statusSpan.createEl("div", { cls: "status-badge none" });
        badge.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="badge-icon">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
          </svg>
          <span>No Tests</span>
        `;
      } else if (typeof docState.score === "number") {
        // Test completed with score
        const score = docState.score;
        const colorClass = score >= 80 ? "complete" : "partial";
        
        const button = statusSpan.createEl("button", { 
          attr: { title: "Open Test Document" } 
        });
        
        const badge = button.createEl("div", { cls: `status-badge ${colorClass}` });
        
        // Create circular progress indicator
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
        // Test created but not taken or partially completed
        const totalQ = docState.questions.length;
        const answeredCount = Object.values(docState.answers || {}).filter(val => (val as string).trim()).length;
        
        const percentComplete = Math.round((answeredCount / totalQ) * 100);
        const colorClass = answeredCount === 0 ? "none" : (answeredCount === totalQ ? "complete" : "in-progress");
        
        const button = statusSpan.createEl("button", { 
          attr: { title: "Open Test Document" } 
        });
        
        const badge = button.createEl("div", { cls: `status-badge ${colorClass}` });
        
        if (answeredCount === 0) {
          // Not started
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
          // In progress - show actual progress with mini progress bar
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
      
      // Update Create Tests button when checkbox is clicked
      checkbox.onchange = () => this.updateCreateBtn(createBtn);
    }
  }

  /**
   * Updates the Create Tests button based on checkbox selection
   */
  private updateCreateBtn(btn: HTMLButtonElement) {
    const boxes = this.containerEl.querySelectorAll('input[type="checkbox"]');
    btn.disabled = !Array.from(boxes).some(b => (b as HTMLInputElement).checked);
  }

  /**
   * Handles refreshing the file index
   */
  async handleRefresh() {
    if (this.isRefreshing) return;
    
    try {
      this.isRefreshing = true;
      this.render(); // Re-render to show spinner
      
      // Show notice
      new Notice("🔄 Refreshing test index...");
      
      // Call the indexing function
      const refreshedNotes = await this.plugin.indexTestNotes();
      
      // Update our local data
      this.pluginData = refreshedNotes;
      
      // Render the updated view
      this.render();
      
      // Show success notice
      new Notice(`✅ Indexed ${refreshedNotes.length} notes`);
    } catch (error) {
      console.error("Error refreshing index:", error);
      new Notice("❌ Error refreshing index. Check console for details.");
    } finally {
      this.isRefreshing = false;
      this.render();
    }
  }

  /**
   * Creates tests for the selected files
   */
  async createTests() {
    const ragPlugin = this.plugin;
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

        // Find the parent list item and get the status icon
        const fileRow = input.closest('.file-row');
        const icon = fileRow?.querySelector<HTMLSpanElement>(".status-icon");
        
        if (icon) {
          // Show spinner while generating
          icon.innerHTML = `<div class="spinner"></div>`;
        }

        tasks.push((async () => {
          try {
            const res = await generateTestQuestions([note], key);
            ragPlugin.testDocuments[filePath] = { 
              description: res.description, 
              questions: res.questions, 
              answers: {} 
            };
            await ragPlugin.saveSettings();
            
            if (icon) {
              // Update icon to show test is ready
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
              // Reset icon if error occurs
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
            
            // Check for context length error and display specific message
            if (error instanceof ContextLengthExceededError) {
              new Notice(`❌ ${filePath}: ${error.message}`, 10000); // Show for 10 seconds
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
      
      // Uncheck all boxes after completion
      boxes.forEach(box => {
        (box as HTMLInputElement).checked = false;
      });
      
      // Update the Create Tests button state
      const createBtn = this.containerEl.querySelector('.dashboard-button.primary') as HTMLButtonElement;
      if (createBtn) {
        createBtn.disabled = true;
      }
    } catch (error) {
      console.error("Error in test generation:", error);
      new Notice("❌ Some tests could not be generated. Check console for details.");
    }
  }
}