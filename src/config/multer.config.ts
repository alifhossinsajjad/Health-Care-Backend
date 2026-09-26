import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { cloudinaryUpload, generateUniqueFileName } from "./cloudinary.config";

const storage = new CloudinaryStorage({
    cloudinary: cloudinaryUpload,
    params: async (req, file) => {
        const { uniqueName, folder } = generateUniqueFileName(file.originalname);

        return {
            folder : `ph-healthcare/${folder}`,
            public_id: uniqueName,
            resource_type : "auto"
        }
    }

})

export const multerUpload = multer({storage})