import { z } from 'zod';

const usernameRegex = /^[a-zA-Z0-9_]+$/;

export const updateProfileSchema = z
    .object({
        fullname: z.string().trim().min(1, { error: 'fullname cannot be empty' }).max(80, { error: 'fullname is too long' }).optional(),
        username: z
            .string()
            .trim()
            .min(3, { error: 'username must be at least 3 characters' })
            .max(30, { error: 'username must be at most 30 characters' })
            .regex(usernameRegex, { error: 'username can only contain letters, numbers, and underscore' })
            .optional(),
        bio: z.string().trim().max(280, { error: 'bio must be at most 280 characters' }).optional(),
        location: z.string().trim().max(120, { error: 'location must be at most 120 characters' }).optional(),
        website: z.string().trim().max(200, { error: 'website must be at most 200 characters' }).optional(),
        isPrivate: z.boolean().optional(),
    })
    .refine((payload) => Object.keys(payload).length > 0, {
        error: 'At least one field is required',
    });
