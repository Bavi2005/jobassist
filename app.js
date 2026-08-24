const LS = {
  profile: "ja_profile",
  settings: "ja_settings",
  tracker: "ja_tracker",
  cache: "ja_jobs_cache",
};

const $ = (id) => document.getElementById(id);
const store = {
  get(k, fallback) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  },
};

let state = {
  profile: store.get(LS.profile, null),
  settings: store.get(LS.settings, { provider: "offline", key: "" }),
  tracker: store.get(LS.tracker, []),
  jobs: [],
  activeTab: "matches",
  currentLetterJob: null,
};

/* ---------- utils ---------- */
function stripHtml(html) {
  const el = document.createElement("div");
  el.innerHTML = html || "";
  return el.textContent || "";
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function daysAgo(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
function timeLabel(d) {
  if (d <= 1) return "today";
  if (d <= 2) return "1d ago";
  if (d < 14) return `${d}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function hueFrom(name) {
  return [...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

/* ---------- job sources ---------- */
async function fetchRemotive() {
  const res = await fetch("https://remotive.com/api/remote-jobs?limit=80");
  if (!res.ok) throw new Error(`Remotive ${res.status}`);
  const data = await res.json();
  return (data.jobs || []).map((j) => ({
    id: `rem-${j.id}`,
    title: j.title,
    company: j.company_name,
    logo: j.company_logo,
    location: j.candidate_required_location || "Remote",
    remote: true,
    tags: typeof j.tags === "string" ? safeParseTags(j.tags) : j.tags || [],
    type: (j.job_type || "").replace("_", " "),
    salary: j.salary || "",
    date: j.publication_date,
    text: stripHtml(j.description).slice(0, 3000),
    url: j.url,
    source: "Remotive",
  }));
}
function safeParseTags(s) {
  try {
    return JSON.parse(s.replace(/'/g, '"'));
  } catch {
    return [];
  }
}
async function fetchArbeitnow() {
  const res = await fetch("https://www.arbeitnow.com/api/job-board-api");
  if (!res.ok) throw new Error(`Arbeitnow ${res.status}`);
  const data = await res.json();
  return (data.data || []).map((j) => ({
    id: `arb-${j.slug}`,
    title: j.title,
    company: j.company_name,
    logo: j.company_logo || "",
    location: j.location || (j.remote ? "Remote" : "—"),
    remote: !!j.remote,
    tags: j.tags || [],
    type: (j.job_types || []).join(", "),
    salary: "",
    date: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
    text: stripHtml(j.description).slice(0, 3000),
    url: j.url || `https://www.arbeitnow.com/jobs/${j.slug}`,
    source: "Arbeitnow",
  }));
}

