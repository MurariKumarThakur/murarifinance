const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema(
  {
    borrowerName: { type: String, required: [true, "Borrower name is required"], trim: true },
    phone:        { type: String, required: [true, "Phone is required"], trim: true },
    amount:       { type: Number, required: [true, "Amount is required"], min: [0, "Must be >= 0"] },
    originalAmount: { type: Number, default: null }, // principal at loan creation — kept for reference, never changes
    interestRate: { type: Number, required: [true, "Interest rate is required"], min: 0 },
    duration:     { type: Date,   required: [true, "Duration date is required"] }, // start date for interest — reset to today only when a payment reduces the principal
    interestPaidOffset: { type: Number, default: 0 }, // cumulative interest-only payments since the last start-date reset; subtracted from calculated interest for display
    status:       { type: String, enum: ["Active", "Inactive"], default: "Active" },
    inactiveDate: { type: Date, default: null }, // set when status → Inactive, freeze interest calc
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Virtual link to transactions (used in populate calls)
loanSchema.virtual("transactions", {
  ref: "Transaction",
  localField: "_id",
  foreignField: "loanId",
});
loanSchema.set("toObject", { virtuals: true });
loanSchema.set("toJSON",   { virtuals: true });

// Index: fast user-scoped loan queries
loanSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Loan", loanSchema);
