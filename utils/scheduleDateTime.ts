export const DEFAULT_OPTIONAL_SCHEDULE_TIME = '09:00';

export const resolveOptionalScheduleTime = (time?: string | null) => {
  const normalizedTime = typeof time === 'string' ? time.trim() : '';
  return normalizedTime || DEFAULT_OPTIONAL_SCHEDULE_TIME;
};

export const buildScheduledForValue = (date: string, time?: string | null) => {
  return `${date}T${resolveOptionalScheduleTime(time)}:00`;
};
