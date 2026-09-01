// The vocabulary rule, verbatim from DESIGN.md §6. This file is the one source
// file the scanner excludes from its own corpus, for the obvious reason.
//
// The rule is accuracy first: the protocol issues pieces to holders in
// proportion to what they hold, which is not a contest and has no victors. It
// is caution second: we are not qualified to make a legal characterisation, so
// we describe the mechanism and decline the vocabulary that would make the
// characterisation for us.
export const BANNED_TERMS = [
  'win',
  'wins',
  'winner',
  'winners',
  'winning',
  'won',
  'ticket',
  'tickets',
  'prize',
  'prizes',
  'lottery',
  'lotteries',
  'lotto',
  'raffle',
  'raffles',
  'jackpot',
  'jackpots',
  'gamble',
  'gambling',
  'bet',
  'bets',
  'betting',
  'wager',
  'odds',
  'luck',
  'lucky',
  'chance to',
  // DESIGN.md §6: "banned in copy and in identifiers alike". The instructions
  // are `request_issuance` and `settle_issuance`, the column is `issue_at`,
  // the job is the issuance cranker.
  'draw',
  'draws',
] as const
