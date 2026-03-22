// =============================================================================
// STORAGE KEYS
// =============================================================================

const SETTINGS_KEY     = "settings";
const LOG_KEY          = "activity_log";
const CACHE_PREFIX     = "cache::";
const INBOX_ID_KEY     = "inbox_folder_id";

// =============================================================================
// FOLDER LABELS
// =============================================================================

const INBOX_FOLDER_TITLE = "📥 Auto Categorize";

// =============================================================================
// LIMITS
// =============================================================================

const MAX_LOG_ENTRIES       = 50;
const RECENTLY_MOVED_TTL_MS = 5000;

// =============================================================================
// CATEGORIES
// Default hint list for the AI prompt. The AI can invent new ones beyond this.
// =============================================================================

const CATEGORIES = [
  "Dev",
  "AI",
  "Video",
  "Social",
  "Finance",
  "Shopping",
  "Learning",
  "Design",
  "Other",
];

// =============================================================================
// AI PROVIDER
// To switch providers: update AI_API_URL + AI_MODEL + AI_FETCH_BODY_BUILDER
// =============================================================================

const AI_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const AI_MODEL   = "llama-3.1-8b-instant";

/**
 * Build the fetch body for the AI request.
 * Swap this function out to support a different API schema (e.g. Gemini, OpenAI).
 * @param {string} prompt
 * @param {string} apiKey
 * @returns {{ url: string, options: RequestInit }}
 */
function AI_FETCH_CONFIG(prompt, apiKey) {
  return {
    url: AI_API_URL,
    options: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 10,
      }),
    },
  };
}

/**
 * Extract the category text from the AI response JSON.
 * Swap this if the provider returns a different response structure.
 * @param {object} data  Parsed JSON response
 * @returns {string}
 */
function AI_PARSE_RESPONSE(data) {
  return data.choices?.[0]?.message?.content?.trim() ?? "Other";
}

// =============================================================================
// AI PROMPT
// Edit here to change how the AI classifies bookmarks.
// =============================================================================

/**
 * Build the classification prompt.
 * @param {string} url
 * @param {string} title
 * @returns {string}
 */
function buildAIPrompt(url, title) {
  return (
    `You are a bookmark categorizer. Assign a short general category name to this website.\n\n` +
    `URL: ${url}\n` +
    `Page Title: ${title || "(no title)"}\n\n` +
    `Rules:\n` +
    `- Return ONLY the category name. No punctuation, no explanation.\n` +
    `- Keep it short: 1-2 words max (e.g. "Anime", "Dev", "News", "Finance").\n` +
    `- Be general not specific: "Anime" not "Anime Tracker", "Dev" not "Code Repository".\n` +
    `- Use common sense about what the site is FOR, not just its name.\n` +
    `- Prefer reusing one of these if it fits: ${CATEGORIES.join(", ")}\n` +
    `- If none fit, invent a short sensible new category.\n` +
    `- If completely unsure, return "Other".`
  );
}

// =============================================================================
// RULES
// Fast domain-based matching — no API call needed for these sites.
// Add new domains here before considering an AI call.
// Format: "CategoryName": ["domain-fragment", ...]
// =============================================================================

const RULES = {
  Dev: [
    "github.com", "gitlab.com", "bitbucket.org",
    "stackoverflow.com", "stackexchange.com", "developer.mozilla.org",
    "npmjs.com", "pypi.org", "codepen.io", "replit.com",
    "jsfiddle.net", "codesandbox.io", "vercel.com", "netlify.com",
    "heroku.com", "digitalocean.com", "aws.amazon.com",
    "cloud.google.com", "azure.microsoft.com", "docker.com",
    "kubernetes.io", "linear.app", "devdocs.io",
    "regex101.com", "roadmap.sh", "leetcode.com", "hackerrank.com",
  ],
  AI: [
    "openai.com", "anthropic.com", "claude.ai", "huggingface.co",
    "replicate.com", "stability.ai", "midjourney.com", "perplexity.ai",
    "gemini.google.com", "copilot.microsoft.com", "mistral.ai",
    "cohere.com", "groq.com", "together.ai", "civitai.com",
    "kaggle.com", "aistudio.google.com",
  ],
  Video: [
    "youtube.com", "youtu.be", "netflix.com", "twitch.tv", "vimeo.com",
    "dailymotion.com", "tiktok.com", "hulu.com", "disneyplus.com",
    "primevideo.com", "crunchyroll.com", "bilibili.com", "nicovideo.jp",
  ],
  Social: [
    "twitter.com", "x.com", "instagram.com", "facebook.com",
    "linkedin.com", "reddit.com", "discord.com", "telegram.org",
    "t.me", "threads.net", "mastodon.", "bsky.app",
    "snapchat.com", "pinterest.com",
  ],
  Finance: [
    "binance.com", "coinbase.com", "kraken.com", "tradingview.com",
    "investing.com", "bloomberg.com", "finance.yahoo.com",
    "wsj.com", "ft.com", "bankofamerica.com", "chase.com",
    "paypal.com", "wise.com", "stripe.com",
  ],
  Shopping: [
    "amazon.com", "amazon.co", "ebay.com", "shopee.", "lazada.",
    "tokopedia.com", "etsy.com", "aliexpress.com", "taobao.com",
    "rakuten.com", "bestbuy.com", "newegg.com",
  ],
  Learning: [
    "udemy.com", "coursera.org", "edx.org", "khanacademy.org",
    "pluralsight.com", "skillshare.com", "freecodecamp.org",
    "theodinproject.com", "w3schools.com", "tutorialspoint.com",
    "medium.com", "dev.to", "hashnode.com", "substack.com",
  ],
  Design: [
    "figma.com", "dribbble.com", "behance.net", "awwwards.com",
    "coolors.co", "fonts.google.com", "fontawesome.com",
    "heroicons.com", "flaticon.com", "unsplash.com",
    "pexels.com", "freepik.com", "canva.com", "adobe.com",
  ],
};
