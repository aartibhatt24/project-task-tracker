import { TaskExplorer } from '../components/TaskExplorer';

export default function AllTasksPage() {
  return (
    <TaskExplorer
      title="All Tasks"
      emptyTitle="No tasks match these filters"
      emptyDescription="Try clearing a filter or searching for something else."
    />
  );
}
