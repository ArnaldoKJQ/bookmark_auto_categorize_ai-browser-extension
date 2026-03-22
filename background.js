// Sections:
//   1. Bootstrap       — load constants.js via importScripts
//   2. Cache           — chrome.storage.local cache layer
//   3. AI              — Groq API fallback classifier
//   4. Rules           — fast domain-based matching
//   5. Settings        — read user settings
//   6. Inbox folder    — create and resolve the watched inbox folder
//   7. Logging         — activity log for the popup
//   8. Core            — classifyAndMove pipeline
//   9. Listeners       — chrome.bookmarks event handlers
//  10. Messages        — popup → background communication

// =============================================================================
// 1. BOOTSTRAP
// importScripts loads constants.js into the service worker scope,
// making all its variables (RULES, CATEGORIES, AI_*, etc.) available here.
// =============================================================================

importScripts("constants.js");

// =============================================================================
// 2. CACHE
// Caches url → category to avoid repeat rule checks and AI calls.
// =============================================================================

/**
 * @param {string} url
 * @returns {Promise<string|null>}
 */
function getCached(url) {
  return new Promise(resolve => {
    chrome.storage.local.get([CACHE_PREFIX + url], result => {
      resolve(result[CACHE_PREFIX + url] ?? null);
    });
  });
}

/**
 * @param {string} url
 * @param {string} category
 * @returns {Promise<void>}
 */
function setCache(url, category) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [CACHE_PREFIX + url]: category }, resolve);
  });
}

// =============================================================================
// 3. AI
// Called only when rules + cache both miss.
// Config lives in constants.js: AI_API_URL, AI_MODEL,
// AI_FETCH_CONFIG(), AI_PARSE_RESPONSE(), buildAIPrompt()
// =============================================================================

/**
 * @param {string} url
 * @param {string} title
 * @param {string} apiKey
 * @returns {Promise<string>} category name
 */
async function classifyWithAI(url, title, apiKey) {
  if (!apiKey) return "Other";

  const prompt = buildAIPrompt(url, title);
  const { url: fetchUrl, options } = AI_FETCH_CONFIG(prompt, apiKey);

  try {
    const res = await fetch(fetchUrl, options);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[BookmarkAI] AI error:", res.status, err?.error?.message ?? err);
      return "Other";
    }

    const data  = await res.json();
    const raw   = AI_PARSE_RESPONSE(data);
    const clean = raw.replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, 20);
    if (!clean) return "Other";

    // Title Case
    return clean.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  } catch (e) {
    console.error("[BookmarkAI] AI fetch failed:", e);
    return "Other";
  }
}

// =============================================================================
// 4. RULES
// Domain-based matching — fast, free, no AI call.
// RULES object lives in constants.js.
// =============================================================================

/**
 * @param {string} url
 * @returns {string|null} category name, or null if no match
 */
function matchRule(url) {
  if (!url) return null;
  const lower = url.toLowerCase();
  for (const [category, domains] of Object.entries(RULES)) {
    if (domains.some(d => lower.includes(d))) return category;
  }
  return null;
}

// =============================================================================
// 5. SETTINGS
// =============================================================================

/**
 * @returns {Promise<{ apiKey: string, enabled: boolean }>}
 */
function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get([SETTINGS_KEY], result => {
      resolve(result[SETTINGS_KEY] ?? { apiKey: "", enabled: false });
    });
  });
}

// =============================================================================
// 6. INBOX FOLDER
// The folder the user saves bookmarks into. The extension watches it and
// moves bookmarks into category subfolders inside it.
// =============================================================================

/** In-memory cache — prevents storage round-trip race on first bookmark after toggle ON */
let _inboxIdMemory = null;

/**
 * Verify a folder ID still exists in the bookmarks tree.
 * @param {string} id
 * @returns {Promise<string|null>}
 */
function verifyFolderId(id) {
  return new Promise(resolve => {
    chrome.bookmarks.get(id, nodes => {
      if (chrome.runtime.lastError || !nodes?.length) {
        _inboxIdMemory = null;
        chrome.storage.local.remove([INBOX_ID_KEY]);
        return resolve(null);
      }
      resolve(id);
    });
  });
}

/**
 * Resolve the inbox folder ID. Checks memory first, then storage.
 * @returns {Promise<string|null>}
 */
function getInboxId() {
  if (_inboxIdMemory) return verifyFolderId(_inboxIdMemory);

  return new Promise(resolve => {
    chrome.storage.local.get([INBOX_ID_KEY], result => {
      const id = result[INBOX_ID_KEY];
      if (!id) return resolve(null);
      verifyFolderId(id).then(validId => {
        if (validId) _inboxIdMemory = validId;
        resolve(validId);
      });
    });
  });
}

/**
 * Create the inbox folder if it doesn't exist, or reuse an existing one.
 * Sets both memory cache and storage immediately so the first bookmark works.
 * @returns {Promise<string>} folder id
 */
