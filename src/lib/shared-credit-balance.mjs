// Feature rows remain available as source-ledger details during the UI transition.
export function sharedPaidCreditBalance(rows = []) {
  return rows.reduce((balance, row) => ({
    remainingUses: balance.remainingUses + Math.max(Number(row.remaining_uses) || 0, 0),
    totalGranted: balance.totalGranted + Math.max(Number(row.total_granted) || 0, 0),
    totalUsed: balance.totalUsed + Math.max(Number(row.total_used) || 0, 0),
  }), { remainingUses: 0, totalGranted: 0, totalUsed: 0 });
}

export function sharedFreeMonthlyCredit(usageRows = []) {
  return {
    remainingUses: usageRows.length ? 0 : 1,
    totalGranted: 1,
    totalUsed: Math.min(usageRows.length, 1),
    source: "free_monthly",
    eligible: true,
  };
}
