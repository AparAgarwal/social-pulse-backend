import { z } from 'zod';

const registerSchema = z.object({
    fullname: z.string().min(1, { error: 'fullname is required' }),
    email: z.email({ error: 'Invalid email' }),
    username: z.string().min(3, { error: 'username must be at least 3 characters' }),
    password: z.string().min(6, { error: 'password must be at least 6 characters' }),
});

const loginSchema = z
    .object({
        email: z.email({ error: 'Invalid email' }).optional(),
        username: z.string().min(3, { error: 'username must be at least 3 characters' }).optional(),
        password: z.string().min(1, { error: 'password is required' }),
    })
    .refine((data) => !!(data.email || data.username), {
        error: 'email or username is required',
        path: ['email'],
    });

const revokeSessionSchema = z.object({
    sessionId: z.uuid({ error: 'Valid sessionId is required' }),
});

export { registerSchema, loginSchema, revokeSessionSchema };