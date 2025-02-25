export interface GeneratedTest {
	/**
	 * The question text. For example:
	 *   - "What is X? (1)"
	 *   - "Explain Y. (2)"
	 *   - "Discuss the impact of Z with examples. (3)"
	 */
	question: string;
  
	/**
	 * Indicates if the question is a 1-mark, 2-mark, or 3-mark question.
	 *   "short" => 1 mark
	 *   "long"  => 2 marks
	 *   "extended" => 3 marks
	 */
	type: "short" | "long" | "extended";
  }
  
  export interface TestQuestionsResponse {
	description: string;
	questions: GeneratedTest[];
  }
  
  export interface TestDocumentState {
	description: string;
	questions: GeneratedTest[];
	answers: { [key: number]: string };
	score?: number;
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
  
  /**
   * Basic structure for test readiness and pass/fail counters in your notes.
   */
  export interface TestStatus {
	testsReady: boolean;
	passed: number;
	total: number;
  }
  
  /**
   * Represents a file in the vault that may have a "## Test" section, etc.
   */
  export interface IndexedNote {
	filePath: string;
	content: string;
	testStatus: TestStatus;
  }