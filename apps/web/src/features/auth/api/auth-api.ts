import type { LoginInput, UserDto } from '@workspace/shared';
import { api } from '@/lib/api/client';

/** `POST /auth/login`: sets the httpOnly `tas_token` cookie; the token is never in the body. */
export function login(input: LoginInput): Promise<UserDto> {
  return api.post<UserDto>('/auth/login', input);
}

/** `POST /auth/logout`: clears the cookie (204). No body. */
export function logout(): Promise<void> {
  return api.post<void>('/auth/logout');
}

/** `GET /auth/me`. */
export function getMe(): Promise<UserDto> {
  return api.get<UserDto>('/auth/me');
}
