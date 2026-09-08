import clsx from 'clsx';
import { Priority, Status } from '../types/domain';

const STATUS_STYLES: Record<Status, string> = {
  BACKLOG: 'bg-slate-100 text-slate-700 ring-slate-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 ring-blue-300',
  IN_REVIEW: 'bg-purple-100 text-purple-700 ring-purple-300',
  BLOCKED: 'bg-red-100 text-red-700 ring-red-300',
  DONE: 'bg-green-100 text-green-700 ring-green-300',
};

const STATUS_LABELS: Record<Status, string> = {
  BACKLOG: 'Backlog',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  BLOCKED: 'Blocked',
  DONE: 'Done',
};

const PRIORITY_STYLES: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-600 ring-slate-300',
  MEDIUM: 'bg-amber-100 text-amber-700 ring-amber-300',
  HIGH: 'bg-orange-100 text-orange-700 ring-orange-300',
  URGENT: 'bg-red-100 text-red-700 ring-red-300',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        PRIORITY_STYLES[priority],
      )}
    >
      {priority}
    </span>
  );
}
