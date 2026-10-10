import type { Role } from './enums.js';

/** Public user shape returned by the API. Never includes the password hash. */
export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
}
