import { App } from "obsidian";
import type { IndexedNote, TestStatus } from "../models/types";

/**
 * Reads *all* Markdown files in the vault and extracts any checklist items 
 * to build a test status. If no items are found, total/passed remain zero.
 */
export async function indexTestNotes(app: App): Promise<IndexedNote[]> {
  const notes: IndexedNote[] = [];
  const markdownFiles = app.vault.getMarkdownFiles();

  for (const file of markdownFiles) {
    const content = await app.vault.read(file);

    // Let’s just see how many checkboxes exist, ignoring whether “## Test” is present.
    let total = 0;
    let passed = 0;

    // This regex finds `- [ ]` or `- [x]` lines anywhere.
    const regex = /- \[( |x)\]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      total++;
      if (match[1] === "x") {
        passed++;
      }
    }

    // If you want, you can remove or rename “testsReady” altogether:
    const testsReady = (total > 0);

    const testStatus: TestStatus = { testsReady, passed, total };
    notes.push({
      filePath: file.path,
      content,
      testStatus
    });
  }

  return notes;
}