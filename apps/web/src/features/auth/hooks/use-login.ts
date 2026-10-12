import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, UserDto } from '@workspace/shared';
import type { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query-keys';
import { login } from '../api/auth-api';

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<UserDto, ApiError, LoginInput>({
    mutationFn: login,
    onSuccess: (user) => {
      // Drop anything cached for a previous session before the new one starts.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.auth.me, user);
    },
  });
}
