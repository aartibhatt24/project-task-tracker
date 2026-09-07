import { AuthenticatedUser } from '../middleware/auth';
import { Errors } from '../utils/AppError';
import { prisma } from '../utils/prisma';

export interface CreateProjectInput {
  key: string;
  name: string;
  description?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

function isManager(user: AuthenticatedUser) {
  return user.role === 'MANAGER';
}

export async function listProjects(user: AuthenticatedUser, includeArchived: boolean) {
  const archivedFilter = includeArchived ? {} : { archived: false };

  if (isManager(user)) {
    return prisma.project.findMany({
      where: archivedFilter,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tasks: true, members: true } } },
    });
  }

  return prisma.project.findMany({
    where: {
      ...archivedFilter,
      members: { some: { userId: user.id } },
    },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { tasks: true, members: true } } },
  });
}

async function assertProjectVisible(user: AuthenticatedUser, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw Errors.notFound('Project not found.');
  }
  if (isManager(user)) {
    return project;
  }
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!membership) {
    throw Errors.forbidden('You are not a member of this project.');
  }
  return project;
}

export async function getProjectById(user: AuthenticatedUser, projectId: string) {
  const project = await assertProjectVisible(user, projectId);
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return { ...project, members: members.map((m) => m.user) };
}

/** Throws if the project doesn't exist or the member is not visible to this user; used by
 * other services (tasks, dependencies, etc.) to enforce the same visibility rule. */
export async function assertProjectAccessible(user: AuthenticatedUser, projectId: string) {
  return assertProjectVisible(user, projectId);
}

export async function createProject(manager: AuthenticatedUser, input: CreateProjectInput) {
  const existing = await prisma.project.findUnique({ where: { key: input.key } });
  if (existing) {
    throw Errors.conflict('PROJECT_KEY_TAKEN', `Project key "${input.key}" is already in use.`);
  }

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        ownerId: manager.id,
      },
    });
    await tx.projectMember.create({ data: { projectId: project.id, userId: manager.id } });
    return project;
  });
}

export async function updateProject(
  _manager: AuthenticatedUser,
  projectId: string,
  input: UpdateProjectInput,
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw Errors.notFound('Project not found.');

  return prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });
}

export async function archiveProject(_manager: AuthenticatedUser, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw Errors.notFound('Project not found.');
  return prisma.project.update({ where: { id: projectId }, data: { archived: true } });
}

export async function restoreProject(_manager: AuthenticatedUser, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw Errors.notFound('Project not found.');
  return prisma.project.update({ where: { id: projectId }, data: { archived: false } });
}

export async function addMember(_manager: AuthenticatedUser, projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw Errors.notFound('Project not found.');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.badRequest('USER_NOT_FOUND', 'User not found.');

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (existing) {
    throw Errors.conflict('ALREADY_MEMBER', 'User is already a member of this project.');
  }

  return prisma.projectMember.create({ data: { projectId, userId } });
}

/**
 * Removes a project member and, atomically, unassigns them from every task in that
 * project. Writes an UNASSIGNED history entry per affected task so the removal is
 * traceable in each task's timeline, same as an explicit unassignment would be.
 */
export async function removeMember(actor: AuthenticatedUser, projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw Errors.notFound('Project not found.');

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership) {
    throw Errors.notFound('User is not a member of this project.');
  }

  await prisma.$transaction(async (tx) => {
    const affectedAssignments = await tx.taskAssignee.findMany({
      where: { userId, task: { projectId } },
      select: { id: true, taskId: true },
    });

    if (affectedAssignments.length > 0) {
      await tx.taskAssignee.deleteMany({
        where: { id: { in: affectedAssignments.map((a) => a.id) } },
      });
      await tx.taskHistory.createMany({
        data: affectedAssignments.map((a) => ({
          taskId: a.taskId,
          actorId: actor.id,
          type: 'UNASSIGNED',
          oldValue: userId,
          metadata: JSON.stringify({ reason: 'PROJECT_MEMBER_REMOVED' }),
        })),
      });
    }

    await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
  });
}
