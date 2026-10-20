import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { IndexingService } from "./indexing.service";
import { RagService } from "./rag.service";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../errors/ApiError";

// 1. Standard Multi-turn RAG Chat
const chatWithAssistant = catchAsync(async (req: Request, res: Response) => {
  const { query, history } = req.body;
  const result = await RagService.askHospitalAssistant(query, history);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Medical triage response generated successfully",
    data: result,
  });
});

// 2. Real-time Streaming SSE Chat (ChatGPT-like live typing)
const chatStreamWithAssistant = async (req: Request, res: Response) => {
  try {
    const { query, history } = req.body;

    // Set Server-Sent Events (SSE) HTTP headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const metadata = await RagService.askHospitalAssistantStream(
      query,
      history,
      (token: string) => {
        res.write(`data: ${JSON.stringify({ type: "token", text: token })}\n\n`);
      }
    );

    // Send final metadata (citations, doctors, emergency flags)
    res.write(`data: ${JSON.stringify({ type: "done", data: metadata })}\n\n`);
    res.end();
  } catch (error: any) {
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message: error?.message || "Streaming error occurred",
      })}\n\n`
    );
    res.end();
  }
};

// 3. Agent Tool: Check Doctor Availability
const checkDoctorAvailability = catchAsync(async (req: Request, res: Response) => {
  const { doctorName, specialtyTitle } = req.body;
  const result = await RagService.tools.checkDoctorAvailabilityTool({
    doctorName,
    specialtyTitle,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: result.success,
    message: "Doctor schedule availability retrieved successfully",
    data: result,
  });
});

// 4. Agent Tool: Hospital Pay Later & Payment Policy
const getHospitalPaymentPolicy = catchAsync(async (_req: Request, res: Response) => {
  const policy = await RagService.tools.getHospitalPaymentPolicyTool();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hospital payment and Pay Later policy retrieved",
    data: policy,
  });
});

// 5. Agent Tool: Hold Appointment Slot under Pay Later Online Rule
const holdAppointmentSlot = catchAsync(async (req: Request, res: Response) => {
  const { doctorId, scheduleId } = req.body;

  // Resolve patient id from authenticated user
  const userId = req.user?.id;
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "User authentication required");
  }

  const patient = await prisma.patient.findUnique({
    where: { userId },
  });

  if (!patient) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only registered patients can book appointment holds"
    );
  }

  const result = await RagService.tools.holdAppointmentSlotTool({
    patientId: patient.id,
    doctorId,
    scheduleId,
  });

  sendResponse(res, {
    statusCode: result.success ? httpStatus.CREATED : httpStatus.BAD_REQUEST,
    success: result.success,
    message: result.message || "Appointment hold processed",
    data: result,
  });
});

// 6. Direct Semantic Search
const semanticSearch = catchAsync(async (req: Request, res: Response) => {
  const { query, limit, threshold, category } = req.body;
  const results = await RagService.searchSimilarDocuments(query, {
    limit,
    threshold,
    category,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Semantic search completed successfully",
    data: results,
  });
});

// 7. Admin Knowledge Sync
const syncKnowledge = catchAsync(async (req: Request, res: Response) => {
  const syncReport = await IndexingService.syncKnowledgeBase();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      "Hospital knowledge base synchronized and vector embeddings generated successfully",
    data: syncReport,
  });
});

// 8. Admin Vector Stats
const getStats = catchAsync(async (req: Request, res: Response) => {
  const stats = await IndexingService.getKnowledgeStats();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Knowledge base statistics retrieved successfully",
    data: stats,
  });
});

export const AiController = {
  chatWithAssistant,
  chatStreamWithAssistant,
  checkDoctorAvailability,
  getHospitalPaymentPolicy,
  holdAppointmentSlot,
  semanticSearch,
  syncKnowledge,
  getStats,
};
