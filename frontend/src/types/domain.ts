export type Status = 'BACKLOG' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type HistoryType =
  | 'CREATED'
  | 'FIELD_CHANGE'
  | 'STATUS_CHANGE'
  | 'ASSIGNED'
  | 'UNASSIGNED'
  | 'COMMENT';

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  ownerId: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number; members: number };
}

export interface ProjectMemberUser {
  id: string;
  name: string;
  email: string;
  role: 'MANAGER' | 'MEMBER';
}

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMemberUser[];
}

export interface TaskAssigneeEntry {
  id: string;
  taskId: string;
  userId: string;
  user: ProjectMemberUser;
}

export interface TaskSummary {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null;
  status: Status;
  blockedFromStatus: Status | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssigneeEntry[];
  project: { id: string; key: string; name: string; archived?: boolean };
}

export interface PagedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  actorId: string;
  actor: ProjectMemberUser;
  type: HistoryType;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface TaskDependencySummary {
  id: string;
  title: string;
  status: Status;
}

export interface BulkResult {
  successful: { taskId: string }[];
  failed: { taskId: string; code: string; reason: string }[];
}

export interface DashboardSummary {
  openTasks: number;
  overdueTasks: number;
  dueThisWeek: number;
  completedThisWeek: number;
}

export interface StatusBreakdownEntry {
  status: Status;
  count: number;
}

export interface AssigneeBreakdownEntry {
  user: ProjectMemberUser;
  count: number;
}

export interface CompletionBucket {
  weekStart: string;
  weekEnd: string;
  count: number;
}
