import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db/postgres'
import { pipelineReports } from '@/lib/db/schema'

export async function insertReport(
  type: string,
  payload: unknown
): Promise<string> {
  const [row] = await db
    .insert(pipelineReports)
    .values({ type, payload: payload as object })
    .returning({ id: pipelineReports.id })
  return row.id
}

export async function latestReport(
  type: string
): Promise<{ id: string; createdAt: Date; payload: unknown } | null> {
  const [row] = await db
    .select({
      id: pipelineReports.id,
      createdAt: pipelineReports.createdAt,
      payload: pipelineReports.payload,
    })
    .from(pipelineReports)
    .where(eq(pipelineReports.type, type))
    .orderBy(desc(pipelineReports.createdAt))
    .limit(1)
  return row ?? null
}

export async function reportById(
  id: string,
  type: string
): Promise<{ id: string; createdAt: Date; payload: unknown } | null> {
  const [row] = await db
    .select({
      id: pipelineReports.id,
      createdAt: pipelineReports.createdAt,
      payload: pipelineReports.payload,
    })
    .from(pipelineReports)
    .where(and(eq(pipelineReports.id, id), eq(pipelineReports.type, type)))
    .limit(1)
  return row ?? null
}
