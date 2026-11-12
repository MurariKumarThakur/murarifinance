const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { asyncHandler } = require("./errorHandler");

/** Protect routes — validates Bearer JWT */
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized — no token provided" });
  }

  const token = header.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const msg =
      err.name === "TokenExpiredError"
        ? "Session expired — please log in again"
        : "Not authorized — invalid token";
    return res.status(401).json({ message: msg });
  }

  const user = await User.findById(decoded.id).select(
    "-password -resetToken -resetTokenExpiry"
  );
  if (!user) return res.status(401).json({ message: "User no longer exists" });

  req.user = user;
  next();
});

/** Restrict to admin role */
const admin = (req, res, next) => {
  if (req.user?.role === "admin") return next();
  res.status(403).json({ message: "Admin access required" });
};

module.exports = { protect, admin };
