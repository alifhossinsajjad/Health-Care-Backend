import { prisma } from "./app/lib/prisma";

async function setupVectorIndex() {
  try {
    console.log("Checking pgvector extension and creating HNSW index...");
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
    
    // Create HNSW index for high-performance sub-millisecond approximate nearest neighbor search
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_doc_embeddings_hnsw 
      ON "document_embeddings" 
      USING hnsw (embedding vector_cosine_ops)
      WHERE status = 'INDEXED' AND "isDeleted" = false;
    `);
    
    console.log("✅ HNSW Cosine Vector Index verified successfully!");
  } catch (error: any) {
    console.error("❌ Failed to setup HNSW vector index:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

setupVectorIndex();
