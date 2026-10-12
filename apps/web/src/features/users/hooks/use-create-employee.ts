import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput, UserDto } from '@workspace/shared';
import { toast } from 'sonner';
import type { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query-keys';
import { createEmployee } from '../api/users-api';

/** The form handles errors (EMAIL_TAKEN / validation inline, the rest toasted). */
export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation<UserDto, ApiError, CreateUserInput>({
    mutationFn: createEmployee,
    onSuccess: (user) => {
      toast.success(`Employee account created for ${user.name}`);
      return queryClient.invalidateQueries({ queryKey: queryKeys.users.list });
    },
  });
}
