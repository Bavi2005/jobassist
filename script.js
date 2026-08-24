// ===== Mobile nav =====
const menuToggle = document.getElementById("menuToggle");
const nav = document.getElementById("nav");
menuToggle.addEventListener("click", () => nav.classList.toggle("open"));
nav.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => nav.classList.remove("open"))
);

// ===== Reveal on scroll =====
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

// ===== Animated stat counters =====
document.querySelectorAll(".stat strong").forEach((el) => {
  const target = parseInt(el.dataset.count, 10);
  const suffix = el.textContent.replace(/[\d,]/g, "");
  const duration = 1400;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.floor(target * eased).toLocaleString() + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) {
      requestAnimationFrame(tick);
      obs.disconnect();
    }
  }).observe(el);
});

// ===== Match feed (like / skip demo) =====
const feedJobs = [
  { co: "Northwind Retail", role: "Customer Service Rep", loc: "Remote", ago: "2d ago", score: 96 },
  { co: "Vertex Logistics", role: "Data Entry Specialist", loc: "Remote", ago: "3d ago", score: 94 },
  { co: "Oakline Cloud", role: "Software Engineer", loc: "Remote", ago: "4d ago", score: 92 },
  { co: "Helix Microsystems", role: "Senior Software Engineer", loc: "Remote", ago: "5d ago", score: 90 },
  { co: "Aptora Labs", role: "Product Manager", loc: "Remote", ago: "6d ago", score: 88 },
  { co: "Ferrostone Capital", role: "Project Manager", loc: "Remote", ago: "7d ago", score: 86 },
];

const initials = (name) =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const hue = (name) =>
  [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

function renderFeed() {
  const feed = document.getElementById("feed");
  feed.innerHTML = "";
  feedJobs.forEach((job) => {
    const item = document.createElement("div");
    item.className = "feed-item";
    item.innerHTML = `
      <span class="avatar" style="--c:hsl(${hue(job.co)},70%,45%)">${initials(job.co)}</span>
      <div class="feed-info">
        <h5>${job.role}</h5>
        <p>${job.co} · ${job.loc} · ${job.ago}</p>
      </div>
      <span class="feed-score">${job.score}/100</span>
      <div class="feed-actions">
        <button class="icon-btn dislike" title="Dislike" aria-label="Dislike">✕</button>
        <button class="icon-btn like" title="Like" aria-label="Like">♥</button>
      </div>`;
    item.querySelector(".dislike").addEventListener("click", () => remove(item));
    item.querySelector(".like").addEventListener("click", () => remove(item, true));
    feed.appendChild(item);
  });
}

function remove(item, liked) {
  if (liked) {
    const scoreEl = item.querySelector(".feed-score");
    scoreEl.textContent = "Applied ✓";
    scoreEl.style.color = "#059669";
  }
  item.classList.add("removing");
  setTimeout(() => item.remove(), 300);
}

renderFeed();

document.getElementById("refineBtn").addEventListener("click", () => {
  // shuffle scores slightly and re-render to simulate a refreshed feed
  feedJobs.forEach((j) => {
    j.score = Math.max(80, Math.min(98, j.score + Math.floor(Math.random() * 7) - 3));
    j.ago = `${Math.floor(Math.random() * 7) + 1}d ago`;
  });
  feedJobs.sort((a, b) => b.score - a.score);
  renderFeed();
});

// ===== Auto Apply demo =====
document.getElementById("autoApplyBtn").addEventListener("click", function () {
  const note = document.getElementById("applyNote");
  this.disabled = true;
  this.textContent = "⏳ Tailoring resume…";
  setTimeout(() => {
    this.textContent = "✍️ Writing cover letter…";
  }, 900);
  setTimeout(() => {
    this.textContent = "📨 Submitting application…";
  }, 1800);
  setTimeout(() => {
    this.textContent = "✓ Application submitted";
    note.textContent = "Sent! Track it in your inbox below.";
    note.classList.add("done");
    this.disabled = false;
  }, 2700);
});

// ===== Testimonials marquee =====
const testimonials = [
  { n: "Rachel M.", loc: "Austin, TX", when: "3 days ago", t: "Fewer listings than the big boards, but every match was actually close to what I wanted. The search finally felt manageable." },
  { n: "Daniel O.", loc: "Manchester, UK", when: "5 days ago", t: "Other sites kept pushing roles unrelated to my background. This stayed on target and helped me focus on jobs worth my time." },
  { n: "Priya S.", loc: "Toronto, ON", when: "1 week ago", t: "I used to spend entire evenings on applications and barely hear back. Now I apply consistently without it becoming a second job." },
  { n: "Marcus B.", loc: "Chicago, IL", when: "6 days ago", t: "Auto Apply saved me the most time. I still reviewed each job myself, but the repetitive forms and letters were handled." },
  { n: "Sophie L.", loc: "Bristol, UK", when: "2 weeks ago", t: "The cover letters were written for each actual role — not the same generic paragraph pasted everywhere." },
  { n: "Emily R.", loc: "Denver, CO", when: "4 days ago", t: "I was nervous about automation at first, but I could see every match, choose what made sense, and track what went out." },
  { n: "Tom H.", loc: "Leeds, UK", when: "1 week ago", t: "Before this, I had job tabs open everywhere with no system. The dashboard made it easy to see what needed attention." },
  { n: "Jessica P.", loc: "Seattle, WA", when: "2 weeks ago", t: "The biggest change was consistency. I used to apply for a few days then burn out. Now I just keep going." },
];

const track = document.getElementById("marqueeTrack");
track.innerHTML = [...testimonials, ...testimonials]
  .map(
    (t) => `
  <figure class="t-card">
    <blockquote>"${t.t}"</blockquote>
    <figcaption class="t-meta">
      <span><span class="t-name">${t.n}</span> <span class="t-verified">✓ Verified</span><br /><span class="t-loc">${t.loc}</span></span>
      <time class="t-loc">${t.when}</time>
    </figcaption>
  </figure>`
  )
  .join("");
