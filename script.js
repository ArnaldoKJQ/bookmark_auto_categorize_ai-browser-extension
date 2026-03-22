// Sections:
//   1. Tab switching
//   2. Toggle (enable / disable)
//   3. Inbox status
//   4. Settings (load + save API key)
//   5. Categories grid
//   6. Activity log

// =============================================================================
// 1. TAB SWITCHING
// =============================================================================

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
  });
});

// =============================================================================
// 2. TOGGLE
// =============================================================================

const enabledToggle = document.getElementById("enabled-toggle");
const toggleStatus  = document.getElementById("toggle-status");

function setToggleUI(enabled) {
  toggleStatus.textContent   = enabled ? "ON" : "OFF";
  toggleStatus.style.color   = enabled ? "var(--green)" : "var(--muted)";
}

enabledToggle.addEventListener("change", () => {
  const enabled = enabledToggle.checked;
  setToggleUI(enabled);

  // Persist the change
  chrome.storage.local.get([SETTINGS_KEY], result => {
    const settings = result[SETTINGS_KEY] ?? {};
    settings.enabled = enabled;
    chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  });

  // Notify background to create or clear the inbox folder
  chrome.runtime.sendMessage(
    { type: enabled ? "TOGGLE_ON" : "TOGGLE_OFF" },
    () => updateInboxStatus()
  );
});

// =============================================================================
// 3. INBOX STATUS
// =============================================================================

function updateInboxStatus() {
  const el = document.getElementById("inbox-status");
  if (!el) return;

  chrome.storage.local.get([INBOX_ID_KEY, SETTINGS_KEY], result => {
    const enabled = result[SETTINGS_KEY]?.enabled === true;
    const id      = result[INBOX_ID_KEY];

    if (!enabled) {
      el.innerHTML = `<span class="status-dot off"></span> Toggle ON to create the <strong>${INBOX_FOLDER_TITLE}</strong> folder`;
    } else if (id) {
      el.innerHTML = `<span class="status-dot ok"></span> <strong>${INBOX_FOLDER_TITLE}</strong> folder is ready`;
    } else {
      el.innerHTML = `<span class="status-dot warn"></span> Folder missing — toggle OFF then ON to recreate`;
    }
  });
}

// =============================================================================
// 4. SETTINGS — load on open, save API key
// =============================================================================

chrome.storage.local.get([SETTINGS_KEY], result => {
  const settings = result[SETTINGS_KEY] ?? { apiKey: "", enabled: false };
  document.getElementById("api-key").value = settings.apiKey ?? "";
  enabledToggle.checked = settings.enabled === true;
  setToggleUI(enabledToggle.checked);
  updateInboxStatus();
});

document.getElementById("btn-save").addEventListener("click", () => {
  const apiKey = document.getElementById("api-key").value.trim();
  chrome.storage.local.get([SETTINGS_KEY], result => {
    const settings = result[SETTINGS_KEY] ?? {};
    settings.apiKey = apiKey;
    chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
      const msg = document.getElementById("save-msg");
      msg.classList.remove("hidden");
      setTimeout(() => msg.classList.add("hidden"), 2000);
    });
  });
});

// =============================================================================
// 5. CATEGORIES GRID
// Reads CATEGORIES from constants.js
// =============================================================================

const grid = document.getElementById("categories-grid");
CATEGORIES.forEach(cat => {
  const chip = document.createElement("span");
  chip.className   = "cat-chip";
  chip.textContent = cat;
  grid.appendChild(chip);
});

// =============================================================================
// 6. ACTIVITY LOG
// =============================================================================

function getFaviconUrl(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).origin}&sz=32`; }
  catch { return ""; }
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function methodClass(method) {
  if (method?.startsWith("rule"))  return "method-rule";
  if (method?.startsWith("ai"))    return "method-ai";
  if (method?.startsWith("cache")) return "method-cache";
  return "method-other";
}

function methodLabel(method) {
  if (method?.startsWith("rule"))  return "rule";
  if (method?.startsWith("ai"))    return "AI";
  if (method?.startsWith("cache")) return "cache";
  return method ?? "?";
}

function renderLog(log) {
  const container = document.getElementById("log-list");
  const countEl   = document.getElementById("log-count");

  countEl.textContent = `${log.length} bookmark${log.length !== 1 ? "s" : ""} categorized`;

  if (log.length === 0) {
    container.innerHTML = `
      <div class="log-empty">
        <div class="icon">📭</div>
        <div>No bookmarks yet.<br>Save into <strong>${INBOX_FOLDER_TITLE}</strong><br>to get started.</div>
      </div>`;
    return;
  }

  container.innerHTML = log.map(entry => {
    const favicon  = getFaviconUrl(entry.url);
    const title    = entry.title || entry.url;
    const hostname = (() => { try { return new URL(entry.url).hostname; } catch { return entry.url; } })();
    return `
      <div class="log-item">
        <img class="log-favicon" src="${favicon}" alt="" onerror="this.style.visibility='hidden'" />
        <div class="log-info">
          <div class="log-title" title="${entry.title}">${title}</div>
          <div class="log-url">${hostname}</div>
          <div class="log-meta">
            <span class="badge">${entry.category}</span>
            <span class="method-badge ${methodClass(entry.method)}">${methodLabel(entry.method)}</span>
          </div>
        </div>
        <div class="log-time">${timeAgo(entry.ts)}</div>
      </div>`;
  }).join("");
}

function loadLog() {
  chrome.storage.local.get([LOG_KEY], result => renderLog(result[LOG_KEY] ?? []));
}

document.getElementById("btn-clear").addEventListener("click", () => {
  chrome.storage.local.remove([LOG_KEY], () => renderLog([]));
});

loadLog();

// Live-refresh when a new bookmark is categorized while the popup is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[LOG_KEY]) {
    renderLog(changes[LOG_KEY].newValue ?? []);
  }
});
