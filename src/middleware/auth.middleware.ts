import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { findUserById } from '../repositories/users.repository';
import { AppError } from '../utils/AppError';
import type { UserRole } from '../types/auth';

interface JwtPayload {
  sub: string;
  role: UserRole;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    return;
  }

  const token = header.replace('Bearer ', '');

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    const user = await findUserById(payload.sub);
    if (!user) {
      next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
      return;
    }

    if (user.isSuspended) {
      next(new AppError('Your account is suspended. Please contact support.', 403, 'ACCOUNT_SUSPENDED'));
      return;
    }

    req.user = {
      userId: payload.sub,
      role: payload.role,
    };
    next();
  } catch {
    next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
  }
}

export function requireRole(roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError('Forbidden', 403, 'FORBIDDEN'));
      return;
    }
    next();
  };
}
