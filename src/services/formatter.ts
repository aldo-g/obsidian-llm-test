import type { IndexedNote } from "../models/types";

export function formatNotesForLLM(notes: IndexedNote[]): string {
	let prompt = "Generate test questions based on the following notes.\n\n";
	notes.forEach(note => {
		prompt += `### Note: ${note.filePath}\n`;
		prompt += `Content:\n${note.content}\n\n`;
	});
	prompt += "Ensure that the test questions are relevant to the content and test key concepts.";
	return prompt;
}