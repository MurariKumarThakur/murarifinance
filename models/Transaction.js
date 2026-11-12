const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    loanId: { type: mongoose.Schema.Types.ObjectId, ref: "Loan",  required: [true, "Loan ID required"] },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User",  required: [true, "User ID required"] },
    amount: { type: Number, required: [true, "Amount is required"], min: [0.01, "Must be > 0"] },
    type:   { type: String, enum: ["Payment"], default: "Payment", required: [true, "Type is required"] },
    note:   { type: String, trim: true, maxlength: 500 },
    date:   { type: Date, default: Date.now },

    // ── Snapshot of the loan state around this payment ─────────────────
    // Lets the app show a clear history line ("₹7000 due → paid ₹3000 → ₹4000 new principal")
    // and lets DELETE safely undo the most recent payment.
    principalBefore:      { type: Number },
    interestApplied:      { type: Number },
    principalAfter:       { type: Number },
    previousDuration:     { type: Date },
    previousInterestPaidOffset: { type: Number, default: 0 },
    previousStatus:       { type: String },
    previousInactiveDate: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes: fast lookups by loan or user
transactionSchema.index({ loanId: 1, date: -1 });
transactionSchema.index({ userId: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
