import type { AuthenticatedRequestUser } from './auth';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequestUser;
      rawBody?: string;
    }
  }
}

export {};
