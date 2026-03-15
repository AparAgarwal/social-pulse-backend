import { ApiError } from "../utils/ApiError.js";

export const validateSchema = (schema) => async (req, res, next) => {
	try {
		const parsed = await schema.parseAsync(req.body);
		req.body = parsed;
		return next();
	} catch (err) {
		// zod error
		if (err?.issues) {
			const errors = err.issues.map((issue) => ({
				path: issue.path.join('.') || issue.path,
				message: issue.message,
			}));
			throw new ApiError(400, 'Validation failed', errors);
		}
		throw err;
	}
};
