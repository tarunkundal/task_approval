import type { UserDto } from '@workspace/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware after the token and user are verified. */
      user?: UserDto;
    }
  }
}

export {};
