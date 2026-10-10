import { z } from 'zod';

export const createCommentSchema = z.strictObject({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(2000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
