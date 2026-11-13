'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { PasswordRecoveryError,RECOVERY_COOKIE_NAME,requestPasswordReset,updateRecoveredPassword,verifyPasswordRecovery } from '@/lib/password-recovery';

async function writeRecoveryCookie(value: string,maxAge: number) {
  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE_NAME,value,{ httpOnly: true,secure: process.env.NODE_ENV==='production',sameSite: 'strict',path: '/reset-password',maxAge });
}

function failureCode(error: unknown,invalidInput: 'email' | 'invalid' | 'password') {
  if (error instanceof PasswordRecoveryError) return error.code;
  if (error instanceof z.ZodError) return invalidInput;
  logger.error({ err: error,code: 'RECOVERY_ACTION_FAILED' },'Password recovery failed');
  return 'unavailable';
}

export async function requestReset(formData: FormData) {
  let destination = '/forgot-password?sent=1';
  try {
    await requestPasswordReset(formData.get('email'));
  } catch (error) {
    destination = `/forgot-password?error=${failureCode(error,'email')}`;
  }
  redirect(destination);
}

export async function confirmResetLink(formData: FormData) {
  let destination = '/reset-password';
  await writeRecoveryCookie('',0);
  try {
    const session = await verifyPasswordRecovery(formData.get('token_hash'));
    await writeRecoveryCookie(session.accessToken,session.maxAge);
  } catch (error) {
    destination = `/forgot-password?error=${failureCode(error,'invalid')}`;
  }
  redirect(destination);
}

export async function changePassword(formData: FormData) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(RECOVERY_COOKIE_NAME)?.value;
  if (!accessToken) redirect('/forgot-password?error=invalid');
  let destination = '/login?reset=1';
  try {
    await updateRecoveredPassword(accessToken,{ password: formData.get('password'),confirmation: formData.get('confirmation') });
    await writeRecoveryCookie('',0);
  } catch (error) {
    const code = failureCode(error,'password');
    if (code==='invalid') {
      await writeRecoveryCookie('',0);
      destination = '/forgot-password?error=invalid';
    } else destination = `/reset-password?error=${code}`;
  }
  redirect(destination);
}
