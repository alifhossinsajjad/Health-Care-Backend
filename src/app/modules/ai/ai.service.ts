import { EmbeddingService } from "./embedding.service";
import { IndexingService } from "./indexing.service";
import { RagService } from "./rag.service";

export * from "./embedding.service";
export * from "./indexing.service";
export * from "./rag.service";

/**
 * Enterprise AI Service Facade
 * Provides unified access across Embedding, Indexing, and RAG pipelines.
 */
export const AiService = {
  // Embedding operations
  getEmbedding: EmbeddingService.generateEmbedding,
  formatVectorForPg: EmbeddingService.formatVectorForPg,

  // Indexing & Sync operations
  syncKnowledgeBase: IndexingService.syncKnowledgeBase,
  getKnowledgeStats: IndexingService.getKnowledgeStats,
  generateContentHash: IndexingService.generateContentHash,
  upsertChunkWithEmbedding: IndexingService.upsertChunkWithEmbedding,

  // RAG & Triage operations
  askHospitalAssistant: RagService.askHospitalAssistant,
  askHospitalAssistantStream: RagService.askHospitalAssistantStream,
  searchSimilarDocuments: RagService.searchSimilarDocuments,
  isCriticalEmergency: RagService.isCriticalEmergency,
  generateWithResilience: RagService.generateWithResilience,
  tools: RagService.tools,
};
