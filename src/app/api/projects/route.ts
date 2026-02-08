import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  projects,
  organizations,
  trackedKeywords,
  alerts,
} from '@/lib/db/schema';
import { requireAuth, getUserOrganization, handleAuthError, AuthError } from '@/lib/auth/helpers';
import { canAddProject } from '@/lib/billing/plan-limits';
import type { ProjectResponse, AlertType } from '@/types';

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  domain: z.string().min(1).max(255),
  brandName: z.string().min(1).max(255),
  brandAliases: z.array(z.string()).optional(),
});

const DEFAULT_ALERTS: { alertType: AlertType; threshold: number | null }[] = [
  { alertType: 'visibility_drop', threshold: 0.2 },
  { alertType: 'new_citation', threshold: null },
  { alertType: 'negative_sentiment', threshold: null },
];

export async function GET() {
  try {
    const user = await requireAuth();
    const db = getDb();

    const membership = await getUserOrganization(user.id);
    if (!membership) {
      return Response.json([]);
    }

    const orgProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        domain: projects.domain,
        brandName: projects.brandName,
        brandAliases: projects.brandAliases,
        ga4PropertyId: projects.ga4PropertyId,
        gscSiteUrl: projects.gscSiteUrl,
        createdAt: projects.createdAt,
        keywordCount: sql<number>`(
          select count(*)::int from ${trackedKeywords}
          where ${trackedKeywords.projectId} = ${projects.id}
        )`,
      })
      .from(projects)
      .where(eq(projects.organizationId, membership.organizationId));

    const response: ProjectResponse[] = orgProjects.map((p) => ({
      id: p.id,
      name: p.name,
      domain: p.domain,
      brandName: p.brandName,
      brandAliases: p.brandAliases || [],
      ga4Connected: !!p.ga4PropertyId,
      gscConnected: !!p.gscSiteUrl,
      keywordCount: p.keywordCount,
      createdAt: p.createdAt.toISOString(),
    }));

    return Response.json(response);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const db = getDb();

    const membership = await getUserOrganization(user.id);
    if (!membership) {
      throw new AuthError('No organization found. Please create one first.', 400);
    }

    const body = await request.json();
    const data = createProjectSchema.parse(body);

    // Check plan limits
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, membership.organizationId))
      .limit(1);

    if (!org) {
      throw new AuthError('Organization not found', 404);
    }

    const [projectCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(eq(projects.organizationId, org.id));

    if (!canAddProject(org.subscriptionTier, projectCount?.count || 0)) {
      return Response.json(
        {
          error: 'Project limit reached for your plan',
          code: 'PLAN_LIMIT_EXCEEDED',
        },
        { status: 403 }
      );
    }

    // Insert project
    const [project] = await db
      .insert(projects)
      .values({
        organizationId: org.id,
        name: data.name,
        domain: data.domain,
        brandName: data.brandName,
        brandAliases: data.brandAliases || [],
      })
      .returning();

    // Auto-create default alerts
    await db.insert(alerts).values(
      DEFAULT_ALERTS.map((a) => ({
        projectId: project.id,
        alertType: a.alertType,
        channel: 'in_app' as const,
        threshold: a.threshold,
      }))
    );

    const response: ProjectResponse = {
      id: project.id,
      name: project.name,
      domain: project.domain,
      brandName: project.brandName,
      brandAliases: project.brandAliases || [],
      ga4Connected: false,
      gscConnected: false,
      keywordCount: 0,
      createdAt: project.createdAt.toISOString(),
    };

    return Response.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }
    return handleAuthError(error);
  }
}
