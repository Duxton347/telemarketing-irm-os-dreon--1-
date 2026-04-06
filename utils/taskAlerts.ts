import { TaskAlertChannel, TaskBrowserAlert } from '../types';

export const TASK_ALERT_PREFIX = 'TASK_ALERT::';

export interface TaskAlertPayload {
  channel: TaskAlertChannel;
  taskId?: string;
  clientName: string;
  taskType?: string;
  senderName: string;
  message: string;
}

export const buildTaskAlertNote = (payload: TaskAlertPayload): string => {
  return `${TASK_ALERT_PREFIX}${JSON.stringify(payload)}`;
};

export const parseTaskAlertNote = (
  note: string | null | undefined,
  event: { id: string; operator_id: string; timestamp: string }
): TaskBrowserAlert | null => {
  if (!note || !note.startsWith(TASK_ALERT_PREFIX)) {
    return null;
  }

  try {
    const payload = JSON.parse(note.slice(TASK_ALERT_PREFIX.length)) as TaskAlertPayload;

    if (!payload.channel || !payload.clientName || !payload.senderName) {
      return null;
    }

    return {
      id: event.id,
      operatorId: event.operator_id,
      taskId: payload.taskId,
      channel: payload.channel,
      clientName: payload.clientName,
      taskType: payload.taskType,
      senderName: payload.senderName,
      message: payload.message,
      route: payload.channel === 'WHATSAPP' ? '/whatsapp' : '/queue',
      timestamp: event.timestamp
    };
  } catch (error) {
    console.error('Failed to parse task alert note:', error);
    return null;
  }
};
