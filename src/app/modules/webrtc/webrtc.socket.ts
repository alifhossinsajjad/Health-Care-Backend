import { Server, Socket } from "socket.io";
import { WebRtcService } from "./webrtc.service";
import {
  ICallInitiatePayload,
  ICallAcceptPayload,
  ICallRejectPayload,
  ISdpPayload,
  IIceCandidatePayload,
  IMediaTogglePayload,
  ICallEndPayload,
} from "./webrtc.interface";

export const initWebRtcSocket = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    if (!user) return;

    socket.join(`user:${user.id}`);

    /**
     * Join Call Room (for initial room setup or re-connection)
     */
    socket.on(
      "call:join",
      async (payload: { appointmentId: string }, callback) => {
        try {
          if (!payload?.appointmentId) {
            if (callback) {
              callback({
                success: false,
                message: "appointmentId is required",
              });
            }
            return;
          }

          await WebRtcService.validateConsultationAccess(
            user.id,
            payload.appointmentId,
          );

          const roomName = `call:${payload.appointmentId}`;
          socket.join(roomName);

          socket.to(roomName).emit("call:peer-joined", {
            userId: user.id,
            role: user.role,
            appointmentId: payload.appointmentId,
          });

          if (callback) {
            callback({
              success: true,
              message: "Joined call room successfully",
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to join call room";
          if (callback) callback({ success: false, message: errorMessage });
        }
      },
    );

    /**
     * 1. Initiate Video/Voice Call
     */
    socket.on(
      "call:initiate",
      async (payload: ICallInitiatePayload, callback) => {
        try {
          console.log("📞 [WebRTC Socket] Received call:initiate from:", user.id, payload);

          if (!payload.appointmentId || !payload.videoCallingId) {
            const err = "appointmentId and videoCallingId are required";
            socket.emit("call:error", { action: "call:initiate", message: err });
            if (callback) callback({ success: false, message: err });
            return;
          }

          const session = await WebRtcService.createCallSession(
            user.id,
            payload,
          );

          const roomName = `call:${payload.appointmentId}`;
          socket.join(roomName);

          // 1. Notify caller that call was successfully registered
          socket.emit("call:initiated", {
            success: true,
            callId: session.callLog.id,
            appointmentId: payload.appointmentId,
            videoCallingId: session.videoCallingId,
            receiverId: session.receiverUserId,
          });

          // 2. Notify receiver via their personal private user room
          console.log(`📲 [WebRTC Socket] Emitting call:incoming to user:${session.receiverUserId}`);
          io.to(`user:${session.receiverUserId}`).emit("call:incoming", {
            callId: session.callLog.id,
            appointmentId: payload.appointmentId,
            videoCallingId: session.videoCallingId,
            callerId: user.id,
            callerName: session.callerName,
            callerRole: session.callerRole,
            callType: payload.callType || "VIDEO",
            startedAt: session.callLog.startedAt,
          });

          if (callback) {
            callback({
              success: true,
              data: {
                callId: session.callLog.id,
                appointmentId: payload.appointmentId,
                videoCallingId: session.videoCallingId,
              },
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to initiate call";
          console.error("❌ [WebRTC Socket call:initiate error]:", errorMessage);
          socket.emit("call:error", { action: "call:initiate", message: errorMessage });
          if (callback) callback({ success: false, message: errorMessage });
        }
      },
    );

    /**
     * 2. Accept Incoming Call
     */
    socket.on("call:accept", async (payload: ICallAcceptPayload, callback) => {
      try {
        console.log("📞 [WebRTC Socket] Received call:accept from:", user.id, payload);

        if (!payload.appointmentId || !payload.callId) {
          const err = "appointmentId and callId are required";
          socket.emit("call:error", { action: "call:accept", message: err });
          if (callback) callback({ success: false, message: err });
          return;
        }

        const callLog = await WebRtcService.acceptCallSession(
          user.id,
          payload,
        );

        const roomName = `call:${payload.appointmentId}`;
        socket.join(roomName);

        console.log(`🎉 [WebRTC Socket] Call accepted! Notifying room ${roomName} and caller user:${callLog.callerId}`);

        // 1. Notify caller and room participants
        io.to(roomName).emit("call:accepted", {
          callId: payload.callId,
          appointmentId: payload.appointmentId,
          acceptedBy: user.id,
        });

        // 2. Also notify caller private user room directly for reliability
        io.to(`user:${callLog.callerId}`).emit("call:accepted", {
          callId: payload.callId,
          appointmentId: payload.appointmentId,
          acceptedBy: user.id,
        });

        // 3. Confirm to acceptor
        socket.emit("call:accepted_success", { success: true, data: callLog });
        if (callback) callback({ success: true, data: callLog });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to accept call";
        console.error("❌ [WebRTC Socket call:accept error]:", errorMessage);
        socket.emit("call:error", { action: "call:accept", message: errorMessage });
        if (callback) callback({ success: false, message: errorMessage });
      }
    });

    /**
     * 3. Reject / Decline Call
     */
    socket.on("call:reject", async (payload: ICallRejectPayload, callback) => {
      try {
        if (!payload.appointmentId || !payload.callId) {
          if (callback) {
            callback({
              success: false,
              message: "appointmentId and callId are required",
            });
          }
          return;
        }

        const callLog = await WebRtcService.rejectCallSession(
          user.id,
          payload,
        );

        const roomName = `call:${payload.appointmentId}`;
        io.to(roomName).emit("call:rejected", {
          callId: payload.callId,
          appointmentId: payload.appointmentId,
          rejectedBy: user.id,
          reason: payload.reason || "Declined",
        });

        if (callback) callback({ success: true, data: callLog });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to reject call";
        if (callback) callback({ success: false, message: errorMessage });
      }
    });

    /**
     * 4. WebRTC SDP Offer Exchange
     */
    socket.on("webrtc:offer", (payload: ISdpPayload) => {
      if (!payload?.appointmentId || !payload?.sdp) return;
      const roomName = `call:${payload.appointmentId}`;
      socket.to(roomName).emit("webrtc:offer", {
        sdp: payload.sdp,
        senderId: user.id,
        appointmentId: payload.appointmentId,
      });
    });

    /**
     * 5. WebRTC SDP Answer Exchange
     */
    socket.on("webrtc:answer", (payload: ISdpPayload) => {
      if (!payload?.appointmentId || !payload?.sdp) return;
      const roomName = `call:${payload.appointmentId}`;
      socket.to(roomName).emit("webrtc:answer", {
        sdp: payload.sdp,
        senderId: user.id,
        appointmentId: payload.appointmentId,
      });
    });

    /**
     * 6. WebRTC ICE Candidate Exchange
     */
    socket.on("webrtc:ice-candidate", (payload: IIceCandidatePayload) => {
      if (!payload?.appointmentId || !payload?.candidate) return;
      const roomName = `call:${payload.appointmentId}`;
      socket.to(roomName).emit("webrtc:ice-candidate", {
        candidate: payload.candidate,
        senderId: user.id,
        appointmentId: payload.appointmentId,
      });
    });

    /**
     * 7. Toggle Media (Mute Mic / Disable Camera)
     */
    socket.on("call:toggle-media", (payload: IMediaTogglePayload) => {
      if (!payload?.appointmentId) return;
      const roomName = `call:${payload.appointmentId}`;
      socket.to(roomName).emit("call:media-toggled", {
        userId: user.id,
        videoMuted: payload.videoMuted,
        audioMuted: payload.audioMuted,
      });
    });

    /**
     * 8. End Video Call
     */
    socket.on("call:end", async (payload: ICallEndPayload, callback) => {
      try {
        console.log("📞 [WebRTC Socket] Received call:end from:", user.id, payload);
        if (!payload?.appointmentId) return;

        const result = await WebRtcService.endCallSession(user.id, payload);

        const roomName = `call:${payload.appointmentId}`;
        console.log(`📴 [WebRTC Socket] Call ended in room ${roomName}, duration: ${result?.durationSec || 0}s`);

        io.to(roomName).emit("call:ended", {
          appointmentId: payload.appointmentId,
          endedBy: user.id,
          durationSec: result?.durationSec || 0,
        });

        socket.leave(roomName);
        if (callback) callback({ success: true, data: result });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to end call";
        console.error("❌ [WebRTC Socket call:end error]:", errorMessage);
        socket.emit("call:error", { action: "call:end", message: errorMessage });
        if (callback) callback({ success: false, message: errorMessage });
      }
    });
  });
};
