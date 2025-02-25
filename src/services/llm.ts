// src/services/llm.ts

import { formatNotesForLLM } from "./formatter";
import type {
  IndexedNote,
  LLMResponse,
  TestQuestionsResponse,
} from "../models/types";

const API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Generates test questions, each ending in (1), (2), or (3),
 * plus a 'type' field indicating "short", "long", or "extended".
 */
export async function generateTestQuestions(
  indexedNotes: IndexedNote[],
  apiKey: string
): Promise<TestQuestionsResponse> {
  if (!apiKey) {
    throw new Error("Missing OpenAI API key! Please set it in the plugin settings.");
  }

  const notesPrompt = formatNotesForLLM(indexedNotes);

  // System instructions:
  //   - We want the final JSON to have "description" + an array "questions"
  //   - Each question must end with (1), (2), or (3)
  //   - "type" is "short", "long", or "extended" correspondingly.
  const systemInstructions = `
You are a helpful AI that generates test questions from user study notes.
We want each question to end with "(1)", "(2)", or "(3)" to show how many marks it is worth.
Correspondingly, the "type" field is "short" (1 mark), "long" (2 marks), or "extended" (3 marks).

Return JSON in this shape (no extra keys, no markdown fences):
{
  "description": string,
  "questions": [
    { "question": "What is X? (1)", "type": "short" },
    { "question": "Explain Y in detail. (2)", "type": "long" },
    { "question": "Discuss Z thoroughly with examples. (3)", "type": "extended" }
  ]
}
`.trim();

  const requestBody = {
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: systemInstructions,
      },
      {
        role: "user",
        content: notesPrompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 500,
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${response.statusText}`);
  }

  const responseData = (await response.json()) as LLMResponse;
  const rawContent = responseData.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("No content from LLM for test questions.");
  }

  // Clean up potential formatting
  let jsonString = rawContent.trim();
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
    throw new Error("Failed to parse JSON response for test questions");
  }
}

/**
 * Mark user answers.
 * We can pass the question text, which might have (1), (2), or (3).
 * We'll also pass question type if we want the LLM to see that it's short/long/extended.
 */
export async function markTestAnswers(
  noteContent: string,
  qnaPairs: {
    question: string; // e.g. "Explain Y. (2)"
    answer: string;
    type?: "short" | "long" | "extended";
  }[],
  apiKey: string
): Promise<Array<{ questionNumber: number; correct: boolean; feedback: string }>> {
  if (!apiKey) {
    throw new Error("No API key provided for markTestAnswers.");
  }

  const systemMessage = `
You are a helpful AI that grades user answers based on the provided source text.
A question might have (1), (2), or (3) to indicate mark weighting, but you only return:
  - questionNumber
  - correct (true/false)
  - feedback (a brief explanation)
Output must be JSON array only, no additional text.
`.trim();

  // Build up user prompt with question text + user answers
  let userPrompt = `SOURCE DOCUMENT:\n${noteContent}\n\nUSER ANSWERS:\n`;
  qnaPairs.forEach((pair, index) => {
    userPrompt += `Q${index + 1} (type=${pair.type||"?"}): ${pair.question}\nAnswer: ${pair.answer}\n\n`;
  });
  userPrompt += `Please return a JSON array of objects, each { "questionNumber", "correct", "feedback" }. No extra keys.`;

  const reqBody = {
    model: "gpt-4",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 1000,
    temperature: 0.0,
  };

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody),
  });

  if (!resp.ok) {
    throw new Error(`OpenAI API error: ${resp.status} - ${resp.statusText}`);
  }

  const data = (await resp.json()) as LLMResponse;
  let feedback = data.choices?.[0]?.message?.content;
  if (!feedback) {
    throw new Error("No marking feedback returned by LLM.");
  }

  feedback = feedback.trim();
  if (feedback.startsWith("```")) {
    feedback = feedback.replace(/^```[a-z]*\n?/, "").replace(/```$/, "").trim();
  }

  try {
    return JSON.parse(feedback) as Array<{
      questionNumber: number;
      correct: boolean;
      feedback: string;
    }>;
  } catch (err) {
    throw new Error("Failed to parse LLM marking JSON output.");
  }
}