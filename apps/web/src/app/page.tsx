import { getCurrentUser } from '@/lib/api/server';
import { homeFor, LOGIN_PATH } from '@/lib/routes';
import { redirect } from 'next/navigation';

// `/` has no content of its own: send the user to their role's home, or to the login page.
export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user.role) : LOGIN_PATH);
}