async function loadJobs(force = false) {
  setStatus("Loading live jobs…");
  const cached = store.get(LS.cache, null);
  const fresh = cached && Date.now() - cached.at < 6 * 3600 * 1000;
  if (fresh && !force) {
    state.jobs = cached.jobs;
    renderAll();
    setStatus(`${state.jobs.length} live jobs · updated ${timeLabel(Math.floor((Date.now() - cached.at) / 86400000))} · sources: Remotive + Arbeitnow`);
    return;
  }
  const results = await Promise.allSettled([fetchRemotive(), fetchArbeitnow()]);
  const jobs = [];
  results.forEach((r) => r.status === "fulfilled" && jobs.push(...r.value));
  if (!jobs.length) {
    setStatus("⚠ Could not reach job APIs. Check your connection and hit Refresh.");
    return;
  }
  const seen = new Set();
  state.jobs = jobs.filter((j) => {
    const k = `${j.company}|${j.title}`.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  store.set(LS.cache, { at: Date.now(), jobs: state.jobs });
  setStatus(`${state.jobs.length} live jobs fetched just now · sources: Remotive + Arbeitnow`);
  renderAll();
}

/* ---------- scoring ---------- */
function scoreJob(job, profile) {
  const jobTitleWords = job.title.toLowerCase().split(/[^a-z]+/);
  let bestTitle = 0;
  profile.titles.forEach((t) => {
    const words = t.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) return;
    const hits = words.filter((w) =>
      jobTitleWords.some((jw) => jw === w || jw.startsWith(w))
    ).length;
    bestTitle = Math.max(bestTitle, hits / words.length);
  });
  const titleScore = bestTitle * 40;

  const hay = `${job.title} ${job.tags.join(" ")} ${job.text}`.toLowerCase();
  const hits = profile.skills.filter((s) => s.length > 2 && hay.includes(s)).length;
  const skillScore =
    hits >= 5 ? 45 : hits === 4 ? 38 : hits === 3 ? 32 : hits === 2 ? 26 : hits === 1 ? 16 : 0;

  const d = daysAgo(job.date);
  const recency = d <= 1 ? 10 : d <= 3 ? 8 : d <= 7 ? 6 : d <= 14 ? 4 : d <= 30 ? 2 : 0;

  const loc = profile.location;
  let locScore = 0;
  if (loc === "anywhere") locScore = 5;
  else if (loc === "remote" && job.remote) locScore = 5;
  else if (loc === "usa" && /usa|united states|us\b|\bny\b|\bca\b/i.test(job.location)) locScore = 5;
  else if (loc === "europe" && /germany|netherlands|spain|france|uk|poland|europe|ireland|italy|portugal|sweden|denmark|switzerland|austria|belgium/i.test(job.location)) locScore = 5;

  const total = Math.round(titleScore + skillScore + recency + locScore);
  return Math.max(total, Math.min(total, 99));
}
function scoreLabel(score) {
  if (score >= 90) return ["Excellent fit", "score-high"];
  if (score >= 75) return ["Great fit", "score-mid"];
  return ["Good fit", "score-low"];
}

/* ---------- rendering ---------- */
function trackerFor(id) {
  return state.tracker.find((t) => t.id === id);
}
function visibleJobs() {
  const q = $("feedSearch").value.trim().toLowerCase();
  const min = Number($("minScore").value);
  let list = state.jobs.map((j) => ({ ...j, score: scoreJob(j, state.profile) }));
  if (state.activeTab === "matches") {
    list.sort((a, b) => b.score - a.score);
  } else {
    const wanted = state.activeTab === "saved" ? "saved" : "applied";
    const ids = new Set(state.tracker.filter((t) => t.status === wanted).map((t) => t.id));
    list = list.filter((j) => ids.has(j.id));
    if (state.activeTab === "applied") {
      state.tracker
        .filter((t) => t.status === "applied")
        .forEach((t) => {
          if (!list.some((j) => j.id === t.id)) {
            list.push({ ...t.jobData, score: t.jobData.score ?? 0 });
          }
        });
    }
  }
  if (min > 0 && state.activeTab === "matches") list = list.filter((j) => j.score >= min);
  if (q) list = list.filter((j) => `${j.title} ${j.company} ${j.tags.join(" ")}`.toLowerCase().includes(q));
  return list;
}

function renderFeed() {
  const feed = $("jobFeed");
  const list = visibleJobs();
  if (!list.length) {
    feed.innerHTML = `<div class="empty-state"><strong>No jobs here yet</strong>${
      state.activeTab === "matches"
        ? "Try lowering the minimum score or refreshing."
        : "Save or apply to jobs from your Matches tab and they'll show up here."
    }</div>`;
    return;
  }
  feed.innerHTML = list
    .map((j) => {
      const t = trackerFor(j.id);
      const [label, cls] = scoreLabel(j.score);
      const savedOn = t?.status === "saved";
      const avatar = j.logo
        ? `<img class="avatar" src="${escapeHtml(j.logo)}" alt="" data-fallback="${escapeHtml(initials(j.company))}" data-hue="${hueFrom(j.company)}">`
        : `<span class="avatar" style="--c:hsl(${hueFrom(j.company)},70%,45%)">${initials(j.company)}</span>`;
      return `
      <article class="job-row">
        ${avatar}
        <div>
          <div class="job-title-line">
            <h3><a href="${escapeHtml(j.url)}" target="_blank" rel="noopener">${escapeHtml(j.title)}</a></h3>
            <div class="job-meta">
              <span><strong>${escapeHtml(j.company)}</strong></span>
              <span>${escapeHtml(j.location)}</span>
              ${j.type ? `<span>${escapeHtml(j.type)}</span>` : ""}
              ${j.salary ? `<span>${escapeHtml(j.salary)}</span>` : ""}
              <span>${timeLabel(daysAgo(j.date))}</span>
              ${j.remote ? '<span class="status-pill status-saved">Remote</span>' : ""}
              ${t ? `<span class="status-pill status-${t.status}">${t.status === "interview" ? "🎉 Interview stage" : escapeHtml(t.status)}</span>` : ""}
            </div>
          </div>
          <div class="job-tags">${j.tags.slice(0, 6).map((tg) => `<span>${escapeHtml(tg)}</span>`).join("")}</div>
        </div>
        <div class="job-side">
          <span class="match-score ${cls}">${j.score}/100 · ${label}</span>
          <div class="job-actions">
            <button class="act-btn letter-btn" data-id="${j.id}">✍ Letter</button>
            <button class="act-btn save-btn ${savedOn ? "saved-on" : ""}" data-id="${j.id}">♥ ${savedOn ? "Saved" : "Save"}</button>
            <a class="act-btn primary apply-btn" data-id="${j.id}" href="${escapeHtml(j.url)}" target="_blank" rel="noopener">Apply ↗</a>
          </div>
        </div>
      </article>`;
    })
    .join("");

  feed.querySelectorAll(".save-btn").forEach((b) =>
    b.addEventListener("click", () => toggleSave(b.dataset.id))
  );
  feed.querySelectorAll(".letter-btn").forEach((b) =>
    b.addEventListener("click", () => openLetter(b.dataset.id))
  );
  feed.querySelectorAll(".apply-btn").forEach((a) =>
    a.addEventListener("click", () => markApplied(a.dataset.id))
  );
  feed.querySelectorAll("img.avatar").forEach((img) =>
    img.addEventListener("error", () => {
      const span = document.createElement("span");
      span.className = "avatar";
      const hue = img.dataset.hue || 0;
      span.style.setProperty("--c", `hsl(${hue},70%,45%)`);
      span.textContent = img.dataset.fallback || "?";
      img.replaceWith(span);
    })
  );
}

function renderStats() {
  $("statMatches").textContent = state.jobs.length || "–";
  $("statSaved").textContent = state.tracker.filter((t) => t.status === "saved").length;
  $("statApplied").textContent = state.tracker.filter((t) => t.status !== "saved").length;
  $("statInterviews").textContent = state.tracker.filter((t) => t.status === "interview").length;
}

function renderAll() {
  renderFeed();
  renderStats();
}

function setStatus(msg) {
  $("feedStatus").textContent = msg;
}

/* ---------- tracker ---------- */
function toggleSave(id) {
  const t = trackerFor(id);
  if (t && t.status === "saved") {
    state.tracker = state.tracker.filter((x) => x.id !== id);
  } else if (t) {
    t.status = "saved";
  } else {
    state.tracker.push({ id, status: "saved", at: Date.now(), jobData: jobSnapshot(id) });
  }
  store.set(LS.tracker, state.tracker);
  renderAll();
}
function markApplied(id) {
  const t = trackerFor(id);
  if (t) t.status = "applied";
  else state.tracker.push({ id, status: "applied", at: Date.now(), jobData: jobSnapshot(id) });
  store.set(LS.tracker, state.tracker);
  renderAll();
}
function promoteToInterview(id) {
  const t = trackerFor(id);
  if (t) t.status = "interview";
  store.set(LS.tracker, state.tracker);
  renderAll();
}
function jobSnapshot(id) {
  const j = state.jobs.find((x) => x.id === id);
  if (!j) return {};
  return { ...j, score: scoreJob(j, state.profile) };
}

/* ---------- cover letters ---------- */
function buildPrompt(job) {
  const p = state.profile;
  return `Write a concise, professional cover letter (max 250 words) for this application. Write in first person as ${p.name}, sound human and specific, no clichés like "I am writing to express". Reference 1-2 of the candidate's real skills that match the posting. End with "Sincerely, ${p.name}".

CANDIDATE RESUME / EXPERIENCE:
${p.resumeText || `(no resume provided — ${p.name}, skilled in ${p.skills.join(", ")})`}

TARGET SKILLS OF CANDIDATE: ${p.skills.join(", ")}

JOB TITLE: ${job.title}
COMPANY: ${job.company}
KEY REQUIREMENTS FROM POSTING: ${job.text.slice(0, 1200)}`;
}

async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(state.settings.key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function callGroq(prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.settings.key}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

function offlineLetter(job) {
  const p = state.profile;
  const matchedSkills = p.skills.filter((s) =>
    `${job.title} ${job.text}`.toLowerCase().includes(s)
  );
  const top = matchedSkills.slice(0, 3);
  const skillLine = top.length
    ? `My background lines up well with what you're looking for — particularly my experience with ${top.join(", ")}.`
    : `I believe my broader background would transfer well to this role.`;
  const resumeBit = p.resumeText
    ? p.resumeText.trim().split(/[.\n]/)[0].slice(0, 160)
    : `I'm pursuing roles like ${p.titles[0]}`;
  return `Dear ${job.company} Hiring Team,

I'd love to be considered for the ${job.title} role. ${resumeBit}, and this position stood out because it calls for exactly the kind of work I enjoy doing.

${skillLine}${matchedSkills.length > 3 ? ` I also bring working knowledge of ${matchedSkills.slice(3, 5).join(" and ")}.` : ""}

What draws me to ${job.company} is the chance to contribute from day one and grow with the team. I'd welcome the opportunity to walk you through concrete examples of my work and how I'd apply them here.

Thank you for your consideration.

Sincerely,
${p.name}`;
}

async function generateLetter(job) {
  const provider = state.settings.provider;
  const keyOk = state.settings.key && state.settings.key.length > 20;
  if (provider !== "offline" && keyOk) {
    try {
      const prompt = buildPrompt(job);
      const text =
        provider === "gemini" ? await callGemini(prompt) : await callGroq(prompt);
      if (text) return { text: text.trim(), via: provider };
      throw new Error("Empty response");
    } catch (err) {
      return { text: offlineLetter(job), via: `offline (AI failed: ${err.message})` };
    }
  }
  return { text: offlineLetter(job), via: "offline template" };
}

async function openLetter(id) {
  const job = state.jobs.find((x) => x.id === id) || trackerSnapshotJob(id);
  if (!job) return;
  state.currentLetterJob = job;
  $("letterTitle").textContent = `Cover letter – ${job.title}`;
  $("letterSub").textContent = `${job.company} · tailored to this posting`;
  $("applyLink").href = job.url;
  $("letterBackdrop").classList.remove("hidden");
  const statusEl = $("letterStatus");
  statusEl.classList.remove("hidden", "err");
  statusEl.textContent = state.settings.provider === "offline" ? "Generating with offline template…" : `Generating with ${state.settings.provider}…`;
  $("letterText").value = "";
  const { text, via } = await generateLetter(job);
  $("letterText").value = text;
  statusEl.textContent = `✓ Generated (${via})`;
}
function trackerSnapshotJob(id) {
  const t = state.tracker.find((x) => x.id === id);
  return t?.jobData || null;
}

/* ---------- tabs ---------- */
document.querySelectorAll(".tab-link").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-link").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeTab = btn.dataset.tab;
    renderFeed();
  })
);

