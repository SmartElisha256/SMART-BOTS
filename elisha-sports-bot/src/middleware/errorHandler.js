import { z } from 'zod';

export const errorResponseSchema = z.object({
  status: z.number().default(500),
  code: z.string().default('INTERNAL_ERROR'),
  message: z.string().default('Something went wrong')
});

export function errorHandler(err, req, res, next) {
  const status = err.statusCode ?? err.status ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';
  const message = err.message ?? 'Something went wrong';

  if (res.headersSent) {
    return next(err);
  }

  return res.status(status).json({
    ok: false,
    code,
    message
  });
}
