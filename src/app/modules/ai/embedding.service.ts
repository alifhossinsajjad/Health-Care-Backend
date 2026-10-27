import { GoogleGenAI } from "@google/genai";
import httpStatus from "http-status";
import { envVars } from "../../../config/env";
import { ApiError } from "../../errors/ApiError";
import { AI_CONFIG } from "./ai.constant";

// Initialize official Google GenAI SDK client
export const getGenAIClient = (): GoogleGenAI => {
  if (!envVars.GEMINI_API_KEY) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "GEMINI_API_KEY is missing from environment variables.",
    );
  }
  if (envVars.GEMINI_BASE_URL) {
    return new GoogleGenAI({
      apiKey: envVars.GEMINI_API_KEY,
      httpOptions: { baseUrl: envVars.GEMINI_BASE_URL },
    });
  }

  return new GoogleGenAI({ apiKey: envVars.GEMINI_API_KEY });
};

/**
 * Generate 768-dimensional dense vector embedding using gemini-embedding-001
 * @param text The input string (title, symptom, medical text)
 * @returns Array of 768 floating point numbers
 */
const generateEmbedding = async (text: string): Promise<number[]> => {
  const ai = getGenAIClient();
  const response = await ai.models.embedContent({
    model: AI_CONFIG.EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: AI_CONFIG.VECTOR_DIMENSION,
    },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length !== AI_CONFIG.VECTOR_DIMENSION) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to generate valid ${AI_CONFIG.VECTOR_DIMENSION}-dimensional embedding`,
    );
  }
  return values;
};

/**
 * Format a number array into pgvector literal format: '[0.1, -0.2, ...]'
 */
const formatVectorForPg = (vector: number[]): string => {
  return `[${vector.join(",")}]`;
};

export const EmbeddingService = {
  getGenAIClient,
  generateEmbedding,
  formatVectorForPg,
};
