export interface GeneratedTest {
	question: string;
}
export interface TestQuestionsResponse {
	description: string;
	questions: GeneratedTest[];
}
export interface TestDocumentState {
	description: string;
	questions: GeneratedTest[];
	answers: { [key: number]: string };
}
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
export interface TestStatus {
	testsReady: boolean;
	passed: number;
	total: number;
}
export interface IndexedNote {
	filePath: string;
	content: string;
	testStatus: TestStatus;
}