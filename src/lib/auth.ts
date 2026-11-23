
import NextAuth, { type User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import { UnconfirmedEmailError, verifyPassword } from './password-auth';
import { EmailUnconfirmedError, requestAccess } from './access-request';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        let identity: Awaited<ReturnType<typeof verifyPassword>>;
        try {
          identity = await verifyPassword(credentials);
        } catch (error) {
          if (error instanceof UnconfirmedEmailError) throw new EmailUnconfirmedError();
          throw error;
        }
        if (!identity) return null;

        return requestAccess(identity);
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },

  callbacks: {
    jwt({ token, user }: { token: JWT; user?: User }) {
      // User is available during initial sign-in.
      // On subsequent requests, retain the existing token.
      if (user?.id) {
        token.supabaseSubject = user.id;
      }

      return token;
    },

    session({ session, token }) {
      session.user.id =
        typeof token.supabaseSubject === 'string'
          ? token.supabaseSubject
          : '';

      return session;
    },
  },

  pages: {
    signIn: '/login',
  },
});
