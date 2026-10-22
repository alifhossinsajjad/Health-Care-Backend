import { Server, Socket } from "socket.io";
import { ChatService } from "./chat.service";
import {
  ISendMessagePayload,
  ITypingPayload,
  IJoinRoomPayload,
  IEditMessagePayload,
  IDeleteMessagePayload,
} from "./chat.interface";

export const initChatSocket = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    // Each user joins their private personal room for direct notifications
    const personalRoom = `user:${user.id}`;
    socket.join(personalRoom);

    /**
     * 1. Join Appointment Consultation Room
     */
    socket.on("join:appointment", async (payload: IJoinRoomPayload, callback) => {
      try {
        const { appointmentId } = payload;
        if (!appointmentId) {
          if (callback) callback({ success: false, message: "appointmentId is required" });
          return;
        }

        const participantInfo = await ChatService.verifyAppointmentParticipant(
          user.id,
          appointmentId,
        );

        const roomName = `appointment:${appointmentId}`;
        socket.join(roomName);

        // Notify room that participant is present
        socket.to(roomName).emit("participant:online", {
          userId: user.id,
          role: user.role,
          appointmentId,
        });

        if (callback) {
          callback({
            success: true,
            message: "Joined appointment chat room successfully",
            data: {
              room: roomName,
              isPatient: participantInfo.isPatient,
              isDoctor: participantInfo.isDoctor,
              receiverUserId: participantInfo.receiverUserId,
            },
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to join room";
        if (callback) callback({ success: false, message: errorMessage });
      }
    });

    /**
     * 2. Send Message
     */
    socket.on("chat:send", async (payload: ISendMessagePayload, callback) => {
      try {
        if (!payload.appointmentId || !payload.message?.trim()) {
          if (callback) callback({ success: false, message: "Valid appointmentId and message are required" });
          return;
        }

        const savedMessage = await ChatService.saveMessage(user.id, payload);

        const roomName = `appointment:${payload.appointmentId}`;

        // Broadcast to everyone in the appointment room (including sender)
        io.to(roomName).emit("chat:message", savedMessage);

        // Push real-time notification to receiver's personal user room
        if (savedMessage.receiverId) {
          io.to(`user:${savedMessage.receiverId}`).emit("chat:notification", {
            appointmentId: payload.appointmentId,
            message: savedMessage,
          });
        }

        if (callback) callback({ success: true, data: savedMessage });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to send message";
        if (callback) callback({ success: false, message: errorMessage });
      }
    });

    /**
     * 3. Typing Indicator
     */
    socket.on("chat:typing", (payload: ITypingPayload) => {
      if (!payload?.appointmentId) return;
      const roomName = `appointment:${payload.appointmentId}`;
      socket.to(roomName).emit("chat:typing", {
        appointmentId: payload.appointmentId,
        userId: user.id,
        isTyping: !!payload.isTyping,
      });
    });

    /**
     * 4. Mark Messages Read
     */
    socket.on("chat:read", async (payload: { appointmentId: string }) => {
      try {
        if (!payload?.appointmentId) return;
        await ChatService.markMessagesAsRead(user.id, payload.appointmentId);
        const roomName = `appointment:${payload.appointmentId}`;
        socket.to(roomName).emit("chat:read_receipt", {
          appointmentId: payload.appointmentId,
          readBy: user.id,
          readAt: new Date(),
        });
      } catch {
        // Silent catch for read receipt
      }
    });

    /**
     * 5. Edit Message (Meta Messenger-like)
     */
    socket.on("chat:edit", async (payload: IEditMessagePayload, callback) => {
      try {
        if (!payload?.messageId || !payload?.appointmentId || !payload?.newMessage?.trim()) {
          if (callback) callback({ success: false, message: "Valid messageId, appointmentId and newMessage are required" });
          return;
        }

        const updatedMessage = await ChatService.editMessage(user.id, payload);
        const roomName = `appointment:${payload.appointmentId}`;
        io.to(roomName).emit("chat:edited", updatedMessage);

        if (callback) callback({ success: true, data: updatedMessage });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to edit message";
        if (callback) callback({ success: false, message: errorMessage });
      }
    });

    /**
     * 6. Delete / Unsend Message for Everyone (Meta Messenger-like)
     */
    socket.on("chat:delete", async (payload: IDeleteMessagePayload, callback) => {
      try {
        if (!payload?.messageId || !payload?.appointmentId) {
          if (callback) callback({ success: false, message: "Valid messageId and appointmentId are required" });
          return;
        }

        const deletedMessage = await ChatService.deleteMessage(user.id, payload);
        const roomName = `appointment:${payload.appointmentId}`;
        io.to(roomName).emit("chat:deleted", {
          messageId: payload.messageId,
          appointmentId: payload.appointmentId,
          deletedMessage,
        });

        if (callback) callback({ success: true, data: deletedMessage });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to delete message";
        if (callback) callback({ success: false, message: errorMessage });
      }
    });

    /**
     * 7. Leave Consultation Room
     */
    socket.on("leave:appointment", (payload: { appointmentId: string }) => {
      if (!payload?.appointmentId) return;
      const roomName = `appointment:${payload.appointmentId}`;
      socket.leave(roomName);
      socket.to(roomName).emit("participant:offline", {
        userId: user.id,
        appointmentId: payload.appointmentId,
      });
    });

    /**
     * 6. Disconnect
     */
    socket.on("disconnect", () => {
      socket.leave(personalRoom);
    });
  });
};
