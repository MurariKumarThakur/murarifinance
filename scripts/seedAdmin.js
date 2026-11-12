require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const connectDB = require("../config/db");

const seed = async () => {
  await connectDB();

  const exists = await User.findOne({ email: "murariraj.one@gmail.com" });
  if (exists) {
    console.log("ℹ️  Admin already exists — skipping.");
    return mongoose.connection.close();
  }

  await User.create({
    name: "Murari Kumar",
    email: "murariraj.one@gmail.com",
    phone: "7799169804",
    password: "mur@ri99340", // hashed by pre-save hook
    role: "admin",
  });

  console.log("✅ Admin created successfully.");
  mongoose.connection.close();
};

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  mongoose.connection.close();
  process.exit(1);
});
