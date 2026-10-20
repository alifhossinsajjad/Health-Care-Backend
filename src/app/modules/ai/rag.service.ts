import httpStatus from "http-status";
import { KnowledgeCategory } from "../../../../generated/prisma/client";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../lib/prisma";
import { AgentTools } from "./agent.tools";
import { AI_CONFIG, EMERGENCY_PATTERNS, SYSTEM_TRIAGE_PROMPT } from "./ai.constant";
import { EmbeddingService, getGenAIClient } from "./embedding.service";

// Deterministic Rule-0 Emergency Triage Check (Fast regex before calling LLM)
const isCriticalEmergency = (query: string): boolean => {
  return EMERGENCY_PATTERNS.some((pattern) => pattern.test(query));
};

export interface SearchResult {
  id: string;
  chunkKey: string;
  sourceType: KnowledgeCategory;
  sourceId: string;
  sourceLabel: string | null;
  title: string;
  content: string;
  metadata: any;
  similarity: number;
}

/**
 * High-performance semantic vector search using pgvector Cosine Distance
 */
const searchSimilarDocuments = async (
  query: string,
  options?: {
    limit?: number;
    threshold?: number;
    category?: KnowledgeCategory;
  }
): Promise<SearchResult[]> => {
  const limit = options?.limit ?? AI_CONFIG.RETRIEVAL_LIMIT;
  const threshold = options?.threshold ?? AI_CONFIG.SIMILARITY_THRESHOLD;
  const category = options?.category;

  const queryVector = await EmbeddingService.generateEmbedding(query);
  const vectorStr = EmbeddingService.formatVectorForPg(queryVector);

  let results: SearchResult[];

  if (category) {
    results = await prisma.$queryRaw<SearchResult[]>`
      SELECT 
        id, 
        "chunkKey", 
        "sourceType", 
        "sourceId", 
        "sourceLabel", 
        title, 
        content, 
        metadata,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM "document_embeddings"
      WHERE status = 'INDEXED' 
        AND "isDeleted" = false
        AND "sourceType" = ${category}::"KnowledgeCategory"
        AND (1 - (embedding <=> ${vectorStr}::vector)) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${limit};
    `;
  } else {
    results = await prisma.$queryRaw<SearchResult[]>`
      SELECT 
        id, 
        "chunkKey", 
        "sourceType", 
        "sourceId", 
        "sourceLabel", 
        title, 
        content, 
        metadata,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM "document_embeddings"
      WHERE status = 'INDEXED' 
        AND "isDeleted" = false
        AND (1 - (embedding <=> ${vectorStr}::vector)) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${limit};
    `;
  }

  return results;
};

/**
 * Helper to structure multi-turn conversation memory for Gemini API
 */
const formatContentsWithHistory = (
  prompt: string,
  history?: Array<{ role: string; parts: string }>
) => {
  const contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string }>;
  }> = [];

  if (history && history.length > 0) {
    for (const turn of history) {
      contents.push({
        role: turn.role === "assistant" ? "model" : (turn.role as "user" | "model"),
        parts: [{ text: turn.parts }],
      });
    }
  }

  contents.push({
    role: "user",
    parts: [{ text: prompt }],
  });

  return contents;
};

/**
 * Resilient multi-model failover execution to guarantee 99.9% uptime against 503 spikes
 */
const generateWithResilience = async (contents: any): Promise<string> => {
  const ai = getGenAIClient();
  const modelsToTry = [
    AI_CONFIG.PRIMARY_LLM_MODEL,
    ...AI_CONFIG.FALLBACK_LLM_MODELS,
  ];

  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
      });
      if (response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn(
        `[AI Triage] Model ${model} encountered load spike, attempting failover:`,
        err.message?.slice(0, 100)
      );
      lastError = err;
    }
  }

  throw new ApiError(
    httpStatus.SERVICE_UNAVAILABLE,
    `AI generation unavailable across all model endpoints: ${lastError?.message || "Unknown error"}`
  );
};

/**
 * Real-time Token Streaming with Multi-Model Failover (Server-Sent Events)
 */
const generateStreamWithResilience = async (
  contents: any,
  onChunk: (text: string) => void
): Promise<string> => {
  const ai = getGenAIClient();
  const modelsToTry = [
    AI_CONFIG.PRIMARY_LLM_MODEL,
    ...AI_CONFIG.FALLBACK_LLM_MODELS,
  ];

  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      const responseStream = await ai.models.generateContentStream({
        model,
        contents,
      });

      let fullText = "";
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullText += chunk.text;
          onChunk(chunk.text);
        }
      }
      if (fullText) {
        return fullText;
      }
    } catch (err: any) {
      console.warn(
        `[AI Triage Stream] Model ${model} encountered load spike, attempting failover:`,
        err.message?.slice(0, 100)
      );
      lastError = err;
    }
  }

  throw new ApiError(
    httpStatus.SERVICE_UNAVAILABLE,
    `AI streaming unavailable across all model endpoints: ${lastError?.message || "Unknown error"}`
  );
};

/**
 * Common Ground Truth Context Assembler
 */
