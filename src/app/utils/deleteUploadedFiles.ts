/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request } from "express";
import { deleteFileFromCloudinary } from "../../config/cloudinary.config";


export const deleteUploadedFilesFromGlobalErrorHandler = async (
  req: Request,
) => {
  try {
    const filesToDelete: string[] = [];

    if (req.file && req.file.path) {
      filesToDelete.push(req.file.path);
    } else if (req.files) {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | Express.Multer.File[];

      if (Array.isArray(files)) {
        files.forEach((file) => {
          if (file.path) {
            filesToDelete.push(file.path);
          }
        });
      } else {
        Object.values(files).forEach((fileArray) => {
          fileArray.forEach((file) => {
            if (file.path) {
              filesToDelete.push(file.path);
            }
          });
        });
      }
    }

    if (filesToDelete.length > 0) {
      await Promise.all(
        filesToDelete.map((url) => deleteFileFromCloudinary(url)),
      );
      if (process.env.NODE_ENV === "development") {
        console.log(
          `\n🧹 Deleted ${filesToDelete.length} uploaded file(s) from Cloudinary due to an error during request processing.\n`,
        );
      }
    }
  } catch (error: any) {
    console.error(
      "🔴 Error deleting uploaded files from Global Error Handler:",
      error,
    );
  }
};
