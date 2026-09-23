// Chat content guard. Blocks sharing of contact/social-media details so
// conversations stay inside Astro. Applied on both the REST message endpoint
// and the `chat:send` socket handler.
const SOCIAL_WORDS = [
  "instagram",
  "insta",
  "facebook",
  "fb",
  "whatsapp",
  "telegram",
  "snapchat",
  "tiktok",
  "twitter",
  "linkedin",
  "youtube",
  "discord",
  "reddit",
  "pinterest",
  "behance",
  "viber",
  "wechat",
  "kik",
  "hellotalk",
  "myspace",
  "drift",
];

const SOCIAL_DOMAINS = [
  "instagram.com",
  "instagr.am",
  "facebook.com",
  "fb.com",
  "fb.me",
  "whatsapp.com",
  "wa.me",
  "telegram.me",
  "telegram.org",
  "t.me",
  "snapchat.com",
  "addsnapchat.com",
  "tiktok.com",
  "vm.tiktok.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "discord.gg",
  "discord.com",
  "reddit.com",
  "pinterest.com",
  "github.com",
  "medium.com",
  "quora.com",
  "behance.net",
  "viber.com",
  "wechat.com",
  "hellotalk.com",
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const HANDLE_RE = /(?:^|[\s(])@[a-z0-9_.]{1,30}/i;
const URL_RE = /(?:https?:\/\/|www\.)[^\s]+/i;

// Instagram-style bare usernames: snake_case (kid_official), dotted (play.time.7),
// or short alphanumeric handles (beyond07) that share nothing but the id itself.
const HANDLE_LIKE_RE = /\b[a-z][a-z0-9_]{2,}\b/g;
const UNDERSCORE_RE = /\b[a-z0-9]{2,}_[a-z0-9_]{2,}\b/i;
const DOTTED_RE = /\b[a-z][a-z0-9]+(?:\.[a-z0-9]+){1,}\b/i;

// Phrases people use to hand over a username without typing @ or a platform word.
const SHARE_PHRASE_RE = /\b(?:username|user\s*id|ig\s*id|ig\s*handle|my\s*id|apni\s*id|apna\s*id|mera\s*id|meri\s*id|id\s+(?:de|do|bhej|send|dede|dedo|bhejo))\b/i;

const hasPhoneNumber = (text) => {
  const matches = text.match(/(?:\+?\d[\d\s().-]{6,20}\d)|(?:\b\d{9,15}\b)/g);
  if (!matches) return false;
  return matches.some((match) => {
    const digits = match.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15;
  });
};

const hasHandleLikeWord = (text) => {
  const lower = text.toLowerCase();
  if ((lower.match(UNDERSCORE_RE) || []).length > 0) return true;
  if ((lower.match(DOTTED_RE) || []).some((m) => m.length >= 5)) return true;
  if ((lower.match(HANDLE_LIKE_RE) || []).some((m) => /_|\d/.test(m) && m.length >= 4 && m.length <= 30)) return true;
  return false;
};

// Returns the block reason message, or null if the message is allowed.
const blockedMessageReason = (rawText) => {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text) return null;

  const lower = text.toLowerCase();

  if (EMAIL_RE.test(lower)) {
    return "Sharing email or contact details isn’t allowed. Keep conversations on Astro.";
  }
  if (hasPhoneNumber(text)) {
    return "Sharing phone numbers isn’t allowed. Keep conversations on Astro.";
  }
  if (/(?:^|[\s(])(insta(?:gram)?)\b|inst\b/i.test(lower)) {
    return "Sharing Instagram details isn’t allowed. Keep conversations on Astro.";
  }
  if (new RegExp(`\\b(?:${SOCIAL_WORDS.join("|")})\\w*`, "i").test(lower)) {
    return "Sharing other social media details isn’t allowed. Keep conversations on Astro.";
  }
  if (new RegExp(`(?:${SOCIAL_DOMAINS.map((d) => d.replace(/\./g, "\\.")).join("|")})`, "i").test(lower)) {
    return "Sharing social media links isn’t allowed. Keep conversations on Astro.";
  }
  if (URL_RE.test(lower)) {
    return "Sharing links isn’t allowed. Keep conversations on Astro.";
  }
  if (SHARE_PHRASE_RE.test(lower)) {
    return "Sharing usernames isn’t allowed. Keep conversations on Astro.";
  }
  if (hasHandleLikeWord(lower)) {
    return "Sharing usernames isn’t allowed. Keep conversations on Astro.";
  }
  if (HANDLE_RE.test(lower)) {
    return "Sharing usernames isn’t allowed. Keep conversations on Astro.";
  }
  return null;
};

module.exports = { blockedMessageReason, hasPhoneNumber };