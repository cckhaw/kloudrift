// Basic automated screening for anonymous wind-bottles. This is a first line of defence,
// not a substitute for a real moderation service: word lists never catch everything.

export const MAX_LENGTH = 140;

export function sanitize(text) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH);
}

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|app|me|ly|gg|xyz|ru|cn)\b)/i;
const CONTACT = /([\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{7,}\d|(^|\s)@\w{3,})/;
const UNKIND = /\b(kill yourself|kys|stupid|idiot|loser|ugly|hate you|moron|worthless|f+u+c+k\w*|sh+i+t\w*|bitch\w*|asshole\w*|cunt\w*|dick\w*)\b/i;
const HEAVY = /\b(suicid\w*|kill myself|end it all|want to die|self[- ]harm|hurt myself)\b/i;

/** Returns null when acceptable, otherwise a short reason code. */
export function moderate(text) {
  if (text.length < 3) return 'too_short';
  if (CONTACT.test(text)) return 'contact';
  if (LINK.test(text)) return 'links';
  if (/(.)\1{6,}/.test(text)) return 'spam';
  if (HEAVY.test(text)) return 'heavy';
  if (UNKIND.test(text)) return 'unkind';
  return null;
}
