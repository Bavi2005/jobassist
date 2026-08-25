const LS = {
  me: "ja_me",
  settings: "ja_settings",
  tracker: "ja_tracker",
  cache: "ja_jobs_cache",
};

const $ = (id) => document.getElementById(id);
const store = {
  get(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};

let state = {
  me: store.get(LS.me, null),
  settings: store.get(LS.settings, { provider: "offline", key: "", adzunaId: "", adzunaKey: "" }),
  tracker: store.get(LS.tracker, []),
  jobs: [],
  activeTab: "matches",
  currentLetterJob: null,
};

/* ---------- utils ---------- */
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stripHtml = (h) => { const d = document.createElement("div"); d.innerHTML = h || ""; return d.textContent || ""; };
const daysAgo = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 999);
const timeLabel = (x) => x <= 1 ? "today" : x <= 13 ? `${x}d ago` : x < 60 ? `${Math.floor(x / 7)}w ago` : `${Math.floor(x / 30)}mo ago`;
const initials = (n) => String(n || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const hueFrom = (n) => [...String(n)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

/* ---------- skill detection ---------- */
const SKILL_DICT = [
  "javascript","typescript","react","vue","angular","node.js","next.js","python","java","spring boot","kotlin","swift","go","golang","rust","c++","c#","php","laravel","django","flask","fastapi","ruby on rails",".net","sql","mysql","postgresql","mongodb","redis","graphql","rest api","aws","azure","google cloud","docker","kubernetes","terraform","ci/cd","jenkins","git","github","linux","bash","html","css","sass","tailwind","bootstrap","jquery","figma","ui/ux","machine learning","deep learning","tensorflow","pytorch","nlp","computer vision","pandas","numpy","data analysis","data science","power bi","tableau","excel","vba","sap","accounting","bookkeeping","quickbooks","audit","taxation","digital marketing","seo","sem","google analytics","content writing","copywriting","social media marketing","email marketing","salesforce","hubspot","crm","customer service","customer success","project management","agile","scrum","jira","confluence","product management","human resources","recruitment","payroll","teaching","tutoring","curriculum","autocad","solidworks","revit","cad","electrical engineering","mechanical engineering","civil engineering","quality assurance","selenium","cypress","devops","networking","ccna","cybersecurity","penetration testing","wordpress","shopify","magento","photoshop","illustrator","premiere pro","after effects","video editing","photography","logistics","supply chain","procurement","warehouse operations","manufacturing","lean six sigma","matlab","r programming","flutter","react native","android","ios development","unity","blockchain","solidity","bahasa malaysia","mandarin","english","cantonese","tamil","finance","financial analysis","investment banking","compliance","risk management","insurance","underwriting","nursing","healthcare","medical assistant","pharmacy","food safety","culinary","hospitality","housekeeping","driving","forklift","administrative support","data entry","office administration","technical writing","translation","legal","contract law","architecture","interior design","event management","public relations","journalism","e-commerce","amazon web services","microservices","system architecture","unit testing","accessibility","webflow","canva","notion","slack","zoho","odoo","erp","pos systems","inventory management","customer support","call center","b2b sales","lead generation","negotiation","budgeting","forecasting","statistical analysis","spss","etl","airflow","dbt","looker","snowflake","bigquery","api development","mobile apps","game design","animation","sound design","music production","copy editing","proofreading","research","market research","business development","partnerships","operations management","facilities management","safety compliance","environmental compliance","chinese","japanese","korean","german","french"
];
const STOP = new Set("the and a an to of in for with on at by from as is are be been will have has had you your our their this that these those we they i my he she it its not but or if then than so such can could should would may might must do does did done about into over under more most other some any each which who whom whose what when where why how all both few many own same too very just also only than there here out up down off again further once during before after above below between through while".split(" "));
const MY_RE = /(malaysia|kuala lumpur|\bkl\b|penang|pulau pinang|johor|selangor|sabah|sarawak|melaka|malacca|negeri sembilan|\bperak\b|kedah|penang|terengganu|kelantan|putrajaya|cyberjaya|puchong|petaling jaya|shah alam|subang|george town|iskandar|\bmyr\b|ringgit)/i;

function detectSkills(text) {
  const t = ` ${String(text).toLowerCase().replace(/[^a-z+#./ ]/g, " ").replace(/\s+/g, " ")} `;
  const found = SKILL_DICT.filter((s) => t.includes(` ${s} `) || t.includes(` ${s},`) || t.includes(`${s}.`));
  return [...new Set(found)];
}
function topResumeWords(text, n = 12) {
  const words = String(text).toLowerCase().match(/[a-z][a-z+#.-]{2,}/g) || [];
  const freq = {};
  words.forEach((w) => { if (!STOP.has(w) && !SKILL_DICT.includes(w)) freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

/* ---------- job sources ---------- */
async function fetchAdzuna() {
  const { adzunaId, adzunaKey } = state.settings;
  if (!adzunaId || !adzunaKey) return [];
  const what = state.skills.slice(0, 2).join(" ");
  const url = `https://api.adzuna.com/v1/api/jobs/my/search/1?app_id=${encodeURIComponent(adzunaId)}&app_key=${encodeURIComponent(adzunaKey)}&results_per_page=60&max_days_old=45&what=${encodeURIComponent(what)}&content-type=application/json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Adzuna ${res.status}${res.status === 401 ? " – check your Adzuna ID/key" : ""}`);
  const data = await res.json();
  return (data.results || []).map((j) => ({
    id: `adz-${j.id}`,
    title: j.title,
    company: j.company?.display_name || "—",
    logo: "",
    location: j.location?.display_name || "Malaysia",
    remote: /remote/i.test(j.description || ""),
    tags: [],
    type: j.contract_time ? j.contract_time.replace("_", " ") : "",
    salary: j.salary_min && j.salary_max ? `MYR ${Math.round(j.salary_min / 1000)}k–${Math.round(j.salary_max / 1000)}k` : "",
    date: j.created,
    text: stripHtml(j.description).slice(0, 3000),
    url: j.redirect_url,
    source: "Adzuna MY",
    myLocal: true,
  }));
}
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
    tags: typeof j.tags === "string" ? safeTags(j.tags) : j.tags || [],
    type: (j.job_type || "").replace("_", " "),
    salary: j.salary || "",
    date: j.publication_date,
    text: stripHtml(j.description).slice(0, 3000),
    url: j.url,
    source: "Remotive",
  }));
}
async function fetchJobicy() {
  const res = await fetch("https://jobicy.com/api/v2/remote-jobs?count=50");
  if (!res.ok) throw new Error(`Jobicy ${res.status}`);
  const data = await res.json();
  return ((data.jobs && data.jobs.length ? data.jobs : data) || []).map((j) => ({
    id: `job-${j.id}`,
    title: j.jobTitle || j.title,
    company: j.companyName || j.company,
    logo: j.companyLogo || "",
    location: j.jobGeo || j.location || "Remote",
    remote: true,
    tags: Array.isArray(j.jobLevel) ? j.jobLevel : [j.jobLevel].filter(Boolean),
    type: j.jobType || "",
    salary: j.salaryMin ? `${j.salaryCurrency || "$"}${j.salaryMin >= 1000 ? Math.round(j.salaryMin / 1000) + "k" : j.salaryMin}+` : "",
    date: j.pubDate,
    text: stripHtml(j.jobDescription || j.jobExcerpt || "").slice(0, 3000),
    url: j.url,
    source: "Jobicy",
  }));
}
function safeTags(s) { try { return JSON.parse(s.replace(/'/g, '"')); } catch { return []; } }

function myRelevance(job) {
  const hay = `${job.location} ${job.title} ${job.text.slice(0, 1500)} ${job.tags.join(" ")}`;
  if (job.myLocal || MY_RE.test(hay)) return "my";
  const restricts = /(us only|united states only|usa only|canada only|uk only|europe only|eu only|singapore only|australia only|must reside|must be located|tz only|certain countries|eligible to work in the us|us-based only|americas|latin america)/i.test(hay);
  return job.remote && !restricts ? "remote-open" : "no";
}

async function loadJobs(force = false) {
  setStatus("Loading Malaysia-relevant jobs…");
  const cached = store.get(LS.cache, null);
  const fresh = cached && Date.now() - cached.at < 6 * 3600 * 1000;
  if (fresh && !force) {
    state.jobs = cached.jobs;
    afterLoad(cached.at);
    return;
  }
  const results = await Promise.allSettled([fetchAdzuna(), fetchRemotive(), fetchJobicy()]);
  const jobs = [], errors = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") jobs.push(...r.value);
    else errors.push(["Adzuna", "Remotive", "Jobicy"][i] + ": " + r.reason.message);
  });
  if (!jobs.length) {
    setStatus("⚠ Could not load jobs. " + errors.join(" · "));
    return;
  }
  const seen = new Set();
  state.jobs = jobs.filter((j) => {
    const k = `${j.company}|${j.title}`.toLowerCase().trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((j) => ({ ...j, region: myRelevance(j) }));
  store.set(LS.cache, { at: Date.now(), jobs: state.jobs });
  afterLoad(Date.now());
}
function afterLoad(at) {
  renderAll();
  const myCount = state.jobs.filter((j) => j.region === "my").length;
  const remCount = state.jobs.filter((j) => j.region === "remote-open").length;
  setStatus(`${state.jobs.length} jobs loaded (${timeLabel(Math.max(daysAgo(new Date(at).toISOString()), 0))}) · ${myCount} Malaysia-linked · ${remCount} worldwide-remote${state.settings.adzunaKey ? " · Adzuna MY active" : " · add free Adzuna key in Settings for full MY listings"}`);
}

/* ---------- scoring ---------- */
function scoreJob(job) {
  const hay = `${job.title} ${job.tags.join(" ")} ${job.text}`.toLowerCase();
  const hits = state.skills.filter((s) => hay.includes(s)).length;
  const skillScore = hits >= 8 ? 60 : hits === 7 ? 55 : hits === 6 ? 50 : hits === 5 ? 44 : hits === 4 ? 38 : hits === 3 ? 31 : hits === 2 ? 24 : hits === 1 ? 16 : 6;
  const d = daysAgo(job.date);
  const recency = d <= 3 ? 15 : d <= 7 ? 12 : d <= 14 ? 9 : d <= 21 ? 6 : d <= 35 ? 3 : 0;
  let locScore = 0;
  if (job.region === "my") locScore += 15;
  else if (job.region === "remote-open") locScore += 10;
  const tw = job.title.toLowerCase().split(/[^a-z]+/);
  const kwHits = state.keywords.filter((k) => tw.some((t) => t.startsWith(k))).length;
  const kwScore = Math.min(kwHits * 5, 10);
  return Math.min(Math.round(skillScore + recency + locScore + kwScore), 99);
}
function scoreLabel(score) {
  if (score >= 85) return ["Excellent", "score-high"];
  if (score >= 65) return ["Great fit", "score-mid"];
  return ["Fair fit", "score-low"];
}

/* ---------- rendering ---------- */
function visibleJobs() {
  const q = $("feedSearch").value.trim().toLowerCase();
  const min = Number($("minScore").value);
  const incRemote = $("includeRemote").checked;
  let list = state.jobs
    .filter((j) => j.region === "my" || (incRemote && j.region === "remote-open"))
    .map((j) => ({ ...j, score: scoreJob(j) }));
  if (state.activeTab !== "matches") {
    const wanted = state.activeTab === "saved" ? "saved" : "applied";
    const ids = new Set(state.tracker.filter((t) => t.status === wanted).map((t) => t.id));
    list = list.filter((j) => ids.has(j.id));
    state.tracker.filter((t) => t.status === wanted).forEach((t) => {
      if (!list.some((j) => j.id === t.id) && t.jobData?.title) list.push({ ...t.jobData, score: t.jobData.score ?? 0 });
    });
  } else {
    list.sort((a, b) => b.score - a.score);
    if (min > 0) list = list.filter((j) => j.score >= min);
  }
  if (q) list = list.filter((j) => `${j.title} ${j.company} ${j.tags.join(" ")}`.toLowerCase().includes(q));
  return list;
}

function renderFeed() {
  const feed = $("jobFeed");
  const list = visibleJobs();
  if (!list.length) {
    feed.innerHTML = `<div class="empty-state"><strong>No jobs here yet</strong>${
      state.activeTab === "matches"
        ? ($("includeRemote").checked ? "Try lowering the score filter." : "Tick “include worldwide-remote”, add your free Adzuna key in Settings, or lower the score filter.")
        : "Save or apply to jobs from Matches and they'll appear here."
    }</div>`;
    return;
  }
  feed.innerHTML = list.map((j) => {
    const t = state.tracker.find((x) => x.id === j.id);
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
            ${j.source === "Adzuna MY" || j.myLocal ? '<span class="status-pill status-interview">🇲🇾 Malaysia</span>' : ""}
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
  }).join("");

  feed.querySelectorAll(".save-btn").forEach((b) => b.addEventListener("click", () => toggleSave(b.dataset.id)));
  feed.querySelectorAll(".letter-btn").forEach((b) => b.addEventListener("click", () => openLetter(b.dataset.id)));
  feed.querySelectorAll(".apply-btn").forEach((a) => a.addEventListener("click", () => markApplied(a.dataset.id)));
  feed.querySelectorAll("img.avatar").forEach((img) =>
    img.addEventListener("error", () => {
      const s = document.createElement("span");
      s.className = "avatar";
      s.style.setProperty("--c", `hsl(${img.dataset.hue || 0},70%,45%)`);
      s.textContent = img.dataset.fallback || "?";
      img.replaceWith(s);
    })
  );
}
function renderStats() {
  $("statMatches").textContent = state.jobs.filter((j) => j.region === "my").length || "–";
  $("statSaved").textContent = state.tracker.filter((t) => t.status === "saved").length;
  $("statApplied").textContent = state.tracker.filter((t) => t.status !== "saved").length;
  $("statInterviews").textContent = state.tracker.filter((t) => t.status === "interview").length;
}
function renderAll() { renderFeed(); renderStats(); }
function setStatus(m) { $("feedStatus").textContent = m; }

/* ---------- tracker ---------- */
function toggleSave(id) {
  const t = state.tracker.find((x) => x.id === id);
  if (t?.status === "saved") state.tracker = state.tracker.filter((x) => x.id !== id);
  else if (t) t.status = "saved";
  else state.tracker.push({ id, status: "saved", at: Date.now(), jobData: snapshot(id) });
  store.set(LS.tracker, state.tracker); renderAll();
}
function markApplied(id) {
  const t = state.tracker.find((x) => x.id === id);
  if (t) t.status = "applied"; else state.tracker.push({ id, status: "applied", at: Date.now(), jobData: snapshot(id) });
  store.set(LS.tracker, state.tracker); renderAll();
}
function promoteInterview(id) {
  const t = state.tracker.find((x) => x.id === id);
  if (t) { t.status = "interview"; store.set(LS.tracker, state.tracker); renderAll(); }
}
function snapshot(id) {
  const j = state.jobs.find((x) => x.id === id);
  return j ? { ...j, score: scoreJob(j) } : {};
}

/* ---------- AI ---------- */
function aiReady() { return state.settings.provider !== "offline" && state.settings.key.length > 20; }
async function callGemini(prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(state.settings.key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text;
}
async function callGroq(prompt) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.settings.key}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], temperature: 0.7 }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content;
}
async function askAI(prompt) {
  if (!aiReady()) throw new Error("offline");
  return state.settings.provider === "gemini" ? callGemini(prompt) : callGroq(prompt);
}

function offlineLetter(job) {
  const me = state.me;
  const matched = state.skills.filter((s) => `${job.title} ${job.text}`.toLowerCase().includes(s)).slice(0, 4);
  const line = matched.length ? `My background lines up well with what you're looking for — particularly hands-on experience with ${matched.join(", ")}.` : `My broader background would transfer well to this role.`;
  const opener = (me.resumeText || "").split(/[.\n]/)[0].slice(0, 170) || `I'm excited about the ${job.title} opening`;
  return `Dear ${job.company} Hiring Team,

I'd love to be considered for the ${job.title} role. ${opener}, and this position stood out because it calls for exactly the kind of work I do best.

${line}${matched.length > 3 ? ` I also bring working knowledge of ${matched.slice(3).join(" and ")}.` : ""}

What draws me to ${job.company} is the chance to contribute from day one and grow with the team. Based in ${me.city || "Malaysia"}${job.remote ? ", I'm fully comfortable working remotely" : ""}, and I'd welcome the chance to walk you through concrete examples of my work.

Thank you for your consideration.

Sincerely,
${me.name || "Candidate"}`;
}
function letterPrompt(job) {
  const me = state.me;
  return `Write a concise professional cover letter (max 220 words) for this application. First person, human tone, no clichés like "I am writing to express". Candidate is based in ${me.city || "Malaysia"}. Reference 1-2 real matching skills. End with "Sincerely, ${me.name || ""}".

CANDIDATE RESUME:
${(me.resumeText || "").slice(0, 3500)}

CANDIDATE SKILLS: ${state.skills.join(", ")}

JOB: ${job.title} at ${job.company}
REQUIREMENTS EXCERPT: ${job.text.slice(0, 1100)}`;
}
async function generateLetter(job) {
  if (aiReady()) {
    try {
      const t = await askAI(letterPrompt(job));
      if (t) return { text: t.trim(), via: state.settings.provider };
    } catch (e) { return { text: offlineLetter(job), via: `template (AI error: ${e.message})` }; }
  }
  return { text: offlineLetter(job), via: "smart template" };
}
async function openLetter(id) {
  const job = state.jobs.find((x) => x.id === id) || state.tracker.find((x) => x.id === id)?.jobData;
  if (!job) return;
  state.currentLetterJob = job;
  $("letterTitle").textContent = `Cover letter – ${job.title}`;
  $("letterSub").textContent = `${job.company} · tailored to this posting`;
  $("applyLink").href = job.url || "#";
  $("letterBackdrop").classList.remove("hidden");
  const st = $("letterStatus");
  st.classList.remove("hidden", "err");
  st.textContent = aiReady() ? `Generating with ${state.settings.provider}…` : "Generating smart template…";
  $("letterText").value = "";
  const { text, via } = await generateLetter(job);
  $("letterText").value = text;
  st.textContent = `✓ Generated (${via})`;
}

/* ---------- tabs & controls ---------- */
document.querySelectorAll(".tab-link").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-link").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeTab = btn.dataset.tab;
    renderFeed();
  })
);
$("feedSearch").addEventListener("input", renderFeed);
$("minScore").addEventListener("change", renderFeed);
$("includeRemote").addEventListener("change", renderFeed);
$("refreshBtn").addEventListener("click", () => loadJobs(true));

