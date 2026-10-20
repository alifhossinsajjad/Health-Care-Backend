import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { IndexingService } from "./indexing.service";
import { RagService } from "./rag.service";

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
  semanticSearch,
  syncKnowledge,
  getStats,
};
