/* eslint-disable @typescript-eslint/no-explicit-any */
import status from "http-status";

import { ApiError } from "../../errors/ApiError";
import { IRequestUser } from "../../interfaces/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { sendEmail } from "../../utils/email";
import { ICreatePrescriptionPayload } from "./prescription.interface";
import { generatePrescriptionPDF } from "./prescription.utils";
import { IPaginationOptions } from "../../interfaces/pagination";
import { paginationHelper } from "../../../shared/paginationHelper";
import { AppointmentStatus, Role } from "../../../../generated/prisma/enums";
import { deleteFileFromCloudinary, uploadFileToCloudinary } from "../../../config/cloudinary.config";
import { Prisma } from "../../../../generated/prisma/client";

const givePrescription = async (user: IRequestUser, payload: ICreatePrescriptionPayload) => {
    const doctorData = await prisma.doctor.findUniqueOrThrow({
        where: {
            userId: user.id
        },
    });

    const appointmentData = await prisma.appointment.findUniqueOrThrow({
        where: {
            id: payload.appointmentId
        },
        include: {
            patient: true,
            doctor: {
                include: {
                    specialties: true
                }
            },
            schedule: {
                include: {
                    doctorSchedules: true
                }
            },
        }
    });

    if (appointmentData.doctorId !== doctorData.id) {
        throw new ApiError(status.BAD_REQUEST, "You can only give prescription for your own appointments");
    }

    if (appointmentData.status === AppointmentStatus.CANCELED) {
        throw new ApiError(status.BAD_REQUEST, "You cannot prescribe for a canceled appointment");
    }

    const isAlreadyPrescribed = await prisma.prescription.findFirst({
        where: {
            appointmentId: payload.appointmentId
        }
    });

    if (isAlreadyPrescribed) {
        throw new ApiError(status.BAD_REQUEST, "You have already given prescription for this appointment. You can update the prescription instead.");
    }

    const followUpDate = new Date(payload.followUpDate);

    // Step 1: Create the prescription in DB WITHOUT PDF URL (Fast DB operation)
    // No transaction needed, avoiding DB lock during Cloudinary/Email operations!
    const prescription = await prisma.prescription.create({
        data: {
            ...payload,
            followUpDate,
            doctorId: appointmentData.doctorId,
            patientId: appointmentData.patientId,
        }
    });

    // Step 2: Generate PDF using the new prescription ID
    const pdfBuffer = await generatePrescriptionPDF({
        doctorName: doctorData.name,
        patientName: appointmentData.patient.name,
        appointmentDate: appointmentData.schedule.startDateTime,
        instructions: payload.instructions,
        followUpDate,
        doctorEmail: doctorData.email,
        patientEmail: appointmentData.patient.email,
        prescriptionId: prescription.id,
        createdAt: prescription.createdAt,
    });

    // Step 3: Upload PDF to Cloudinary (Slow external API call, but DB is free!)
    const fileName = `Prescription-${Date.now()}.pdf`;
    let pdfUrl = null;
    try {
        const uploadedFile = await uploadFileToCloudinary(pdfBuffer, fileName);
        pdfUrl = uploadedFile.secure_url;
    } catch (uploadError) {
        console.error("Failed to upload prescription PDF to Cloudinary", uploadError);
        // We could delete the prescription here if we want to be strictly transactional,
        // but it's better to keep the prescription and let the doctor retry PDF generation later.
    }

    let updatedPrescription = prescription;

    if (pdfUrl) {
        // Step 4: Update the prescription with the PDF URL
        updatedPrescription = await prisma.prescription.update({
            where: {
                id: prescription.id
            },
            data: {
                pdfUrl
            }
        });
    }

    // Step 5: Send Email
    if (pdfUrl) {
        try {
            const patient = appointmentData.patient;
            const doctor = appointmentData.doctor;

            await sendEmail({
                to: patient.email,
                subject: `You have received a new prescription from Dr. ${doctor.name}`,
                templateName: "prescription",
                templateData: {
                    doctorName: doctor.name,
                    patientName: patient.name,
                    specialization: doctor.specialties.map((s: any) => s.title).join(", "),
                    appointmentDate: new Date(appointmentData.schedule.startDateTime).toLocaleString(),
                    issuedDate: new Date(prescription.createdAt).toLocaleDateString(),
                    prescriptionId: prescription.id,
                    instructions: payload.instructions,
                    followUpDate: followUpDate.toLocaleDateString(),
                    pdfUrl: pdfUrl
                },
                attachments: [
                    {
                        filename: fileName,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            });
        } catch (error) {
            console.error("Failed to send email notification for prescription", error);
        }
    }

    // Optional: Mark appointment as COMPLETED if prescribed
    await prisma.appointment.update({
        where: { id: appointmentData.id },
        data: { status: AppointmentStatus.COMPLETED }
    });

    return updatedPrescription;
};

const myPrescriptions = async (user: IRequestUser, filters: any, options: IPaginationOptions) => {
    const { limit, page, skip, sortBy, sortOrder } = paginationHelper.calculatePagination(options);

    const andConditions: Prisma.PrescriptionWhereInput[] = [];

    if (user.role === Role.DOCTOR) {
        const doctorData = await prisma.doctor.findUniqueOrThrow({
            where: { userId: user.id }
        });
        andConditions.push({ doctorId: doctorData.id });
    } else if (user.role === Role.PATIENT) {
        const patientData = await prisma.patient.findUniqueOrThrow({
            where: { userId: user.id }
        });
        andConditions.push({ patientId: patientData.id });
    } else {
        throw new ApiError(status.FORBIDDEN, "Only patients and doctors can view their prescriptions");
    }

    const whereConditions: Prisma.PrescriptionWhereInput = { AND: andConditions };

    const result = await prisma.prescription.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: {
            [sortBy]: sortOrder,
        },
        include: {
            doctor: user.role === Role.PATIENT, // Patient sees doctor details
            patient: user.role === Role.DOCTOR, // Doctor sees patient details
            appointment: true,
        },
    });

    const total = await prisma.prescription.count({
        where: whereConditions,
    });

    return {
        meta: {
            total,
            page,
            limit,
        },
        data: result,
    };
};

