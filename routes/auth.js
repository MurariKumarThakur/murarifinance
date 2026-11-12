const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const { protect, admin } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// ── Helpers ───────────────────────────────────────────────────
const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "7d" });

const safeUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone });

// ── POST /api/auth/register  (admin only) ─────────────────────
router.post(
  "/register",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, email, phone, password, role } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: "Name, email and password are required" });

    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ message: "Email already in use" });

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
      password,
      role: role === "admin" ? "admin" : "user",
    });

    res.status(201).json({ message: "User created successfully", user: safeUser(user) });
  })
);

// ── POST /api/auth/login ──────────────────────────────────────
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Same response for "no user" and "wrong password" — prevents email enumeration
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ message: "Invalid email or password" });

    res.json({ user: safeUser(user), token: generateToken(user._id, user.role) });
  })
);

// ── GET /api/auth/me ──────────────────────────────────────────
router.get(
  "/me",
  protect,
  asyncHandler(async (req, res) => {
    res.json({ user: safeUser(req.user) });
  })
);

// ── POST /api/auth/forgot-password ───────────────────────────
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    // Always return same message — prevents email enumeration
    const genericOk = { message: "If this email exists, a reset link has been sent." };

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.json(genericOk);

    const token = crypto.randomBytes(32).toString("hex");
    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 15 * 60 * 1000; // 15 min
    await user.save({ validateBeforeSave: false });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;

    await sendEmail({
      to: user.email,
      subject: "Reset Your Password — MyLoanApp",
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;background:#0f0f14;color:#f0ece0;border-radius:12px">
          <h2 style="color:#c9a84c;margin-top:0">Password Reset Request</h2>
          <p>Hi <strong>${user.name}</strong>,</p>
          <p>Click the button below to reset your password. This link expires in <strong>15 minutes</strong>.</p>
          <a href="${resetLink}"
             style="display:inline-block;margin:24px 0;padding:12px 28px;background:linear-gradient(135deg,#c9a84c,#e8c96a);color:#000;font-weight:700;text-decoration:none;border-radius:8px">
            Reset Password
          </a>
          <p style="font-size:13px;color:#888">Or copy this link:<br>
            <a href="${resetLink}" style="color:#c9a84c;word-break:break-all">${resetLink}</a>
          </p>
          <hr style="border-color:#333;margin:24px 0">
          <p style="font-size:12px;color:#666">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    res.json(genericOk);
  })
);

// ── POST /api/auth/reset-password/:token ─────────────────────
router.post(
  "/reset-password/:token",
  asyncHandler(async (req, res) => {
    const { password } = req.body;

    if (!password || password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });

    const user = await User.findOne({
      resetToken: req.params.token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ message: "Reset link is invalid or has expired" });

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: "Password reset successful. You can now log in." });
  })
);

// ── GET /api/auth/users  (admin only) ────────────────────────
router.get(
  "/users",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const users = await User.find()
      .select("-password -resetToken -resetTokenExpiry")
      .sort({ createdAt: -1 });
    res.json(users);
  })
);

module.exports = router;
