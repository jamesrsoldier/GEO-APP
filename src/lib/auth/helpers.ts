import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/lib/db';
import { users, organizationMembers, projects, organizations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { SubscriptionTier } from '@/types';

export interface AuthUser {
  id: string;
  clerkId: string;
  email: string;
}

export interface ProjectAccessResult {
  user: AuthUser;
  project: {
    id: string;
    organizationId: string;
    name: string;
    domain: string;
    brandName: string;
  };
  organization: {
    id: string;
    subscriptionTier: SubscriptionTier;
  };
}

/**
 * Get the authenticated user from Clerk session.
 * Returns null if not authenticated.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      clerkId: users.clerkId,
      email: users.email,
    })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  return user || null;
}

/**
 * Require authentication. Throws if not authenticated.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) {
    throw new AuthError('Authentication required', 401);
  }
  return user;
}

/**
 * Verify user has access to a project (is member of the project's organization).
 * Returns user, project, and organization data.
 */
export async function requireProjectAccess(projectId: string): Promise<ProjectAccessResult> {
  const user = await requireAuth();
  const db = getDb();

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new AuthError('Project not found', 404);
  }

  const [org] = await db
    .select({
      id: organizations.id,
      subscriptionTier: organizations.subscriptionTier,
    })
    .from(organizations)
    .where(eq(organizations.id, project.organizationId))
    .limit(1);

  if (!org) {
    throw new AuthError('Organization not found', 404);
  }

  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, project.organizationId),
        eq(organizationMembers.userId, user.id),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new AuthError('Access denied', 403);
  }

  return {
    user,
    project: {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      domain: project.domain,
      brandName: project.brandName,
    },
    organization: {
      id: org.id,
      subscriptionTier: org.subscriptionTier as SubscriptionTier,
    },
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
