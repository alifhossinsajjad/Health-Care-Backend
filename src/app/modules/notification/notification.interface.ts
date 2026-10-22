import { NotificationType, Role } from "../../../../generated/prisma/enums";

export interface ICreateNotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface IBroadcastRoleNotificationPayload {
  role: Role;
  notificationType: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface INotificationFilterRequest {
  searchTerm?: string;
  type?: NotificationType;
  isRead?: string | boolean;
  startDate?: string;
  endDate?: string;
}
