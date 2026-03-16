import express from "express";
import {
	listActiveSessions,
	listSessionsForManagement,
	loginUser,
	logoutUser,
	refreshAccessToken,
	registerUser,
	revokeSession,
	revokeSessionForManagement
} from "../controllers/auth.controller.js";
import { validateSchema } from "../middlewares/validate.middleware.js";
import { loginSchema, registerSchema, revokeSessionSchema } from "../schemas/auth.schema.js";
import { authenticate, refreshAuthenticate, sessionManagementAuthenticate } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post('/register', validateSchema(registerSchema), registerUser);
router.post('/login', validateSchema(loginSchema), loginUser);
router.post('/refresh', refreshAuthenticate, refreshAccessToken);
router.post('/logout', logoutUser);
router.get('/sessions', authenticate, listActiveSessions);
router.post('/sessions/revoke', authenticate, validateSchema(revokeSessionSchema), revokeSession);

router.get('/session-management/sessions', sessionManagementAuthenticate, listSessionsForManagement);
router.post('/session-management/sessions/revoke', sessionManagementAuthenticate, validateSchema(revokeSessionSchema), revokeSessionForManagement);

export default router;