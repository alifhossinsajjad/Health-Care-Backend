import { CallStatus } from "../../../../generated/prisma/enums"

export interface ICallInitiatePayload {
  appointmentId: string;
  videoCallingId: string;
  callType?: "VIDEO" | "AUDIO";
}

export interface ICallAcceptPayload {
  appointmentId: string;
  callId: string;
}

export interface ICallRejectPayload {
  appointmentId: string;
  callId: string;
  reason?: string;
}

export interface ISdpPayload {
  appointmentId: string;
  sdp: unknown;
}

export interface IIceCandidatePayload {
  appointmentId: string;
  candidate: unknown;
}

export interface IMediaTogglePayload {
  appointmentId: string;
  videoMuted?: boolean;
  audioMuted?: boolean;
}

export interface ICallEndPayload {
  appointmentId: string;
  callId?: string;
}

export interface IIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export { CallStatus };