const getAllPrescriptions = async (filters: any, options: IPaginationOptions) => {
    const { limit, page, skip, sortBy, sortOrder } = paginationHelper.calculatePagination(options);
    const { patientEmail, doctorId } = filters;

    const andConditions: Prisma.PrescriptionWhereInput[] = [];

    if (patientEmail) {
        andConditions.push({
            patient: {
                email: patientEmail,
            },
        });
    }

    if (doctorId) {
        andConditions.push({
            doctorId: doctorId,
        });
    }

    const whereConditions: Prisma.PrescriptionWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

    const result = await prisma.prescription.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: {
            [sortBy]: sortOrder,
        },
        include: {
            patient: true,
            doctor: true,
            appointment: true,
        }
    });

    const total = await prisma.prescription.count({
        where: whereConditions,
    });

    return {
        meta: {
            total,
            page,
            limit,
        },
        data: result,
    };
};

const updatePrescription = async (user: IRequestUser, prescriptionId: string, payload: any) => {
    // Fetch current prescription data
    const prescriptionData = await prisma.prescription.findUniqueOrThrow({
        where: {
            id: prescriptionId
        },
        include: {
            doctor: true,
            patient: true,
            appointment: {
                include: {
                    schedule: true
                }
            }
        }
    });

    // Verify the user is the doctor for this prescription
    if (user.id !== prescriptionData.doctor.userId) {
        throw new ApiError(status.FORBIDDEN, "This is not your prescription!");
    }

    // Prepare updated data
    const updatedInstructions = payload.instructions || prescriptionData.instructions;
    const updatedFollowUpDate = payload.followUpDate
        ? new Date(payload.followUpDate)
        : prescriptionData.followUpDate;

    // Step 1: Generate new PDF with updated data
    const pdfBuffer = await generatePrescriptionPDF({
        doctorName: prescriptionData.doctor.name,
        doctorEmail: prescriptionData.doctor.email,
        patientName: prescriptionData.patient.name,
        patientEmail: prescriptionData.patient.email,
        appointmentDate: prescriptionData.appointment.schedule.startDateTime,
        instructions: updatedInstructions,
        followUpDate: updatedFollowUpDate,
        prescriptionId: prescriptionData.id,
        createdAt: prescriptionData.createdAt,
    });

    // Step 2: Upload new PDF to Cloudinary (No DB lock)
    const fileName = `prescription-updated-${Date.now()}.pdf`;
    const uploadedFile = await uploadFileToCloudinary(pdfBuffer, fileName).catch((uploadError) => {
        console.error("Failed to upload updated prescription PDF to Cloudinary", uploadError);
        throw new ApiError(status.INTERNAL_SERVER_ERROR, "Failed to upload new PDF.");
    });
    const newPdfUrl = uploadedFile.secure_url;

    // Step 3: Delete old PDF from Cloudinary if it exists and a new one was uploaded
    if (prescriptionData.pdfUrl && newPdfUrl !== prescriptionData.pdfUrl) {
        try {
            await deleteFileFromCloudinary(prescriptionData.pdfUrl);
        } catch (deleteError) {
            console.error("Failed to delete old PDF from Cloudinary:", deleteError);
        }
    }

    // Step 4: Update prescription in database
    const result = await prisma.prescription.update({
        where: {
            id: prescriptionId
        },
        data: {
            instructions: updatedInstructions,
            followUpDate: updatedFollowUpDate,
            pdfUrl: newPdfUrl
        },
        include: {
            patient: true,
            doctor: true,
            appointment: {
                include: {
                    schedule: true
                }
            },
        }
    });

    // Step 5: Send updated prescription email to patient
    try {
        await sendEmail({
            to: result.patient.email,
            subject: `Your Prescription has been Updated by Dr. ${result.doctor.name}`,
            templateName: "prescription",
            templateData: {
                patientName: result.patient.name,
                doctorName: result.doctor.name,
                specialization: "Healthcare Provider",
                prescriptionId: result.id,
                appointmentDate: new Date(result.appointment.schedule.startDateTime).toLocaleString(),
                issuedDate: new Date(result.createdAt).toLocaleDateString(),
                followUpDate: new Date(result.followUpDate).toLocaleDateString(),
                instructions: result.instructions,
                pdfUrl: newPdfUrl
            },
            attachments: [
                {
                    filename: `Prescription-${result.id}.pdf`,
                    content: pdfBuffer,
                    contentType: "application/pdf"
                }
            ]
        });
    } catch (emailError) {
        console.error("Failed to send updated prescription email:", emailError);
    }

    return result;
};

const deletePrescription = async (user: IRequestUser, prescriptionId: string): Promise<void> => {
    // Fetch prescription data
    const prescriptionData = await prisma.prescription.findUniqueOrThrow({
        where: {
            id: prescriptionId
        },
        include: {
            doctor: true
        }
    });

    // Verify the user is the doctor for this prescription
    if (user.id !== prescriptionData.doctor.userId) {
        throw new ApiError(status.FORBIDDEN, "This is not your prescription!");
    }

    // Delete PDF from Cloudinary if it exists
    if (prescriptionData.pdfUrl) {
        try {
            await deleteFileFromCloudinary(prescriptionData.pdfUrl);
        } catch (deleteError) {
            console.error("Failed to delete PDF from Cloudinary:", deleteError);
        }
    }

    // Delete prescription from database
    await prisma.prescription.delete({
        where: {
            id: prescriptionId
        }
    });
}

export const PrescriptionService = {
    givePrescription,
    myPrescriptions,
    getAllPrescriptions,
    updatePrescription,
    deletePrescription
};
