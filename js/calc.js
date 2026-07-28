// ---------- Core business calculations ----------
// All money values are treated as plain numbers (TWD, no decimals expected but not enforced).

const DEFAULT_SEASON_PASS_DIVISOR = 18;

// The season-pass cost-sharing divisor now lives on the SESSION itself (each session can be
// adjusted independently), not on the season.
export function seasonPassDivisorOf(session) {
  const v = Number(session?.seasonPassDivisor);
  return v > 0 ? v : DEFAULT_SEASON_PASS_DIVISOR;
}

// Per-session per-season-pass-member cost share.
// (venueCost + acCost) / seasonPassDivisor — a fixed, manually adjustable number set per
// session (e.g. "the court is split 18 ways"), NOT tied to how many season-pass members attend.
export function sessionPerPersonShare(session) {
  const denom = seasonPassDivisorOf(session);
  const total = (Number(session.venueCost) || 0) + (Number(session.acCost) || 0);
  return total / denom;
}

export function sessionTotalExpense(session) {
  return (Number(session.venueCost) || 0) + (Number(session.acCost) || 0) + (Number(session.otherCost) || 0);
}

// A casual (臨打) roster row counts as paid once a payment method has been set — "－" means unpaid.
export function isRosterPaid(row) {
  return Boolean(row.paymentMethod);
}

// F8 — session-level stats. rosters = all SessionRoster rows for this session.
// Season-pass members are treated as attending (出席) by default — only an explicit 請假
// row excludes them. Their prepaid share of this specific session now also counts as
// "season-pass income" for this session's stats, and folds into both surplus figures.
export function computeSessionStats(session, rosters) {
  const casualRows = rosters.filter((r) => r.sourceType === 'casual');
  const seasonPassLeave = rosters.filter((r) => r.sourceType === 'seasonPass' && r.attendance === '請假');
  const seasonPassRows = rosters.filter((r) => r.sourceType === 'seasonPass');
  const seasonPassAttendingCount = seasonPassRows.filter((r) => r.attendance !== '請假').length;

  const receivable = casualRows.reduce((sum, r) => sum + (Number(r.feeAmount) || 0), 0);
  const received = casualRows.filter(isRosterPaid).reduce((sum, r) => sum + (Number(r.feeAmount) || 0), 0);
  const expense = sessionTotalExpense(session);
  const share = sessionPerPersonShare(session);
  const seasonPassIncome = seasonPassAttendingCount * share;

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
  };
}

// F9 — season pass settlement for one member across every session in the season.
// Season-pass members default to 出席 (attending) for every session — a session with no
// SessionRoster row at all for this member is treated exactly like an explicit 出席 row.
// Only an explicit 請假 row reduces what they owe for that session.
// rosterRowsBySessionId: { [sessionId]: SessionRoster row } — only rows for THIS member.
export function computeSeasonPassSettlement(seasonPass, sessions, rosterRowsBySessionId) {
  const rows = sessions.map((session) => {
    const roster = rosterRowsBySessionId[session.id];
    const attendance = roster ? roster.attendance : '出席';
    const share = sessionPerPersonShare(session);
    const due = attendance === '請假' ? 0 : share;
    return { sessionId: session.id, date: session.date, attendance, share, due };
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
