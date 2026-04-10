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
  chrome.storage.local.get("cf_sorter_active_state", (data) => {
    const state = data.cf_sorter_active_state;
    if (state && state.type === "CF_SORTER_UPDATE" && state.problems) {
      currentProblems = state.problems;
      solvedKeys = new Set(state.solvedKeys || []);
      showTagsForUnsolved = !!state.showTagsForUnsolved;
      currentPage = 1;
      isActive = true;

      // Ensure DOM is ready before rendering
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", renderTable);
      } else {
        renderTable();
      }
    }
  });

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
