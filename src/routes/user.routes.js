import express from "express";
import { authenticate, optionalAuthenticate } from "../middlewares/auth.middleware.js";
import {
    getCurrentUser,
    getPublicUserProfile,
    updateCurrentUserProfile,
    deleteAvatar,
    deleteBanner,
    uploadAvatar,
    uploadBanner,
    followUser,
    unfollowUser,
    listFollowers,
    listFollowing,
    listUserPosts,
} from "../controllers/user.controller.js";
import { uploadAvatarImage, uploadBannerImage } from "../config/upload.js";
import { validateSchema } from "../middlewares/validate.middleware.js";
import { updateProfileSchema } from "../schemas/user.schema.js";

const router = express.Router();

router.get('/me', authenticate, getCurrentUser);
router.patch('/me', authenticate, validateSchema(updateProfileSchema), updateCurrentUserProfile);
router.get('/:username/posts', optionalAuthenticate, listUserPosts);
router.get('/:username', optionalAuthenticate, getPublicUserProfile);

router.patch('/me/avatar', authenticate, uploadAvatarImage, uploadAvatar);
router.patch('/me/banner', authenticate, uploadBannerImage, uploadBanner);
router.delete('/me/avatar', authenticate, deleteAvatar);
router.delete('/me/banner', authenticate, deleteBanner);

router.post('/:username/follow', authenticate, followUser);
router.delete('/:username/follow', authenticate, unfollowUser);
router.get('/:username/followers', listFollowers);
router.get('/:username/following', listFollowing);

export default router;