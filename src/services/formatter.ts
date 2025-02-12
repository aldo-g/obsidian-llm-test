/*
This file contains functions to format indexed notes into a prompt for an LLM.
It exports a function formatNotesForLLM that takes an array of IndexedNote and returns a formatted prompt string.
*/

import type { IndexedNote } from "../models/types";

/**
 * Formats an array of IndexedNote objects into a structured prompt string for the LLM.
 * @param notes - An array of IndexedNote objects.
 * @returns A formatted prompt string containing the full content of each note.
 */
export function formatNotesForLLM(notes: IndexedNote[]): string {
	let prompt = "Generate test questions based on the following notes.\n\n";
	notes.forEach(note => {
		prompt += `### Note: ${note.filePath}\n`;
		prompt += `Content:\n${note.content}\n\n`;
	});
	prompt += "Ensure that the test questions are relevant to the content and test key concepts.";
	return prompt;
}
