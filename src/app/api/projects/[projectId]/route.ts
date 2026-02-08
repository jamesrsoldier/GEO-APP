import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects, trackedKeywords } from '@/lib/db/schema';
import { requireProjectAccess, handleAuthError } from '@/lib/auth/helpers';
import type { ProjectResponse } from '@/types';

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  domain: z.string().min(1).max(255).optional(),
  brandName: z.string().min(1).max(255).optional(),
  brandAliases: z.array(z.string()).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    await requireProjectAccess(projectId);
    const db = getDb();

    const [project] = await db
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
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const response: ProjectResponse = {
      id: project.id,
      name: project.name,
      domain: project.domain,
      brandName: project.brandName,
      brandAliases: project.brandAliases || [],
      ga4Connected: !!project.ga4PropertyId,
      gscConnected: !!project.gscSiteUrl,
      keywordCount: project.keywordCount,
      createdAt: project.createdAt.toISOString(),
    };

    return Response.json(response);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    await requireProjectAccess(projectId);

    const body = await request.json();
    const data = updateProjectSchema.parse(body);
    const db = getDb();

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.domain !== undefined) updateData.domain = data.domain;
    if (data.brandName !== undefined) updateData.brandName = data.brandName;
    if (data.brandAliases !== undefined) updateData.brandAliases = data.brandAliases;

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, projectId))
      .returning();

    if (!updated) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const response: ProjectResponse = {
      id: updated.id,
      name: updated.name,
      domain: updated.domain,
      brandName: updated.brandName,
      brandAliases: updated.brandAliases || [],
      ga4Connected: !!updated.ga4PropertyId,
      gscConnected: !!updated.gscSiteUrl,
      keywordCount: 0,
      createdAt: updated.createdAt.toISOString(),
    };

    return Response.json(response);
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    await requireProjectAccess(projectId);
    const db = getDb();

    await db.delete(projects).where(eq(projects.id, projectId));

    return Response.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
