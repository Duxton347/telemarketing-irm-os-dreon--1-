import { User, UserRole } from '../types';

export const canReceiveTasks = (user?: Pick<User, 'role' | 'active'> | null) =>
  Boolean(
    user
    && user.active !== false
    && [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR].includes(user.role)
  );

export const getTaskAssignableUsers = <T extends Pick<User, 'role' | 'active'>>(users: T[]) =>
  users.filter(canReceiveTasks);
