import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, { error: 'Invalid id format' });

const mediaSchema = z.object({
    url: z.url({ error: 'media url must be valid URL' }),
    publicId: z.string().optional(),
    type: z.enum(['image', 'video', 'gif']).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    duration: z.number().optional(),
    alt: z.string().max(200).optional(),
});

const createPostSchema = z.object({
    content: z.object({
        text: z
            .string()
            .trim()
            .min(1, { error: 'content text is required' })
            .max(5000, { error: 'content must be at most 5000 characters' }),
    }),
    media: z.array(mediaSchema).optional(),
    tags: z.array(z.string().trim()).optional(),
    visibility: z.enum(['public', 'followers', 'private']).optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    allowComments: z.boolean().optional(),
});

const updatePostSchema = z.object({
    content: z.object({
        text: z
            .string()
            .trim()
            .min(1, { error: 'content text is required' })
            .max(5000, { error: 'content must be at most 5000 characters' }),
    }).optional(),
    media: z.array(mediaSchema).optional(),
    tags: z.array(z.string().trim()).optional(),
    visibility: z.enum(['public', 'followers', 'private']).optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    allowComments: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, { error: 'At least one field is required' });

const createCommentSchema = z.object({
    content: z
        .string()
        .trim()
        .min(1, { error: 'content is required' })
        .max(2000, { error: 'content must be at most 2000 characters' }),
    parentComment: objectIdSchema.optional(),
});

export { createPostSchema, updatePostSchema, createCommentSchema };
