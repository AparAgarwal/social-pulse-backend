import express from "express";
import { loginUser, logoutUser, refreshAccessToken, registerUser } from "../controllers/auth.controller.js";
import { validateSchema } from "../middlewares/validate.middleware.js";
import { registerSchema, loginSchema } from "../schemas/auth.schema.js";
import { refreshAuthenticate } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post('/register', validateSchema(registerSchema), registerUser);
router.post('/login', validateSchema(loginSchema), loginUser);
router.post('/refresh', refreshAuthenticate, refreshAccessToken);
router.post('/logout', logoutUser);

export default router;