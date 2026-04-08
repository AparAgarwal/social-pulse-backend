import express from "express";
import { authenticate, optionalAuthenticate } from "../middlewares/auth.middleware.js";
import { validateSchema } from "../middlewares/validate.middleware.js";
import {
    createPost,
    deletePost,
    getPost,
    listDeletedPosts,
    listPosts,
    permanentlyDeletePost,
    restorePost,
    updatePost,
} from "../controllers/post.controller.js";
import {
    getMyPostLikeStatus,
    likePost,
    unlikePost,
} from "../controllers/post.like.controller.js";
import {
    addComment,
    deleteComment,
    listComments,
} from "../controllers/post.comment.controller.js";
import { createCommentSchema, createPostSchema, updatePostSchema } from "../schemas/post.schema.js";

const router = express.Router();

router.post("/", authenticate, validateSchema(createPostSchema), createPost);
router.get("/", optionalAuthenticate, listPosts);
router.get("/trash", authenticate, listDeletedPosts);
router.get("/:postId", optionalAuthenticate, getPost);
router.patch("/:postId", authenticate, validateSchema(updatePostSchema), updatePost);
router.delete("/:postId", authenticate, deletePost); // Soft delete
router.delete("/:postId/permanent", authenticate, permanentlyDeletePost); // Permanent delete
router.post("/:postId/restore", authenticate, restorePost);

router.post("/:postId/likes", authenticate, likePost);
router.delete("/:postId/likes", authenticate, unlikePost);
router.get("/:postId/likes/me", authenticate, getMyPostLikeStatus);

router.post("/:postId/comments", authenticate, validateSchema(createCommentSchema), addComment);
router.get("/:postId/comments", optionalAuthenticate, listComments);
router.delete("/comments/:commentId", authenticate, deleteComment);

export default router;
