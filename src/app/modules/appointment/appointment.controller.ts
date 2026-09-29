import { Request, Response } from "express";
import status from "http-status";

import { AppointmentService } from "./appointment.service";
import pick from "../../../shared/pick";
import { IRequestUser } from "../../interfaces/requestUser.interface";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { appointmentFilterableFields } from "./appointment.constant";




const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user as IRequestUser;
  const appointment = await AppointmentService.bookAppointment(payload, user);
  sendResponse(res, {
    success: true,
    statusCode: status.CREATED,
    message: "Appointment booked successfully",
    data: appointment,
  });
});




const getMyAppointments = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IRequestUser;
  const filters = pick(req.query, ["status", "paymentStatus"]);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await AppointmentService.getMyAppointments(
    user,
    filters,
    options,
  );
  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Appointments retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});



const changeAppointmentStatus = catchAsync(
  async (req: Request, res: Response) => {
    const appointmentId = req.params.id;
    const payload = req.body;
    const user = req.user as IRequestUser;

    const updatedAppointment = await AppointmentService.changeAppointmentStatus(
      appointmentId as string,
      payload,
      user,
    );
    sendResponse(res, {
      success: true,
      statusCode: status.OK,
      message: "Appointment status updated successfully",
      data: updatedAppointment,
    });
  },
);



const getMySingleAppointment = catchAsync(
  async (req: Request, res: Response) => {
    const appointmentId = req.params.id;
    const user = req.user as IRequestUser;

    const appointment = await AppointmentService.getMySingleAppointment(
      appointmentId as string,
      user,
    );
    sendResponse(res, {
      success: true,
      statusCode: status.OK,
      message: "Appointment retrieved successfully",
      data: appointment,
    });
  },
);



const getAllAppointments = catchAsync(async (req: Request, res: Response) => {
  const filters = pick(req.query, appointmentFilterableFields);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await AppointmentService.getAllAppointments(filters, options);
  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "All appointments retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});



const bookAppointmentWithPayLater = catchAsync(
  async (req: Request, res: Response) => {
    const payload = req.body;
    const user = req.user as IRequestUser;
    const appointment = await AppointmentService.bookAppointmentWithPayLater(
      payload,
      user,
    );
    sendResponse(res, {
      success: true,
      statusCode: status.CREATED,
      message: "Appointment booked successfully with Pay Later option",
      data: appointment,
    });
  },
);



const initiatePayment = catchAsync(async (req: Request, res: Response) => {
  const appointmentId = req.params.id;
  const user = req.user as IRequestUser;
  const paymentInfo = await AppointmentService.initiatePayment(
    appointmentId as string,
    user,
  );

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Payment initiated successfully",
    data: paymentInfo,
  });
});




export const AppointmentController = {
  bookAppointment,
  getMyAppointments,
  changeAppointmentStatus,
  getMySingleAppointment,
  getAllAppointments,
  bookAppointmentWithPayLater,
  initiatePayment,
};