/* ---------- settings ---------- */
function syncSettingsUi() {
  $("aiProvider").value = state.settings.provider;
  $("aiKey").value = state.settings.key;
  $("keyRow").classList.toggle("hidden", state.settings.provider === "offline");
  $("adzunaId").value = state.settings.adzunaId;
  $("adzunaKey").value = state.settings.adzunaKey;
  $("sName").value = state.me?.name || "";
  $("sEmail").value = state.me?.email || "";
  $("sPhone").value = state.me?.phone || "";
  $("sCity").value = state.me?.city || "";
  $("settingsResume").value = state.me?.resumeText || "";
  $("sSkills").value = (state.me?.extraSkills || []).join(", ");
  const badge = $("aiBadge");
  if (aiReady()) { badge.textContent = `AI live · ${state.settings.provider}`; badge.classList.add("live"); }
  else { badge.textContent = "Offline mode"; badge.classList.remove("live"); }
}
$("aiProvider").addEventListener("change", () => $("keyRow").classList.toggle("hidden", $("aiProvider").value === "offline"));
$("settingsBtn").addEventListener("click", () => { syncSettingsUi(); $("settingsBackdrop").classList.remove("hidden"); });
$("settingsClose").addEventListener("click", () => $("settingsBackdrop").classList.add("hidden"));
$("settingsBackdrop").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden"); });

