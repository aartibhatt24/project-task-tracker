import { Prisma, PrismaClient } from '@prisma/client';
import { AuthenticatedUser } from '../middleware/auth';
import { HistoryType } from '../domain/constants';
import { prisma } from '../utils/prisma';
import { assertTaskAccessible } from './taskService';

type TxClient = PrismaClient | Prisma.TransactionClient;

export interface HistoryEntryInput {
  taskId: string;
  actorId: string;
  type: HistoryType;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordHistory(tx: TxClient, entry: HistoryEntryInput) {
  return tx.taskHistory.create({
    data: {
      taskId: entry.taskId,
      actorId: entry.actorId,
      type: entry.type,
      field: entry.field ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    },
  });
}

export async function recordHistoryMany(tx: TxClient, entries: HistoryEntryInput[]) {
  if (entries.length === 0) return;
  await tx.taskHistory.createMany({
    data: entries.map((entry) => ({
      taskId: entry.taskId,
      actorId: entry.actorId,
      type: entry.type,
      field: entry.field ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    })),
  });
}

/** The task's full chronological timeline. There is deliberately no corresponding
 * update/delete function anywhere in this module or any route — history is append-only by
 * omission, not by a soft "isDeleted" flag a determined caller could bypass. */
export async function listTaskHistory(actor: AuthenticatedUser, taskId: string) {
  await assertTaskAccessible(actor, taskId);
  return prisma.taskHistory.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { id: true, name: true, email: true, role: true } } },
  });
}

export async function addComment(actor: AuthenticatedUser, taskId: string, text: string) {
  await assertTaskAccessible(actor, taskId);
  return recordHistory(prisma, {
    taskId,
    actorId: actor.id,
    type: 'COMMENT',
    newValue: text,
  });
}
