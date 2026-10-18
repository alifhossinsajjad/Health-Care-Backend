/* eslint-disable @typescript-eslint/no-explicit-any */
import nodemailer from "nodemailer";
import ejs from "ejs";
import path from "path";
import { envVars } from "../../config/env";

interface IEmailOptions {
  to: string;
  subject: string;
  templateName: string;
  templateData: Record<string, any>;
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType: string;
  }[];
}

export const sendEmail = async ({ to, subject, templateName, templateData, attachments }: IEmailOptions) => {
  try {
    const transporter = nodemailer.createTransport({
      host: envVars.EMAIL_SENDER_SMTP_HOST || "smtp.gmail.com",
      port: Number(envVars.EMAIL_SENDER_SMTP_PORT) || 587,
      secure: Number(envVars.EMAIL_SENDER_SMTP_PORT) === 465,
      auth: {
        user: envVars.EMAIL_SENDER_SMTP_USER,
        pass: envVars.EMAIL_SENDER_SMTP_PASS, // App password
      },
    });

    // Resolve the path to the EJS template
    const templatePath = path.join(process.cwd(), "src", "app", "templates", `${templateName}.ejs`);

    // Render the EJS template
    const html = await ejs.renderFile(templatePath, templateData);

    // Send the email
    const info = await transporter.sendMail({
      from: `"HealthCare Support" <${envVars.EMAIL_SENDER_SMTP_USER}>`,
      to,
      subject,
      html,
      attachments: attachments?.map((attachment) => {
        const content =
          typeof attachment.content === "string" &&
          !attachment.content.startsWith("http") &&
          !attachment.content.includes("\n")
            ? Buffer.from(attachment.content, "base64")
            : attachment.content;
        return {
          filename: attachment.filename,
          content,
          contentType: attachment.contentType,
        };
      }),
    });

    console.log("Email sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email: ", error);
    throw new Error("Could not send email.", { cause: error });
  }
};

/**
 * Non-blocking asynchronous email dispatch via BullMQ
 * Returns immediately in < 5ms and executes in the background with auto-retries
 */
export const queueEmail = async ({
  to,
  subject,
  templateName,
  templateData,
  attachments,
}: IEmailOptions) => {
  const { addEmailJob } = await import("../queues/email.queue");
  return await addEmailJob({
    to,
    subject,
    templateName,
    templateData,
    ...(attachments
      ? {
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.isBuffer(a.content)
              ? a.content.toString("base64")
              : String(a.content),
            contentType: a.contentType,
          })),
        }
      : {}),
  });
};
