import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { z } from 'zod';
import { db } from './db';

const profileSchema = z.object({ sub: z.string().min(1), email: z.email().optional(), preferred_username: z.email().optional() });

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [MicrosoftEntraID({
    clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? '',
    clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? '',
    issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? 'https://login.microsoftonline.com/common/v2.0',
  })],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  callbacks: {
    async signIn({ profile }) {
      const parsed = profileSchema.safeParse(profile);
      if (!parsed.success) return false;
      const user = await db.user.findUnique({ where: { externalSubject: parsed.data.sub } });
      return user?.isActive === true;
    },
    jwt({ token, profile }) {
      if (profile) token.oidcSubject = profileSchema.parse(profile).sub;
      return token;
    },
    session({ session, token }) {
      if (typeof token.oidcSubject === 'string') session.user.id = token.oidcSubject;
      return session;
    },
  },
  pages: { signIn: '/login' },
});