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

describe('immutable task history and comments', () => {
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
    const member = await createUser({ role: 'MEMBER' });
    const memberCookie = await loginAndGetCookie(app, member.email, TEST_PASSWORD);
    const outsider = await createUser({ role: 'MEMBER' });
    const outsiderCookie = await loginAndGetCookie(app, outsider.email, TEST_PASSWORD);
    const project = await createProject(manager.id);
    await addMember(project.id, member.id);
    return { manager, managerCookie, member, memberCookie, outsider, outsiderCookie, project };
  }

  it('records a CREATED event visible in the timeline immediately after task creation', async () => {
    const { managerCookie, project } = await setup();
    const created = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set('Cookie', managerCookie)
      .send({ title: 'Track me' });

    const res = await request(app)
      .get(`/api/tasks/${created.body.data.id}/history`)
      .set('Cookie', managerCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe('CREATED');
    expect(res.body.data[0].actor.id).toBeTruthy();
  });

  it('builds a full chronological timeline across create/edit/status/assign/comment', async () => {
    const { manager, managerCookie, member, project } = await setup();
    const task = await createTask(project.id, manager.id, { status: 'BACKLOG' });
    await testPrisma.taskHistory.create({
      data: { taskId: task.id, actorId: manager.id, type: 'CREATED' },
    });

    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Cookie', managerCookie)
      .send({ title: 'Updated title' });
    await request(app)
      .post(`/api/tasks/${task.id}/status`)
      .set('Cookie', managerCookie)
      .send({ status: 'IN_PROGRESS' });
    await request(app)
      .post(`/api/tasks/${task.id}/assignees`)
      .set('Cookie', managerCookie)
      .send({ userIds: [member.id] });
    await request(app)
      .post(`/api/tasks/${task.id}/comments`)
      .set('Cookie', managerCookie)
      .send({ text: 'Looks good so far.' });

    const res = await request(app)
      .get(`/api/tasks/${task.id}/history`)
      .set('Cookie', managerCookie);
    const types = res.body.data.map((h: any) => h.type);
    expect(types).toEqual(['CREATED', 'FIELD_CHANGE', 'STATUS_CHANGE', 'ASSIGNED', 'COMMENT']);

    // chronological order
    const timestamps = res.body.data.map((h: any) => new Date(h.createdAt).getTime());
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it('a comment records the actor and text as newValue', async () => {
    const { manager, memberCookie, member, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const res = await request(app)
      .post(`/api/tasks/${task.id}/comments`)
      .set('Cookie', memberCookie)
      .send({ text: 'I will pick this up tomorrow.' });

    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('COMMENT');
    expect(res.body.data.newValue).toBe('I will pick this up tomorrow.');
    expect(res.body.data.actorId).toBe(member.id);
  });

  it('rejects an empty comment', async () => {
    const { manager, managerCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);
    const res = await request(app)
      .post(`/api/tasks/${task.id}/comments`)
      .set('Cookie', managerCookie)
      .send({ text: '' });
    expect(res.status).toBe(400);
  });

  it('rejects history/comment access for a non-member of the project (IDOR)', async () => {
    const { manager, outsiderCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const historyRes = await request(app)
      .get(`/api/tasks/${task.id}/history`)
      .set('Cookie', outsiderCookie);
    expect(historyRes.status).toBe(403);

    const commentRes = await request(app)
      .post(`/api/tasks/${task.id}/comments`)
      .set('Cookie', outsiderCookie)
      .send({ text: 'sneaky' });
    expect(commentRes.status).toBe(403);
  });

  it('has no route to update a history entry', async () => {
    const { manager, managerCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);
    const entry = await testPrisma.taskHistory.create({
      data: { taskId: task.id, actorId: manager.id, type: 'COMMENT', newValue: 'original' },
    });

    const patchRes = await request(app)
      .patch(`/api/tasks/${task.id}/history/${entry.id}`)
      .set('Cookie', managerCookie)
      .send({ newValue: 'edited' });
    expect(patchRes.status).toBe(404);

    const putRes = await request(app)
      .put(`/api/history/${entry.id}`)
      .set('Cookie', managerCookie)
      .send({ newValue: 'edited' });
    expect(putRes.status).toBe(404);

    const stillOriginal = await testPrisma.taskHistory.findUnique({ where: { id: entry.id } });
    expect(stillOriginal?.newValue).toBe('original');
  });

  it('has no route to delete a history entry, even for a manager', async () => {
    const { manager, managerCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);
    const entry = await testPrisma.taskHistory.create({
      data: { taskId: task.id, actorId: manager.id, type: 'COMMENT', newValue: 'permanent' },
    });

    const res = await request(app)
      .delete(`/api/tasks/${task.id}/history/${entry.id}`)
      .set('Cookie', managerCookie);
    expect(res.status).toBe(404);

    const res2 = await request(app).delete(`/api/history/${entry.id}`).set('Cookie', managerCookie);
    expect(res2.status).toBe(404);

    const stillThere = await testPrisma.taskHistory.findUnique({ where: { id: entry.id } });
    expect(stillThere).not.toBeNull();
  });

  it('member removal history (from an earlier phase) also shows up in the timeline', async () => {
    const { manager, managerCookie, member, project } = await setup();
    const task = await createTask(project.id, manager.id);
    await request(app)
      .post(`/api/tasks/${task.id}/assignees`)
      .set('Cookie', managerCookie)
      .send({ userIds: [member.id] });

    await request(app)
      .delete(`/api/projects/${project.id}/members/${member.id}`)
      .set('Cookie', managerCookie);

    const res = await request(app)
      .get(`/api/tasks/${task.id}/history`)
      .set('Cookie', managerCookie);
    const types = res.body.data.map((h: any) => h.type);
    expect(types).toContain('UNASSIGNED');
  });
});
