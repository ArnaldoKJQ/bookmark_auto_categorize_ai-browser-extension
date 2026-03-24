# 🔖 AI Bookmark Organizer

A Chrome extension that automatically categorizes your bookmarks using rule-based matching and Groq AI — no manual sorting needed.

---

## How It Works

Save a bookmark into the **📥 Auto Categorize** folder, and the extension will automatically move it into the right category subfolder.

```
📥 Auto Categorize/
├── Dev/
│   └── github.com
├── Anime/
│   └── myanimelist.net
├── Video/
│   └── youtube.com
└── ...
```

**Classification pipeline (in order):**

1. **Cache** — already seen this URL before? Use the stored result instantly
2. **Rules** — matches 100+ known domains (github.com → Dev, youtube.com → Video, etc.)
3. **AI** — unknown sites get sent to Groq AI, which infers a category from the URL and page title

The AI is not limited to a fixed category list — it can invent new ones like `Anime`, `Music`, `Travel` based on what the site is actually for.

---

## Demo

| Bookmark | Method | Result |
|---|---|---|
| `github.com` | Rule | `Dev` |
| `youtube.com` | Rule | `Video` |
| `myanimelist.net` | AI | `Anime` |
| `spotify.com` | AI | `Music` |
| `airbnb.com` | AI | `Travel` |

---

## Installation

> No Chrome Web Store listing yet (Pending Review)— load it manually as an unpacked extension.

1. Download or clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select the project folder
5. The extension icon appears in your toolbar

---

## Setup

### 1. Enable the extension

Click the extension icon → toggle **ON**. This creates the **📥 Auto Categorize** folder in your bookmarks bar.

### 2. Get a free Groq API key

> The AI fallback requires a Groq API key. Rule-based matching works without one.

1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Sign up with Google or GitHub — **no credit card required**
3. Create an API key and copy it

### 3. Add the API key

Click the extension icon → **Settings** tab → paste your key → **Save Settings**

---

## Usage

1. Browse to any page
2. Press **Ctrl+D** tp bookmark
3. In the folder dropdown, select **📥 Auto Categorize**
4. Click **Save**

The extension detects the bookmark, classifies it, and moves it into the correct subfolder — usually within a second.

---

## File Structure

```
bookmark-ai/
├── manifest.json     ← extension config
├── constants.js      ← single source of truth: storage keys, AI config, rules, prompt
├── background.js     ← service worker: classification pipeline and bookmark listeners
├── popup.html        ← extension popup markup
├── script.js         ← popup UI logic
├── style.css         ← popup styles and design tokens
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Customization

### Add a new rule domain

Open `constants.js` and add a domain string to the relevant category in `RULES`:

```js
Dev: [
  "github.com",
  "yournewsite.com", // ← add here
  ...
]
```

### Add a new default category

Add to the `CATEGORIES` array in `constants.js`:

```js
const CATEGORIES = [
  "Dev", "AI", "Video", ...,
  "Gaming", // ← add here
];
```

### Change the AI model or provider

Everything is in `constants.js`:

```js
const AI_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const AI_MODEL   = "llama-3.1-8b-instant";
```

To switch to a different provider, update `AI_API_URL`, `AI_MODEL`, `AI_FETCH_CONFIG()`, and `AI_PARSE_RESPONSE()`.

### Change the AI prompt

Edit `buildAIPrompt()` in `constants.js`.

### Retheme the popup

Edit the CSS variables at the top of `style.css`:

```css
:root {
  --bg:      #0f0f13;
  --accent:  #7c6dff;
  /* ... */
}
```

---

## Permissions

| Permission | Reason |
|---|---|
| `bookmarks` | Read, create, move, and delete bookmarks |
| `storage` | Store settings, API key, category cache, and activity log |

---

## Dev Log

Originally built this using Gemini AI, but ran into an issue where the token limit was hit after just 11 requests — which didn’t really match what the docs said.

Instead of digging too deep into that, I just switch providers and move on. The main goal was to challenge myself to build an AI-powered Chrome extension anyway, so overall, mission accomplished.

---

## License

MIT
