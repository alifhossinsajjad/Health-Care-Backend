import status from "http-status";

import { IRequestUser } from "../../interfaces/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { PaymentStatus, Role } from "../../../../generated/prisma/enums";
import { ApiError } from "../../errors/ApiError";

const getDashboardStatsData = async (user: IRequestUser) => {
    switch (user.role) {
        case Role.SUPER_ADMIN:
            return getSuperAdminStatsData();
        case Role.ADMIN:
            return getAdminStatsData();
        case Role.DOCTOR:
            return getDoctorStatsData(user);
        case Role.PATIENT:
            return getPatientStatsData(user);
        default:
            throw new ApiError(status.BAD_REQUEST, "Invalid user role");
    }
}

const getSuperAdminStatsData = async () => {
    // Run independent aggregate queries in parallel using Promise.all for maximum performance
    const [
        appointmentCount,
        doctorCount,
        patientCount,
        superAdminCount,
        adminCount,
        paymentCount,
        userCount,
        totalRevenueAggregate,
        pieChartData,
        barChartData
    ] = await Promise.all([
        prisma.appointment.count(),
        prisma.doctor.count(),
        prisma.patient.count(),
        prisma.admin.count({ where: { user: { role: Role.SUPER_ADMIN } } }),
        prisma.admin.count(),
        prisma.payment.count(),
        prisma.user.count(),
        prisma.payment.aggregate({
            _sum: { amount: true },
            where: { status: PaymentStatus.PAID }
        }),
        getPieChartData(),
        getBarChartData()
    ]);

    return {
        appointmentCount,
        doctorCount,
        patientCount,
        superAdminCount,
        adminCount,
        paymentCount,
        userCount,
        totalRevenue: totalRevenueAggregate._sum.amount || 0,
        pieChartData,
        barChartData
    }
}

const getAdminStatsData = async () => {
    // Similar to Super Admin but omitting Super Admin counts
    const [
        appointmentCount,
        doctorCount,
        patientCount,
        paymentCount,
        userCount,
        adminCount,
        totalRevenueAggregate,
        pieChartData,
        barChartData
    ] = await Promise.all([
        prisma.appointment.count(),
        prisma.doctor.count(),
        prisma.patient.count(),
        prisma.payment.count(),
        prisma.user.count(),
        prisma.admin.count(),
        prisma.payment.aggregate({
            _sum: { amount: true },
            where: { status: PaymentStatus.PAID }
        }),
        getPieChartData(),
        getBarChartData()
    ]);

    return {
        appointmentCount,
        doctorCount,
        patientCount,
        paymentCount,
        userCount,
        adminCount,
        totalRevenue: totalRevenueAggregate._sum.amount || 0,
        pieChartData,
        barChartData
    }
}

const getDoctorStatsData = async (user: IRequestUser) => {
    // BUG FIX: using userId instead of undefined email
    const doctorData = await prisma.doctor.findUniqueOrThrow({
        where: { userId: user.id }
    });

    // Execute multiple independent queries concurrently
    const [
        reviewCount,
        patientCount,
        appointmentCount,
        totalRevenueAggregate,
        appointmentStatusDistribution
    ] = await Promise.all([
        prisma.review.count({ where: { doctorId: doctorData.id } }),
        prisma.appointment.groupBy({
            by: ["patientId"],
            _count: { id: true },
            where: { doctorId: doctorData.id }
        }),
        prisma.appointment.count({ where: { doctorId: doctorData.id } }),
        prisma.payment.aggregate({
            _sum: { amount: true },
            where: {
                appointment: { doctorId: doctorData.id },
                status: PaymentStatus.PAID
            }
        }),
        prisma.appointment.groupBy({
            by: ["status"],
            _count: { id: true },
            where: { doctorId: doctorData.id }
        })
    ]);

    const formattedAppointmentStatusDistribution = appointmentStatusDistribution.map(({ _count, status }) => ({
        status,
        count: _count.id
    }));

    return {
        reviewCount,
        patientCount: patientCount.length, // Unique patients assigned to this doctor
        appointmentCount,
        totalRevenue: totalRevenueAggregate._sum.amount || 0,
        appointmentStatusDistribution: formattedAppointmentStatusDistribution
    }
}

const getPatientStatsData = async (user: IRequestUser) => {
    // BUG FIX: using userId instead of undefined email
    const patientData = await prisma.patient.findUniqueOrThrow({
        where: { userId: user.id }
    });

    const [
        appointmentCount,
        reviewCount,
        appointmentStatusDistribution
    ] = await Promise.all([
        prisma.appointment.count({ where: { patientId: patientData.id } }),
        prisma.review.count({ where: { patientId: patientData.id } }),
        prisma.appointment.groupBy({
            by: ["status"],
            _count: { id: true },
            where: { patientId: patientData.id }
        })
    ]);

    const formattedAppointmentStatusDistribution = appointmentStatusDistribution.map(({ _count, status }) => ({
        status,
        count: _count.id
    }));

    return {
        appointmentCount,
        reviewCount,
        appointmentStatusDistribution: formattedAppointmentStatusDistribution
    }
}

const getPieChartData = async () => {
    const appointmentStatusDistribution = await prisma.appointment.groupBy({
        by: ["status"],
        _count: {
            id: true
        }
    });

    return appointmentStatusDistribution.map(({ _count, status }) => ({
        status,
        count: _count.id
    }));
}

const getBarChartData = async () => {
    // Convert BigInt to Number directly in the mapping to avoid JSON serialization errors
    // The query returns counts grouped by month
    const appointmentCountByMonth: any[] = await prisma.$queryRaw`
        SELECT DATE_TRUNC('month', "createdAt") AS month,
        CAST(COUNT(*) AS INTEGER) AS count
        FROM "appointments"
        GROUP BY month
        ORDER BY month ASC;
    `;

    return appointmentCountByMonth.map(item => ({
        month: item.month,
        count: Number(item.count) // Ensures it's safely serialized as JSON instead of BigInt error
    }));
}

export const StatsService = {
    getDashboardStatsData
}