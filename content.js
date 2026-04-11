// ═══════════════════════════════════════════════════════════════════════════
// CF Sorter — Content Script (injected into codeforces.com/problemset)
// Listens for messages from the popup and replaces the problem table rows.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  const ITEMS_PER_PAGE = 50;
  let currentPage = 1;
  let currentProblems = [];
  let solvedKeys = new Set();
  let showTagsForUnsolved = false;
  let isActive = false;

  // ─── INIT: Check for active state from previous load ───────────────
  // On page refresh, we re-fetch solved data and re-apply filters so that
  // newly solved problems are hidden automatically (if "Hide Solved" is on).
  chrome.storage.local.get(
    ["cf_sorter_active_state", "cf_sorter_config", "cf_cached_data", "cf_user_handle"],
    (data) => {
      const state = data.cf_sorter_active_state;
      const config = data.cf_sorter_config || {};
      const cachedData = data.cf_cached_data;
      const savedHandle = data.cf_user_handle;

      if (state && state.type === "CF_SORTER_UPDATE") {
        showTagsForUnsolved = !!state.showTagsForUnsolved;
        currentPage = 1;
        isActive = true;

        // Determine the user handle — from the page, saved handle, or state
        const pageHandle = getUserHandle();
        const handle = pageHandle || savedHandle || null;

        // We need to re-apply the same filters as the popup does, using the
        // full problem list (not the already-filtered snapshot), so that the
        // "Hide Solved" toggle works correctly with fresh solve data.
        const fullProblems = (cachedData && cachedData.problems) ? cachedData.problems : null;

        const doRender = () => {
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", renderTable);
          } else {
            renderTable();
          }
        };

        // If we have a handle, re-fetch solved status in the background
        if (handle) {
          chrome.runtime.sendMessage({ type: "GET_SOLVED", handle }, (solvedData) => {
            if (solvedData && solvedData.solvedKeys) {
              solvedKeys = new Set(solvedData.solvedKeys);
            } else {
              solvedKeys = new Set(state.solvedKeys || []);
            }

            // Re-apply filters if we have the full problem set and saved config
            if (fullProblems && config) {
              currentProblems = applyFiltersOnProblems(fullProblems, config, solvedKeys);
            } else {
              // Fallback: use the saved filtered list but update solved keys
              currentProblems = state.problems || [];
              if (config.hideSolved) {
                currentProblems = currentProblems.filter(
                  (p) => !solvedKeys.has(`${p.contestId}-${p.index}`)
                );
              }
            }

            // Update the stored active state so it stays current
            updateStoredActiveState();
            doRender();
          });
        } else {
          // No handle — just use stored data as-is
          currentProblems = state.problems || [];
          solvedKeys = new Set(state.solvedKeys || []);
          doRender();
        }
      }
    }
  );

  // ─── Re-apply popup filters on the full problem list ──────────────────
  function applyFiltersOnProblems(problems, config, solvedSet) {
    const minR = parseInt(config.ratingMin) || 0;
    const maxR = parseInt(config.ratingMax) || 9999;
    const activeDivs = (config.activeDivs && !config.activeDivs.includes("all"))
      ? config.activeDivs : null;
    const activeIndices = (config.activeIndices && !config.activeIndices.includes("all"))
      ? config.activeIndices : null;
    const activeTag = config.activeTag || "all";
    const query = (config.search || "").trim().toLowerCase();
    const hideSolved = !!config.hideSolved;
    const pureCFOnly = !!config.pureCFOnly;

    let filtered = problems.filter((p) => {
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
        const match = activeIndices.some((idx) => {
          if (idx === "G+") return pIdx >= "G";
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
        const haystack = `${p.contestId}${p.index} ${p.name} ${(p.tags||[]).join(" ")} ${p.contestName}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      // Hide solved
      if (hideSolved && solvedSet.has(`${p.contestId}-${p.index}`)) return false;

      // Pure CF
      if (pureCFOnly && !p.isStrict) return false;

      return true;
    });

    // Sort
    const sort = config.sort || "id-desc";
    filtered.sort((a, b) => {
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

    return filtered;
  }

  // ─── Keep stored active state in sync ─────────────────────────────────
  function updateStoredActiveState() {
    const payload = {
      type: "CF_SORTER_UPDATE",
      problems: currentProblems,
      solvedKeys: [...solvedKeys],
      showTagsForUnsolved: showTagsForUnsolved,
    };
    chrome.storage.local.set({ cf_sorter_active_state: payload });
  }

  // ─── Extract logged-in user handle from the Codeforces page ────────────
  function getUserHandle() {
    // Codeforces shows the handle in the header nav, inside an <a> tag
    // that links to /profile/<handle>
    const headerLinks = document.querySelectorAll("#header a, .lang-chooser a, .personal-sidebar a");
    for (const link of headerLinks) {
      const href = link.getAttribute("href") || "";
      const match = href.match(/^\/profile\/([A-Za-z0-9_.-]+)/);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  // ─── Locate the problem table on the page ──────────────────────────────
  function getProblemsTable() {
    return document.querySelector("table.problems");
  }

  // ─── Build a single <tr> that matches the native Codeforces style ──────
  function buildRow(p) {
    const isSolved = solvedKeys.has(`${p.contestId}-${p.index}`);
    const tr = document.createElement("tr");

    // Apply green background for solved problems (matching native CF styling)
    if (isSolved) {
      tr.style.cssText = "background-color: rgba(0, 180, 0, 0.08);";
      tr.className = "accepted-problem";
    }

    // Column 1: Problem ID (e.g. "2202B")
    const tdId = document.createElement("td");
    tdId.className = "id";
    const idLink = document.createElement("a");
    idLink.href = `/problemset/problem/${p.contestId}/${p.index}`;
    idLink.title = `${p.contestId}${p.index}`;
    idLink.textContent = `${p.contestId}${p.index}`;
    tdId.appendChild(idLink);
    tr.appendChild(tdId);

    // Column 2: Problem Name + tags
    const tdName = document.createElement("td");
    const nameDiv = document.createElement("div");
    nameDiv.style.cssText = "float:left;";
    const nameLink = document.createElement("a");
    nameLink.href = `/problemset/problem/${p.contestId}/${p.index}`;
    nameLink.style.cssText = "font-weight:bold;";
    nameLink.textContent = p.name;
    nameDiv.appendChild(nameLink);
    tdName.appendChild(nameDiv);

    // Tags: show if solved OR if user toggled "show tags for unsolved"
    const shouldShowTags = p.tags && p.tags.length > 0 && (isSolved || showTagsForUnsolved);
    if (shouldShowTags) {
      const tagDiv = document.createElement("div");
      tagDiv.style.cssText = "float:right; font-size:0.9em; color:#888; padding-top:3px;";
      tagDiv.textContent = p.tags.join(", ");
      tdName.appendChild(tagDiv);
    }

    // Clear floats
    const clearDiv = document.createElement("div");
    clearDiv.style.cssText = "clear:both;";
    tdName.appendChild(clearDiv);

    tr.appendChild(tdName);

    // Column 3: Solved indicator
    const tdSolvedIcon = document.createElement("td");
    tdSolvedIcon.style.cssText = "text-align:center; font-size:1.1em;";
    if (isSolved) {
      tdSolvedIcon.innerHTML = '<span style="color:#00b400;" title="Solved">✔</span>';
    }
    tr.appendChild(tdSolvedIcon);

    // Column 4: Rating
    const tdRating = document.createElement("td");
    tdRating.style.cssText = "text-align:center;";
    if (p.rating) {
      const ratingSpan = document.createElement("span");
      ratingSpan.className = "ProblemRating";
      ratingSpan.title = `Difficulty: ${p.rating}`;
      ratingSpan.textContent = p.rating;
      tdRating.appendChild(ratingSpan);
    }
    tr.appendChild(tdRating);

    // Column 5: Solved count
    const tdSolved = document.createElement("td");
    tdSolved.style.cssText = "text-align:center; font-size: 1.1em; color: #a0a0a0;";
    const solvedLink = document.createElement("a");
    solvedLink.href = `/problemset/status/${p.contestId}/problem/${p.index}`;
    solvedLink.title = `Solved by ${p.solvedCount || 0} people`;
    solvedLink.style.color = "inherit";
    solvedLink.innerHTML = `👤&nbsp;${p.solvedCount || 0}`;
    tdSolved.appendChild(solvedLink);
    tr.appendChild(tdSolved);

    return tr;
  }

  // ─── Render problems into the page table ───────────────────────────────
  function renderTable() {
    const table = getProblemsTable();
    if (!table) return;

    // Remove existing data rows (keep the header row)
    const rows = table.querySelectorAll("tr");
    rows.forEach((row, idx) => {
      if (idx > 0) row.remove();
    });

    const total = currentProblems.length;
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, total);
    const page = currentProblems.slice(start, end);

    const tbody = table.querySelector("tbody") || table;
    page.forEach((p) => {
      tbody.appendChild(buildRow(p));
    });

    renderPagePagination(totalPages);
    addBanner(total);
  }

  // ─── Add / update the "CF Sorter" banner above the table ───────────────
  function addBanner(total) {
    let banner = document.getElementById("cf-sorter-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "cf-sorter-banner";
      banner.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(79,160,255,0.3);
        border-radius: 8px;
        padding: 10px 16px;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-family: 'Segoe UI', sans-serif;
        box-shadow: 0 2px 12px rgba(0,0,0,0.25);
      `;
      const table = getProblemsTable();
      if (table && table.parentNode) {
        table.parentNode.insertBefore(banner, table);
      }
    }

    const solvedCount = currentProblems.filter(
      (p) => solvedKeys.has(`${p.contestId}-${p.index}`)
    ).length;

    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="background: linear-gradient(135deg,#4fa0ff,#a78bfa,#f472b6);
              -webkit-background-clip:text;-webkit-text-fill-color:transparent;
              font-weight:700;font-size:14px;">⚡ CF Sorter Active</span>
        <span style="color:#8b95a8;font-size:12px;">
          Showing <strong style="color:#4fa0ff;">${total.toLocaleString()}</strong> problems
          ${solvedCount > 0 ? `· <strong style="color:#00b400;">${solvedCount}</strong> solved` : ""}
        </span>
      </div>
      <button id="cf-sorter-reset" style="
        background: rgba(248,113,113,0.15); color:#f87171;
        border:1px solid rgba(248,113,113,0.3); border-radius:6px;
        padding:5px 12px; font-size:11px; font-weight:600;
        cursor:pointer; transition:0.2s;
      ">Reset to Default</button>
    `;

    document.getElementById("cf-sorter-reset").addEventListener("click", () => {
      isActive = false;
      chrome.storage.local.remove("cf_sorter_active_state", () => {
        banner.remove();
        window.location.reload();
      });
    });
  }

  // ─── Replace the native Codeforces pagination ──────────────────────────
  function renderPagePagination(totalPages) {
    let nativePagination = document.querySelector(".pagination");

    let paginationContainer = document.getElementById("cf-sorter-pagination");
    if (!paginationContainer) {
      paginationContainer = document.createElement("div");
      paginationContainer.id = "cf-sorter-pagination";
      paginationContainer.style.cssText = `
        display: flex; align-items: center; justify-content: center;
        gap: 4px; padding: 12px 0; margin-top: 8px;
      `;
      const table = getProblemsTable();
      if (table && table.parentNode) {
        table.parentNode.insertBefore(paginationContainer, table.nextSibling);
      }
    }

    // Hide native pagination
    if (nativePagination && nativePagination.id !== "cf-sorter-pagination") {
      nativePagination.style.display = "none";
    }

    if (totalPages <= 1) {
      paginationContainer.innerHTML = "";
      return;
    }

    paginationContainer.innerHTML = "";

    const btnStyle = (active) => `
      min-width:30px; height:30px; border-radius:6px;
      display:inline-flex; align-items:center; justify-content:center;
      font-size:13px; font-weight:${active ? "700" : "500"}; cursor:pointer;
      border: 1px solid ${active ? "rgba(79,160,255,0.5)" : "rgba(255,255,255,0.1)"};
      background: ${active ? "rgba(79,160,255,0.15)" : "rgba(255,255,255,0.04)"};
      color: ${active ? "#4fa0ff" : "#aab"};
      transition: 0.2s; margin: 0 2px;
    `;

    // Previous
    const prev = document.createElement("button");
    prev.textContent = "‹";
    prev.style.cssText = btnStyle(false);
    prev.disabled = currentPage === 1;
    if (prev.disabled) prev.style.opacity = "0.3";
    prev.addEventListener("click", () => {
      if (currentPage > 1) { currentPage--; renderTable(); }
    });
    paginationContainer.appendChild(prev);

    // Page numbers
    const pages = smartRange(currentPage, totalPages, 7);
    pages.forEach((pg) => {
      if (pg === "…") {
        const dots = document.createElement("span");
        dots.textContent = "…";
        dots.style.cssText = "color:#666;padding:0 4px;font-size:12px;";
        paginationContainer.appendChild(dots);
      } else {
        const btn = document.createElement("button");
        btn.textContent = pg;
        btn.style.cssText = btnStyle(pg === currentPage);
        btn.addEventListener("click", () => {
          currentPage = pg;
          renderTable();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
        paginationContainer.appendChild(btn);
      }
    });

    // Next
    const next = document.createElement("button");
    next.textContent = "›";
    next.style.cssText = btnStyle(false);
    next.disabled = currentPage === totalPages;
    if (next.disabled) next.style.opacity = "0.3";
    next.addEventListener("click", () => {
      if (currentPage < totalPages) { currentPage++; renderTable(); }
    });
    paginationContainer.appendChild(next);
  }

  function smartRange(current, total, windowSize) {
    const pages = [];
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, current - half);
    let end = Math.min(total, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);

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

  // ─── Listen for messages from the popup ────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "CF_SORTER_UPDATE") {
      currentProblems = msg.problems || [];
      solvedKeys = new Set(msg.solvedKeys || []);
      showTagsForUnsolved = !!msg.showTagsForUnsolved;
      currentPage = 1;
      isActive = true;
      renderTable();
      sendResponse({ ok: true });
    }

    if (msg.type === "CF_SORTER_PING") {
      const handle = getUserHandle();
      sendResponse({ active: true, handle: handle });
    }
  });

  console.log("[CF Sorter] Content script loaded on", window.location.href);
})();
