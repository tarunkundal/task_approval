'use client';

import type { UserDto } from '@workspace/shared';
import { createContext, useContext, type ReactNode } from 'react';

const CurrentUserContext = createContext<UserDto | null>(null);

/** Makes the user loaded server-side by `(app)/layout.tsx` available to client components. */
export function CurrentUserProvider({ user, children }: { user: UserDto; children: ReactNode }) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

/** The signed-in user. Only usable inside the `(app)` layout. */
export function useCurrentUser(): UserDto {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error('useCurrentUser must be used inside <CurrentUserProvider>');
  return user;
}
