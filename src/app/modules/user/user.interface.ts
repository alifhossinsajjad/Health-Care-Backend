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

export interface ICreateAdmin {
  password: string;
  admin: {
    name: string;
    email: string;
    profilePhoto?: string;
    contactNumber: string;
  };
}

export interface ICreateSuperAdmin {
  password: string;
  superAdmin: {
    name: string;
    email: string;
    profilePhoto?: string;
    contactNumber: string;
  };
}