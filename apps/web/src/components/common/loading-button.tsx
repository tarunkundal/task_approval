import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';

type LoadingButtonProps = ComponentProps<typeof Button> & {
  loading?: boolean;
  /** Optional text shown while loading (defaults to the children). */
  loadingText?: string;
};

/** A Button that is disabled and shows a spinner while `loading`. */
export function LoadingButton({
  loading = false,
  loadingText,
  disabled,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {loading && loadingText ? loadingText : children}
    </Button>
  );
}
