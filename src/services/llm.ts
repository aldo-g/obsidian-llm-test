// src/services/llm.ts
import { formatNotesForLLM } from "./formatter";
import type {
  IndexedNote,
  LLMResponse,
  TestQuestionsResponse,
} from "../models/types";

// IMPORTANT: Make sure this constant is defined at the top of the file
const API_URL = "https://api.openai.com/v1/chat/completions";

export class ContextLengthExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextLengthExceededError";
  }
}

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

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      
      // Check for context length exceeded error
      if (errorData.error?.code === "context_length_exceeded") {
        throw new ContextLengthExceededError(
          "The document is too large for GPT-4's context window. Please split your document into smaller sections or use a model with larger context."
        );
      }
      
      throw new Error(`OpenAI API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
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
  } catch (error) {
    // Re-throw ContextLengthExceededError to preserve the specific error type
    if (error instanceof ContextLengthExceededError) {
      throw error;
    }
    
    // For other errors, check if it's an OpenAI error response with context length issue
    if (error instanceof Error && 
        (error.message.includes("context_length_exceeded") || 
         error.message.includes("maximum context length"))) {
      throw new ContextLengthExceededError(
        "The document is too large for GPT-4's context window. Please split your document into smaller sections or use a model with larger context."
      );
    }
    
    // Re-throw any other errors
    throw error;
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
): Promise<Array<{ questionNumber: number; marks: number; maxMarks: number; feedback: string }>> {
  if (!apiKey) {
    throw new Error("No API key provided for markTestAnswers.");
  }

  const systemMessage = `
You are a helpful AI that grades user answers based on the provided source text.
A question might have (1), (2), or (3) to indicate mark weighting. For each answer, you need to return:
  - questionNumber: The question number (starting from 1)
  - marks: How many marks earned (0 to maxMarks)
  - maxMarks: Maximum possible marks for this question (1, 2, or 3)
  - feedback: A brief explanation of the grading

Output must be a JSON array with these fields only.
`.trim();

  // Build up user prompt with question text + user answers
  let userPrompt = `SOURCE DOCUMENT:\n${noteContent}\n\nUSER ANSWERS:\n`;
  qnaPairs.forEach((pair, index) => {
    // Extract max marks from question text if possible
    let maxMarks = 1;
    const marksMatch = pair.question.match(/\((\d)\)\s*$/);
    if (marksMatch && [1, 2, 3].includes(parseInt(marksMatch[1], 10))) {
      maxMarks = parseInt(marksMatch[1], 10);
    } else if (pair.type === "long") {
      maxMarks = 2;
    } else if (pair.type === "extended") {
      maxMarks = 3;
    }
    
    userPrompt += `Q${index + 1} (maxMarks=${maxMarks}): ${pair.question}\nAnswer: ${pair.answer || "[No answer provided]"}\n\n`;
  });
  userPrompt += `Please return a JSON array of objects, each with { "questionNumber", "marks", "maxMarks", "feedback" }. 
Marks should reflect the quality of the answer (0 = no credit, maxMarks = full credit, with partial marks possible).
No extra fields, no markdown code blocks.`;

  const reqBody = {
    model: "gpt-4",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 1000,
    temperature: 0.0,
  };

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reqBody),
    });

    if (!resp.ok) {
      const errorData = await resp.json();
      
      // Check for context length exceeded error
      if (errorData.error?.code === "context_length_exceeded") {
        throw new ContextLengthExceededError(
          "The document is too large for GPT-4's context window. Please split your document into smaller sections or use a model with larger context."
        );
      }
      
      throw new Error(`OpenAI API Error: ${resp.status} - ${errorData.error?.message || resp.statusText}`);
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
        marks: number;
        maxMarks: number;
        feedback: string;
      }>;
    } catch (err) {
      throw new Error("Failed to parse LLM marking JSON output.");
    }
  } catch (error) {
    // Re-throw ContextLengthExceededError to preserve the specific error type
    if (error instanceof ContextLengthExceededError) {
      throw error;
    }
    
    // For other errors, check if it's an OpenAI error response with context length issue
    if (error instanceof Error && 
        (error.message.includes("context_length_exceeded") || 
         error.message.includes("maximum context length"))) {
      throw new ContextLengthExceededError(
        "The document is too large for GPT-4's context window. Please split your document into smaller sections or use a model with larger context."
      );
    }
    
    // Re-throw any other errors
    throw error;
  }
}