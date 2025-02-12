/*
This file contains functions to scan the vault and extract test data from all Markdown files.
It exports a function indexTestNotes that reads each Markdown file,
extracts test-related markers (if any), and returns an array of IndexedNote objects.
*/

import { App } from "obsidian";
import type { IndexedNote, TestStatus } from "./types";

/**
 * Scans all Markdown files in the vault and extracts test data.
 * @param app - The Obsidian application instance.
 * @returns A promise that resolves to an array of IndexedNote objects.
 */
export async function indexTestNotes(app: App): Promise<IndexedNote[]> {
	const notes: IndexedNote[] = [];
	// Process all Markdown files without filtering by folder.
	const markdownFiles = app.vault.getMarkdownFiles();
	for (const file of markdownFiles) {
		const content = await app.vault.read(file);
		// Check for a test marker (e.g., "## Test"). This may be present in some notes.
		const testsReady = content.includes("## Test");
		let total = 0;
		let passed = 0;
		if (testsReady) {
			const regex = /- \[( |x)\]/g;
			let match;
			while ((match = regex.exec(content)) !== null) {
				total++;
				if (match[1] === "x") passed++;
			}
		}
		const testStatus: TestStatus = { testsReady, passed, total };
		notes.push({
			filePath: file.path,
			content,
			testStatus
		});
	}
	return notes;
}