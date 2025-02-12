/**
 * Test script to verify the indexing, formatting, and LLM response generation.
 * It mocks an Obsidian vault, runs the indexer and formatter, calls the LLM, and prints the output.
 */

import { indexTestNotes } from "./src/indexer";
import { formatNotesForLLM } from "./src/formatter";
import { generateTestQuestions } from "./src/llm";
import type { IndexedNote } from "./src/types";

// Mock Vault class to simulate Obsidian vault behavior
class MockVault {
	files: { path: string; content: string }[];

	constructor(files: { path: string; content: string }[]) {
		this.files = files;
	}

	// Simulates fetching Markdown files
	getMarkdownFiles() {
		return this.files.map(file => ({
			path: file.path,
		}));
	}

	// Simulates reading a file's content
	async read(file: { path: string }) {
		const found = this.files.find(f => f.path === file.path);
		if (found) {
			return found.content;
		}
		throw new Error(`File not found: ${file.path}`);
	}
}

// Mock App object
class MockApp {
	vault: MockVault;

	constructor(vault: MockVault) {
		this.vault = vault;
	}
}

// Sample test data (simulating Obsidian Markdown files)
const mockFiles = [
	{
		path: "Test/1.1 - The Art of Learning.md",
		content: "## Key Takeaways\n- Learning is an iterative process.\n- Experimentation is crucial.\n\n## Test\n- [ ] What is the key principle of learning?",
	},
	{
		path: "Test/1.2 - The Pyramid Principle.md",
		content: "## Summary\nThe Pyramid Principle helps structure arguments.\n\n## Test\n- [x] What does the Pyramid Principle help with?",
	},
	{
		path: "General Notes/1.3 - Random Thoughts.md",
		content: "## Notes\nSome random reflections on life.",
	},
];

async function runTest() {
	// Initialize mock app and vault
	const mockApp = new MockApp(new MockVault(mockFiles));

	// Step 1: Run indexer
	const indexedNotes: IndexedNote[] = await indexTestNotes(mockApp as any);
	console.log("\n📂 Indexed Notes:\n", indexedNotes);

	// Step 2: Run formatter
	const formattedPrompt = formatNotesForLLM(indexedNotes);
	console.log("\n📝 Formatted Prompt for LLM:\n", formattedPrompt);

	// Step 3: Call LLM to generate test questions
	try {
		console.log("\n🚀 Sending request to OpenAI...\n");
		const testQuestions = await generateTestQuestions(indexedNotes);
		console.log("\n✅ Generated Test Questions:\n", testQuestions);
	} catch (error) {
		console.error("\n❌ Error in LLM call:", error);
	}
}

// Execute the test
runTest();