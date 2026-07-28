import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void next;
  const appError = err instanceof AppError ? err : new AppError('Internal server error', 500, 'INTERNAL');

  logger.error(
    {
      err,
      path: req.path,
      method: req.method,
      bookingId: req.params.id,
    },
    'request failed',
  );

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
    },
  });
}
