import type { CreateUserInput, UserDto } from '@workspace/shared';
import { api } from '@/lib/api/client';

/** `GET /users`: employees only, ordered by name, unpaginated (admin only). */
export async function listEmployees(): Promise<UserDto[]> {
  const response = await api.get<{ data: UserDto[] }>('/users');
  return response.data;
}

/** `POST /users`: always creates an EMPLOYEE. 409 `EMAIL_TAKEN` for a duplicate email. */
export function createEmployee(input: CreateUserInput): Promise<UserDto> {
  return api.post<UserDto>('/users', input);
}
