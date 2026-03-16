import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const MAX_FILE_SIZE_MB = 2;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Use memory storage instead of disk
const storage = multer.memoryStorage();

const fileFilter = function (req, file, cb) {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
        return cb(new ApiError(400, "Only JPEG, PNG and WEBP images are allowed"));
    }
    cb(null, true);
};

const createSingleImageUploader = (fieldName) => multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 }
}).single(fieldName);

export const uploadAvatarImage = createSingleImageUploader('avatar');
export const uploadBannerImage = createSingleImageUploader('banner');