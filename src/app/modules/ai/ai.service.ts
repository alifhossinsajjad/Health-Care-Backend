import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import httpStatus from "http-status";
import { KnowledgeCategory } from "../../../../generated/prisma/client";
import { envVars } from "../../../config/env";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../lib/prisma";
import {
  AI_CONFIG,
  EMERGENCY_PATTERNS,
  SYSTEM_TRIAGE_PROMPT,
} from "./ai.constant";

// Initialize official Google GenAI SDK instance
const getGenAIClient = () => {
  if (!envVars.GEMINI_API_KEY) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "GEMINI_API_KEY is missing from environment variables.",
    );
  }
  return new GoogleGenAI({ apiKey: envVars.GEMINI_API_KEY });
};

// Deterministic SHA-256 hash generator for idempotent change detection
const generateContentHash = (text: string): string => {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
};

// Generate 768-dimensional vector embedding
const getEmbedding = async (text: string): Promise<number[]> => {
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

// Fast deterministic Rule-0 emergency triage check
const isCriticalEmergency = (query: string): boolean => {
  return EMERGENCY_PATTERNS.some((pattern) => pattern.test(query));
};

// Core Semantic Nearest Neighbor Search using pgvector Cosine Distance
interface SearchResult {
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

const searchSimilarDocuments = async (
  query: string,
  options?: {
    limit?: number;
    threshold?: number;
    category?: KnowledgeCategory;
  },
): Promise<SearchResult[]> => {
  const limit = options?.limit ?? AI_CONFIG.RETRIEVAL_LIMIT;
  const threshold = options?.threshold ?? AI_CONFIG.SIMILARITY_THRESHOLD;
  const category = options?.category;

  const queryVector = await getEmbedding(query);
  const vectorStr = `[${queryVector.join(",")}]`;

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

// Helper: Upsert Document and compute embedding only if content changed
const upsertChunkWithEmbedding = async (chunk: {
  chunkKey: string;
  sourceType: KnowledgeCategory;
  sourceId: string;
  sourceLabel?: string;
  title: string;
  content: string;
  metadata?: any;
}) => {
  const hash = generateContentHash(
    `${chunk.title}\n${chunk.content}\n${JSON.stringify(chunk.metadata ?? {})}`,
  );

  const existing = await prisma.documentEmbedding.findUnique({
    where: { chunkKey: chunk.chunkKey },
  });

  // If already indexed and content is unchanged, skip re-computation (Zero API waste)
  if (
    existing &&
    existing.contentHash === hash &&
    existing.status === "INDEXED"
  ) {
    return { status: "SKIPPED", chunkKey: chunk.chunkKey };
  }

  // Create or update metadata & content
  const doc = await prisma.documentEmbedding.upsert({
    where: { chunkKey: chunk.chunkKey },
    create: {
      chunkKey: chunk.chunkKey,
      sourceType: chunk.sourceType,
      sourceId: chunk.sourceId,
      sourceLabel: chunk.sourceLabel ?? null,
      title: chunk.title,
      content: chunk.content,
      contentHash: hash,
      status: "PENDING",
      metadata: chunk.metadata ?? {},
    },
    update: {
      sourceLabel: chunk.sourceLabel ?? null,
      title: chunk.title,
      content: chunk.content,
      contentHash: hash,
      status: "PENDING",
      metadata: chunk.metadata ?? {},
      isDeleted: false,
      deletedAt: null,
    },
  });

  // Generate embedding
  const textToEmbed = `${chunk.title}\n${chunk.content}`;
  const vector = await getEmbedding(textToEmbed);
  const vectorStr = `[${vector.join(",")}]`;

  // Update vector and activate status
  await prisma.$executeRawUnsafe(
    `UPDATE "document_embeddings" 
     SET "embedding" = $1::vector, "status" = 'INDEXED', "updatedAt" = NOW() 
     WHERE "id" = $2`,
    vectorStr,
    doc.id,
  );

  return { status: "INDEXED", chunkKey: chunk.chunkKey };
};

// Sync Specialties into Knowledge Base
const syncSpecialties = async () => {
  const specialties = await prisma.specialty.findMany({
    where: { isDeleted: false },
  });

  let processedCount = 0;
  for (const item of specialties) {
    const chunkKey = `SPECIALTY:${item.id}:0`;
    const content = `Medical Specialty: ${item.title}. Description: ${
      item.description ||
      "General hospital clinical specialty and patient care."
    } Patients seeking consultation for symptoms related to ${item.title} should book an appointment with our ${item.title} specialists.`;

    await upsertChunkWithEmbedding({
      chunkKey,
      sourceType: KnowledgeCategory.SPECIALTY,
      sourceId: item.id,
      sourceLabel: item.title,
      title: `Specialty: ${item.title}`,
      content,
      metadata: {
        specialtyId: item.id,
        icon: item.icon,
      },
    });
    processedCount++;
  }
  return processedCount;
};

// Sync Doctors into Knowledge Base
const syncDoctors = async () => {
  const doctors = await prisma.doctor.findMany({
    where: { isDeleted: false },
    include: {
      specialties: {
        include: {
          specialty: true,
        },
      },
    },
  });

  let processedCount = 0;
  for (const doc of doctors) {
    const specialtyTitles =
      doc.specialties
        .map((s: { specialty: { title: string } }) => s.specialty.title)
        .join(", ") || "General Medicine";
    const chunkKey = `DOCTOR:${doc.id}:0`;

    const content = `Doctor Profile: Dr. ${doc.name}.
Designation: ${doc.designation}.
Qualifications & Degrees: ${doc.qualification}.
Specialties: ${specialtyTitles}.
Current Workplace: ${doc.currentWorkingPlace}.
Experience: ${doc.experience} years of clinical practice.
Consultation Fee: ৳${doc.appointmentFee} BDT per session.
Patient Rating: ${doc.avarageRating} / 5.0.
Gender: ${doc.gender}.
Available for online and in-person hospital appointments.`;

    await upsertChunkWithEmbedding({
      chunkKey,
      sourceType: KnowledgeCategory.DOCTOR,
      sourceId: doc.id,
      sourceLabel: `Dr. ${doc.name}`,
      title: `Dr. ${doc.name} - ${doc.designation} (${specialtyTitles})`,
      content,
      metadata: {
        doctorId: doc.id,
        appointmentFee: doc.appointmentFee,
        rating: doc.avarageRating,
        specialties: specialtyTitles,
        email: doc.email,
        contactNumber: doc.contactNumber,
      },
    });
    processedCount++;
  }
  return processedCount;
};

// Clinical Triage Guidelines Seed Data
const CLINICAL_GUIDELINES = [
  {
    code: "TRIAGE-CARDIO-01",
    title: "Cardiology & Chest Pain Triage",
    category: KnowledgeCategory.TRIAGE_GUIDELINE,
    content: `Cardiology Triage Guidelines:
Primary Symptoms: Chest pressure, tightness in the chest radiating to left arm/jaw, shortness of breath, palpitation, irregular heartbeat, ankle swelling.
Emergency Indicators (RED FLAG): Sudden crushing chest pain lasting >5 minutes, profuse sweating, dizziness, sudden collapse. Patient must go directly to Emergency Room (ER) immediately.
Non-emergency Cardiology: Mild hypertension, regular routine heart checkups, post-operative cardiology follow-ups.
Associated Medical Specialty: Cardiology.`,
    metadata: { specialty: "Cardiology", emergencyLevel: "CRITICAL" },
  },
  {
    code: "TRIAGE-NEURO-02",
    title: "Neurology & Stroke Triage",
    category: KnowledgeCategory.TRIAGE_GUIDELINE,
    content: `Neurology Triage Guidelines:
Primary Symptoms: Chronic headaches, migraine, vertigo, dizziness, memory issues, tremors, neuropathic numbness, sleep disorders.
Emergency Indicators (RED FLAG - F.A.S.T.): Sudden facial droop, arm or leg weakness/paralysis, slurred speech or inability to speak, sudden loss of vision. Immediate hospital ER arrival within golden hour is life-critical!
Associated Medical Specialty: Neurology.`,
    metadata: { specialty: "Neurology", emergencyLevel: "CRITICAL" },
  },
  {
    code: "TRIAGE-ORTHO-03",
    title: "Orthopedics & Joint/Bone Health",
    category: KnowledgeCategory.TRIAGE_GUIDELINE,
    content: `Orthopedic Care Guidelines:
Primary Symptoms: Joint stiffness, knee pain, lower back pain, sciatica, arthritis, sports injuries, tendonitis, sprains.
Emergency Indicators: Compound open fractures with bone visible, inability to bear weight after acute severe trauma, limb deformity, vascular compromise.
Associated Medical Specialty: Orthopedics.`,
    metadata: { specialty: "Orthopedics", emergencyLevel: "ROUTINE_TO_URGENT" },
  },
  {
    code: "TRIAGE-PEDIATRICS-04",
    title: "Pediatric Health & Infant Care",
    category: KnowledgeCategory.TRIAGE_GUIDELINE,
    content: `Pediatrics Triage Guidelines:
Primary Patients: Newborns, infants, children, and adolescents under 18 years old.
Symptoms: Child fever, vaccinations, pediatric cough/cold, diarrhea, growth and nutritional assessments, developmental delays.
Emergency Indicators: Infant fever (>101°F in infant <3 months), lethargy, refusal to drink fluids, cyanosis (blue lips), febrile convulsions. Immediate ER referral needed.
Associated Medical Specialty: Pediatrics.`,
    metadata: { specialty: "Pediatrics", emergencyLevel: "HIGH" },
  },
  {
    code: "TRIAGE-GASTRO-05",
    title: "Gastroenterology & Digestive Health",
    category: KnowledgeCategory.TRIAGE_GUIDELINE,
    content: `Gastroenterology Triage Guidelines:
Primary Symptoms: Acid reflux (GERD), chronic abdominal pain, bloating, indigestion, irritable bowel syndrome (IBS), fatty liver, hepatitis, constipation.
Emergency Indicators: Black tarry stool, vomiting blood (hematemesis), acute severe abdominal rigidity with high fever.
Associated Medical Specialty: Gastroenterology.`,
    metadata: { specialty: "Gastroenterology", emergencyLevel: "URGENT" },
  },
  {
    code: "FAQ-HOSPITAL-SERVICES",
    title: "Hospital Operational Policies & Contact",
    category: KnowledgeCategory.HOSPITAL_FAQ,
    content: `Hospital General Services & Policy:
1. Emergency Services (ER) & Trauma Center: 24/7 round the clock, 365 days a year.
2. Outpatient Department (OPD): Daily 8:00 AM - 10:00 PM.
3. Appointments & Booking: Can be booked via web app, mobile portal, or hospital reception desk.
4. Payment Methods: Online card, mobile banking (bKash/Nagad), Stripe, and cash at billing counters.
5. Ambulance & Emergency Contact: Dedicated 24/7 hotline.`,
    metadata: { type: "POLICY", operationalHours: "24/7" },
  },
];

const syncGuidelinesAndFaqs = async () => {
  let count = 0;
  for (const item of CLINICAL_GUIDELINES) {
    const chunkKey = `${item.category}:${item.code}:0`;
    await upsertChunkWithEmbedding({
      chunkKey,
      sourceType: item.category,
      sourceId: item.code,
      sourceLabel: item.title,
      title: item.title,
      content: item.content,
      metadata: item.metadata,
    });
    count++;
  }
  return count;
};

// Full Idempotent Knowledge Base Synchronization
const syncKnowledgeBase = async () => {
  const specialtiesCount = await syncSpecialties();
  const doctorsCount = await syncDoctors();
  const guidelinesCount = await syncGuidelinesAndFaqs();

  const totalActive = await prisma.documentEmbedding.count({
    where: { status: "INDEXED", isDeleted: false },
  });

  return {
    specialtiesIndexed: specialtiesCount,
    doctorsIndexed: doctorsCount,
    guidelinesIndexed: guidelinesCount,
    totalActiveKnowledgeChunks: totalActive,
  };
};

// Ask Healthcare AI Navigator (End-to-End Grounded Triage Assistant)
const askHospitalAssistant = async (
  query: string,
  history?: Array<{ role: string; parts: string }>,
) => {
  const isEmergency = isCriticalEmergency(query);

  // Retrieve relevant knowledge chunks via pgvector Cosine similarity
  const retrievedDocs = await searchSimilarDocuments(query, {
    limit: AI_CONFIG.RETRIEVAL_LIMIT,
    threshold: 0.45, // balanced threshold to capture relevant context
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
          (d) => d.doctorId === doc.metadata.doctorId,
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
          `[Source ${index + 1}] (${doc.sourceType} - ${doc.title}):\n${doc.content}`,
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

  // Resilient LLM generation with automatic multi-model failover
  const generateWithResilience = async (prompt: string): Promise<string> => {
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
          contents: prompt,
        });
        if (response.text) {
          return response.text;
        }
      } catch (err: any) {
        console.warn(
          `[AI Triage] Model ${model} encountered load spike, attempting failover:`,
          err.message?.slice(0, 100),
        );
        lastError = err;
      }
    }

    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      `AI generation unavailable across all model endpoints: ${lastError?.message || "Unknown error"}`,
    );
  };

  const answer = await generateWithResilience(prompt);

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

// Knowledge base statistics for admin monitoring
const getKnowledgeStats = async () => {
  const total = await prisma.documentEmbedding.count();
  const active = await prisma.documentEmbedding.count({
    where: { status: "INDEXED", isDeleted: false },
  });
  const pending = await prisma.documentEmbedding.count({
    where: { status: "PENDING" },
  });
  const failed = await prisma.documentEmbedding.count({
    where: { status: "FAILED" },
  });

  const categoryBreakdown = await prisma.documentEmbedding.groupBy({
    by: ["sourceType"],
    _count: { id: true },
    where: { status: "INDEXED", isDeleted: false },
  });

  return {
    totalRecords: total,
    activeIndexedRecords: active,
    pendingRecords: pending,
    failedRecords: failed,
    categoryBreakdown: categoryBreakdown.map(
      (item: { sourceType: KnowledgeCategory; _count: { id: number } }) => ({
        category: item.sourceType,
        count: item._count.id,
      }),
    ),
    embeddingDimension: AI_CONFIG.VECTOR_DIMENSION,
    embeddingModel: AI_CONFIG.EMBEDDING_MODEL,
    llmModel: AI_CONFIG.PRIMARY_LLM_MODEL,
  };
};

export const AiService = {
  getEmbedding,
  searchSimilarDocuments,
  syncKnowledgeBase,
  askHospitalAssistant,
  getKnowledgeStats,
  isCriticalEmergency,
};
