/*
This file handles communication with OpenAI to generate test questions.
It now expects a JSON-formatted response that returns an object with two keys:
'description' (a brief context for the tests) and 'questions' (an array of objects, each with a single key 'question').
If the JSON is incomplete or wrapped in markdown fences, the code attempts to clean the output.
*/

import { formatNotesForLLM } from "./formatter";
import type { IndexedNote, LLMResponse, TestQuestionsResponse } from "../models/types";

const API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Sends formatted note data to OpenAI and retrieves test questions as JSON.
 * @param indexedNotes - The indexed notes to generate questions from.
 * @param apiKey - The OpenAI API key.
 * @returns A promise that resolves to a TestQuestionsResponse object.
 */
export async function generateTestQuestions(indexedNotes: IndexedNote[], apiKey: string): Promise<TestQuestionsResponse> {
	if (!apiKey) {
		throw new Error("Missing OpenAI API key! Please set it in the plugin settings.");
	}
	const prompt = formatNotesForLLM(indexedNotes);
	const requestBody = {
		model: "gpt-4-turbo",
		messages: [
			{ 
				role: "system", 
				content: "You are a helpful AI that generates test questions from study notes. Respond ONLY with a JSON object with two keys: 'description' and 'questions'. 'description' should be a brief summary of what the tests cover. 'questions' should be an array of objects, each having a single key 'question'. Do not include any additional text or markdown formatting." 
			},
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

	console.log("Raw LLM output:", output);

	// Clean the output by trimming whitespace and removing markdown fences if present.
	let jsonString = output.trim();
	if (jsonString.startsWith("```json")) {
		jsonString = jsonString.slice(7).trim();
	}
	if (jsonString.endsWith("```")) {
		jsonString = jsonString.slice(0, -3).trim();
	}
	// If the JSON might be truncated, try to extract up to the last closing brace.
	const lastBrace = jsonString.lastIndexOf("}");
	if (lastBrace !== -1) {
		jsonString = jsonString.slice(0, lastBrace + 1);
	}
	// Ensure the JSON string ends with a closing curly brace.
	if (!jsonString.endsWith("}")) {
		jsonString += "}";
	}

	console.log("Cleaned JSON string:", jsonString);

	try {
		const parsed: TestQuestionsResponse = JSON.parse(jsonString);
		return parsed;
	} catch (err) {
		console.error("Error parsing JSON from LLM response:", err, "Cleaned JSON string:", jsonString);
		throw new Error("Failed to parse JSON response from OpenAI");
	}
}