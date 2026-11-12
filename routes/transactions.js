const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const Loan = require("../models/Loan");
const { protect } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// ── GET /api/transactions/:loanId ────────────────────────────
router.get(
  "/:loanId",
  protect,
  asyncHandler(async (req, res) => {
    // Verify the loan belongs to this user before exposing its transactions
    const loan = await Loan.findOne({ _id: req.params.loanId, userId: req.user._id });
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const transactions = await Transaction.find({
      loanId: req.params.loanId,
      userId: req.user._id,
    }).sort({ date: -1 });

    res.json(transactions);
  })
);

// Payments are created only via POST /api/loans/:id/pay, which recalculates
// interest and updates the loan's principal in the same step. There is no
// generic "add transaction" endpoint anymore — a raw transaction with no
// matching loan update would desync the ledger.

// ── PUT /api/transactions/:id  — Edit a payment's note only ──
// Amount/date aren't editable after the fact: they already fed into the
// loan's principal recalculation, so changing them here would desync it.
router.put(
  "/:id",
  protect,
  asyncHandler(async (req, res) => {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });

    if (req.body.note !== undefined) transaction.note = req.body.note.trim();

    const updated = await transaction.save();
    res.json(updated);
  })
);

// ── DELETE /api/transactions/:id  — Undo a payment ───────────
// Only the most recent payment on a loan can be deleted, and doing so
// restores the loan's principal/interest-clock/status to what they were
// right before that payment — otherwise the running principal would drift
// out of sync with the history.
router.delete(
  "/:id",
  protect,
  asyncHandler(async (req, res) => {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });

    const latest = await Transaction.findOne({
      loanId: transaction.loanId,
      userId: req.user._id,
    }).sort({ date: -1, createdAt: -1 });

    if (!latest || String(latest._id) !== String(transaction._id)) {
      return res.status(400).json({
        message: "Only the most recent payment on this loan can be deleted, to keep the interest ledger consistent.",
      });
    }

    const loan = await Loan.findOne({ _id: transaction.loanId, userId: req.user._id });
    if (loan) {
      loan.amount = transaction.principalBefore;
      loan.duration = transaction.previousDuration;
      loan.status = transaction.previousStatus;
      loan.inactiveDate = transaction.previousInactiveDate;
      loan.interestPaidOffset = transaction.previousInterestPaidOffset || 0;
      await loan.save();
    }

    await transaction.deleteOne();
    res.json({ message: "Payment reverted and removed", loan });
  })
);

module.exports = router;
