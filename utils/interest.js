// ── Interest calculation (mirrors frontend LoanList.js formula) ─────────────
// principal: current principal amount
// annualRate: interest rate, % per annum
// startDate: date interest starts accruing from (loan.duration)
// endDate: date to calculate interest up to (defaults to now)
function calculateInterest(principal, annualRate, startDate, endDate = new Date()) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let totalMonths = years * 12 + months;

  const startDay = start.getDate();
  const endDay = end.getDate();

  if (endDay >= startDay) {
    const daysInEnd = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    totalMonths += (endDay - startDay) / daysInEnd;
  } else {
    totalMonths -= 1;
    const daysInPrev = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    totalMonths += (daysInPrev - startDay + endDay) / daysInPrev;
  }

  // Interest shouldn't go negative for a payment made "in the past" relative to start
  if (totalMonths < 0) totalMonths = 0;

  return Number(((principal * annualRate * totalMonths) / 100).toFixed(2));
}

// Net interest currently owed: what's accrued since the start date, minus
// any interest-only payments already made against this accrual period.
function netInterest(principal, annualRate, startDate, endDate, paidOffset = 0) {
  const gross = calculateInterest(principal, annualRate, startDate, endDate);
  return Math.max(Math.round((gross - Number(paidOffset || 0)) * 100) / 100, 0);
}

module.exports = { calculateInterest, netInterest };
