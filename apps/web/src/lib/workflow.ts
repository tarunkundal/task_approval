import {
  getAvailableActions,
  type TaskAction,
  type TaskDto,
  type WorkflowActor,
} from '@workspace/shared';

/**
 * Workflow buttons to show for `task` (UI hint only; the API is the authority).
 * Adapts `TaskDto.assignedTo.id` to the shared helper's `assignedToId`.
 */
export function availableActions(
  task: Pick<TaskDto, 'status' | 'assignedTo'>,
  user: WorkflowActor,
): TaskAction[] {
  return getAvailableActions({ status: task.status, assignedToId: task.assignedTo.id }, user);
}
