/*
This file contains shared type definitions for the Obsidian RAG Test Plugin,
including types for LLM responses, generated tests, and indexed notes.
*/

/**
 * Represents the response structure from the LLM API.
 */
export interface LLMResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: {
		index: number;
		message: {
			role: string;
			// Expected to be a JSON string that parses to an array of GeneratedTest objects.
			content: string;
		};
	}[];
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/**
 * Represents a generated test question and its suggested answer (which is stored but not shown to the user).
 */
export interface GeneratedTest {
	question: string;
	suggestedAnswer: string;
}

/**
 * Represents the test status for a note.
 */
export interface TestStatus {
	testsReady: boolean;
	passed: number;
	total: number;
}

/**
 * Represents an indexed note with its file path, content, and test status.
 */
export interface IndexedNote {
	filePath: string;
	content: string;
	testStatus: TestStatus;
}