$("saveSettings").addEventListener("click", () => {
  state.me = {
    ...(state.me || {}),
    name: $("sName").value.trim(),
    email: $("sEmail").value.trim(),
    phone: $("sPhone").value.trim(),
    city: $("sCity").value.trim(),
    resumeText: $("settingsResume").value,
    extraSkills: $("sSkills").value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  };
  recomputeSkills();
  store.set(LS.me, state.me);
  state.settings = {
    provider: $("aiProvider").value,
    key: $("aiKey").value.trim(),
    adzunaId: $("adzunaId").value.trim(),
    adzunaKey: $("adzunaKey").value.trim(),
  };
  store.set(LS.settings, state.settings);
  syncSettingsUi(); renderAll();
  $("settingsBackdrop").classList.add("hidden");
});
$("wipeData").addEventListener("click", () => {
  if (!confirm("Delete everything stored in this browser?")) return;
  Object.values(LS).forEach((k) => localStorage.removeItem(k));
  location.reload();
});

/* ---------- bookmarklet: application filler ---------- */
function buildFiller() {
  const cfg = {
    p: state.settings.provider,
    k: aiReady() ? state.settings.key : "",
    n: state.me.name || "", e: state.me.email || "", ph: state.me.phone || "",
    c: state.me.city || "Kuala Lumpur", m: state.me.email || "",
    cv: (state.me.resumeText || "").slice(0, 4200), sk: state.skills.slice(0, 20),
  };
  const src = `
(async()=>{
try{
var C=${JSON.stringify(cfg)};
var vis=function(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0&&!el.disabled;};
var fields=[].slice.call(document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]),textarea')).filter(vis);
if(!fields.length){alert('No form fields found on this page.');return;}
function lab(el){
  var l='';
  if(el.id){var lb=document.querySelector('label[for="'+el.id+'"]');if(lb)l=lb.textContent;}
  if(!l&&el.closest('label'))l=el.closest('label').textContent;
  if(!l)l=el.getAttribute('aria-label')||'';
  if(!l)l=el.getAttribute('placeholder')||'';
  if(!l)l=el.getAttribute('name')||'';
  if(!l&&el.closest('tr')){var cells=el.closest('tr').querySelectorAll('td,th');l=cells.length>1?cells[0].textContent:'';}
  if(!l){var p=el.closest('div');if(p){var pt=p.textContent.split('\\n').filter(Boolean);l=pt.join(' ').slice(0,120);}}
  return l.replace(/\\s+/g,' ').trim().slice(0,160);
}
function setV(el,v){var proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.style.outline='2px solid #10b981';setTimeout(function(){el.style.outline='';},2500);}
function cls(t){t=t.toLowerCase();
  if(/e-?mail/.test(t))return C.e;
  if(/phone|mobile|whatsapp|contact\\s*no/.test(t))return C.ph;
  if(/^\\s*first(\\s*name)?/.test(t))return C.n.split(' ')[0];
  if(/last\\s*name|surname|family\\s*name/.test(t))return C.n.split(' ').slice(-1)[0];
  if(/full.?name|^name$|your name|candidate name/.test(t))return C.n;
  if(/linkedin/.test(t))return '';
  if(/city|town(?!ship)/.test(t))return C.c;
  if(/postal|post ?code|zip/.test(t))return '50450';
  if(/address.*(line)?\\s*2|address.*suite|apt/.test(t))return '';
  if(/^country/.test(t))return 'Malaysia';
  if(/notice period|available.*start|start date/.test(t))return 'Immediately available';
  return null;
}
var need=[],map={};
fields.forEach(function(f,i){
  var L=lab(f),v=cls(L);
  if(v!==null){if(v!=='')setV(f,v);}
  else if(f.tagName==='TEXTAREA'||L.length>18||(f.type==='number')){need.push({i:i,L:L});map[i]=f;}
});
var filled=[].slice.call(document.querySelectorAll('[style*="outline"]')).length;
if(need.length&&C.k){
  var pr='You are helping '+ (C.n||'a candidate') +' fill a job application. Answer ONLY with a JSON object mapping index->short answer string. Use candidate facts where possible, otherwise honest concise plausible answers (max 60 words each). Candidate is based in '+C.c+', Malaysia. Skills: '+C.sk.join(', ')+'. RESUME: '+C.cv.slice(0,2500)+' QUESTIONS: '+JSON.stringify(need.map(function(q){return {i:q.i,q:q.L};}));
  var url=C.p==='gemini'
    ?'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+encodeURIComponent(C.k)
    :'https://api.groq.com/openai/v1/chat/completions';
  var body=C.p==='gemini'?{contents:[{parts:[{text:pr}]}]}:{model:'llama-3.3-70b-versatile',messages:[{role:'user',content:pr}],temperature:0.4};
  var r=await fetch(url,{method:'POST',headers:C.p==='gemini'?{'Content-Type':'application/json'}:{'Content-Type':'application/json','Authorization':'Bearer '+C.k},body:JSON.stringify(body)});
  var d=await r.json();
  var txt=C.p==='gemini'?d.candidates[0].content.parts[0].text:d.choices[0].message.content;
  var mm=txt.match(/\\{[\\s\\S]*\\}/);
  if(mm){var ans=JSON.parse(mm[0]);
    need.forEach(function(q){var a=ans[q.i];if(a)setV(map[q.i],String(a));});
  }
}else if(need.length&&!C.k){
  need.forEach(function(q){
    if(/describe|essay|why|tell us|about yourself/i.test(q.L)){/* leave blank */}
    setV(map[q.i],'');
  });
}
alert('JA Filler done ✓\\nFilled '+filled+' known fields'+(need.length?(C.k?' + '+need.length+' AI answers':'. '+need.length+' open questions left blank (add an AI key in Settings to auto-answer)'):'')+'.\\nReview everything, then submit yourself.');
}catch(err){alert('JA Filler error: '+err.message);}
})();`;
  return "javascript:" + encodeURIComponent(src.trim());
}
$("genFiller").addEventListener("click", () => {
  const href = buildFiller();
  const link = $("fillerLink");
  link.href = href;
  $("fillerNote").classList.remove("hidden");
  $("fillerHint").textContent = aiReady()
    ? "Works everywhere · drag it now."
    : "Note: no AI key set — it fills your contact details but leaves essay questions blank.";
});

