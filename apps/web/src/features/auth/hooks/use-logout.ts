import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/form-errors';
import { LOGIN_PATH } from '@/lib/routes';
import { logout } from '../api/auth-api';

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      // Full navigation so no client state from the old session survives.
      window.location.assign(LOGIN_PATH);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, 'Could not sign out. Please try again.'));
    },
  });
}
