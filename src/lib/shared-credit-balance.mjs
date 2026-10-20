// Feature rows remain available as source-ledger details during the UI transition.
export function sharedPaidCreditBalance(rows = []) {
  return rows.reduce((balance, row) => ({
    remainingUses: balance.remainingUses + Math.max(Number(row.remaining_uses) || 0, 0),
    totalGranted: balance.totalGranted + Math.max(Number(row.total_granted) || 0, 0),
    totalUsed: balance.totalUsed + Math.max(Number(row.total_used) || 0, 0),
  }), { remainingUses: 0, totalGranted: 0, totalUsed: 0 });
}

// Legacy response name; this is a one-time retained balance, never a monthly grant.
export function sharedFreeMonthlyCredit(rows = []) {
  const retained = rows[0];
  return {
    remainingUses: Math.max(Number(retained?.remaining_uses) || 0, 0),
    totalGranted: retained ? 1 : 0,
    totalUsed: retained ? 1 - Math.max(Number(retained.remaining_uses) || 0, 0) : 0,
    source: "retained_free",
    eligible: !!retained,
  };
}
