import { Prisma, PrismaClient } from '@prisma/client';
import { HistoryType } from '../domain/constants';

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
