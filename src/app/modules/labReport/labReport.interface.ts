import {
  LabReportType,
  LabReportUrgency,
  LabReportStatus,
} from "../../../../generated/prisma/enums";

export type IParameterStatus = "NORMAL" | "HIGH" | "LOW" | "CRITICAL";
export type IFindingSeverity = "MILD" | "MODERATE" | "SEVERE" | "CRITICAL";

export interface ILabParameter {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  status: IParameterStatus;
  clinicalNote?: string;
}

export interface IAbnormalFinding {
  parameter: string;
  value: string;
  referenceRange: string;
  severity: IFindingSeverity;
  clinicalNote: string;
}

export interface ILabReportAIResponse {
  patientName?: string;
  patientAge?: string;
  patientGender?: string;
  testDate?: string;
  labName?: string;
  referringDoctor?: string;
  reportType: LabReportType;
  urgency: LabReportUrgency;
  parameters: ILabParameter[];
  abnormalFindings: IAbnormalFinding[];
  summaryEn: string;
  summaryBn: string;
  doctorQuestions: string[];
  recommendedSpecialties: string[];
  disclaimer: string;
}

export interface ILabReportFilterRequest {
  searchTerm?: string;
  reportType?: LabReportType;
  urgency?: LabReportUrgency;
  status?: LabReportStatus;
  appointmentId?: string;
  startDate?: string;
  endDate?: string;
}

export interface ILinkReportPayload {
  appointmentId: string;
}
