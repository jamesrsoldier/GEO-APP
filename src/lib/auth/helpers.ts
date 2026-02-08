import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/lib/db';
import { users, organizations, organizationMembers, projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Get the internal user record for the current Clerk session.
 * Returns null if not authenticated or user not yet synced.
 */
export async function getAuthUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  return user || null;
}

/**
 * Get the user's organization. For MVP, each user has one org.
 * Auto-creates org on first call if none exists.
 */
export async function getOrCreateOrg(userId: string) {
  const db = getDb();

  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId))
    .limit(1);

  if (membership) {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, membership.organizationId))
      .limit(1);
    return org;
  }

  // Auto-create a personal org
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const orgName = user?.firstName ? `${user.firstName}'s Workspace` : 'My Workspace';
  const slug = `org-${userId.slice(0, 8)}`;

  const [newOrg] = await db
    .insert(organizations)
    .values({
      name: orgName,
      slug,
      createdByUserId: userId,
    })
    .returning();

  await db.insert(organizationMembers).values({
    organizationId: newOrg.id,
    userId,
    role: 'owner',
  });

  return newOrg;
}

/**
 * Verify user has access to a specific project.
 * Returns { user, org, project } or throws AuthError.
 */
export async function requireProjectAccess(projectId: string) {
  const user = await getAuthUser();
  if (!user) {
    throw new AuthError('Not authenticated', 401);
  }

  const org = await getOrCreateOrg(user.id);
  if (!org) {
    throw new AuthError('No organization found', 403);
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, org.id)
      )
    )
    .limit(1);

  if (!project) {
    throw new AuthError('Project not found or access denied', 404);
  }

  return { user, org, project };
}
