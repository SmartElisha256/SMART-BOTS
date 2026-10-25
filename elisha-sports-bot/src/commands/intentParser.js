import { detectFootballIntent } from '../services/footballMlService.js';
import { normalizeLeagueName } from '../utils/leagueAliases.js';

const COMMAND_REGEX = /^([a-z0-9]+)(?:\s+(.+))?$/i;
const LEAGUE_PHRASE = '(premier league|la liga|serie a|bundesliga|ligue 1|champions league|europa league|epl|ucl|mls|uganda|upl)';

export function interpretNaturalLanguage(input) {
  const text = String(input ?? '').trim().toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[?!.,]+$/g, '')
    .replace(/\s+/g, ' ');

  if (!text) return { command: null, args: null, raw: text };
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(text)) {
    return { command: 'menu', args: null, raw: text };
  }
  if (/\b(help|what can you do|how do i use you)\b/.test(text)) {
    return { command: 'help', args: null, raw: text };
  }
  if (/\b(which leagues|supported leagues|list leagues|available leagues)\b/.test(text) || /^leagues?$/.test(text)) {
    return { command: 'leagues', args: null, raw: text };
  }
  if (/^(team|myteam|favourite team|favorite team)\b/.test(text) || /^my team\b/.test(text)) {
    const args = text.replace(/^(team|myteam|favourite team|favorite team|my team)\s*/i, '').trim();
    return { command: 'team', args: args || null, raw: text };
  }
  if (/^h2h\s+/.test(text)) return { command: 'h2h', args: text.replace(/^h2h\s+/, '').trim(), raw: text };
  if (/\b(today'?s? tips?|tips today|best pick today|today'?s? best pick|give me a tip|football tip today|today tip)\b/.test(text)) {
    return { command: 'tip', args: null, raw: text };
  }
  if (/\b(live scores?|scores? right now|matches live|what'?s live)\b/.test(text)) {
    const leagueMatch = text.match(new RegExp('\\b(?:in|for)\\s+(' + LEAGUE_PHRASE + ')\\b'));
    return { command: 'live', args: leagueMatch ? normalizeLeagueName(leagueMatch[1]) : null, raw: text };
  }
  if (/\b(fixtures?|matches today|games today|upcoming matches|what matches are on|who is playing today)\b/.test(text)) {
    const leagueMatch = text.match(new RegExp('\\b(?:in|for)\\s+(' + LEAGUE_PHRASE + ')\\b'));
    return { command: 'fixtures', args: leagueMatch ? normalizeLeagueName(leagueMatch[1]) : null, raw: text };
  }
  if (/\b(league table|standings|table for|show the table|table)\b/.test(text)) {
    const league =
      text.match(/(?:table for|standings for|table of|standings of) (.+)$/)?.[1] ||
      text.match(new RegExp('\\b(' + LEAGUE_PHRASE + ')\\b'))?.[1];
    return { command: 'table', args: league ? normalizeLeagueName(league) : null, raw: text };
  }

  const earlyH2H = text.replace(/[?!,]+/g, ' ').match(/^(?:please )?(?:show|get|give me|check) (?:the )?(?:h2h|head to head)(?: record| stats| history)? (.+?) (?:vs|versus|against) (.+)$/);
  if (earlyH2H?.[1] && earlyH2H?.[2]) {
    return { command: 'h2h', args: earlyH2H[1].trim() + ' vs ' + earlyH2H[2].trim(), raw: text };
  }

  const naturalH2HQuestion = text.replace(/[?!,]+/g, ' ').match(/^(?:what is|what's|tell me|please show|show|get|give me|check) (?:the )?(?:h2h|head to head)(?: record| stats| history)?(?: for)? (.+?) (?:vs|versus|against) (.+)$/);
  if (naturalH2HQuestion?.[1] && naturalH2HQuestion?.[2]) {
    return { command: 'h2h', args: naturalH2HQuestion[1].trim() + ' vs ' + naturalH2HQuestion[2].trim(), raw: text };
  }

  const matchup = text.replace(/[,?!]+/g, ' ').match(/(?:^|\b)(?:please )?(?:analyze|analyse|analysis|predict|prediction|who will win|who might win|who wins|tip for|odds for|what do you think about|compare)\s+(?:the\s+)?(.+?)\s+(?:vs\.?|v\.?|versus|against)\s+(.+?)(?:\s+(?:match|game|today|prediction|analysis))?$/);
  const plainMatchup = text.replace(/[,?!]+/g, ' ').match(/^(.+?)\s+(?:vs\.?|v\.?|versus|against)\s+(.+?)(?:\s+(?:who will win|who might win|who wins|prediction|analysis|today))?$/);
  const pair = matchup || ((/\b(who will win|who might win|who wins|predict|prediction|analy[sz]e|analysis|h2h|head to head|tip)\b/.test(text)) ? plainMatchup : null);
  if (pair) {
    const teamA = (pair[1] ?? '').trim();
    const teamB = (pair[2] ?? '').trim().replace(/[, ]+$/g, '');
    if (teamA && teamB) {
      const command = /\b(h2h|head to head)\b/.test(text) ? 'h2h' : 'analyze';
      return { command, args: `${teamA} vs ${teamB}`, raw: text };
    }
  }

  const formMatch = text.match(/^(?:how is|how's|how are|tell me about|show me the form of|form of|recent form for)\s+(.+?)(?:\s+doing)?$/);
  if (formMatch?.[1] && !/^(the team|football|it)$/i.test(formMatch[1])) {
    return { command: 'form', args: formMatch[1].trim(), raw: text };
  }

  const normalizedQuestion = text.replace(/[?!,]+/g, ' ').replace(/\s+/g, ' ').trim();
  const h2hCommandLike = normalizedQuestion.match(/^(?:please )?(?:show|get|give me|check) (?:the )?(?:h2h|head to head)(?: record| stats| history)? (.+?) (?:vs|versus|against) (.+)$/);
  if (h2hCommandLike?.[1] && h2hCommandLike?.[2]) {
    return { command: 'h2h', args: h2hCommandLike[1].trim() + ' vs ' + h2hCommandLike[2].trim(), raw: text };
  }
  const h2hNatural = normalizedQuestion.match(/(?:show|get|give me|check|what is|tell me)? ?(?:the )?(?:h2h|head to head)(?: record| stats| history)? for (.+?) (?:vs|versus|against) (.+)$/);
  if (h2hNatural?.[1] && h2hNatural?.[2]) {
    return { command: 'h2h', args: h2hNatural[1].trim() + ' vs ' + h2hNatural[2].trim(), raw: text };
  }
  const formNatural = normalizedQuestion.match(/^(?:how is|how's|how are|tell me about|show me the form of|form of|recent form for|recent results for) (.+?)(?: doing)?$/);
  if (formNatural?.[1] && !/^(the team|football|it)$/i.test(formNatural[1])) {
    return { command: 'form', args: formNatural[1].trim(), raw: text };
  }
  if (/\b(upgrade|premium plans?|pricing|subscribe|subscription)\b/.test(text)) {
    return { command: 'upgrade', args: null, raw: text };
  }
  if (/^(feedback|review|suggestion|report)\b/.test(text) || /\b(send feedback|leave a review|product feedback)\b/.test(text)) {
    const args = text
      .replace(/^(feedback|review|suggestion|report)\s*/i, '')
      .replace(/^(send feedback|leave a review|product feedback)\s*/i, '')
      .trim();
    return { command: 'feedback', args: args || null, raw: text };
  }

  const explicitCommand = text.match(COMMAND_REGEX);
  if (explicitCommand && /^(menu|help|fixtures|live|table|form|h2h|analyze|analysis|season|historical|tip|tips|start|stop|leagues|league|team|myteam|feedback|review|suggestion|report)$/.test(explicitCommand[1])) {
    if (!(explicitCommand[1] === 'form' && /^form of\s+/.test(text))) {
      let cmd = explicitCommand[1];
      if (cmd === 'myteam') cmd = 'team';
      if (cmd === 'review' || cmd === 'suggestion' || cmd === 'report') cmd = 'feedback';
      return { command: cmd, args: explicitCommand[2] ? explicitCommand[2].trim() : null, raw: text };
    }
  }

  const intent = detectFootballIntent(text);
  if (intent === 'data_ml_ai' || intent === 'ml_ai') {
    const teams = text.match(/(?:^|\b)(.+?)\s+(?:vs\.?|v\.?|versus|against)\s+(.+?)(?:\s+(?:who will win|who might win|who wins|prediction|analysis|today|tonight|tomorrow|recent form|head to head|h2h|team stats|statistics|stats|injuries|lineups?|squad news))?$/i);
    if (teams?.[1]?.trim() && teams?.[2]?.trim()) {
      return { command: 'analyze', args: teams[1].trim() + ' vs ' + teams[2].trim(), raw: text };
    }
  }

  if (/\b(football|soccer|match|matches|team|teams|player|players|league|leagues|goal|goals|score|scores|win|draw|lose|lost|won|coach|manager|transfer|tournament|formation|referee|penalt(?:y|ies)|offsides?|corners?|cards?|shots on target|possession|lineups?|injuries|expected goals|xg|both teams to score|btts|double chance|correct score|tactics|transfer news|premier league|champions league)\b/.test(text)) {
    return { command: 'football_help', args: text, raw: text };
  }

  const commandMatch = text.match(COMMAND_REGEX);
  if (commandMatch) {
    return { command: commandMatch[1], args: commandMatch[2] ? commandMatch[2].trim() : null, raw: text };
  }
  return { command: null, args: null, raw: text };
}

export function parseCommand(input) {
  return interpretNaturalLanguage(input);
}
