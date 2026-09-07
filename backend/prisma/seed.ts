/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

function daysFromNow(n: number): Date {
  return new Date(now + n * DAY);
}

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

const MEMBER_NAMES = [
  'Alice Nguyen',
  'Bob Ramirez',
  'Carol Kim',
  'Dave Whitfield',
  'Erin O’Malley',
  'Frank Okafor',
  'Grace Liu',
];

const PROJECTS = [
  { key: 'ENG', name: 'Platform Engineering', description: 'Core backend services and APIs.' },
  { key: 'WEB', name: 'Marketing Website', description: 'Public marketing site and landing pages.' },
  { key: 'MOB', name: 'Mobile App', description: 'iOS and Android client applications.' },
  { key: 'DATA', name: 'Data Platform', description: 'Analytics pipelines and reporting.' },
  { key: 'SUP', name: 'Customer Support Tools', description: 'Internal tooling for the support team.' },
  { key: 'SEC', name: 'Security Hardening', description: 'Security review and remediation work.' },
  { key: 'OPS', name: 'DevOps & Infra', description: 'CI/CD, infrastructure, and reliability.' },
  { key: 'QA', name: 'Quality Assurance', description: 'Test automation and release quality.' },
];

const TASK_TITLES = [
  'Fix login redirect loop',
  'Add pagination to search results',
  'Write onboarding email sequence',
  'Investigate memory leak in worker process',
  'Design empty state illustrations',
  'Migrate legacy endpoint to v2 API',
  'Set up rate limiting on public API',
  'Improve mobile navigation drawer',
  'Add CSV export to reports page',
  'Refactor auth middleware for clarity',
  'Update dependency versions',
  'Add dark mode support',
  'Write integration tests for checkout',
  'Optimize slow database query',
  'Create dashboard for support metrics',
  'Add retry logic to webhook delivery',
  'Draft Q3 roadmap document',
  'Fix flaky end-to-end test',
  'Add audit logging for admin actions',
  'Improve error messages on signup form',
  'Set up staging environment',
  'Reduce bundle size of main chunk',
  'Add keyboard shortcuts to task list',
  'Write postmortem for last incident',
  'Add health checks to background jobs',
  'Localize UI strings for Spanish',
  'Clean up unused feature flags',
  'Add rate limit headers to API responses',
  'Improve accessibility of form controls',
  'Set up automated backups',
];

const COMMENTS = [
  'Started looking into this, will update by EOD.',
  'This is blocked on the upstream API change landing first.',
  'Looks good to me, moving to review.',
  'Reproduced locally, root cause found in the caching layer.',
  'Can we get a second pair of eyes on this before merging?',
  'Deployed to staging, please verify.',
];

