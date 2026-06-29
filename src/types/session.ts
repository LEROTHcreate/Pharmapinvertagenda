import type { UserRole } from "@prisma/client";

/**
 * Forme de session applicative — identique à ce que renvoyait NextAuth, pour
 * que `auth()` reste un drop-in après la migration vers Supabase Auth. Tous les
 * consommateurs lisent `session.user.{id,email,name,role,pharmacyId,employeeId}`.
 */
export type AppSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    pharmacyId: string;
    employeeId: string | null;
  };
  expires: string;
};