const prepareRAGContext = async (query: string) => {
  const isEmergency = isCriticalEmergency(query);

  // Retrieve relevant knowledge chunks via pgvector Cosine similarity
  const retrievedDocs = await searchSimilarDocuments(query, {
    limit: AI_CONFIG.RETRIEVAL_LIMIT,
    threshold: 0.45,
  });

  // Extract structured recommendations from retrieved context
  const suggestedSpecialties: string[] = [];
  const recommendedDoctors: Array<{
    doctorId: string;
    name: string;
    specialties: string;
    appointmentFee: number;
    rating: number;
  }> = [];

  retrievedDocs.forEach((doc) => {
    if (doc.sourceType === KnowledgeCategory.SPECIALTY) {
      if (doc.sourceLabel && !suggestedSpecialties.includes(doc.sourceLabel)) {
        suggestedSpecialties.push(doc.sourceLabel);
      }
    } else if (doc.sourceType === KnowledgeCategory.DOCTOR) {
      if (doc.metadata?.doctorId) {
        const exists = recommendedDoctors.some(
          (d) => d.doctorId === doc.metadata.doctorId
        );
        if (!exists) {
          recommendedDoctors.push({
            doctorId: doc.metadata.doctorId,
            name: doc.sourceLabel ?? doc.title,
            specialties: doc.metadata.specialties ?? "General",
            appointmentFee: Number(doc.metadata.appointmentFee ?? 0),
            rating: Number(doc.metadata.rating ?? 0),
          });
        }
      }
    }
  });

  // Build Ground Truth Context string
  let contextText = "";
  if (retrievedDocs.length > 0) {
    contextText = retrievedDocs
      .map(
        (doc, index) =>
          `[Source ${index + 1}] (${doc.sourceType} - ${doc.title}):\n${doc.content}`
      )
      .join("\n\n");
  } else {
    contextText =
      "No specific hospital documents directly matched the symptoms. Provide safe general guidance and advise patient to consult the hospital reception or emergency department.";
  }

  // Construct Gemini Prompt with explicit clinical safety constraints
  let emergencyDirective = "";
  if (isEmergency) {
    emergencyDirective = `
🚨 EMERGENCY PROTOCOL TRIGGERED:
The user query indicates potentially acute, life-threatening symptoms.
Begin your response with a prominent, compassionate EMERGENCY WARNING advising the user to immediately visit the Hospital Emergency Room (ER) or call national emergency numbers (e.g., 999).
Do not recommend waiting for an online appointment for active emergencies!
`;
  }

  const prompt = `
${SYSTEM_TRIAGE_PROMPT}

${emergencyDirective}

GROUND TRUTH HOSPITAL CONTEXT:
=======================================
${contextText}
=======================================

PATIENT / USER QUERY:
"${query}"

Please provide a clear, empathetic, clinically responsible, and well-structured response following all safety rules:
`;

  return {
    prompt,
    isEmergency,
    suggestedSpecialties,
    recommendedDoctors,
    retrievedDocs,
  };
};

/**
 * Standard Multi-Turn RAG Assistant
 */
const askHospitalAssistant = async (
  query: string,
  history?: Array<{ role: string; parts: string }>
) => {
  const {
    prompt,
    isEmergency,
    suggestedSpecialties,
    recommendedDoctors,
    retrievedDocs,
  } = await prepareRAGContext(query);

  const contents = formatContentsWithHistory(prompt, history);
  const answer = await generateWithResilience(contents);

  return {
    answer,
    isEmergency,
    suggestedSpecialties,
    recommendedDoctors,
    sources: retrievedDocs.map((d) => ({
      id: d.id,
      sourceType: d.sourceType,
      sourceId: d.sourceId,
      sourceLabel: d.sourceLabel,
      title: d.title,
      similarity: Number(d.similarity.toFixed(4)),
    })),
  };
};

/**
 * Real-time Streaming Multi-Turn RAG Assistant (Server-Sent Events)
 */
const askHospitalAssistantStream = async (
  query: string,
  history: Array<{ role: string; parts: string }> | undefined,
  onChunk: (token: string) => void
) => {
  const {
    prompt,
    isEmergency,
    suggestedSpecialties,
    recommendedDoctors,
    retrievedDocs,
  } = await prepareRAGContext(query);

  const contents = formatContentsWithHistory(prompt, history);
  const fullAnswer = await generateStreamWithResilience(contents, onChunk);

  return {
    answer: fullAnswer,
    isEmergency,
    suggestedSpecialties,
    recommendedDoctors,
    sources: retrievedDocs.map((d) => ({
      id: d.id,
      sourceType: d.sourceType,
      sourceId: d.sourceId,
      sourceLabel: d.sourceLabel,
      title: d.title,
      similarity: Number(d.similarity.toFixed(4)),
    })),
  };
};

export const RagService = {
  isCriticalEmergency,
  searchSimilarDocuments,
  generateWithResilience,
  generateStreamWithResilience,
  askHospitalAssistant,
  askHospitalAssistantStream,
  tools: AgentTools,
};