function createInboxFolder() {
  return new Promise(resolve => {
    chrome.bookmarks.search({ title: INBOX_FOLDER_TITLE }, results => {
      const found = results.find(r => !r.url);
      if (found) {
        _inboxIdMemory = found.id;
        chrome.storage.local.set({ [INBOX_ID_KEY]: found.id });
        return resolve(found.id);
      }
      chrome.bookmarks.create({ title: INBOX_FOLDER_TITLE }, folder => {
        _inboxIdMemory = folder.id;
        chrome.storage.local.set({ [INBOX_ID_KEY]: folder.id });
        console.log("[BookmarkAI] Inbox folder created:", folder.id);
        resolve(folder.id);
      });
    });
  });
}

/**
 * Get or create a category subfolder inside the inbox folder.
 * @param {string} categoryName
 * @returns {Promise<string|null>} folder id
 */
async function getOrCreateCategoryFolder(categoryName) {
  const inboxId = await getInboxId();
  if (!inboxId) return null;

  return new Promise(resolve => {
    chrome.bookmarks.getChildren(inboxId, children => {
      const existing = children.find(c => !c.url && c.title === categoryName);
      if (existing) return resolve(existing.id);
      chrome.bookmarks.create({ parentId: inboxId, title: categoryName }, folder => {
        resolve(folder.id);
      });
    });
  });
}

// =============================================================================
// 7. LOGGING
// Activity log shown in the popup Recent tab.
// =============================================================================

/**
 * @param {{ url: string, title: string, category: string, method: string }} entry
 * @returns {Promise<void>}
 */
function appendLog(entry) {
  return new Promise(resolve => {
    chrome.storage.local.get([LOG_KEY], result => {
      const log = result[LOG_KEY] ?? [];
      log.unshift({ ...entry, ts: Date.now() });
      if (log.length > MAX_LOG_ENTRIES) log.length = MAX_LOG_ENTRIES;
      chrome.storage.local.set({ [LOG_KEY]: log }, resolve);
    });
  });
}

// =============================================================================
// 8. CORE — classify and move pipeline
// =============================================================================

/** Blocks re-entry for a bookmark currently being processed */
const processing = new Set();

/**
 * IDs we recently moved — used to ignore echo onMoved events fired by Brave
 * after our own chrome.bookmarks.remove/create calls.
 * @type {Map<string, number>}
 */
const recentlyMoved = new Map();

/**
 * Full pipeline: cache → rules → AI → delete original → recreate in category folder.
 * Uses delete+recreate instead of move to prevent Brave sync from moving it back.
 *
 * @param {string} id    bookmark id
 * @param {string} url
 * @param {string} title
 */
async function classifyAndMove(id, url, title) {
  if (processing.has(id)) return;
  processing.add(id);

  try {
    const { apiKey } = await getSettings();
    let method = "cache";

    let category = await getCached(url);

    if (!category) {
      category = matchRule(url);
      method = "rule";
    }

    if (!category) {
      category = await classifyWithAI(url, title, apiKey);
      method = "ai";
    }

    await setCache(url, category);

    const categoryFolderId = await getOrCreateCategoryFolder(category);
    if (!categoryFolderId) {
      console.error("[BookmarkAI] Could not get/create folder for:", category);
      return;
    }

    // Mark before removing so echo events from Brave are ignored
    recentlyMoved.set(id, Date.now());
    setTimeout(() => recentlyMoved.delete(id), RECENTLY_MOVED_TTL_MS);

    await chrome.bookmarks.remove(id);
    await chrome.bookmarks.create({ parentId: categoryFolderId, title, url });

    console.log(`[BookmarkAI] "${title}" → ${INBOX_FOLDER_TITLE}/${category} (via ${method})`);
    await appendLog({ url, title, category, method });

  } catch (err) {
    console.error("[BookmarkAI] classifyAndMove error:", err);
  } finally {
    processing.delete(id);
  }
}

// =============================================================================
// 9. LISTENERS
// Two events cover all Brave bookmark-save flows:
//   onMoved   — Brave saves to Bar first, then moves to selected folder
//   onCreated — Brave creates directly in the selected folder (less common)
// =============================================================================

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  if (recentlyMoved.has(id)) return; // our own move, ignore

  const inboxId = await getInboxId();
  if (!inboxId || moveInfo.parentId !== inboxId) return;

  const { enabled } = await getSettings();
  if (!enabled) return;

  chrome.bookmarks.get(id, async (nodes) => {
    if (chrome.runtime.lastError || !nodes?.length) return;
    const { url, title } = nodes[0];
    if (!url) return;
    await classifyAndMove(id, url, title ?? "");
  });
});

chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (!bookmark.url) return;

  const inboxId = await getInboxId();
  if (!inboxId || bookmark.parentId !== inboxId) return;

  const { enabled } = await getSettings();
  if (!enabled) return;

  await classifyAndMove(id, bookmark.url, bookmark.title ?? "");
});

// =============================================================================
// 10. MESSAGES  (popup → background)
// =============================================================================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case "TOGGLE_ON":
      _inboxIdMemory = null; // clear stale cache before (re)creating
      createInboxFolder().then(id => {
        console.log("[BookmarkAI] TOGGLE_ON: inbox ready id=", id);
        sendResponse({ ok: true, inboxId: id });
      });
      return true; // keep channel open for async response

    case "TOGGLE_OFF":
      _inboxIdMemory = null;
      sendResponse({ ok: true });
      break;
  }
});

console.log("[BookmarkAI] Service worker started.");
