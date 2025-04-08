import { formatNotesForLLM } from "./formatter";
import type {
  IndexedNote,
  LLMResponse,
  TestQuestionsResponse,
} from "../models/types";
import type { LLMProvider } from "../../main";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

export class ContextLengthExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextLengthExceededError";
  }
}

function getApiKey(provider: LLMProvider, apiKeys: Record<string, string>): string {
  return apiKeys[provider] || "";
}

export async function generateTestQuestions(
  indexedNotes: IndexedNote[],
  provider: LLMProvider,
  apiKeys: Record<string, string>,
  models?: Record<string, string>,
  ollamaSettings?: { url: string }
): Promise<TestQuestionsResponse> {
  const apiKey = getApiKey(provider, apiKeys);
  const model = models?.[provider] || getDefaultModel(provider);
  
  // Skip API key check for Ollama
  if (provider !== "ollama" && !apiKey) {
    throw new Error(`Missing API key for ${provider}! Please set it in the plugin settings.`);
  }

  const notesPrompt = formatNotesForLLM(indexedNotes);
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

  try {
    let responseData;
    
    switch (provider) {
      case "openai":
        responseData = await callOpenAI(systemInstructions, notesPrompt, apiKey, model);
        break;
      case "anthropic":
        responseData = await callAnthropic(systemInstructions, notesPrompt, apiKey, model);
        break;
      case "deepseek":
        responseData = await callDeepSeek(systemInstructions, notesPrompt, apiKey, model);
        break;
      case "gemini":
        responseData = await callGemini(systemInstructions, notesPrompt, apiKey, model);
        break;
      case "mistral":
        responseData = await callMistral(systemInstructions, notesPrompt, apiKey, model);
        break;
      case "ollama":
        const ollamaUrl = ollamaSettings?.url || "http://localhost:11434";
        responseData = await callOllama(systemInstructions, notesPrompt, model, 500, ollamaUrl);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    return parseTestQuestionsResponse(responseData);
  } catch (error) {
    if (error instanceof ContextLengthExceededError) {
      throw error;
    }
    
    if (error instanceof Error && 
        (error.message.includes("context_length_exceeded") || 
         error.message.includes("maximum context length"))) {
      throw new ContextLengthExceededError(
        "The document is too large for the model's context window. Please split your document into smaller sections."
      );
    }
    
    throw error;
  }
}

export async function markTestAnswers(
  noteContent: string,
  qnaPairs: {
    question: string;
    answer: string;
    type?: "short" | "long" | "extended";
  }[],
  provider: LLMProvider,
  apiKeys: Record<string, string>,
  models?: Record<string, string>,
  ollamaSettings?: { url: string }
): Promise<Array<{ questionNumber: number; marks: number; maxMarks: number; feedback: string }>> {
  const apiKey = getApiKey(provider, apiKeys);
  const model = models?.[provider] || getDefaultModel(provider);
  
  // Skip API key check for Ollama
  if (provider !== "ollama" && !apiKey) {
    throw new Error(`Missing API key for ${provider}! Please set it in the plugin settings.`);
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

  let userPrompt = `SOURCE DOCUMENT:\n${noteContent}\n\nUSER ANSWERS:\n`;
  qnaPairs.forEach((pair, index) => {
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

  try {
    let responseData;
    
    switch (provider) {
      case "openai":
        responseData = await callOpenAI(systemMessage, userPrompt, apiKey, model, 1000);
        break;
      case "anthropic":
        responseData = await callAnthropic(systemMessage, userPrompt, apiKey, model, 1000);
        break;
      case "deepseek":
        responseData = await callDeepSeek(systemMessage, userPrompt, apiKey, model, 1000);
        break;
      case "gemini":
        responseData = await callGemini(systemMessage, userPrompt, apiKey, model, 1000);
        break;
      case "mistral":
        responseData = await callMistral(systemMessage, userPrompt, apiKey, model, 1000);
        break;
      case "ollama":
        const ollamaUrl = ollamaSettings?.url || "http://localhost:11434";
        responseData = await callOllama(systemMessage, userPrompt, model, 1000, ollamaUrl);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    return parseMarkingResponse(responseData);
  } catch (error) {
    if (error instanceof ContextLengthExceededError) {
      throw error;
    }
    
    if (error instanceof Error && 
        (error.message.includes("context_length_exceeded") || 
         error.message.includes("maximum context length"))) {
      throw new ContextLengthExceededError(
        "The document is too large for the model's context window. Please split your document into smaller sections."
      );
    }
    
    throw error;
  }
}

function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4";
    case "anthropic":
      return "claude-3-opus-20240229";
    case "deepseek":
      return "deepseek-chat";
    case "gemini":
      return "gemini-pro";
    case "mistral":
      return "mistral-medium";
    case "ollama":
      return "llama3";
    default:
      return "";
  }
}

function parseTestQuestionsResponse(rawContent: string): TestQuestionsResponse {
  if (!rawContent) {
    throw new Error("No content from LLM for test questions.");
  }

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

function parseMarkingResponse(feedback: string): Array<{ questionNumber: number; marks: number; maxMarks: number; feedback: string }> {
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
}

async function callOpenAI(
  systemMessage: string, 
  userPrompt: string, 
  apiKey: string, 
  model: string = "gpt-4", 
  maxTokens = 500
): Promise<string> {
  const requestBody = {
    model: model,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: maxTokens
  };

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json();
    
    if (errorData.error?.code === "context_length_exceeded") {
      throw new ContextLengthExceededError(
        `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
      );
    }
    
    throw new Error(`OpenAI API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
  }

  const responseData = await response.json();
  return responseData.choices?.[0]?.message?.content || "";
}

async function callAnthropic(
  systemMessage: string, 
  userPrompt: string, 
  apiKey: string, 
  model: string = "claude-3-opus-20240229", 
  maxTokens = 500
): Promise<string> {
  const requestBody = {
    model: model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${systemMessage}\n\n${userPrompt}`
          }
        ]
      }
    ],
    max_tokens: maxTokens
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json();
    
    if (errorData.error?.type === "context_length_exceeded" || 
        errorData.error?.message?.includes("context window")) {
      throw new ContextLengthExceededError(
        `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
      );
    }
    
    throw new Error(`Anthropic API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
  }

  const responseData = await response.json();
  return responseData.content?.[0]?.text || "";
}

async function callDeepSeek(
  systemMessage: string, 
  userPrompt: string, 
  apiKey: string, 
  model: string = "deepseek-chat", 
  maxTokens = 500
): Promise<string> {
  const requestBody = {
    model: model,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userPrompt }
    ],
    max_tokens: maxTokens
  };

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json();
    
    if (errorData.error?.code === "context_window_exceeded" || 
        errorData.error?.message?.includes("context length")) {
      throw new ContextLengthExceededError(
        `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
      );
    }
    
    throw new Error(`DeepSeek API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
  }

  const responseData = await response.json();
  return responseData.choices?.[0]?.message?.content || "";
}

async function callGemini(
  systemMessage: string, 
  userPrompt: string, 
  apiKey: string, 
  model: string = "gemini-pro", 
  maxTokens = 500
): Promise<string> {
  const fullPrompt = `${systemMessage}\n\n${userPrompt}`;
  
  const modelEndpoint = model === "gemini-pro" ? "gemini-pro" : model;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelEndpoint}:generateContent?key=${apiKey}`;
  
  const requestBody = {
    contents: [
      {
        parts: [
          { text: fullPrompt }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7
    }
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json();
    
    if (errorData.error?.message?.includes("context length") || 
        errorData.error?.message?.includes("token limit")) {
      throw new ContextLengthExceededError(
        `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
      );
    }
    
    throw new Error(`Google Gemini API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
  }

  const responseData = await response.json();
  return responseData.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callMistral(
  systemMessage: string, 
  userPrompt: string, 
  apiKey: string, 
  model: string = "mistral-medium", 
  maxTokens = 500
): Promise<string> {
  const requestBody = {
    model: model,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: maxTokens
  };

  const response = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json();
    
    if (errorData.error?.type === "context_length_exceeded" || 
        errorData.error?.message?.includes("context") || 
        errorData.error?.message?.includes("token limit")) {
      throw new ContextLengthExceededError(
        `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
      );
    }
    
    throw new Error(`Mistral API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
  }

  const responseData = await response.json();
  return responseData.choices?.[0]?.message?.content || "";
}

async function callOllama(
  systemMessage: string, 
  userPrompt: string, 
  model: string = "llama3", 
  maxTokens = 500,
  ollamaUrl = "http://localhost:11434"
): Promise<string> {
  const fullPrompt = `${systemMessage}\n\n${userPrompt}`;
  
  // Ollama API endpoint for generate
  const generateUrl = `${ollamaUrl}/api/generate`;
  
  const requestBody = {
    model: model,
    prompt: fullPrompt,
    stream: false,
    options: {
      num_predict: maxTokens
    }
  };

  try {
    const response = await fetch(generateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        // If it's not valid JSON, use the text as is
      }
      
      if (errorText.includes("context window") || errorText.includes("context length")) {
        throw new ContextLengthExceededError(
          `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
        );
      }
      
      throw new Error(`Ollama API Error: ${response.status} - ${(errorData as any).error || errorText || response.statusText}`);
    }

    const responseData = await response.json();
    return responseData.response || "";
  } catch (error) {
    if (error instanceof ContextLengthExceededError) {
      throw error;
    }
    
    if (error.message?.includes("Failed to fetch")) {
      throw new Error(`Could not connect to Ollama server at ${ollamaUrl}. Is it running?`);
    }
    
    throw error;
  }
}