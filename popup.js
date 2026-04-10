// ═══════════════════════════════════════════════════════════════════════════
// CF Sorter — Popup Logic
// ═══════════════════════════════════════════════════════════════════════════

const ITEMS_PER_PAGE = 50;

let allProblems = [];
let filteredProblems = [];
let currentPage = 1;
let showTags = false;
let hideSolved = false;
let pureCFOnly = false;
let cfTabId = null;
let solvedKeysSet = new Set(); // Set of "contestId-index" strings
let userHandle = null;

// ─── Config State (to persist UI settings) ───────────────────────────────
let config = {
  ratingMin: "",
  ratingMax: "",
  search: "",
  sort: "id-desc",
  activeDivs: ["all"],
  activeIndices: ["all"],
  activeTag: "all",
  showTags: false,
  hideSolved: false,
  pureCFOnly: false
};


// ─── DOM References ──────────────────────────────────────────────────────
const $list = document.getElementById("problem-list");
const $loading = document.getElementById("loading-state");
const $empty = document.getElementById("empty-state");
const $error = document.getElementById("error-state");
const $count = document.getElementById("result-count");
const $pagination = document.getElementById("pagination");
const $ratingMin = document.getElementById("rating-min");
const $ratingMax = document.getElementById("rating-max");
const $divPills = document.getElementById("division-pills");
const $indexPills = document.getElementById("index-pills");
const $tagSelect = document.getElementById("tag-select");
const $sortSelect = document.getElementById("sort-select");
const $searchInput = document.getElementById("search-input");
const $refresh = document.getElementById("btn-refresh");
const $toggleTags = document.getElementById("toggle-tags");
const $toggleHideSolved = document.getElementById("toggle-hide-solved");
const $togglePure = document.getElementById("toggle-pure");
const $syncStatus = document.getElementById("sync-status");
const $handleInput = document.getElementById("handle-input");
const $handleStatus = document.getElementById("handle-status");

// ─── Rating → CSS class ─────────────────────────────────────────────────
function ratingClass(r) {
  if (r === null || r === undefined) return "rating-unrated";
  if (r < 1200) return "rating-newbie";
  if (r < 1400) return "rating-pupil";
  if (r < 1600) return "rating-specialist";
  if (r < 1900) return "rating-expert";
  if (r < 2100) return "rating-cm";
  if (r < 2300) return "rating-master";
  if (r < 2400) return "rating-im";
  if (r < 2600) return "rating-gm";
  if (r < 3000) return "rating-igm";
  return "rating-legendary";
}

// ─── Division → tag class ────────────────────────────────────────────────
function divTagClass(div) {
  if (div.includes("1")) return "div-tag-1";
  if (div.includes("2")) return "div-tag-2";
  if (div.includes("3")) return "div-tag-3";
  if (div.includes("4")) return "div-tag-4";
  if (div.includes("Edu")) return "div-tag-edu";
  if (div.includes("Global")) return "div-tag-global";
  return "div-tag-other";
}

// ─── Is problem solved? ─────────────────────────────────────────────────
function isSolved(p) {
  return solvedKeysSet.has(`${p.contestId}-${p.index}`);
}

// ─── Get active divisions ────────────────────────────────────────────────
function getActiveDivisions() {
  const pills = [...$divPills.querySelectorAll(".pill.active")];
  const divs = pills.map((p) => p.dataset.div);
  if (divs.includes("all")) return null;
  return divs;
}

// ─── Get active indices ──────────────────────────────────────────────────
function getActiveIndices() {
  if (!$indexPills) return null;
  const pills = [...$indexPills.querySelectorAll(".pill.active")];
  const indices = pills.map((p) => p.dataset.index);
  if (indices.includes("all")) return null;
  return indices;
}

