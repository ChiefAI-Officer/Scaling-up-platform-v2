import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { enforceProductionSafeAuthPosture } from "@/lib/auth/auth-posture";

// User roles for authorization
export type UserRole = "ADMIN" | "STAFF" | "COACH";

// Guardrail: DEMO_MODE can only be effective in local development.
enforceProductionSafeAuthPosture("startup");

function isCanonicalAdminEmail(email: string): boolean {
  const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!configuredAdminEmail) return false; // Fail closed — no canonical admin when env var unset
  return email.toLowerCase() === configuredAdminEmail;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: UserRole;
      image?: string | null;
    };
  }

  interface User {
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
  }
}

export const authOptions: NextAuthOptions = {
  // Note: Don't use adapter with JWT + Credentials - it causes session issues
  // adapter: PrismaAdapter(db) as NextAuthOptions["adapter"],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const INVALID_CREDENTIALS = "Invalid email or password";

        if (!credentials?.email || !credentials?.password) {
          throw new Error(INVALID_CREDENTIALS);
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user) {
          throw new Error(INVALID_CREDENTIALS);
        }

        const authPosture = enforceProductionSafeAuthPosture("runtime");
        const isDemoMode = authPosture.effectiveDemoMode;

        if (isDemoMode) {
          // Demo mode - accept demo123 for testing
          if (credentials.password !== "demo123") {
            throw new Error(INVALID_CREDENTIALS);
          }
          console.warn(
            `⚠️ DEMO_MODE enabled in ${authPosture.deploymentContext} - using local demo authentication`
          );
        } else {
          // Production mode - require bcrypt password validation
          const bcrypt = await import("bcryptjs");

          if (!user.passwordHash) {
            console.error(
              `User ${user.email} is missing passwordHash while DEMO_MODE is disabled`
            );
            throw new Error(INVALID_CREDENTIALS);
          }

          const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
          if (!isValid) {
            throw new Error(INVALID_CREDENTIALS);
          }
        }

        if (user.role === "ADMIN" && !isCanonicalAdminEmail(user.email)) {
          // Check if this admin was legitimately invited
          const invite = await db.adminInvite.findUnique({
            where: { email: user.email.toLowerCase() },
          });
          if (!invite || !invite.acceptedAt) {
            console.error(
              `Blocked non-canonical, non-invited admin login for ${user.email}. Expected ${process.env.ADMIN_EMAIL} or an accepted invite.`
            );
            throw new Error(INVALID_CREDENTIALS);
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      console.log(`User signed in: ${user.email}`);
    },
    async signOut({ token }) {
      console.log(`User signed out: ${token.email}`);
    },
  },
};

// Helper to check if user has required role
export function hasRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole);
}

// Role hierarchy - ADMIN has all permissions
export function canAccess(userRole: UserRole, requiredRole: UserRole): boolean {
  const hierarchy: Record<UserRole, number> = {
    ADMIN: 3,
    STAFF: 2,
    COACH: 1,
  };
  return hierarchy[userRole] >= hierarchy[requiredRole];
}
