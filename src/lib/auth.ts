import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyPassword } from './password-auth';
import { requestAccess } from './access-request';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Credentials({
    credentials: { email: { type: 'email' }, password: { type: 'password' } },
    async authorize(credentials) {
      const identity = await verifyPassword(credentials);
      if (!identity) return null;
      return requestAccess(identity);
    },
  })],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.supabaseSubject = user.id;
      return token;
    },
    session({ session, token }) {
      session.user.id = typeof token.supabaseSubject === 'string' ? token.supabaseSubject : '';
      return session;
    },
  },
  pages: { signIn: '/login' },
});