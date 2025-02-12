/*
This file handles communication with OpenAI to generate test questions.
It exports a function generateTestQuestions that sends a prompt (built using formatter.ts)
to OpenAI using the provided API key and returns an array of test questions.
*/

import { formatNotesForLLM } from "./formatter";
import type { IndexedNote, LLMResponse } from "../models/types";

const API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Sends formatted note data to OpenAI and retrieves test questions.
 * @param indexedNotes - The indexed notes to generate questions from.
 * @param apiKey - The OpenAI API key.
 * @returns A promise that resolves to an array of generated test questions.
 */
export async function generateTestQuestions(indexedNotes: IndexedNote[], apiKey: string): Promise<string[]> {
	if (!apiKey) {
		throw new Error("Missing OpenAI API key! Please set it in the plugin settings.");
	}
	const prompt = formatNotesForLLM(indexedNotes);
	const requestBody = {
		model: "gpt-3.5-turbo-0125",
		messages: [
			{ role: "system", content: "You are a helpful AI that generates test questions from study notes. Your questions should be answered with written answers." },
			{ role: "user", content: prompt }
		],
		temperature: 0.7,
		max_tokens: 500
	};

	const response = await fetch(API_URL, {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${apiKey}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(requestBody)
	});

	if (!response.ok) {
		throw new Error(`OpenAI API Error: ${response.statusText}`);
	}

	const responseData: LLMResponse = await response.json();
	const output = responseData.choices?.[0]?.message?.content;

	if (!output) {
		throw new Error("Invalid response from OpenAI");
	}

	// Split response into separate questions (assuming they are newline-separated)
	return output.split("\n").filter(q => q.trim().length > 0);
}
