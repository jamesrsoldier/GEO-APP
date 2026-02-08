import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { users, organizationMembers, projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface AuthUser {
  userId: string;
  clerkId: string;
  email: string;
}

// Get authenticated user from Clerk session header
// In a full Clerk setup, this would use auth() from @clerk/nextjs/server.
// For now, we read the clerk user ID from the header set by middleware.
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  // Clerk middleware sets this header after verifying the session
  const clerkId = request.headers.get('x-clerk-user-id');
  if (!clerkId) return null;

  const db = getDb();
  const [user] = await db
    .select({ userId: users.id, clerkId: users.clerkId, email: users.email })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  return user || null;
}

// Verify the user has access to a project (belongs to the project's organization)
export async function requireProjectAccess(
  request: NextRequest,
  projectId: string,
): Promise<{
  user: AuthUser;
  project: typeof projects.$inferSelect;
} | NextResponse> {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  // Load the project
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Verify user is a member of the project's organization
  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, project.organizationId),
        eq(organizationMembers.userId, user.userId),
      ),
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { user, project };
}

// Check if the result from requireProjectAccess is an error response
export function isAuthError(
  result: { user: AuthUser; project: typeof projects.$inferSelect } | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
