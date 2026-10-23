import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../errors/ApiError";
import { getGenAIClient } from "../ai/embedding.service";
import {
  LAB_REPORT_SYSTEM_PROMPT,
  LAB_REPORT_VISION_MODELS,
  SUPPORTED_LAB_REPORT_MIME_TYPES,
  MAX_LAB_REPORT_FILE_SIZE,
  labReportSearchableFields,
} from "./labReport.constant";
import {
  ILabReportAIResponse,
  ILabReportFilterRequest,
} from "./labReport.interface";
import {
  uploadFileToCloudinary,
  deleteFileFromCloudinary,
} from "../../../config/cloudinary.config";
import {
  Role,
  LabReportStatus,
  LabReportType,
  LabReportUrgency,
  Prisma,
} from "../../../../generated/prisma/client";
import { IPaginationOptions } from "../../interfaces/pagination";
import { paginationHelper } from "../../../shared/paginationHelper";

/**
 * 1. Upload & Analyze Medical Lab Report with Gemini Multimodal Vision
 */
const analyzeAndSaveReport = async (
  userId: string,
  file: Express.Multer.File,
  payload?: { appointmentId?: string; reportName?: string },
) => {
  if (!file) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "No lab report file provided. Please upload a PDF or image.",
    );
  }

  // 1. Verify Patient Profile
  const patient = await prisma.patient.findUnique({
    where: { userId },
  });

  if (!patient) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Patient profile not found for this user account.",
    );
  }

  // 2. Validate MIME Type & Size
  if (!SUPPORTED_LAB_REPORT_MIME_TYPES.includes(file.mimetype)) {
    throw new ApiError(
      httpStatus.UNSUPPORTED_MEDIA_TYPE,
      `Unsupported file type: ${file.mimetype}. Supported formats: PDF, JPEG, PNG, WEBP.`,
    );
  }

  if (file.size > MAX_LAB_REPORT_FILE_SIZE) {
    throw new ApiError(
      httpStatus.REQUEST_ENTITY_TOO_LARGE,
      "File size exceeds the 20MB maximum limit.",
    );
  }

  // 3. Extract File Buffer & Base64
  let fileBuffer: Buffer;
  let fileUrl = file.path;
  let publicId = file.filename;

  if (file.buffer) {
    fileBuffer = file.buffer;
    // Upload in-memory buffer to Cloudinary for permanent CDN storage
    const uploadResult = await uploadFileToCloudinary(
      fileBuffer,
      file.originalname,
    );
    fileUrl = uploadResult.secure_url;
    publicId = uploadResult.public_id;
  } else if (file.path) {
    // If multer-storage-cloudinary already uploaded it, fetch buffer for Gemini
    const res = await fetch(file.path);
    const arrayBuf = await res.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuf);
  } else {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Unable to read file content for analysis.",
    );
  }

  const base64Data = fileBuffer.toString("base64");

  // 4. Multimodal Analysis via Google Gemini with Resilient Failover
  const ai = getGenAIClient();
  let aiResponse: ILabReportAIResponse | null = null;
  let lastError: any = null;

  for (const model of LAB_REPORT_VISION_MODELS) {
    try {
      console.log(`🔬 [LabReportAI] Attempting vision analysis with model: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: file.mimetype,
                  data: base64Data,
                },
              },
              {
                text: LAB_REPORT_SYSTEM_PROMPT,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1, // Deterministic extraction
        },
      });

      if (response.text) {
        const cleanJson = response.text
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        aiResponse = JSON.parse(cleanJson);
        if (aiResponse && aiResponse.parameters) {
          console.log(`✅ [LabReportAI] Successfully extracted parameters using: ${model}`);
          break;
        }
      }
    } catch (err: any) {
      console.warn(
        `⚠️ [LabReportAI] Model ${model} failed, switching to next fallback:`,
        err.message?.slice(0, 120),
      );
      lastError = err;
    }
  }

  if (!aiResponse) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      `AI Vision Extraction unavailable across all model endpoints: ${lastError?.message || "Unknown error"}`,
    );
  }

  // 5. Verify Appointment Ownership if appointmentId was passed
  let validAppointmentId: string | null = null;
  if (payload?.appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: payload.appointmentId,
        patientId: patient.id,
      },
    });

    if (appointment) {
      validAppointmentId = appointment.id;
    }
  }

  // 6. Format Dates and Enums safely
  let parsedTestDate: Date | null = null;
  if (aiResponse.testDate) {
    const d = new Date(aiResponse.testDate);
    if (!isNaN(d.getTime())) {
      parsedTestDate = d;
    }
  }

  const reportTypeEnum = Object.values(LabReportType).includes(
    aiResponse.reportType as LabReportType,
  )
    ? (aiResponse.reportType as LabReportType)
    : LabReportType.OTHER;

  const urgencyEnum = Object.values(LabReportUrgency).includes(
    aiResponse.urgency as LabReportUrgency,
  )
    ? (aiResponse.urgency as LabReportUrgency)
    : LabReportUrgency.ROUTINE;

  const resolvedReportName =
    payload?.reportName?.trim() ||
    (aiResponse.labName
      ? `${reportTypeEnum.replace(/_/g, " ")} - ${aiResponse.labName}`
      : `${reportTypeEnum.replace(/_/g, " ")} Report`);

  // 7. Persist to PostgreSQL
  const savedReport = await prisma.labReport.create({
    data: {
      patientId: patient.id,
      appointmentId: validAppointmentId,
      reportName: resolvedReportName,
      reportUrl: fileUrl,
      publicId: publicId || null,
      fileType: file.mimetype,
      fileSize: file.size,
      status: LabReportStatus.COMPLETED,
      reportType: reportTypeEnum,
      urgency: urgencyEnum,
      patientName: aiResponse.patientName || null,
      patientAge: aiResponse.patientAge || null,
      patientGender: aiResponse.patientGender || null,
      testDate: parsedTestDate,
      labName: aiResponse.labName || null,
      referringDoctor: aiResponse.referringDoctor || null,
      parameters: aiResponse.parameters as any,
      abnormalFindings: (aiResponse.abnormalFindings || []) as any,
      summaryEn: aiResponse.summaryEn || null,
      summaryBn: aiResponse.summaryBn || null,
      doctorQuestions: (aiResponse.doctorQuestions || []) as any,
      recommendedSpecialties: aiResponse.recommendedSpecialties || [],
      disclaimer: aiResponse.disclaimer || null,
      rawAnalysis: aiResponse as any,
    },
    include: {
      patient: {
        select: {
          id: true,
          name: true,
          email: true,
          profilePhoto: true,
        },
      },
      appointment: {
        select: {
          id: true,
          status: true,
          doctorId: true,
          doctor: {
            select: {
              name: true,
              designation: true,
            },
          },
        },
      },
    },
  });

  return savedReport;
};

/**
 * 2. Retrieve Paginated Lab Reports for Authenticated Patient
 */
const getMyLabReports = async (
  userId: string,
  filters: ILabReportFilterRequest,
  options: IPaginationOptions,
) => {
  const patient = await prisma.patient.findUnique({
    where: { userId },
  });

  if (!patient) {
    throw new ApiError(httpStatus.NOT_FOUND, "Patient profile not found.");
  }

  const { limit, page, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination(options);

  const andConditions: Prisma.LabReportWhereInput[] = [
    { patientId: patient.id },
  ];

  const {
    searchTerm,
    reportType,
    urgency,
    status,
    appointmentId,
    startDate,
    endDate,
  } = filters;

  if (searchTerm) {
    andConditions.push({
      OR: labReportSearchableFields.map((field) => ({
        [field]: {
          contains: searchTerm,
          mode: "insensitive",
        },
      })),
    });
  }

  if (reportType) {
    andConditions.push({ reportType });
  }

  if (urgency) {
    andConditions.push({ urgency });
  }

  if (status) {
    andConditions.push({ status });
  }

  if (appointmentId) {
    andConditions.push({ appointmentId });
  }

  if (startDate && endDate) {
    andConditions.push({
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    });
  }

  const whereConditions: Prisma.LabReportWhereInput = {
    AND: andConditions,
  };

  const [data, total] = await Promise.all([
    prisma.labReport.findMany({
      where: whereConditions,
      skip,
      take: limit,
      orderBy:
        sortBy && sortOrder
          ? { [sortBy]: sortOrder }
          : { createdAt: "desc" },
      include: {
        appointment: {
          select: {
            id: true,
            status: true,
            doctor: {
              select: {
                name: true,
                designation: true,
              },
            },
          },
        },
      },
    }),
    prisma.labReport.count({ where: whereConditions }),
  ]);

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    data,
  };
};

/**
 * 3. Retrieve Single Lab Report by ID with Access Validation
 */
const getLabReportById = async (
  userId: string,
  userRole: Role,
  reportId: string,
) => {
  const report = await prisma.labReport.findUnique({
    where: { id: reportId },
    include: {
      patient: {
        select: {
          id: true,
          userId: true,
          name: true,
          email: true,
          profilePhoto: true,
          contactNumber: true,
        },
      },
      appointment: {
        select: {
          id: true,
          status: true,
          doctorId: true,
          doctor: {
            select: {
              userId: true,
              name: true,
              designation: true,
            },
          },
        },
      },
    },
  });

  if (!report) {
    throw new ApiError(httpStatus.NOT_FOUND, "Lab report not found.");
  }

  // Authorization Check
  if (userRole === Role.PATIENT) {
    if (report.patient.userId !== userId) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Access denied. You do not own this laboratory report.",
      );
    }
  } else if (userRole === Role.DOCTOR) {
    // Check if doctor has an appointment with this patient
    const hasConsultation = await prisma.appointment.findFirst({
      where: {
        patientId: report.patientId,
        doctor: { userId },
      },
    });

    if (!hasConsultation) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Access denied. You do not have an active consultation with this patient.",
      );
    }
  }

  return report;
};

/**
 * 4. Retrieve Lab Reports for a Specific Telemedicine Appointment Consultation
 * (Used by Doctor & Patient inside the consultation room)
 */
const getAppointmentLabReports = async (
  userId: string,
  userRole: Role,
  appointmentId: string,
) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      doctor: { select: { userId: true } },
      patient: { select: { userId: true, id: true } },
    },
  });

  if (!appointment) {
    throw new ApiError(httpStatus.NOT_FOUND, "Appointment not found.");
  }

  const isPatient = appointment.patient.userId === userId;
  const isDoctor = appointment.doctor.userId === userId;
  const isAdmin = userRole === Role.ADMIN || userRole === Role.SUPER_ADMIN;

  if (!isPatient && !isDoctor && !isAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Access denied. You are not a participant in this consultation.",
    );
  }

  // Fetch reports directly attached to this appointment
  const linkedReports = await prisma.labReport.findMany({
    where: { appointmentId },
    orderBy: { createdAt: "desc" },
  });

  // Fetch other historical reports of this patient (up to 5 recent) for clinical context
  const patientRecentReports = await prisma.labReport.findMany({
    where: {
      patientId: appointment.patient.id,
      appointmentId: { not: appointmentId },
    },
    take: 5,
    orderBy: { createdAt: "desc" },
  });

  return {
    linkedReports,
    patientRecentReports,
  };
};

/**
 * 5. Link an Existing Lab Report to an Appointment
 */
const linkReportToAppointment = async (
  userId: string,
  reportId: string,
  appointmentId: string,
) => {
  const patient = await prisma.patient.findUnique({
    where: { userId },
  });

  if (!patient) {
    throw new ApiError(httpStatus.NOT_FOUND, "Patient profile not found.");
  }

  const report = await prisma.labReport.findFirst({
    where: {
      id: reportId,
      patientId: patient.id,
    },
  });

  if (!report) {
    throw new ApiError(httpStatus.NOT_FOUND, "Lab report not found or unowned.");
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      patientId: patient.id,
    },
  });

  if (!appointment) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Appointment not found or does not belong to this patient.",
    );
  }

  const updatedReport = await prisma.labReport.update({
    where: { id: reportId },
    data: { appointmentId },
  });

  return updatedReport;
};

/**
 * 6. Delete Lab Report (Removes PostgreSQL Record + Cloudinary Asset)
 */
const deleteLabReport = async (
  userId: string,
  userRole: Role,
  reportId: string,
) => {
  const report = await prisma.labReport.findUnique({
    where: { id: reportId },
    include: {
      patient: { select: { userId: true } },
    },
  });

  if (!report) {
    throw new ApiError(httpStatus.NOT_FOUND, "Lab report not found.");
  }

  if (userRole === Role.PATIENT && report.patient.userId !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Access denied. You do not own this laboratory report.",
    );
  }

  // Delete from Cloudinary if publicId exists
  if (report.publicId || report.reportUrl) {
    try {
      await deleteFileFromCloudinary(report.reportUrl);
    } catch (cdnErr) {
      console.warn("⚠️ [LabReportService] Cloudinary deletion warning:", cdnErr);
    }
  }

  await prisma.labReport.delete({
    where: { id: reportId },
  });

  return { deleted: true, reportId };
};

export const LabReportService = {
  analyzeAndSaveReport,
  getMyLabReports,
  getLabReportById,
  getAppointmentLabReports,
  linkReportToAppointment,
  deleteLabReport,
};
