import { redirect } from 'next/navigation';
import { currentActor } from './rbac';
import { UnauthorizedError } from './errors';

export async function pageActor() {
  try { return await currentActor(); } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    throw error;
  }
}