import { AuthenticatedUser } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { buildTaskOrderBy, buildTaskWhere, TaskFilters } from './taskQueryService';
import { TaskQuery } from '../validators/taskQueryValidators';

const CSV_HEADERS = [
  'id',
  'projectKey',
  'projectName',
  'title',
  'description',
  'status',
  'priority',
  'dueDate',
  'assignees',
  'createdAt',
  'updatedAt',
];

// Task titles/descriptions are free text a manager controls but that other managers will
// open in Excel/Sheets. A leading =, +, -, or @ is interpreted as a formula by most
// spreadsheet apps ("CSV/formula injection") — prefixing with a tab neutralizes that
// without changing how the value displays or how it's parsed as a CSV field.
function neutralizeFormulaInjection(value: string): string {
  return /^[=+\-@]/.test(value) ? `\t${value}` : value;
}

function escapeCsvField(value: string): string {
  const safe = neutralizeFormulaInjection(value);
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function toRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(',');
}

/**
 * Generates CSV for the currently filtered/sorted task list, from the same
 * buildTaskWhere/buildTaskOrderBy the paginated list endpoint uses — so an export always
 * matches what the equivalent (unpaginated) list query would return, never just the rows a
 * particular browser page happened to have loaded. No pagination: the whole filtered result
 * is exported, per PROJECT_SPEC.md 1.9.
 */
export async function generateTaskCsv(
  user: AuthenticatedUser,
  filters: TaskFilters,
  sortBy: TaskQuery['sortBy'],
  sortOrder: TaskQuery['sortOrder'],
): Promise<string> {
  const where = buildTaskWhere(user, filters);
  const orderBy = buildTaskOrderBy(sortBy, sortOrder);

  const tasks = await prisma.task.findMany({
    where,
    orderBy,
    include: {
      project: { select: { key: true, name: true } },
      assignees: { include: { user: { select: { name: true, email: true } } } },
    },
  });

  const lines = [toRow(CSV_HEADERS)];
  for (const task of tasks) {
    lines.push(
      toRow([
        task.id,
        task.project.key,
        task.project.name,
        task.title,
        task.description ?? '',
        task.status,
        task.priority,
        task.dueDate ? task.dueDate.toISOString() : '',
        task.assignees.map((a) => a.user.name).join('; '),
        task.createdAt.toISOString(),
        task.updatedAt.toISOString(),
      ]),
    );
  }

  return lines.join('\r\n') + '\r\n';
}