// ─── Detect if active tab is a Codeforces problemset page ────────────────
async function detectCfTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes("codeforces.com/problemset")) {
      cfTabId = tab.id;
      try {
        const resp = await chrome.tabs.sendMessage(cfTabId, { type: "CF_SORTER_PING" });
        showSyncStatus(true);
        // If the content script detected a handle, use it
        if (resp && resp.handle) {
          userHandle = resp.handle;
          if ($handleInput) $handleInput.value = resp.handle;
          updateHandleStatus("auto");
        }
        return true;
      } catch {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: cfTabId },
            files: ["content.js"],
          });
          // Try pinging again after injection
          try {
            const resp = await chrome.tabs.sendMessage(cfTabId, { type: "CF_SORTER_PING" });
            if (resp && resp.handle) {
              userHandle = resp.handle;
              if ($handleInput) $handleInput.value = resp.handle;
              updateHandleStatus("auto");
            }
          } catch { /* ignore */ }
          showSyncStatus(true);
          return true;
        } catch {
          cfTabId = null;
          showSyncStatus(false);
          return false;
        }
      }
    }
  } catch { /* ignore */ }
  cfTabId = null;
  showSyncStatus(false);
  return false;
}

// ─── Show/hide sync status badge ─────────────────────────────────────────
function showSyncStatus(synced) {
  if (!$syncStatus) return;
  if (synced) {
    $syncStatus.classList.remove("hidden");
    $syncStatus.classList.add("synced");
    $syncStatus.innerHTML = `
      <span class="sync-dot"></span>
      <span>Synced to Codeforces tab</span>
    `;
  } else {
    $syncStatus.classList.remove("synced");
    $syncStatus.classList.add("hidden");
  }
}

// ─── Update handle status indicator ──────────────────────────────────────
function updateHandleStatus(mode) {
  if (!$handleStatus) return;
  if (mode === "auto") {
    $handleStatus.textContent = "✓ detected";
    $handleStatus.className = "handle-status detected";
  } else if (mode === "loading") {
    $handleStatus.textContent = "loading…";
    $handleStatus.className = "handle-status loading";
  } else if (mode === "loaded") {
    $handleStatus.textContent = `✓ ${solvedKeysSet.size} solved`;
    $handleStatus.className = "handle-status detected";
  } else if (mode === "error") {
    $handleStatus.textContent = "✗ not found";
    $handleStatus.className = "handle-status error";
  } else {
    $handleStatus.textContent = "";
    $handleStatus.className = "handle-status";
  }
}

// ─── Fetch solved problems for a handle ──────────────────────────────────
async function loadSolvedProblems(handle) {
  if (!handle) {
    solvedKeysSet = new Set();
    updateHandleStatus("");
    applyFilters();
    return;
  }

  updateHandleStatus("loading");

  chrome.runtime.sendMessage({ type: "GET_SOLVED", handle }, (data) => {
    if (data && data.solvedKeys) {
      solvedKeysSet = new Set(data.solvedKeys);
      updateHandleStatus("loaded");
    } else {
      solvedKeysSet = new Set();
      updateHandleStatus("error");
    }
    applyFilters();
  });
}

// ─── Send filtered problems to the content script on the CF tab ──────────
async function sendToContentScript() {
  const payload = {
    type: "CF_SORTER_UPDATE",
    problems: filteredProblems,
    solvedKeys: [...solvedKeysSet],
    showTagsForUnsolved: showTags,
  };

  // Save the active state to storage so content.js can pick it up on reload
  chrome.storage.local.set({ cf_sorter_active_state: payload });

  if (!cfTabId) return;
  try {
    await chrome.tabs.sendMessage(cfTabId, payload);
  } catch {
    cfTabId = null;
    showSyncStatus(false);
  }
}

// ─── Save & Load Config ──────────────────────────────────────────────────
function saveConfig() {
  config = {
    ratingMin: $ratingMin.value,
    ratingMax: $ratingMax.value,
    search: $searchInput.value,
    sort: $sortSelect.value,
    activeDivs: [...$divPills.querySelectorAll(".pill.active")].map(p => p.dataset.div),
    activeIndices: $indexPills ? [...$indexPills.querySelectorAll(".pill.active")].map(p => p.dataset.index) : ["all"],
    activeTag: $tagSelect ? $tagSelect.value : "all",
    showTags,
    hideSolved,
    pureCFOnly
  };
  chrome.storage.local.set({ cf_sorter_config: config });
}

