# ⚡ CF Sorter — Codeforces Problem Filter & Sorter

A powerful Chrome extension that supercharges your [Codeforces](https://codeforces.com) problem-solving workflow. Filter, sort, and browse the entire Codeforces problemset directly from your browser toolbar — with results synced live to the Codeforces website.

![Chrome Extension](https://img.shields.io/badge/Platform-Chrome_Extension-blue?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![Version](https://img.shields.io/badge/Version-1.1.0-purple)

---

## 📸 Overview

CF Sorter provides a premium dark-themed popup interface with glassmorphism aesthetics. It fetches all Codeforces problems and contest metadata via the official API, enriches them with division, tag, and solve-count data, and lets you slice through thousands of problems with a rich set of filters — all persisted across sessions.

---

## ✨ Features

### 🔍 Filtering

#### Rating Range Filter
- Set a **minimum** and **maximum** rating (800–3500) to narrow problems by difficulty.
- Inputs are debounced for a smooth experience.

#### Tag Filter
- Filter problems by a specific algorithmic **tag** from a dropdown containing **35 official Codeforces tags**:
  - `2-sat`, `binary search`, `bitmasks`, `brute force`, `chinese theorem`, `combinatorics`, `constructive algorithms`, `data structures`, `dfs and similar`, `divide and conquer`, `dp`, `dsu`, `expression parsing`, `fft`, `flows`, `games`, `geometry`, `graphs`, `greedy`, `hashing`, `implementation`, `interactive`, `math`, `matrices`, `meet-in-the-middle`, `number theory`, `probabilities`, `schedules`, `shortest paths`, `sortings`, `string suffix structures`, `strings`, `ternary search`, `trees`, `two pointers`

#### Problem Index Filter (A / B / C / D / E / F / G+)
- Filter by problem **position** within a contest.
- Select one or multiple indices simultaneously (multi-select pill buttons).
- Supports sub-indices: selecting **A** matches `A`, `A1`, `A2`, etc.
- **G+** captures all problems from G onward (G, H, I, …) for the harder end of contests.

#### Division Filter
- Filter by contest **division** using pill-style toggle buttons:
  - **Div. 1**, **Div. 2**, **Div. 3**, **Div. 4**
  - **Educational** (Edu rounds)
  - **Global** (Global rounds)
- Multi-select supported — combine multiple divisions in one view.

#### Pure CF Toggle
- Enable to **hide sponsored and non-standard rounds** (e.g., Pinely Round, EPIC Institute, Squarepoint Challenge).
- Shows only official Codeforces rounds, Educational rounds, and Global rounds.

#### Hide Solved Toggle
- When enabled, **hides problems you have already solved**, so you only see unsolved ones.
- Requires a Codeforces handle to be set (see Handle Integration below).

#### Text Search
- **Real-time search** across problem name, contest name, problem ID, and tags.
- Debounced input for performance.

---

### 📊 Sorting

Sort the filtered problem list by any of the following criteria via a dropdown:

| Sort Option     | Description                                    |
|-----------------|------------------------------------------------|
| **Rating ↑**    | Lowest difficulty first                        |
| **Rating ↓**    | Highest difficulty first                       |
| **Name A→Z**    | Alphabetical order                             |
| **Name Z→A**    | Reverse alphabetical order                     |
| **Most Solved**  | Problems solved by the most people first       |
| **Least Solved** | Problems solved by the fewest people first     |
| **Newest**       | Most recent contest problems first (default)   |
| **Oldest**       | Oldest contest problems first                  |

---

### 👤 User Handle Integration

#### Auto-Detection
- If you are **logged into Codeforces** and have the problemset page open, the extension automatically detects your handle from the page header.
- Shown with a **✓ detected** status badge.

#### Manual Entry
- Type any Codeforces handle into the handle input field.
- The extension fetches all accepted submissions and builds a **solved problem set**.
- Status indicator shows: **loading…** → **✓ N solved** (or **✗ not found** on error).

#### Solved Problem Tracking
- Problems you have solved are highlighted with a **green left border** and a **✔** checkmark in the popup.
- On the Codeforces page, solved problems get a green-tinted row background.
- Your handle is **persisted** across sessions — no need to re-enter it.

---

### 🏷️ Tags Visibility Toggle

- **Tags OFF (default):** Tags are hidden for unsolved problems to avoid spoilers. Tags are always shown for solved problems.
- **Tags ON:** Tags are revealed for all problems, including unsolved ones.
- This setting is **persisted** and synced to the Codeforces page.

---

### 📈 Solved Count Display

- Every problem card displays a **👤 N** count showing how many people have solved it.
- Data is pulled from the official `problemStatistics` API response.
- On the Codeforces page, a clickable solved count column links to the problem's submission status page.

---

### 🔄 Live Sync to Codeforces Tab

When you have a Codeforces **problemset page** open:

- A **"Synced to Codeforces tab"** badge appears in the extension.
- Filtered results are **pushed live** to the Codeforces page, replacing the native problem table.
- A styled **"⚡ CF Sorter Active"** banner appears above the table on Codeforces showing:
  - Total filtered problem count
  - Number of solved problems in the current view
- Custom pagination replaces the native Codeforces pagination.
- A **"Reset to Default"** button on the banner restores the original problemset view.
- **Persists across page refreshes** — your sorted view stays active even after reloading the Codeforces tab.

---

### 💾 State Persistence

**All UI settings are automatically saved** to Chrome's local storage and restored when you reopen the extension:

- Rating range (min/max)
- Selected tag filter
- Active index pills (A–G+)
- Active division pills
- Sort order
- Search query
- Tags toggle (on/off)
- Hide Solved toggle (on/off)
- Pure CF toggle (on/off)
- User handle

---

### ⚡ Smart Caching & Performance

| Data              | Cache Duration | Description                                    |
|-------------------|----------------|------------------------------------------------|
| Problems + Stats  | **6 hours**    | Full problemset with contest metadata and solve counts |
| Solved Problems   | **30 minutes** | User submission data (more frequent updates)   |

- A **periodic alarm** refreshes the cache every 6 hours in the background.
- **Force Refresh** button (↻) in the header lets you manually pull fresh data.
- Data is pre-fetched on extension install.

---

### 🎨 Premium UI Design

- **Dark glassmorphism theme** with semi-transparent surfaces and subtle glow effects.
- **Inter** font from Google Fonts for clean typography.
- **Color-coded rating badges** matching the official Codeforces rank colors:
  - Gray (Newbie) → Green (Pupil) → Teal (Specialist) → Blue (Expert) → Purple (CM) → Orange (Master/IM) → Red (GM/IGM/LGM)
- **Color-coded division tags** — each division has a distinct accent color.
- **Smooth animations**: cards fade in with staggered delays, hover effects shift cards subtly.
- **Custom scrollbar** styling for the problem list.
- **Pagination** with smart page-range calculation (ellipsis for large page counts).
- Responsive 480px popup width optimized for extension use.

---

## 🗂️ Project Structure

```
codeforces_extension/
├── manifest.json       # Chrome Extension Manifest V3 configuration
├── background.js       # Service worker — API fetching, caching, message handling
├── content.js          # Content script — injected into codeforces.com/problemset
├── popup.html          # Extension popup UI structure
├── popup.js            # Popup logic — filtering, sorting, rendering, state management
├── styles.css          # Premium dark glassmorphism theme styles
├── icons/
│   ├── icon16.png      # Toolbar icon (16×16)
│   ├── icon48.png      # Extension management icon (48×48)
│   └── icon128.png     # Chrome Web Store icon (128×128)
└── README.md           # This file
```

---

## 🔧 Installation

### From Source (Developer Mode)

1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/your-username/codeforces_extension.git
   ```
2. Open **Google Chrome** and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **"Load unpacked"** and select the `codeforces_extension` folder.
5. The **CF Sorter** icon will appear in your Chrome toolbar.

---

## 🚀 Usage

1. Click the **CF Sorter** icon in the Chrome toolbar to open the popup.
2. Set your desired **filters** (rating, tag, index, division).
3. Choose a **sort order** from the dropdown.
4. Enter your **Codeforces handle** to track solved problems.
5. Navigate to [codeforces.com/problemset](https://codeforces.com/problemset) — filtered results sync automatically to the page.
6. Click the **↻ button** to force-refresh data from the Codeforces API.

---

## 🌐 APIs Used

| API Endpoint                                  | Purpose                                  |
|-----------------------------------------------|------------------------------------------|
| `codeforces.com/api/problemset.problems`      | Fetch all problems + solve statistics    |
| `codeforces.com/api/contest.list`             | Fetch contest names and division info    |
| `codeforces.com/api/user.status?handle=X`     | Fetch user submission history            |

---

## 📋 Permissions

| Permission         | Reason                                                |
|--------------------|-------------------------------------------------------|
| `storage`          | Persist cached data, config, and user preferences     |
| `unlimitedStorage` | Handle large problem datasets without quota issues    |
| `alarms`           | Schedule periodic background data refresh             |
| `activeTab`        | Detect if the current tab is a Codeforces page        |
| `tabs`             | Query tab URL for sync status                         |
| `scripting`        | Inject content script into the Codeforces page        |
| `host_permissions` | Access `https://codeforces.com/*` for API calls       |

---

## 🛠️ Tech Stack

- **HTML5** / **CSS3** / **Vanilla JavaScript**
- **Chrome Extension Manifest V3**
- **Codeforces API** (REST, JSON)
- **Google Fonts** (Inter)

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Made with ❤️ for the competitive programming community
</p>
