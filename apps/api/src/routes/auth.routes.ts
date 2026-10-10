import { loginSchema } from '@workspace/shared';
import { Router, type RequestHandler } from 'express';
import { authController, type AuthControllerConfig } from '../controllers/auth.controller.js';
import { validateBody } from '../middleware/validate.js';

export interface AuthRouterDeps {
  config: AuthControllerConfig;
  authenticate: RequestHandler;
  loginLimiter: RequestHandler;
}

export function authRouter({ config, authenticate, loginLimiter }: AuthRouterDeps): Router {
  const router = Router();
  const controller = authController(config);

  router.post('/login', loginLimiter, validateBody(loginSchema), controller.login);
  router.post('/logout', controller.logout);
  router.get('/me', authenticate, controller.me);

  return router;
}
