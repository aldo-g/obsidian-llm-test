/**
 * Represents a generated test question returned from the LLM.
 */
export interface GeneratedTest {
	question: string;
}

/**
 * Represents the complete LLM response for test questions.
 */
export interface TestQuestionsResponse {
	description: string;
	questions: GeneratedTest[];
}

/**
 * Represents the persisted state for a test document.
 */
export interface TestDocumentState {
	description: string;
	questions: GeneratedTest[];
	answers: { [key: number]: string };
}

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