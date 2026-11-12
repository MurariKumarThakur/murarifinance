const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Loan = require("../models/Loan");
const Transaction = require("../models/Transaction");
const { protect } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { netInterest } = require("../utils/interest");

// ── POST /api/loans  — Create loan ───────────────────────────
router.post(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    const { borrowerName, phone, amount, interestRate, duration, status } = req.body;

    if (!borrowerName || !phone || !amount || !interestRate || !duration)
      return res.status(400).json({ message: "borrowerName, phone, amount, interestRate and duration are required" });

    const loan = await Loan.create({
      borrowerName: borrowerName.trim(),
      phone: phone.trim(),
      amount: Number(amount),
      originalAmount: Number(amount),
      interestRate: Number(interestRate),
      duration,
      status: status || "Active",
      userId: req.user._id,
    });

    res.status(201).json(loan);
  })
);

// ── GET /api/loans  — All loans with transaction totals ───────
// Original: N+1 queries (1 per loan). Fixed: single aggregation pipeline.
router.get(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    const loans = await Loan.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user._id) } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "transactions",
          localField: "_id",
          foreignField: "loanId",
          as: "transactions",
        },
      },
      {
        // Informational only — the loan's `amount` field is already the live
        // principal (payments fold interest in and reduce it directly).
        // totalPaid is just "how much has this borrower paid in total so far".
        $addFields: {
          totalPaid: { $sum: "$transactions.amount" },
        },
      },
      // Don't send full transaction array in list view
      { $project: { transactions: 0 } },
    ]);

    res.json(loans);
  })
);

// ── PUT /api/loans/:id  — Update loan ────────────────────────
router.put(
  "/:id",
  protect,
  asyncHandler(async (req, res) => {
    const loan = await Loan.findOne({ _id: req.params.id, userId: req.user._id });
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    // Only allow updating these fields — prevents userId/id injection
    const allowed = ["borrowerName", "phone", "amount", "interestRate", "duration", "status"];
    allowed.forEach((f) => { if (req.body[f] !== undefined) loan[f] = req.body[f]; });

    // Manually correcting the Start Date restarts the interest accrual
    // period, so any banked interest-only payments no longer apply.
    if (req.body.duration !== undefined) loan.interestPaidOffset = 0;

    // Auto-set inactiveDate when toggling status
    if (req.body.status === "Inactive" && !loan.inactiveDate) {
      loan.inactiveDate = new Date();
    } else if (req.body.status === "Active") {
      loan.inactiveDate = null; // reactivated — clear freeze date
    }

    const updated = await loan.save();
    res.json(updated);
  })
);

// ── DELETE /api/loans/:id  — Delete loan + cascade ───────────
router.delete(
  "/:id",
  protect,
  asyncHandler(async (req, res) => {
    const loan = await Loan.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const { deletedCount } = await Transaction.deleteMany({ loanId: loan._id });

    res.json({
      message: "Loan and related transactions deleted successfully",
      transactionsRemoved: deletedCount,
    });
  })
);

// ── POST /api/loans/:id/pay  — Record a payment ──────────────────────
// Rule:
//  - If the payment is MORE than the interest currently owed: that interest
//    is fully cleared, the extra goes toward principal, and the Start Date
//    resets to today (the interest clock restarts from the payment date).
//  - If the payment is LESS THAN OR EQUAL TO the interest owed: it's an
//    interest-only payment — principal and Start Date stay as-is, but the
//    payment is banked as interestPaidOffset so the displayed interest
//    (and Total Due) drop by that amount immediately.
// Example: principal 10000, accrued interest 9600, payment 5000 (<= 9600)
//   → principal unchanged, Start Date unchanged, interest now shows 4600.
// A later payment that exceeds the (now-reduced) interest owed clears it
// fully, folds any excess into principal, and resets everything.
router.post(
  "/:id/pay",
  protect,
  asyncHandler(async (req, res) => {
    const { amount, note, date } = req.body;
    const payAmount = Math.round(Number(amount) * 100) / 100;

    if (!payAmount || payAmount <= 0)
      return res.status(400).json({ message: "Enter a valid payment amount" });

    const loan = await Loan.findOne({ _id: req.params.id, userId: req.user._id });
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    if (loan.status !== "Active")
      return res.status(400).json({ message: "This loan is inactive. Reactivate it before recording a payment." });

    const paymentDate = date ? new Date(date) : new Date();
    if (paymentDate < new Date(loan.duration))
      return res.status(400).json({ message: "Payment date can't be before the loan's Start Date" });

    const principalBefore = Number(loan.amount);
    const previousDuration = loan.duration;
    const offsetBefore = Number(loan.interestPaidOffset || 0);

    // Interest currently owed, net of any interest-only payments already banked
    const interestApplied = netInterest(principalBefore, loan.interestRate, loan.duration, paymentDate, offsetBefore);
    const totalDue = Math.round((principalBefore + interestApplied) * 100) / 100;

    if (payAmount > totalDue + 0.01)
      return res.status(400).json({ message: `Payment of ₹${payAmount} exceeds total due of ₹${totalDue.toFixed(2)}` });

    const reducesPrincipal = payAmount > interestApplied + 0.01;

    let principalAfter;
    let closesLoan = false;
    let interestPaidOffsetAfter;
    if (reducesPrincipal) {
      const rawRemainder = Math.round((totalDue - payAmount) * 100) / 100;
      principalAfter = Math.max(rawRemainder, 0);
      closesLoan = rawRemainder <= 0.01;
      interestPaidOffsetAfter = 0; // interest fully cleared, clock resets
    } else {
      // Interest-only payment: principal and Start Date are untouched;
      // bank the payment against the interest owed for this accrual period.
      principalAfter = principalBefore;
      interestPaidOffsetAfter = Math.round((offsetBefore + payAmount) * 100) / 100;
    }

    // Snapshot so a delete can safely undo exactly this payment
    const previousStatus = loan.status;
    const previousInactiveDate = loan.inactiveDate;
    const previousInterestPaidOffset = offsetBefore;

    loan.amount = principalAfter;
    loan.interestPaidOffset = interestPaidOffsetAfter;
    if (reducesPrincipal) {
      loan.duration = paymentDate; // reset Start Date / interest clock
    }
    if (closesLoan) {
      loan.status = "Inactive";
      loan.inactiveDate = paymentDate;
    }
    await loan.save();

    const transaction = await Transaction.create({
      loanId: loan._id,
      userId: req.user._id,
      amount: payAmount,
      type: "Payment",
      note: note?.trim(),
      date: paymentDate,
      principalBefore,
      interestApplied,
      principalAfter,
      previousDuration,
      previousStatus,
      previousInactiveDate,
      previousInterestPaidOffset,
    });

    res.status(201).json({ loan, transaction });
  })
);

module.exports = router;