/* ---------- resume upload gate ---------- */
async function extractFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    let out = "";
    const pages = Math.min(doc.numPages, 25);
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      out += tc.items.map((it) => it.str).join(" ") + "\n";
    }
    return out;
  }
  if (name.endsWith(".docx")) {
    const buf = await file.arrayBuffer();
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    return r.value;
  }
  if (name.endsWith(".doc")) throw new Error("Legacy .doc not supported — export as .docx or PDF");
  return file.text();
}

let uploadedResume = "";
function handleFile(file) {
  const st = $("extractStatus");
  st.classList.remove("hidden", "err");
  st.textContent = `⏳ Reading ${file.name}…`;
  extractFile(file)
    .then((text) => {
      if (!text || text.trim().length < 40) throw new Error("Couldn't read enough text — is it a scanned image PDF?");
      uploadedResume = text.trim();
      $("gateResumePreview").value = uploadedResume.slice(0, 20000);
      $("gateResumePreview").classList.remove("hidden");
      st.textContent = `✓ Extracted ${uploadedResume.length.toLocaleString()} characters · ${detectSkills(uploadedResume).length} skills detected`;
      $("startBtn").disabled = false;
    })
    .catch((err) => {
      st.classList.add("err");
      st.textContent = `✗ ${err.message}`;
      $("startBtn").disabled = true;
    });
}
$("resumeFile").addEventListener("change", (e) => e.target.files[0] && handleFile(e.target.files[0]));
const dz = $("dropzone");
["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
dz.addEventListener("drop", (e) => e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]));

