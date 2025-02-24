import { formatNotesForLLM } from "./formatter";
import type { IndexedNote } from "../models/types";

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
export interface TestQuestionsResponse {
	description: string;
	questions: { question: string }[];
}

const API_URL = "https://api.openai.com/v1/chat/completions";

export async function generateTestQuestions(indexedNotes: IndexedNote[], apiKey: string): Promise<TestQuestionsResponse> {
	if (!apiKey) {
		throw new Error("Missing OpenAI API key! Please set it in the plugin settings.");
	}
	const prompt = formatNotesForLLM(indexedNotes);
	const requestBody = {
		model: "gpt-4",
		messages: [
			{
				role: "system",
				content: `You are a helpful AI that generates test questions from study notes. 
Respond ONLY with a JSON object with two keys: 'description' and 'questions'. 
'description' is a brief summary of what the tests cover. 
'questions' is an array of objects, each with a single key 'question'. 
Do not include any additional text or markdown formatting.`
			},
			{ role: "user", content: prompt }
		],
		temperature: 0.7,
		max_tokens: 500
	};

	const response = await fetch(API_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(requestBody)
	});

	if (!response.ok) {
		throw new Error(`OpenAI API Error: ${response.statusText}`);
	}

	const responseData = await response.json() as LLMResponse;
	const output = responseData.choices?.[0]?.message?.content;
	if (!output) {
		throw new Error("Invalid response from OpenAI");
	}

	let jsonString = output.trim();
	if (jsonString.startsWith("```json")) {
		jsonString = jsonString.slice(7).trim();
	}
	if (jsonString.endsWith("```")) {
		jsonString = jsonString.slice(0, -3).trim();
	}
	const lastBrace = jsonString.lastIndexOf("}");
	if (lastBrace !== -1) {
		jsonString = jsonString.slice(0, lastBrace + 1);
	}
	if (!jsonString.endsWith("}")) {
		jsonString += "}";
	}
	try {
		const parsed: TestQuestionsResponse = JSON.parse(jsonString);
		return parsed;
	} catch (err) {
		throw new Error("Failed to parse JSON response from OpenAI");
	}
}

export async function markTestAnswers(noteContent: string, qnaPairs: { question: string; answer: string }[], apiKey: string): Promise<Array<{ questionNumber: number; correct: boolean; feedback: string }>> {
	if (!apiKey) {
		throw new Error("No API key provided for markTestAnswers.");
	}
	const systemMessage = `
You are a helpful AI that grades user answers based on the provided source text. 
Return your feedback ONLY as a JSON array, with each element containing:
- "questionNumber": the question index (1-based)
- "correct": true or false
- "feedback": a concise explanation
No extra text or markdown fences.
`.trim();

	let userPrompt = `SOURCE DOCUMENT:\n${noteContent}\n\nUSER'S ANSWERS:\n`;
	qnaPairs.forEach((pair, idx) => {
		userPrompt += `Q${idx + 1}: ${pair.question}\nAnswer: ${pair.answer}\n\n`;
	});
	userPrompt += `Please return a JSON array where each object has "questionNumber", "correct", and "feedback". 
No extra text or formatting. 
If you cannot judge correctness, please set "correct": false and provide minimal feedback.`;

	const reqBody = {
		model: "gpt-4",
		messages: [
			{ role: "system", content: systemMessage },
			{ role: "user", content: userPrompt }
		],
		max_tokens: 1000,
		temperature: 0.0
	};

	const resp = await fetch(API_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(reqBody)
	});

	if (!resp.ok) {
		throw new Error(`OpenAI API error: ${resp.status} - ${resp.statusText}`);
	}

	const data = await resp.json() as LLMResponse;
	let feedback = data.choices?.[0]?.message?.content;
	if (!feedback) {
		throw new Error("No content returned by LLM for markTestAnswers.");
	}
	feedback = feedback.trim();
	if (feedback.startsWith("```")) {
		feedback = feedback.replace(/^```[a-z]*\n?/, "").replace(/```$/, "").trim();
	}
	try {
		const parsed = JSON.parse(feedback) as Array<{ questionNumber: number; correct: boolean; feedback: string }>;
		return parsed;
	} catch (err) {
		throw new Error("Failed to parse LLM marking JSON output.");
	}
}