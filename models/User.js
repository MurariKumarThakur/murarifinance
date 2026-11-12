const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name:  { type: String, required: [true, "Name is required"], trim: true },
    phone: { type: String, trim: true },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: { type: String, required: [true, "Password is required"], minlength: 6 },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    resetToken: String,
    resetTokenExpiry: Date,
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, await bcrypt.genSalt(10));
  next();
});

// Compare entered password
userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Strip sensitive fields from any JSON output — password can never leak
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetToken;
  delete obj.resetTokenExpiry;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
