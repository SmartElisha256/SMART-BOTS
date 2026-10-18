export function getFriendlyFallback() {
  return '⚽ I’m here to help with football. You can ask about rules, tactics, formations, teams, players, competitions, or statistics. For match data, try FIXTURES, LIVE, TABLE, FORM [TEAM], H2H [TEAM A] vs [TEAM B], or ANALYZE [TEAM A] vs [TEAM B]. For broader football questions, the AI assistant needs to be enabled by configuring OPENAI_API_KEY. What would you like to know?';
}

export function getMenuMessage() {
  return `🏟️ ELISHA SPORTS BOT

Available commands:

• MENU — show this menu
• Ask naturally — e.g. “What matches are on today?” or “How is Arsenal doing?”
• TIP / “Today's tip” — check available fixtures before requesting a match analysis
• FIXTURES — upcoming matches
• LIVE — live scores (when available)
• TABLE — league standings
• FORM [TEAM] — recent results for a team
• H2H [TEAM A] vs [TEAM B] — head-to-head stats
• ANALYZE [TEAM A] vs [TEAM B] — form, squad availability, strength, lineups, and data-quality analysis
• SEASON [LEAGUE] [YEAR] — historical season summary
• HELP — usage guide
• UPGRADE — view Premium plans and payment steps
• START — enable notifications
• STOP — disable notifications`;
}

export function getHelpMessage() {
  return `📖 HELP - How to use ELISHA SPORTS BOT

Examples:

“What matches are on today?”
  Shows available upcoming fixtures.

“How is Arsenal doing?”
  Shows Arsenal's recent form.

“Arsenal vs Chelsea, who might win?”
  Requests detailed analysis (Premium required).

“Today's tip”
  Checks available fixtures; it will not invent a pick if reliable data is unavailable.

Voice notes
  Voice-note understanding is planned for a future upgrade. Please type your football question for now.

FIXTURES
  Shows next 3 upcoming matches.

TABLE
  Shows league standings (top 5 teams).

FORM Arsenal
  Shows Arsenal's last 5 matches.

H2H Manchester City vs Liverpool
  Shows historical head-to-head record.

ANALYZE Arsenal vs Chelsea
  Compares recent form, head-to-head, squad availability, team strength, lineup context, and data-quality warnings.

SEASON Premier League 2023
  Summarizes completed fixtures, points, goals, and home/away records for a historical season.

LIVE
  Shows current live scores (when available).

START / STOP
  Enable or disable match notifications.

UPGRADE
  Shows Premium plans and manual payment instructions. Activation requires administrator verification.

Reply MENU for all commands.`;
}

export function premiumRequiredMessage() {
  return '🔒 PREMIUM FEATURE\n\nDetailed match analysis and historical season reports are available to active Premium subscribers.\n\nSend UPGRADE to view plans and payment instructions. Your access will activate only after an administrator verifies your payment.';
}

export const BETTING_DISCLAIMER = 'Disclaimer: This statistical analysis is intended for adults aged 18 and above. Gambling can be psychologically harmful and can lead to financial loss. Tips are derived from statistical analysis, not certainty. Use any tips responsibly and stake only what you can afford to lose.';

export function appendBettingDisclaimer(message) {
  return `${message}\n\n${BETTING_DISCLAIMER}`;
}
