import { z } from 'zod';

export const errorResponseSchema = z.object({
  status: z.number().default(500),
  code: z.string().default('INTERNAL_ERROR'),
  message: z.string().default('Something went wrong')
});

export function errorHandler(err, req, res, next) {
  const status = err.statusCode ?? err.status ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';

  if (res.headersSent) {
    return next(err);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const safeMessage = isProduction
    ? (status >= 500 ? 'Something went wrong. Please try again later.' : (err.message ?? 'Request could not be processed.'))
    : (err.message ?? 'Something went wrong');

  return res.status(status).json({
    ok: false,
    code,
    message: safeMessage
  });
}
