import { Gender } from "../../../../generated/prisma/enums";

export interface ICreateDoctorPayload {
  password: string;
  doctor: {
    name: string;
    email: string;
    contactNumber: string;
    address: string;
    gender: Gender;
    appointmentFee: number;
    qualification: string;
    currentWorkingPlace: string;
    designation: string;
  };
  specialties : string[];
}