async function loadConfig() {
  const data = await chrome.storage.local.get("cf_sorter_config");
  if (data.cf_sorter_config) {
    config = { ...config, ...data.cf_sorter_config };
  }

  // Restore UI
  $ratingMin.value = config.ratingMin;
  $ratingMax.value = config.ratingMax;
  $searchInput.value = config.search;
  $sortSelect.value = config.sort;
  showTags = config.showTags;
  hideSolved = config.hideSolved;
  pureCFOnly = config.pureCFOnly;

  $toggleTags.classList.toggle("on", showTags);
  $toggleHideSolved.classList.toggle("on", hideSolved);
  if ($togglePure) $togglePure.classList.toggle("on", pureCFOnly);

  if (!config.activeIndices) config.activeIndices = ["all"]; // fallback
  if (!config.activeTag) config.activeTag = "all";
  if ($tagSelect) $tagSelect.value = config.activeTag;

  $divPills.querySelectorAll(".pill").forEach((p) => {
    p.classList.toggle("active", config.activeDivs.includes(p.dataset.div));
  });
  if ($indexPills) {
    $indexPills.querySelectorAll(".pill").forEach((p) => {
      p.classList.toggle("active", config.activeIndices.includes(p.dataset.index));
    });
  }
}

// ─── Filter & Sort ───────────────────────────────────────────────────────
function applyFilters() {
  const minR = parseInt($ratingMin.value) || 0;
  const maxR = parseInt($ratingMax.value) || 9999;
  const activeDivs = getActiveDivisions();
  const activeIndices = getActiveIndices();
  const activeTag = $tagSelect ? $tagSelect.value : "all";
  const query = $searchInput.value.trim().toLowerCase();

  filteredProblems = allProblems.filter((p) => {
    // Rating
    const r = p.rating || 0;
    if (r < minR || r > maxR) return false;

    // Division
    if (activeDivs) {
      const match = p.divisions.some((d) => activeDivs.includes(d));
      if (!match) return false;
    }

    // Index
    if (activeIndices) {
      const pIdx = (p.index || "").toUpperCase();
      const match = activeIndices.some(idx => {
        if (idx === "G+") {
          return pIdx >= "G"; 
        }
        return pIdx.startsWith(idx);
      });
      if (!match) return false;
    }

    // Tag
    if (activeTag !== "all") {
      if (!p.tags || !p.tags.includes(activeTag)) return false;
    }

    // Search
    if (query) {
      const haystack = `${p.contestId}${p.index} ${p.name} ${p.tags.join(" ")} ${p.contestName}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    // Hide solved
    if (hideSolved && isSolved(p)) return false;

    // Pure CF
    if (pureCFOnly && !p.isStrict) return false;

    return true;
  });

  // Sort
  const sort = $sortSelect.value;
  filteredProblems.sort((a, b) => {
    switch (sort) {
      case "rating-asc":  return (a.rating || 0) - (b.rating || 0);
      case "rating-desc": return (b.rating || 0) - (a.rating || 0);
      case "name-asc":    return a.name.localeCompare(b.name);
      case "name-desc":   return b.name.localeCompare(a.name);
      case "solved-desc": return (b.solvedCount || 0) - (a.solvedCount || 0) || (b.contestId - a.contestId);
      case "solved-asc":  return (a.solvedCount || 0) - (b.solvedCount || 0) || (b.contestId - a.contestId);
      case "id-desc":     return b.contestId - a.contestId || b.index.localeCompare(a.index);
      case "id-asc":      return a.contestId - b.contestId || a.index.localeCompare(b.index);
      default: return 0;
    }
  });

  saveConfig();
  currentPage = 1;
  render();
  sendToContentScript();
}

// ─── Render ──────────────────────────────────────────────────────────────
function render() {
  $list.querySelectorAll(".problem-card").forEach((el) => el.remove());

  const total = filteredProblems.length;
  $count.textContent = total.toLocaleString();

  if (total === 0) {
    $loading.classList.add("hidden");
    $empty.classList.remove("hidden");
    $pagination.classList.add("hidden");
    return;
  }

  $loading.classList.add("hidden");
  $empty.classList.add("hidden");
  $error.classList.add("hidden");

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, total);
  const page = filteredProblems.slice(start, end);

  const fragment = document.createDocumentFragment();

  page.forEach((p, i) => {
    const a = document.createElement("a");
    a.href = p.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "problem-card" + (isSolved(p) ? " solved" : "");
    a.style.animationDelay = `${i * 20}ms`;

    const rClass = ratingClass(p.rating);
    const divDisplay = p.divisions[0] || "Other";
    const dtClass = divTagClass(divDisplay);

    // Smart tags: always show for solved, only if toggle ON for unsolved
    const solved = isSolved(p);
    const shouldShowTags = p.tags.length > 0 && (solved || showTags);

    let tagsHtml = "";
    if (shouldShowTags) {
      tagsHtml = `<div class="problem-tags">${p.tags.map((t) => `<span class="problem-tag">${t}</span>`).join("")}</div>`;
    }

    // Solved indicator
    const solvedIcon = solved
      ? '<span class="solved-check" title="Solved">✔</span>'
      : '';

    a.innerHTML = `
      <div class="problem-rating-badge ${rClass}">${p.rating || "?"}</div>
      <div class="problem-info">
        <div class="problem-name">${p.contestId}${p.index}. ${escapeHtml(p.name)}</div>
        <div class="problem-meta">
          ${escapeHtml(p.contestName)}
          <span style="font-size:0.9em; margin-left:8px; color:rgba(255,255,255,0.4);" title="Solved by ${p.solvedCount || 0} people">👤 ${p.solvedCount || 0}</span>
        </div>
        ${tagsHtml}
      </div>
      ${solvedIcon}
      <span class="problem-division-tag ${dtClass}">${divDisplay}</span>
      <span class="problem-arrow">›</span>
    `;

    fragment.appendChild(a);
  });

  $list.appendChild(fragment);
  $list.scrollTop = 0;
  renderPagination(totalPages);
}

function escapeHtml(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}

// ─── Pagination ──────────────────────────────────────────────────────────
function renderPagination(totalPages) {
  if (totalPages <= 1) {
    $pagination.classList.add("hidden");
    return;
  }
  $pagination.classList.remove("hidden");
  $pagination.innerHTML = "";

  const prev = document.createElement("button");
  prev.className = "page-btn";
  prev.textContent = "‹";
  prev.disabled = currentPage === 1;
  prev.addEventListener("click", () => { currentPage--; render(); });
  $pagination.appendChild(prev);

  const pages = smartPageRange(currentPage, totalPages, 5);
  pages.forEach((pg) => {
    if (pg === "…") {
      const dots = document.createElement("span");
      dots.className = "page-info";
      dots.textContent = "…";
      $pagination.appendChild(dots);
    } else {
      const btn = document.createElement("button");
      btn.className = `page-btn ${pg === currentPage ? "active" : ""}`;
      btn.textContent = pg;
      btn.addEventListener("click", () => { currentPage = pg; render(); });
      $pagination.appendChild(btn);
    }
  });

  const next = document.createElement("button");
  next.className = "page-btn";
  next.textContent = "›";
  next.disabled = currentPage === totalPages;
  next.addEventListener("click", () => { currentPage++; render(); });
  $pagination.appendChild(next);
}

function smartPageRange(current, total, window) {
  const pages = [];
  const half = Math.floor(window / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(total, start + window - 1);
  start = Math.max(1, end - window + 1);

  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("…");
  }
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total) {
    if (end < total - 1) pages.push("…");
    pages.push(total);
  }
  return pages;
}

// ─── Division Pill Toggle Logic ──────────────────────────────────────────
$divPills.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill) return;

  const div = pill.dataset.div;

  if (div === "all") {
    $divPills.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
  } else {
    $divPills.querySelector('[data-div="all"]').classList.remove("active");
    pill.classList.toggle("active");

    const anyActive = $divPills.querySelectorAll(".pill.active").length;
    if (!anyActive) {
      $divPills.querySelector('[data-div="all"]').classList.add("active");
    }
  }

  applyFilters();
});

// ─── Index Pill Toggle Logic ─────────────────────────────────────────────
if ($indexPills) {
  $indexPills.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;

    const index = pill.dataset.index;

    if (index === "all") {
      $indexPills.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
    } else {
      $indexPills.querySelector('[data-index="all"]').classList.remove("active");
      pill.classList.toggle("active");

      const anyActive = $indexPills.querySelectorAll(".pill.active").length;
      if (!anyActive) {
        $indexPills.querySelector('[data-index="all"]').classList.add("active");
      }
    }

    applyFilters();
  });
}

// ─── Event Listeners ─────────────────────────────────────────────────────
let debounceTimer;
function debounced(fn, delay = 300) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, delay);
}

$ratingMin.addEventListener("input", () => debounced(applyFilters));
$ratingMax.addEventListener("input", () => debounced(applyFilters));
$sortSelect.addEventListener("change", applyFilters);
if ($tagSelect) $tagSelect.addEventListener("change", applyFilters);
$searchInput.addEventListener("input", () => debounced(applyFilters));

// Tags toggle: show tags for unsolved problems
$toggleTags.addEventListener("click", () => {
  showTags = !showTags;
  $toggleTags.classList.toggle("on", showTags);
  saveConfig();
  render();
  sendToContentScript();
});

// Hide solved toggle
$toggleHideSolved.addEventListener("click", () => {
  hideSolved = !hideSolved;
  $toggleHideSolved.classList.toggle("on", hideSolved);
  applyFilters();
});

// Pure CF toggle
if ($togglePure) {
  $togglePure.addEventListener("click", () => {
    pureCFOnly = !pureCFOnly;
    $togglePure.classList.toggle("on", pureCFOnly);
    applyFilters();
  });
}

// Handle input — debounce before fetching
let handleDebounce;
$handleInput.addEventListener("input", () => {
  clearTimeout(handleDebounce);
  handleDebounce = setTimeout(() => {
    const handle = $handleInput.value.trim();
    if (handle) {
      userHandle = handle;
      // Save the handle for next time
      chrome.storage.local.set({ cf_user_handle: handle });
      loadSolvedProblems(handle);
    } else {
      userHandle = null;
      solvedKeysSet = new Set();
      updateHandleStatus("");
      applyFilters();
    }
  }, 600);
});

$refresh.addEventListener("click", () => {
  $refresh.classList.add("refreshing");
  chrome.runtime.sendMessage({ type: "FORCE_REFRESH" }, (data) => {
    $refresh.classList.remove("refreshing");
    if (data && data.problems) {
      allProblems = data.problems;
      applyFilters();
    }
  });
});

// ─── Initial Data Load ──────────────────────────────────────────────────
async function init() {
  // Restore config state first
  await loadConfig();

  // Detect if we're on a CF tab (also auto-detects handle)
  await detectCfTab();

  // Load saved handle if we didn't auto-detect one
  if (!userHandle) {
    const stored = await chrome.storage.local.get("cf_user_handle");
    if (stored.cf_user_handle) {
      userHandle = stored.cf_user_handle;
      if ($handleInput) $handleInput.value = userHandle;
    }
  }

  // Load problems
  chrome.runtime.sendMessage({ type: "GET_PROBLEMS" }, (data) => {
    if (data && data.problems) {
      allProblems = data.problems;
      $loading.classList.add("hidden");

      // If we have a handle, load solved before applying filters
      if (userHandle) {
        loadSolvedProblems(userHandle);
      } else {
        applyFilters();
      }
    } else {
      $loading.classList.add("hidden");
      $error.classList.remove("hidden");
    }
  });
}

init();
