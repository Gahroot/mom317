(function () {
  "use strict";

  var cfg = window.WAITLIST_CONFIG || {};
  var STORE_KEY = "317_signup";
  var REF_KEY = "317_ref";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Remember who referred this visitor (?ref=code) for this session.
  try {
    var ref = new URLSearchParams(location.search).get("ref");
    if (ref && /^[a-zA-Z0-9_-]{3,40}$/.test(ref)) sessionStorage.setItem(REF_KEY, ref);
  } catch (e) { /* storage unavailable: referral simply isn't credited */ }

  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  // Real signup count, only when the owner supplies one.
  var count = Number(cfg.realSignupCount);
  if (count > 0) {
    document.querySelectorAll("[data-proof]").forEach(function (el) {
      el.textContent = "Join " + count.toLocaleString("en-US") + " women who are done accepting 3 a.m.";
    });
  }

  // Links that jump to a form also move keyboard focus into the email field.
  document.querySelectorAll("[data-focus-form]").forEach(function (link) {
    link.addEventListener("click", function (ev) {
      var id = (link.getAttribute("href") || "").replace("#", "");
      var form = document.getElementById(id);
      if (!form) return;
      ev.preventDefault();
      var input = /** @type {HTMLInputElement | null} */ (form.querySelector('input[type="email"]'));
      form.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      if (input) input.focus({ preventScroll: true });
    });
  });

  // ---------- Signup ----------
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setError(form, input, msg) {
    var err = form.querySelector(".join-error");
    if (err) err.textContent = msg || "";
    if (msg) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function makeCode() {
    var chars = "abcdefghjkmnpqrstuvwxyz23456789", out = "";
    var bytes = new Uint8Array(7);
    window.crypto.getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
    return out;
  }

  function save(data) {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  document.querySelectorAll("form[data-join]").forEach(function (form) {
    var input = /** @type {HTMLInputElement} */ (form.querySelector('input[type="email"]'));
    var button = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="submit"]'));
    var label = button.textContent;
    var busy = false;

    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid") === "true" && EMAIL_RE.test(input.value.trim())) setError(form, input, "");
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (busy) return;

      var honeypot = /** @type {HTMLInputElement | null} */ (form.querySelector('input[name="company"]'));
      if (honeypot && honeypot.value) return; // bot

      var email = input.value.trim();
      if (!email) { setError(form, input, "Please enter your email address."); input.focus(); return; }
      if (!EMAIL_RE.test(email)) { setError(form, input, "That email doesn't look quite right. Please check it, for example name@example.com."); input.focus(); return; }
      setError(form, input, "");

      var refCode = null;
      try { refCode = sessionStorage.getItem(REF_KEY); } catch (e) {}

      busy = true;
      button.setAttribute("aria-disabled", "true");
      button.textContent = "Joining";

      var done = function (result) {
        save({
          email: email,
          referralCode: (result && result.referralCode) || makeCode(),
          position: result && Number(result.position) > 0 ? Number(result.position) : null,
          preview: !cfg.signupEndpoint
        });
        location.href = "thanks.html";
      };

      var fail = function () {
        busy = false;
        button.removeAttribute("aria-disabled");
        button.textContent = label;
        setError(form, input, "Something went wrong on our side. Please try again in a moment.");
      };

      if (!cfg.signupEndpoint) { done(null); return; }

      fetch(cfg.signupEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ email: email, ref: refCode, source: form.id })
      }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json().catch(function () { return {}; });
      }).then(done, fail);
    });
  });

  // ---------- Sticky mobile CTA ----------
  var sticky = /** @type {HTMLElement | null} */ (document.querySelector("[data-sticky]"));
  var heroForm = document.getElementById("join-hero");
  var finalForm = document.getElementById("join-final");
  if (sticky && heroForm && "IntersectionObserver" in window) {
    var heroVisible = true, finalVisible = false;
    var update = function () {
      var show = !heroVisible && !finalVisible && window.innerWidth <= 900;
      sticky.hidden = !show;
      document.body.classList.toggle("has-sticky", show);
    };
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.target === heroForm) heroVisible = e.isIntersecting;
        if (e.target === finalForm) finalVisible = e.isIntersecting;
      });
      update();
    }).observe(heroForm);
    if (finalForm) new IntersectionObserver(function (entries) {
      finalVisible = entries[0].isIntersecting; update();
    }).observe(finalForm);
    window.addEventListener("resize", update);
  }
})();
