import type { LucideIcon } from 'lucide-react';
import type { TaskInstance, TaskList, TaskPriority, TaskRecurrenceType } from '../../types';

export type TaskManagerViewKey =
  | 'all'
  | 'my-day'
  | 'important'
  | 'planned'
  | 'assigned-to-me'
  | 'completed'
  | 'personal'
  | 'team'
  | 'created-by-me'
  | `custom:${string}`;

export type QuickTaskOwnership = 'PERSONAL' | 'ASSIGNED' | 'TEAM';

export type TaskSortMode = 'smart' | 'due' | 'created';

export type TaskFilterMode = 'active' | 'all';

export type TaskManagerTask = TaskInstance & {
  list?: TaskList | null;
  listLabel: string;
  taskScopeLabel: 'PESSOAL' | 'SETOR';
  isCompleted: boolean;
  isDeleted: boolean;
  isOverdue: boolean;
  isPlanned: boolean;
  wasAssignedByOtherUser: boolean;
  wasAssignedByCurrentUser: boolean;
  canEdit: boolean;
  canAssign: boolean;
  canComplete: boolean;
  requiresCommentOnCompletion: boolean;
  recurrenceType: TaskRecurrenceType;
  recurrenceWeekdays: string[];
  explicitTime: boolean;
};

export type TaskSidebarItem = {
  id: TaskManagerViewKey;
  label: string;
  count: number;
  icon: LucideIcon;
  kind: 'smart' | 'source' | 'custom';
  list?: TaskList | null;
};

export type QuickTaskFormState = {
  title: string;
  description: string;
  ownership: QuickTaskOwnership;
  listId: string;
  dueDate: string;
  dueTime: string;
  reminderDate: string;
  reminderTime: string;
  recurrenceType: TaskRecurrenceType;
  weeklyDays: string[];
  assignedUserId: string;
  priority: TaskPriority;
  inMyDay: boolean;
  isImportant: boolean;
};
