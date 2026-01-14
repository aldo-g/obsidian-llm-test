import { formatNotesForLLM } from "./formatter";
import { requestUrl } from "obsidian";
import type {
  IndexedNote,
  LLMResponse,
  TestQuestionsResponse,
} from "../models/types";
import type { LLMProvider } from "../../main";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
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
IMPORTANT: You must generate the questions and description in the SAME LANGUAGE as the study notes provided.

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
IMPORTANT: You must provide the "feedback" in the SAME LANGUAGE as the source text and the user's answers.

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
      return "gpt-4o";
    case "anthropic":
      return "claude-3-5-sonnet-latest";
    case "deepseek":
      return "deepseek-chat";
    case "gemini":
      return "gemini-1.5-pro";
    case "mistral":
      return "mistral-large-latest";
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
  model: string = "gpt-4o",
  maxTokens = 500
): Promise<string> {
  const isReasoningModel = model.startsWith("o1-") || model.startsWith("o3-") || model.startsWith("gpt-5");

  const messages = [];
  // For o1-preview and o1-mini, system role is not supported. Best to merge into user.
  // For newer models (o1, o3), system is supported but often mapped to 'developer' role.
  if (isReasoningModel && (model.includes("preview") || model.includes("mini") && !model.includes("o3"))) {
    messages.push({ role: "user", content: `${systemMessage}\n\n${userPrompt}` });
  } else {
    messages.push({ role: "system", content: systemMessage });
    messages.push({ role: "user", content: userPrompt });
  }

  const requestBody: any = {
    model: model,
    messages: messages,
  };

  // Reasoning models (o1/o3/gpt-5) use max_completion_tokens and don't support temperature.
  // CRITICAL: max_completion_tokens counts both thinking (internal) and output tokens.
  // We must increase this significantly for reasoning models, or they cut off before the JSON starts.
  if (isReasoningModel) {
    requestBody.max_completion_tokens = Math.max(maxTokens * 4, 4000);
  } else {
    requestBody.max_tokens = maxTokens;
    requestBody.temperature = 0.7;
  }

  const response = await requestUrl({
    url: OPENAI_API_URL,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (response.status !== 200) {
    const errorData = response.json;
    if (errorData.error?.code === "context_length_exceeded") {
      throw new ContextLengthExceededError(
        `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
      );
    }
    throw new Error(`OpenAI API Error: ${response.status} - ${errorData.error?.message || "Unknown error"}`);
  }

  const content = response.json.choices?.[0]?.message?.content || "";

  if (!content && isReasoningModel) {
    // Sometimes reasoning models return their reasoning in a separate field or fail to output if tokens are low.
    const reasoning = response.json.choices?.[0]?.message?.reasoning_content;
    if (reasoning && !content) {
      throw new Error(`Reasoning model (${model}) spent all tokens thinking and didn't generate an answer. Try a shorter note or check your usage tiers.`);
    }
  }

  return content;
}

async function callAnthropic(
  systemMessage: string,
  userPrompt: string,
  apiKey: string,
  model: string = "claude-3-5-sonnet-latest",
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

  const response = await requestUrl({
    url: ANTHROPIC_API_URL,
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (response.status !== 200) {
    const errorData = response.json;

    if (errorData.error?.type === "context_length_exceeded" ||
      errorData.error?.message?.includes("context window")) {
      throw new ContextLengthExceededError(
        `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
      );
    }

    throw new Error(`Anthropic API Error: ${response.status} - ${errorData.error?.message || "Unknown error"}`);
  }

  return response.json.content?.[0]?.text || "";
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

  const response = await requestUrl({
    url: DEEPSEEK_API_URL,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (response.status !== 200) {
    const errorData = response.json;

    if (errorData.error?.code === "context_window_exceeded" ||
      errorData.error?.message?.includes("context length")) {
      throw new ContextLengthExceededError(
        `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
      );
    }

    throw new Error(`DeepSeek API Error: ${response.status} - ${errorData.error?.message || "Unknown error"}`);
  }

  return response.json.choices?.[0]?.message?.content || "";
}

async function callGemini(
  systemMessage: string,
  userPrompt: string,
  apiKey: string,
  model: string = "gemini-1.5-pro",
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

  const response = await requestUrl({
    url: apiUrl,
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (response.status !== 200) {
    const errorData = response.json;

    if (errorData.error?.message?.includes("context length") ||
      errorData.error?.message?.includes("token limit")) {
      throw new ContextLengthExceededError(
        `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
      );
    }

    throw new Error(`Google Gemini API Error: ${response.status} - ${errorData.error?.message || "Unknown error"}`);
  }

  return response.json.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callMistral(
  systemMessage: string,
  userPrompt: string,
  apiKey: string,
  model: string = "mistral-large-latest",
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

  const response = await requestUrl({
    url: MISTRAL_API_URL,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (response.status !== 200) {
    const errorData = response.json;

    if (errorData.error?.type === "context_length_exceeded" ||
      errorData.error?.message?.includes("context") ||
      errorData.error?.message?.includes("token limit")) {
      throw new ContextLengthExceededError(
        `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
      );
    }

    throw new Error(`Mistral API Error: ${response.status} - ${errorData.error?.message || "Unknown error"}`);
  }

  return response.json.choices?.[0]?.message?.content || "";
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
    const response = await requestUrl({
      url: generateUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (response.status !== 200) {
      const errorText = response.text;

      if (errorText.includes("context window") || errorText.includes("context length")) {
        throw new ContextLengthExceededError(
          `The document is too large for ${model}'s context window. Please split your document into smaller sections.`
        );
      }

      throw new Error(`Ollama API Error: ${response.status} - ${errorText || "Unknown error"}`);
    }

    return response.json.response || "";
  } catch (error) {
    if (error instanceof ContextLengthExceededError) {
      throw error;
    }

    if (error.message?.includes("Failed to fetch") || error.message?.includes("net::ERR_CONNECTION_REFUSED")) {
      throw new Error(`Could not connect to Ollama server at ${ollamaUrl}. Is it running?`);
    }

    throw error;
  }
}

export async function fetchProviderModels(
  provider: LLMProvider,
  apiKey: string,
  ollamaUrl: string = "http://localhost:11434"
): Promise<Array<{ id: string; name: string }>> {
  try {
    switch (provider) {
      case "openai": {
        const response = await requestUrl({
          url: "https://api.openai.com/v1/models",
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        const data = response.json;
        return data.data
          .filter((m: any) => {
            const id = m.id.toLowerCase();

            // 1. MUST start with a known chat-capable prefix
            const isChatPrefix = id.startsWith("gpt-") || id.startsWith("o1-") || id.startsWith("o3-");
            if (!isChatPrefix) return false;

            // 2. EXCLUDE specialized/incompatible utility models
            const isSpecialized =
              id.includes("-instruct") ||
              id.includes("-realtime") ||
              id.includes("-audio") ||
              id.includes("-tts") ||
              id.includes("-embedding") ||
              id.includes("-moderation") ||
              id.includes("-transcribe") ||
              id.includes("-diarize") ||
              id.includes("-image") ||
              id.includes("-search") ||
              id.includes("-codex") ||
              id.includes("-edit");

            if (isSpecialized) return false;

            // 3. EXCLUDE legacy fixed-version legacy models
            const isLegacy = ["gpt-3.5-turbo-0301", "gpt-4-0314", "gpt-4-0613"].includes(id);
            if (isLegacy) return false;

            // 4. HANDLE -PREVIEW models (Hide most, but keep important ones like o1/o3/vision)
            if (id.includes("-preview")) {
              const allowedPreviews = ["gpt-4-vision-preview", "o1-preview", "o1-mini-preview", "o3-mini"];
              return allowedPreviews.some(allowed => id.includes(allowed));
            }

            return true;
          })
          .map((m: any) => ({ id: m.id, name: m.id }));
      }
      case "anthropic": {
        const response = await requestUrl({
          url: "https://api.anthropic.com/v1/models",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          }
        });
        const data = response.json;
        return data.data
          .filter((m: any) => m.id.startsWith("claude-"))
          .map((m: any) => ({ id: m.id, name: m.display_name || m.id }));
      }
      case "deepseek": {
        const response = await requestUrl({
          url: "https://api.deepseek.com/v1/models",
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        const data = response.json;
        return data.data.map((m: any) => ({ id: m.id, name: m.id }));
      }
      case "gemini": {
        const response = await requestUrl({
          url: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        });
        const data = response.json;
        return data.models
          .filter((m: any) => m.supportedGenerationMethods.includes("generateContent"))
          .map((m: any) => ({
            id: m.name.replace("models/", ""),
            name: m.displayName || m.name.replace("models/", "")
          }));
      }
      case "mistral": {
        const response = await requestUrl({
          url: "https://api.mistral.ai/v1/models",
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        const data = response.json;
        return data.data
          .filter((m: any) => !m.id.includes("embed") && !m.id.includes("moderation"))
          .map((m: any) => ({ id: m.id, name: m.id }));
      }
      case "ollama": {
        const response = await requestUrl({
          url: `${ollamaUrl}/api/tags`
        });
        const data = response.json;
        return data.models.map((m: any) => ({ id: m.name, name: m.name }));
      }
      default:
        return [];
    }
  } catch (error) {
    console.error(`Error fetching models for ${provider}:`, error);
    return [];
  }
}

export async function fetchCommunityModels(
  provider: LLMProvider
): Promise<Array<{ id: string; name: string }>> {
  try {
    const url = `https://raw.githubusercontent.com/aldo-g/obsidian-llm-test/master/community-models.json`;
    const response = await requestUrl({ url });

    if (response.status === 200) {
      const data = response.json;
      return data[provider] || [];
    }
  } catch (error) {
    // Fail silently
  }
  return [];
}