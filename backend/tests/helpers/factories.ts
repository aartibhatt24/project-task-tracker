import bcrypt from 'bcryptjs';
import { testPrisma } from './testDb';

export const TEST_PASSWORD = 'Password123!';
const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}${counter}${Date.now()}`;
}

export async function createUser(overrides: { role?: 'MANAGER' | 'MEMBER'; name?: string } = {}) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
  const email = `${unique('user')}@example.com`;
  return testPrisma.user.create({
    data: {
      name: overrides.name ?? 'Test User',
      email,
      passwordHash,
      role: overrides.role ?? 'MEMBER',
    },
  });
}

export async function createProject(ownerId: string, overrides: { archived?: boolean } = {}) {
  return testPrisma.project.create({
    data: {
      key: unique('KEY').toUpperCase().slice(0, 10),
      name: 'Test Project',
      ownerId,
      archived: overrides.archived ?? false,
    },
  });
}

export async function addMember(projectId: string, userId: string) {
  return testPrisma.projectMember.create({ data: { projectId, userId } });
}

export async function createTask(
  projectId: string,
  createdById: string,
  overrides: Partial<{
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    blockedFromStatus: string | null;
  }> = {},
) {
  return testPrisma.task.create({
    data: {
      projectId,
      title: overrides.title ?? 'Test Task',
      priority: overrides.priority ?? 'MEDIUM',
      priorityRank: PRIORITY_RANK[overrides.priority ?? 'MEDIUM'],
      status: overrides.status ?? 'BACKLOG',
      dueDate: overrides.dueDate ?? null,
      blockedFromStatus: overrides.blockedFromStatus ?? null,
      createdById,
    },
  });
}
