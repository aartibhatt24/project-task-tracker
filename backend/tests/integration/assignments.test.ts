import { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loginAndGetCookie } from '../helpers/auth';
import {
  TEST_PASSWORD,
  addMember,
  createProject,
  createTask,
  createUser,
} from '../helpers/factories';
import { resetDb, testPrisma } from '../helpers/testDb';

describe('task assignments', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await testPrisma.$disconnect();
  });

  async function setup() {
    const manager = await createUser({ role: 'MANAGER' });
    const managerCookie = await loginAndGetCookie(app, manager.email, TEST_PASSWORD);
    const member = await createUser({ role: 'MEMBER', name: 'Member One' });
    const memberCookie = await loginAndGetCookie(app, member.email, TEST_PASSWORD);
    const outsider = await createUser({ role: 'MEMBER', name: 'Outsider' });
    const project = await createProject(manager.id);
    await addMember(project.id, member.id);
    return { manager, managerCookie, member, memberCookie, outsider, project };
  }

  it('assigns a project member to a task and records ASSIGNED history', async () => {
    const { manager, managerCookie, member, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const res = await request(app)
      .post(`/api/tasks/${task.id}/assignees`)
      .set('Cookie', managerCookie)
      .send({ userIds: [member.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.map((a: any) => a.user.id)).toEqual([member.id]);

    const history = await testPrisma.taskHistory.findMany({
      where: { taskId: task.id, type: 'ASSIGNED' },
    });
    expect(history).toHaveLength(1);
    expect(history[0].newValue).toBe(member.id);
  });

  it('rejects assigning a non-member of the project', async () => {
    const { manager, managerCookie, outsider, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const res = await request(app)
      .post(`/api/tasks/${task.id}/assignees`)
      .set('Cookie', managerCookie)
      .send({ userIds: [outsider.id] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_PROJECT_MEMBER');

    const assignees = await testPrisma.taskAssignee.findMany({ where: { taskId: task.id } });
    expect(assignees).toHaveLength(0);
  });

  it('assigns multiple members at once', async () => {
    const { manager, managerCookie, member, project } = await setup();
    const secondMember = await createUser({ role: 'MEMBER' });
    await addMember(project.id, secondMember.id);
    const task = await createTask(project.id, manager.id);

    const res = await request(app)
      .post(`/api/tasks/${task.id}/assignees`)
      .set('Cookie', managerCookie)
      .send({ userIds: [member.id, secondMember.id] });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('unassigns a user by omitting them from a subsequent call, recording UNASSIGNED history', async () => {
    const { manager, managerCookie, member, project } = await setup();
    const task = await createTask(project.id, manager.id);

    await request(app)
      .post(`/api/tasks/${task.id}/assignees`)
      .set('Cookie', managerCookie)
      .send({ userIds: [member.id] });

    const res = await request(app)
      .post(`/api/tasks/${task.id}/assignees`)
      .set('Cookie', managerCookie)
      .send({ userIds: [] });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);

    const history = await testPrisma.taskHistory.findMany({
      where: { taskId: task.id, type: 'UNASSIGNED' },
    });
    expect(history).toHaveLength(1);
    expect(history[0].oldValue).toBe(member.id);
  });

  it('removing a project member cleans up their task assignments (integration with member removal)', async () => {
    const { manager, managerCookie, member, project } = await setup();
    const task = await createTask(project.id, manager.id);
    await request(app)
      .post(`/api/tasks/${task.id}/assignees`)
      .set('Cookie', managerCookie)
      .send({ userIds: [member.id] });

    await request(app)
      .delete(`/api/projects/${project.id}/members/${member.id}`)
      .set('Cookie', managerCookie);

    const assignees = await testPrisma.taskAssignee.findMany({ where: { taskId: task.id } });
    expect(assignees).toHaveLength(0);
  });

  it('rejects a member from managing assignments (manager-only)', async () => {
    const { manager, memberCookie, member, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const res = await request(app)
      .post(`/api/tasks/${task.id}/assignees`)
      .set('Cookie', memberCookie)
      .send({ userIds: [member.id] });

    expect(res.status).toBe(403);
  });
});
