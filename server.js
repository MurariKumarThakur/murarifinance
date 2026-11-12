// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const loanRoutes = require("./routes/loans");
const transactionRoutes = require("./routes/transactions");
const app = express();
connectDB();

app.use(cors());
app.use(express.json());

// API routes

app.use("/api/auth", authRoutes);
app.use("/api/loans", loanRoutes);

app.use("/api/transactions", transactionRoutes);

// Healthcheck
app.get("/api/ping", (req, res) => res.json({ ok: true }));

// Serve static built React in production (if you build frontend into ../frontend/build)
// const path = require("path");
// app.use(express.static(path.join(__dirname, "../frontend/build")));
// app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../frontend/build", "index.html")));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