async function resetDatabase() {
  await prisma.alertDismissal.deleteMany();
  await prisma.taskHistory.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log('Seeding database...');
  await resetDatabase();

  const password = await hash('Password123!');

  const manager = await prisma.user.create({
    data: {
      name: 'Morgan Lee',
      email: 'manager@example.com',
      passwordHash: password,
      role: 'MANAGER',
    },
  });

  const members = [];
  for (let i = 0; i < MEMBER_NAMES.length; i++) {
    const email = `member${i + 1}@example.com`;
    const user = await prisma.user.create({
      data: {
        name: MEMBER_NAMES[i],
        email,
        passwordHash: password,
        role: 'MEMBER',
      },
    });
    members.push(user);
  }

  const projects = [];
  for (let i = 0; i < PROJECTS.length; i++) {
    const p = PROJECTS[i];
    const project = await prisma.project.create({
      data: {
        key: p.key,
        name: p.name,
        description: p.description,
        ownerId: manager.id,
        archived: i === PROJECTS.length - 1, // keep one archived project to exercise archive/restore
      },
    });
    projects.push(project);

    // Manager belongs to every project (can create/manage tasks anywhere).
    await prisma.projectMember.create({ data: { projectId: project.id, userId: manager.id } });

    // Distribute 3-5 members into each project, rotating through the pool.
    const memberCount = 3 + (i % 3);
    for (let m = 0; m < memberCount; m++) {
      const member = members[(i + m) % members.length];
      await prisma.projectMember.create({
        data: { projectId: project.id, userId: member.id },
      }).catch(() => undefined); // guard against rotation collisions
    }
  }

  const statusCycle = ['BACKLOG', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE', 'IN_PROGRESS', 'BACKLOG', 'DONE', 'IN_REVIEW', 'BACKLOG'];
  const priorityCycle = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  let taskCounter = 0;
  const allTasks: { id: string; projectId: string; status: string }[] = [];

  for (let pi = 0; pi < projects.length; pi++) {
    const project = projects[pi];
    const projectMembers = await prisma.projectMember.findMany({ where: { projectId: project.id } });
    const memberIds = projectMembers.map((pm) => pm.userId).filter((id) => id !== manager.id);
    if (memberIds.length === 0) continue;

    const tasksInProject = 10 + (pi % 3); // 10-12 tasks per project

    for (let ti = 0; ti < tasksInProject; ti++) {
      const idx = taskCounter % TASK_TITLES.length;
      const title = `${TASK_TITLES[idx]}`;
      const status = statusCycle[taskCounter % statusCycle.length];
      const priority = priorityCycle[taskCounter % priorityCycle.length];

      // Due date distribution: overdue, due soon, future, or none.
      let dueDate: Date | null;
      const dueBucket = taskCounter % 5;
      if (dueBucket === 0) dueDate = null;
      else if (dueBucket === 1) dueDate = daysFromNow(-(2 + (taskCounter % 5))); // overdue
      else if (dueBucket === 2) dueDate = daysFromNow(1 + (taskCounter % 6)); // due this week
      else if (dueBucket === 3) dueDate = daysFromNow(14 + (taskCounter % 20)); // future
      else dueDate = daysFromNow(-(1 + (taskCounter % 3))); // recently overdue

      // DONE tasks should never read as overdue and should have a believable completedAt
      // (modeled via updatedAt, see docs/decisions.md).
      let updatedAt = new Date();
      let effectiveDueDate = dueDate;
      let blockedFromStatus: string | null = null;

      if (status === 'DONE') {
        // Spread completions across the last 8 weeks so the dashboard trend has data.
        const weeksAgo = taskCounter % 8;
        updatedAt = new Date(now - weeksAgo * 7 * DAY - (taskCounter % 5) * DAY);
        effectiveDueDate = dueDate && dueDate.getTime() < now ? daysFromNow(-1) : dueDate;
      }

      if (status === 'BLOCKED') {
        blockedFromStatus = taskCounter % 2 === 0 ? 'IN_PROGRESS' : 'IN_REVIEW';
      }

      const creator = memberIds[taskCounter % memberIds.length];

      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          title: `${title} (${project.key}-${ti + 1})`,
          description: `Task ${ti + 1} for ${project.name}. Auto-generated seed description covering realistic day-to-day work.`,
          priority,
          status,
          dueDate: effectiveDueDate,
          blockedFromStatus,
          createdById: creator,
          createdAt: new Date(now - (30 - (taskCounter % 30)) * DAY),
          updatedAt,
        },
      });

      allTasks.push({ id: task.id, projectId: project.id, status: task.status });

      await prisma.taskHistory.create({
        data: {
          taskId: task.id,
          actorId: creator,
          type: 'CREATED',
          metadata: JSON.stringify({ title: task.title }),
          createdAt: task.createdAt,
        },
      });

      // Assign 1-2 members (multi-assignee coverage).
      const assigneeCount = taskCounter % 3 === 0 ? 2 : 1;
      const assignedIds = new Set<string>();
      for (let a = 0; a < assigneeCount; a++) {
        const assignee = memberIds[(taskCounter + a) % memberIds.length];
        if (assignedIds.has(assignee)) continue;
        assignedIds.add(assignee);
        await prisma.taskAssignee.create({ data: { taskId: task.id, userId: assignee } });
        await prisma.taskHistory.create({
          data: {
            taskId: task.id,
            actorId: creator,
            type: 'ASSIGNED',
            newValue: assignee,
            createdAt: new Date(task.createdAt.getTime() + 1000),
          },
        });
      }

      if (status !== 'BACKLOG') {
        await prisma.taskHistory.create({
          data: {
            taskId: task.id,
            actorId: creator,
            type: 'STATUS_CHANGE',
            field: 'status',
            oldValue: 'BACKLOG',
            newValue: status,
            createdAt: new Date(task.createdAt.getTime() + 2000),
          },
        });
      }

      if (taskCounter % 4 === 0) {
        const commenter = memberIds[(taskCounter + 1) % memberIds.length];
        await prisma.taskHistory.create({
          data: {
            taskId: task.id,
            actorId: commenter,
            type: 'COMMENT',
            newValue: COMMENTS[taskCounter % COMMENTS.length],
            createdAt: new Date(task.createdAt.getTime() + 3000),
          },
        });
      }

      taskCounter++;
    }
  }

  // Seed a handful of same-project dependencies so lifecycle/blocker behavior is visible.
  const tasksByProject = new Map<string, typeof allTasks>();
  for (const t of allTasks) {
    const arr = tasksByProject.get(t.projectId) ?? [];
    arr.push(t);
    tasksByProject.set(t.projectId, arr);
  }
  for (const [, tasks] of tasksByProject) {
    if (tasks.length < 4) continue;
    // blocker (not done) -> blocked target
    const blocker = tasks.find((t) => t.status !== 'DONE');
    const blocked = tasks.find((t) => t.id !== blocker?.id && t.status !== 'DONE');
    if (blocker && blocked) {
      await prisma.taskDependency.create({
        data: { blockerTaskId: blocker.id, blockedTaskId: blocked.id },
      }).catch(() => undefined);
    }
    // a finished blocker -> another target, to demonstrate an unblocked dependency
    const finishedBlocker = tasks.find((t) => t.status === 'DONE');
    const otherTarget = tasks.find(
      (t) => t.id !== finishedBlocker?.id && t.id !== blocked?.id && t.status !== 'DONE',
    );
    if (finishedBlocker && otherTarget) {
      await prisma.taskDependency.create({
        data: { blockerTaskId: finishedBlocker.id, blockedTaskId: otherTarget.id },
      }).catch(() => undefined);
    }
  }

  const userCount = await prisma.user.count();
  const projectCount = await prisma.project.count();
  const taskCount = await prisma.task.count();
  const historyCount = await prisma.taskHistory.count();

  console.log(`Seeded: ${userCount} users, ${projectCount} projects, ${taskCount} tasks, ${historyCount} history entries.`);
  console.log('Demo credentials (all use password "Password123!"):');
  console.log('  Manager: manager@example.com');
  members.forEach((m, i) => console.log(`  Member ${i + 1}: member${i + 1}@example.com (${m.name})`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
