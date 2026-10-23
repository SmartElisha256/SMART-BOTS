export function getFriendlyFallback() {
  return '⚽ I’m here to help with football. You can ask about rules, tactics, formations, teams, players, competitions, or statistics. For match data, try FIXTURES, LIVE, TABLE, FORM [TEAM], H2H [TEAM A] vs [TEAM B], or ANALYZE [TEAM A] vs [TEAM B]. For broader football questions, the AI assistant needs to be enabled by configuring OPENAI_API_KEY. What would you like to know?';
}

export function getMenuMessage() {
  return `🏟️ ELISHA SPORTS BOT

Available commands:

• MENU — show this menu
• Ask naturally — e.g. “What matches are on today?” or “How is Arsenal doing?”
• TIP / “Today's tip” — fixture check; model tip only when data quality is strong
• FIXTURES — upcoming matches (optional league)
• LIVE — live scores (when available)
• TABLE — league standings (e.g. TABLE La Liga)
• FORM [TEAM] — recent results (uses your TEAM if set)
• TEAM [NAME] — save favourite team
• H2H [TEAM A] vs [TEAM B] — head-to-head stats
• ANALYZE [TEAM A] vs [TEAM B] — Premium ML + context analysis
• SEASON [LEAGUE] [YEAR] — historical season summary (Premium)
• LEAGUES — supported league aliases
• HELP — usage guide
• UPGRADE — Premium plans and Mobile Money steps
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

TEAM Arsenal
  Saves your favourite team for quicker FORM requests.

“Arsenal vs Chelsea, who might win?”
  Requests detailed analysis (Premium required). Weak data → no tip sold.

“Today's tip”
  Checks fixtures; will not invent a pick if quality is low.

FIXTURES / TABLE La Liga / LEAGUES
  Multi-league support when the sports API is configured.

ANALYZE Arsenal vs Chelsea (Premium)
  ML estimates + context; logged for accuracy tracking.

UPGRADE
  Day / Week / Month Mobile Money plans. Admin verifies before activation.

Reply MENU for all commands.`;
}

export function premiumRequiredMessage() {
  return '🔒 PREMIUM FEATURE\n\nDetailed match analysis and historical season reports are available to active Premium subscribers.\n\nSend UPGRADE to view plans and payment instructions. Your access will activate only after an administrator verifies your payment.';
}

export const BETTING_DISCLAIMER = 'Disclaimer: This statistical analysis is intended for adults aged 18 and above. Gambling can be psychologically harmful and can lead to financial loss. Tips are derived from statistical analysis, not certainty. Use any tips responsibly and stake only what you can afford to lose.';

export function appendBettingDisclaimer(message) {
  return `${message}\n\n${BETTING_DISCLAIMER}`;
}
