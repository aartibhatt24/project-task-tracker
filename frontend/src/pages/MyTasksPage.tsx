import { TaskExplorer } from '../components/TaskExplorer';
import { useAuth } from '../hooks/useAuth';

export default function MyTasksPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <TaskExplorer
      title="My Tasks"
      lockedAssigneeId={user.id}
      emptyTitle="Nothing assigned to you"
      emptyDescription="Tasks assigned to you across all your projects will show up here."
    />
  );
}
