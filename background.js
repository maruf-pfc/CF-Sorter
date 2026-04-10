// ─── Codeforces API Endpoints ────────────────────────────────────────────────
const API_PROBLEMS = "https://codeforces.com/api/problemset.problems";
const API_CONTESTS = "https://codeforces.com/api/contest.list";
const API_USER_STATUS = "https://codeforces.com/api/user.status";
const CACHE_KEY = "cf_cached_data";
const CACHE_TIMESTAMP_KEY = "cf_cache_ts";
const SOLVED_CACHE_KEY = "cf_solved_data";
const SOLVED_CACHE_TS_KEY = "cf_solved_ts";
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours
const SOLVED_CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes (more frequent for solve status)

// ─── Division Parser ─────────────────────────────────────────────────────────
function parseDivision(contestName) {
  const name = contestName.toLowerCase();
  const divs = [];

  if (name.includes("div. 1") || name.includes("div.1") || name.includes("division 1")) {
    divs.push("Div. 1");
  }
  if (name.includes("div. 2") || name.includes("div.2") || name.includes("division 2")) {
    divs.push("Div. 2");
  }
  if (name.includes("div. 3") || name.includes("div.3") || name.includes("division 3")) {
    divs.push("Div. 3");
  }
  if (name.includes("div. 4") || name.includes("div.4") || name.includes("division 4")) {
    divs.push("Div. 4");
  }
  if (name.includes("educational")) {
    divs.push("Educational");
  }
  if (name.includes("global")) {
    divs.push("Global");
  }

  if (divs.length === 0) {
    divs.push("Other");
  }
  return divs;
}

// ─── Fetch & Build Dataset ───────────────────────────────────────────────────
async function fetchAndCache() {
  try {
    const [problemsRes, contestsRes] = await Promise.all([
      fetch(API_PROBLEMS),
      fetch(API_CONTESTS),
    ]);

    const problemsJson = await problemsRes.json();
    const contestsJson = await contestsRes.json();

    if (problemsJson.status !== "OK" || contestsJson.status !== "OK") {
      throw new Error("Codeforces API returned non-OK status");
    }

    // Build contest → division map
    const contestMap = {};
    for (const contest of contestsJson.result) {
      contestMap[contest.id] = {
        name: contest.name,
        divisions: parseDivision(contest.name),
      };
    }

    // Build stats map
    const statsMap = {};
    if (problemsJson.result.problemStatistics) {
      for (const stat of problemsJson.result.problemStatistics) {
        statsMap[`${stat.contestId}-${stat.index}`] = stat.solvedCount;
      }
    }

    // Build enriched problem list
    const problems = problemsJson.result.problems.map((p) => {
      const contest = contestMap[p.contestId] || { name: "Unknown", divisions: ["Other"] };
      const nameLower = contest.name.toLowerCase();
      // Strict CF rounds are the regular ones, excluding sponsored names like "Squarepoint Challenge" or "Pinely Round"
      const isStrictCF = 
        nameLower.startsWith("codeforces round") ||
        nameLower.startsWith("educational codeforces round") ||
        nameLower.startsWith("codeforces global round");

      return {
        contestId: p.contestId,
        index: p.index,
        name: p.name,
        rating: p.rating || null,
        tags: p.tags || [],
        contestName: contest.name,
        divisions: contest.divisions,
        isStrict: isStrictCF,
        solvedCount: statsMap[`${p.contestId}-${p.index}`] || 0,
        url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
      };
    });

    const data = { problems, lastUpdated: Date.now() };
    await chrome.storage.local.set({
      [CACHE_KEY]: data,
      [CACHE_TIMESTAMP_KEY]: Date.now(),
    });

    console.log(`[CF Sorter] Cached ${problems.length} problems.`);
    return data;
  } catch (err) {
    console.error("[CF Sorter] Fetch error:", err);
    return null;
  }
}

// ─── Fetch User Solved Problems ──────────────────────────────────────────────
async function fetchSolvedProblems(handle) {
  if (!handle) return null;

  try {
    // Check cache first
    const stored = await chrome.storage.local.get([SOLVED_CACHE_KEY, SOLVED_CACHE_TS_KEY]);
    const cached = stored[SOLVED_CACHE_KEY];
    const ts = stored[SOLVED_CACHE_TS_KEY];

    if (cached && cached.handle === handle && ts && Date.now() - ts < SOLVED_CACHE_DURATION_MS) {
      console.log(`[CF Sorter] Serving solved set from cache for ${handle}.`);
      return cached;
    }

    console.log(`[CF Sorter] Fetching submissions for ${handle}…`);
    const res = await fetch(`${API_USER_STATUS}?handle=${handle}`);
    const json = await res.json();

    if (json.status !== "OK") {
      throw new Error(`user.status API error: ${json.comment || "unknown"}`);
    }

    // Build a set of solved problem keys "contestId-index"
    const solvedSet = [];
    const seen = new Set();

    for (const sub of json.result) {
      if (sub.verdict === "OK") {
        const key = `${sub.problem.contestId}-${sub.problem.index}`;
        if (!seen.has(key)) {
          seen.add(key);
          solvedSet.push(key);
        }
      }
    }

    const data = { handle, solvedKeys: solvedSet, fetchedAt: Date.now() };
    await chrome.storage.local.set({
      [SOLVED_CACHE_KEY]: data,
      [SOLVED_CACHE_TS_KEY]: Date.now(),
    });

    console.log(`[CF Sorter] Cached ${solvedSet.length} solved problems for ${handle}.`);
    return data;
  } catch (err) {
    console.error("[CF Sorter] Error fetching solved problems:", err);
    return null;
  }
}

// ─── Cache Check ─────────────────────────────────────────────────────────────
async function getCachedOrFetch() {
  const stored = await chrome.storage.local.get([CACHE_KEY, CACHE_TIMESTAMP_KEY]);
  const ts = stored[CACHE_TIMESTAMP_KEY];

  if (ts && Date.now() - ts < CACHE_DURATION_MS && stored[CACHE_KEY]) {
    console.log("[CF Sorter] Serving from cache.");
    return stored[CACHE_KEY];
  }

  console.log("[CF Sorter] Cache miss, fetching fresh data…");
  return await fetchAndCache();
}

// ─── Alarm for periodic refresh ──────────────────────────────────────────────
chrome.alarms.create("cf-refresh", { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cf-refresh") {
    fetchAndCache();
  }
});

// ─── Message Handler (popup requests data) ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_PROBLEMS") {
    getCachedOrFetch().then((data) => sendResponse(data));
    return true; // async
  }
  if (msg.type === "FORCE_REFRESH") {
    fetchAndCache().then((data) => sendResponse(data));
    return true;
  }
  if (msg.type === "GET_SOLVED") {
    fetchSolvedProblems(msg.handle).then((data) => sendResponse(data));
    return true;
  }
});

// Pre-fetch on install
chrome.runtime.onInstalled.addListener(() => {
  fetchAndCache();
});
