// ---------- Core business calculations ----------
// All money values are treated as plain numbers (TWD, no decimals expected but not enforced).

const DEFAULT_SEASON_PASS_FEE = 230;

// Each session has its own manually-set "season-pass default fee" — this is the flat amount
// every attending season-pass member owes for THAT session (replaces the old cost-sharing
// formula). Lives on the session so it can be adjusted per occurrence.
export function seasonPassFeeOf(session) {
  const v = Number(session?.seasonPassFeePerSession);
  return Number.isFinite(v) ? v : DEFAULT_SEASON_PASS_FEE;
}

export function sessionTotalExpense(session) {
  return (Number(session.venueCost) || 0) + (Number(session.acCost) || 0) + (Number(session.otherCost) || 0);
}

// A casual (臨打) / waitlist (候補) roster row counts as paid once a payment method has been
// set — "－" means unpaid.
export function isRosterPaid(row) {
  return Boolean(row.paymentMethod);
}

// F8 — session-level stats. rosters = all SessionRoster rows for this session.
// Season-pass members are treated as attending (出席) by default — only an explicit 請假
// row excludes them. Their flat per-session fee counts as "season-pass income" for this
// session's stats, and folds into both surplus figures.
// Waitlist (候補) rows are financially identical to casual (臨打) rows — same fee/payment
// handling — they're just grouped separately in the UI.
export function computeSessionStats(session, rosters) {
  const casualRows = rosters.filter((r) => r.sourceType === 'casual');
  const waitlistRows = rosters.filter((r) => r.sourceType === 'waitlist');
  const seasonPassLeave = rosters.filter((r) => r.sourceType === 'seasonPass' && r.attendance === '請假');
  const seasonPassRows = rosters.filter((r) => r.sourceType === 'seasonPass');
  const seasonPassAttendingCount = seasonPassRows.filter((r) => r.attendance !== '請假').length;

  // Point 9: 候補 (waitlist) money is excluded from all financial stats — only 臨打 (casual) counts.
  const receivable = casualRows.reduce((sum, r) => sum + (Number(r.feeAmount) || 0), 0);
  const received = casualRows.filter(isRosterPaid).reduce((sum, r) => sum + (Number(r.feeAmount) || 0), 0);
  const expense = sessionTotalExpense(session);
  const seasonPassFee = seasonPassFeeOf(session);
  const seasonPassIncome = seasonPassAttendingCount * seasonPassFee;

  const byMethod = {};
  casualRows.filter(isRosterPaid).forEach((r) => {
    const key = r.paymentMethod;
    byMethod[key] = (byMethod[key] || 0) + (Number(r.feeAmount) || 0);
  });

  return {
    receivable,
    received,
    expense,
    seasonPassIncome,
    receivableSurplus: receivable + seasonPassIncome - expense,
    receivedSurplus: received + seasonPassIncome - expense,
    byMethod,
    attendeeCount: seasonPassAttendingCount + casualRows.length,
    seasonPassAttendingCount,
    seasonPassLeaveCount: seasonPassLeave.length,
    casualCount: casualRows.length,
    waitlistCount: waitlistRows.length,
  };
}

// F9 — season pass settlement for one member across every session in the season.
// Season-pass members default to 出席 (attending) for every session — a session with no
// SessionRoster row at all for this member is treated exactly like an explicit 出席 row.
// Only an explicit 請假 row reduces what they owe for that session (due = 0).
// rosterRowsBySessionId: { [sessionId]: SessionRoster row } — only rows for THIS member.
export function computeSeasonPassSettlement(seasonPass, sessions, rosterRowsBySessionId) {
  const rows = sessions.map((session) => {
    const roster = rosterRowsBySessionId[session.id];
    const attendance = roster ? roster.attendance : '出席';
    const fee = seasonPassFeeOf(session);
    const due = attendance === '請假' ? 0 : fee;
    return { sessionId: session.id, date: session.date, attendance, fee, due };
  }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const actualTotalDue = rows.reduce((sum, r) => sum + r.due, 0);
  const prepaid = Number(seasonPass.prepaidAmount) || 0;
  const diff = prepaid - actualTotalDue; // positive => refund, negative => makeup owed

  return {
    rows,
    actualTotalDue,
    prepaidAmount: prepaid,
    refundAmount: diff > 0 ? diff : 0,
    makeupAmount: diff < 0 ? -diff : 0,
    isMakeup: diff < 0,
  };
}

// F8 — season-level aggregate stats.
// sessions: all sessions in season; sessionStatsById: map sessionId -> computeSessionStats result
// seasonPasses: all SeasonPass rows for the season, each with .settlement attached
export function computeSeasonStats(sessions, sessionStatsById, seasonPasses) {
  let sessionsReceivable = 0, sessionsReceived = 0, sessionsExpense = 0;
  const byMethod = {};

  sessions.forEach((s) => {
    const st = sessionStatsById[s.id];
    if (!st) return;
    sessionsReceivable += st.receivable;
    sessionsReceived += st.received;
    sessionsExpense += st.expense;
    Object.entries(st.byMethod).forEach(([k, v]) => { byMethod[k] = (byMethod[k] || 0) + v; });
  });

  let seasonPassPrepaidTotal = 0;
  let seasonPassPaidTotal = 0;
  let refundTotal = 0;

  seasonPasses.forEach((sp) => {
    const prepaid = Number(sp.prepaidAmount) || 0;
    seasonPassPrepaidTotal += prepaid;
    if (sp.paymentStatus === '已繳') {
      seasonPassPaidTotal += prepaid;
      const key = sp.paymentMethod || '未指定';
      byMethod[key] = (byMethod[key] || 0) + prepaid;
    }
    if (sp.settlement) refundTotal += sp.settlement.refundAmount - sp.settlement.makeupAmount;
  });

  const receivable = sessionsReceivable + seasonPassPrepaidTotal;
  const received = sessionsReceived + seasonPassPaidTotal;

  return {
    receivable,
    received,
    expense: sessionsExpense,
    refundTotal,
    receivableSurplus: receivable - sessionsExpense - refundTotal,
    receivedSurplus: received - sessionsExpense - refundTotal,
    byMethod,
  };
}
