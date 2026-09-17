import { Gender } from "../../../../generated/prisma/client";

export interface IDoctorPayload {
  name?: string;
  email?: string;
  contactNumber?: string;
  gender?: Gender;
  appointmentFee?: number;
  qualification?: string;
  currentWorkingPlace?: string;
  designation?: string;
  specialties?: string[];
}