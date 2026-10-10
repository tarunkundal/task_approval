import { z } from 'zod';

/** Prisma `@default(cuid())` ids. */
export const idSchema = z.cuid();

export const idParamSchema = z.object({ id: idSchema });
export type IdParam = z.infer<typeof idParamSchema>;

/** Trimmed, lower-cased email address. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Calendar date in `YYYY-MM-DD` form (stored as MySQL DATE). */
export const dateOnlySchema = z.iso.date();
