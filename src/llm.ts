/**
 * Handles communication with OpenAI to generate test questions.
 */

import { formatNotesForLLM } from "./formatter";
import type { IndexedNote, LLMResponse } from "./types";

const API_URL = "https://api.openai.com/v1/chat/completions";

// Load API key from environment variables (DO NOT hardcode!)
import { config } from "dotenv";
config(); // Load .env variables

const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
	throw new Error("Missing OpenAI API key! Add it to your .env file.");
}

console.log("✅ OpenAI API Key Loaded Successfully");

/**
 * Sends formatted note data to OpenAI and retrieves test questions.
 * @param {IndexedNote[]} indexedNotes - The indexed notes to generate questions from.
 * @returns {Promise<string[]>} - The generated test questions.
 */
export async function generateTestQuestions(indexedNotes: IndexedNote[]): Promise<string[]> {
	const prompt = formatNotesForLLM(indexedNotes);

	const requestBody = {
		model: "gpt-4-turbo", // You can change this model
		messages: [
			{ role: "system", content: "You are a helpful AI that generates test questions from study notes." },
			{ role: "user", content: prompt }
		],
		temperature: 0.7, // Adjust for more or less creativity
		max_tokens: 500
	};

	const response = await fetch(API_URL, {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${API_KEY}`,
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