/* ---------- settings ---------- */
function syncSettingsUi() {
  $("aiProvider").value = state.settings.provider;
  $("aiKey").value = state.settings.key;
  $("keyRow").classList.toggle("hidden", state.settings.provider === "offline");
  $("settingsResume").value = state.profile?.resumeText || "";
  $("settingsName").value = state.profile?.name || "";
  $("settingsSkills").value = state.profile?.skills.join(", ") || "";
  $("settingsTitles").value = state.profile?.titles.join(", ") || "";
  const badge = $("aiBadge");
  if (state.settings.provider !== "offline" && state.settings.key.length > 20) {
    badge.textContent = `AI live · ${state.settings.provider}`;
    badge.classList.add("live");
  } else {
    badge.textContent = "Offline mode";
    badge.classList.remove("live");
  }
}

$("aiProvider").addEventListener("change", () =>
  $("keyRow").classList.toggle("hidden", $("aiProvider").value === "offline")
);

$("settingsBtn").addEventListener("click", () => {
  syncSettingsUi();
  $("settingsBackdrop").classList.remove("hidden");
});
$("settingsClose").addEventListener("click", () => $("settingsBackdrop").classList.add("hidden"));
$("settingsBackdrop").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
});

$("saveSettings").addEventListener("click", () => {
  const p = state.profile || {};
  state.profile = {
    name: $("settingsName").value.trim() || p.name || "Candidate",
    titles: ($("settingsTitles").value || p.titles?.join(", ") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    skills: ($("settingsSkills").value || p.skills?.join(", ") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    location: p.location || "remote",
    resumeText: $("settingsResume").value,
  };
  store.set(LS.profile, state.profile);
  state.settings = {
    provider: $("aiProvider").value,
    key: $("aiKey").value.trim(),
  };
  store.set(LS.settings, state.settings);
  syncSettingsUi();
  renderAll();
  $("settingsBackdrop").classList.add("hidden");
});

$("wipeData").addEventListener("click", () => {
  if (!confirm("Delete your profile, tracker and settings from this browser?")) return;
  Object.values(LS).forEach((k) => localStorage.removeItem(k));
  location.reload();
});

/* ---------- letter modal actions ---------- */
$("letterClose").addEventListener("click", () => $("letterBackdrop").classList.add("hidden"));
$("letterBackdrop").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
});
$("regenLetter").addEventListener("click", () => {
  if (state.currentLetterJob) openLetter(state.currentLetterJob.id);
});
$("copyLetter").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("letterText").value);
  $("copyLetter").textContent = "Copied ✓";
  setTimeout(() => ($("copyLetter").textContent = "Copy"), 1500);
});
$("downloadLetter").addEventListener("click", () => {
  const blob = new Blob([$("letterText").value], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cover-letter-${(state.currentLetterJob?.company || "job").toLowerCase().replace(/\W+/g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ---------- feed controls ---------- */
$("feedSearch").addEventListener("input", renderFeed);
$("minScore").addEventListener("change", renderFeed);
$("refreshBtn").addEventListener("click", () => loadJobs(true));

/* ---------- boot ---------- */
$("profileForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.profile = {
    name: $("pfName").value.trim(),
    titles: $("pfTitles").value.split(",").map((s) => s.trim()).filter(Boolean),
    skills: $("pfSkills").value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    location: $("pfLocation").value,
    resumeText: $("pfResume").value,
  };
  store.set(LS.profile, state.profile);
  $("onboarding").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  loadJobs(true);
});

(function init() {
  if (state.profile) {
    $("onboarding").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
    syncSettingsUi();
    loadJobs(false);
  } else {
    $("onboarding").classList.remove("hidden");
  }
})();
