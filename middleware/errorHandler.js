/**
 * Wraps async route handlers — no more try/catch in every route
 * Usage: router.get("/", asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** 404 — no route matched */
const notFound = (req, _res, next) => {
  const err = new Error(`Not found: ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
};

/** Global error handler */
const errorHandler = (err, _req, res, _next) => {
  // Mongoose validation errors → readable field messages
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: messages.join(". ") });
  }

  // Duplicate key (e.g. unique email)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(400).json({ message: `${field} already exists` });
  }

  // Bad ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid ID format" });
  }

  const status = err.statusCode || err.status || 500;

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ERROR ${status}:`, err.message);
  }

  res.status(status).json({
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};

module.exports = { asyncHandler, notFound, errorHandler };
