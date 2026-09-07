export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthenticated: (message = 'Authentication required.') =>
    new AppError(401, 'UNAUTHENTICATED', message),
  forbidden: (message = 'You do not have permission to perform this action.') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'Resource not found.') => new AppError(404, 'NOT_FOUND', message),
  badRequest: (code: string, message: string) => new AppError(400, code, message),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  invalidTransition: (message: string) => new AppError(409, 'INVALID_STATUS_TRANSITION', message),
  validation: (message: string) => new AppError(400, 'VALIDATION_ERROR', message),
};
