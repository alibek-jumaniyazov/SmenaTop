import { UnprocessableEntityException } from '@nestjs/common';
import { z } from 'zod';
export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new UnprocessableEntityException({
      code: 'VALIDATION_ERROR',
      message: 'Maydonlarni tekshiring',
      fieldErrors: z.flattenError(result.error).fieldErrors,
    });
  return result.data;
}
export const uuid = z.string().uuid();
export const iso = z.string().datetime({ offset: true });
export const reason = z.object({ reason: z.string().trim().min(3).max(1000) });
