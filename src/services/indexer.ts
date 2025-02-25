import { App } from "obsidian";
import type { IndexedNote, TestStatus } from "../models/types";

export async function indexTestNotes(app: App): Promise<IndexedNote[]> {
  const notes: IndexedNote[] = [];
  const markdownFiles = app.vault.getMarkdownFiles();

  for (const file of markdownFiles) {
    const content = await app.vault.read(file);

    let total = 0;
    let passed = 0;

    const regex = /- \[( |x)\]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      total++;
      if (match[1] === "x") {
        passed++;
      }
    }

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