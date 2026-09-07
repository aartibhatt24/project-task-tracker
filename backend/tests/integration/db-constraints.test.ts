import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testPrisma } from '../helpers/testDb';

describe('database schema constraints', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await testPrisma.$disconnect();
  });

  it('enforces unique user email', async () => {
    await testPrisma.user.create({
      data: { name: 'A', email: 'dup@example.com', passwordHash: 'x', role: 'MEMBER' },
    });
    await expect(
      testPrisma.user.create({
        data: { name: 'B', email: 'dup@example.com', passwordHash: 'x', role: 'MEMBER' },
      }),
    ).rejects.toThrow();
  });

  it('enforces unique project key', async () => {
    const owner = await testPrisma.user.create({
      data: { name: 'Owner', email: 'owner@example.com', passwordHash: 'x', role: 'MANAGER' },
    });
    await testPrisma.project.create({
      data: { key: 'DUP', name: 'One', ownerId: owner.id },
    });
    await expect(
      testPrisma.project.create({ data: { key: 'DUP', name: 'Two', ownerId: owner.id } }),
    ).rejects.toThrow();
  });

  it('enforces unique (projectId, userId) project membership', async () => {
    const owner = await testPrisma.user.create({
      data: { name: 'Owner', email: 'owner2@example.com', passwordHash: 'x', role: 'MANAGER' },
    });
    const project = await testPrisma.project.create({
      data: { key: 'MEM', name: 'Membership test', ownerId: owner.id },
    });
    await testPrisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    await expect(
      testPrisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } }),
    ).rejects.toThrow();
  });

  it('enforces unique (taskId, userId) task assignment', async () => {
    const owner = await testPrisma.user.create({
      data: { name: 'Owner', email: 'owner3@example.com', passwordHash: 'x', role: 'MANAGER' },
    });
    const project = await testPrisma.project.create({
      data: { key: 'ASG', name: 'Assign test', ownerId: owner.id },
    });
    const task = await testPrisma.task.create({
      data: {
        projectId: project.id,
        title: 'T',
        priority: 'LOW',
        status: 'BACKLOG',
        createdById: owner.id,
      },
    });
    await testPrisma.taskAssignee.create({ data: { taskId: task.id, userId: owner.id } });
    await expect(
      testPrisma.taskAssignee.create({ data: { taskId: task.id, userId: owner.id } }),
    ).rejects.toThrow();
  });

  it('enforces unique (blockerTaskId, blockedTaskId) dependency', async () => {
    const owner = await testPrisma.user.create({
      data: { name: 'Owner', email: 'owner4@example.com', passwordHash: 'x', role: 'MANAGER' },
    });
    const project = await testPrisma.project.create({
      data: { key: 'DEP', name: 'Dependency test', ownerId: owner.id },
    });
    const a = await testPrisma.task.create({
      data: {
        projectId: project.id,
        title: 'A',
        priority: 'LOW',
        status: 'BACKLOG',
        createdById: owner.id,
      },
    });
    const b = await testPrisma.task.create({
      data: {
        projectId: project.id,
        title: 'B',
        priority: 'LOW',
        status: 'BACKLOG',
        createdById: owner.id,
      },
    });
    await testPrisma.taskDependency.create({ data: { blockerTaskId: a.id, blockedTaskId: b.id } });
    await expect(
      testPrisma.taskDependency.create({ data: { blockerTaskId: a.id, blockedTaskId: b.id } }),
    ).rejects.toThrow();
  });

  it('cascades: deleting a project deletes its tasks and memberships', async () => {
    const owner = await testPrisma.user.create({
      data: { name: 'Owner', email: 'owner5@example.com', passwordHash: 'x', role: 'MANAGER' },
    });
    const project = await testPrisma.project.create({
      data: { key: 'CAS', name: 'Cascade test', ownerId: owner.id },
    });
    await testPrisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    const task = await testPrisma.task.create({
      data: {
        projectId: project.id,
        title: 'T',
        priority: 'LOW',
        status: 'BACKLOG',
        createdById: owner.id,
      },
    });

    await testPrisma.project.delete({ where: { id: project.id } });

    expect(await testPrisma.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(
      await testPrisma.projectMember.findMany({ where: { projectId: project.id } }),
    ).toHaveLength(0);
  });

  it('rejects a foreign key referencing a non-existent project', async () => {
    const owner = await testPrisma.user.create({
      data: { name: 'Owner', email: 'owner6@example.com', passwordHash: 'x', role: 'MANAGER' },
    });
    await expect(
      testPrisma.task.create({
        data: {
          projectId: 'does-not-exist',
          title: 'Orphan',
          priority: 'LOW',
          status: 'BACKLOG',
          createdById: owner.id,
        },
      }),
    ).rejects.toThrow();
  });
});
