/**
 * A single error shape for every deliberate failure the API raises
 * (validation, not-found, forbidden, conflict …), as opposed to unexpected
 * bugs. Controllers/services `throw new ApiError(404, 'Booking not found')`
 * and the central error handler (see middleware/errorHandler.js) knows to
 * trust `statusCode`/`message` on anything that's an ApiError, and to hide
 * the details of anything that isn't (a real bug shouldn't leak a stack
 * trace or a raw SQL error message to a client).
 */
class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = true; // distinguishes "expected" errors from bugs
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }

  static tooManyRequests(message = 'Too many requests — please try again later') {
    return new ApiError(429, message);
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(500, message);
  }
}

module.exports = ApiError;
