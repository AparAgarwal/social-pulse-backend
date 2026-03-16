import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
    getCurrentUser,
    getPublicUserProfile,
    updateCurrentUserProfile,
    uploadAvatar,
    uploadBanner
} from "../controllers/user.controller.js";
import { uploadAvatarImage, uploadBannerImage } from "../config/upload.js";
import { validateSchema } from "../middlewares/validate.middleware.js";
import { updateProfileSchema } from "../schemas/user.schema.js";

const router = express.Router();

router.get('/me', authenticate, getCurrentUser);
router.patch('/me', authenticate, validateSchema(updateProfileSchema), updateCurrentUserProfile);
router.get('/:username', getPublicUserProfile);

router.patch('/me/avatar', authenticate, uploadAvatarImage, uploadAvatar);
router.patch('/me/banner', authenticate, uploadBannerImage, uploadBanner);

export default router;