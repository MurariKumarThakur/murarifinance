const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

const options = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 60000,
  connectTimeoutMS: 10000,
  heartbeatFrequencyMS: 10000,
  maxPoolSize: 10,
  minPoolSize: 2,
};

const connectDB = async () => {
  try {
    mongoose.set("strictQuery", true);
    const conn = await mongoose.connect(MONGO_URI, options);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

// Auto-reconnect on disconnect
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  MongoDB disconnected — retrying in 5s...");
  setTimeout(() => {
    mongoose.connect(MONGO_URI, options).catch((err) =>
      console.error("❌ Reconnect failed:", err.message)
    );
  }, 5000);
});

mongoose.connection.on("reconnected", () => {
  console.log("✅ MongoDB reconnected");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB error:", err.message);
});

module.exports = connectDB;
