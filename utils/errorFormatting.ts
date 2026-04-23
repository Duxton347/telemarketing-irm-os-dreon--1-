export const formatUnknownError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.hint, record.details]
      .filter(value => typeof value === 'string' && value.trim().length > 0)
      .map(value => String(value).trim());

    if (parts.length > 0) {
      return parts.join(' | ');
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'Erro desconhecido';
    }
  }

  return 'Erro desconhecido';
};