$("gateResumePreview")?.addEventListener("input", () => {
  uploadedResume = $("gateResumePreview").value;
});

function recomputeSkills() {
  const base = detectSkills(state.me.resumeText || "");
  const extra = state.me.extraSkills || [];
  state.skills = [...new Set([...base, ...extra])];
  state.keywords = topResumeWords(state.me.resumeText || "");
}

$("resumeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.me = {
    name: $("gName").value.trim(),
    email: $("gEmail").value.trim(),
    phone: $("gPhone").value.trim(),
    city: $("gCity").value.trim(),
    resumeText: ($("gateResumePreview").value || uploadedResume).trim(),
    extraSkills: [],
  };
  recomputeSkills();
  store.set(LS.me, state.me);
  $("resumeGate").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  syncSettingsUi();
  loadJobs(true);
});

/* ---------- letter modal actions ---------- */
$("letterClose").addEventListener("click", () => $("letterBackdrop").classList.add("hidden"));
$("letterBackdrop").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden"); });
$("regenLetter").addEventListener("click", () => state.currentLetterJob && openLetter(state.currentLetterJob.id));
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

/* ---------- boot ---------- */
(function init() {
  if (state.me?.resumeText) {
    recomputeSkills();
    $("resumeGate").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
    syncSettingsUi();
    loadJobs(false);
  } else {
    $("resumeGate").classList.remove("hidden");
  }
})();
