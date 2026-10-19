(function () {
  "use strict";

  var cfg = window.WAITLIST_CONFIG || {};
  var data = {};
  try { data = JSON.parse(sessionStorage.getItem("317_signup") || "{}") || {}; } catch (e) {}

  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  var isPreview = !!data.preview || !cfg.signupEndpoint;
  if (isPreview) {
    var pv = /** @type {HTMLElement | null} */ (document.querySelector("[data-preview]"));
    if (pv) pv.hidden = false;
  }

  /** @param {unknown} value @returns {URL | null} */
  function httpsUrl(value) {
    if (typeof value !== "string" || !value) return null;
    try {
      var u = new URL(value);
      return u.protocol === "https:" ? u : null;
    } catch (e) { return null; }
  }

  // Founding reservation: live only with a real https payment link and amount.
  // In preview mode it shows with placeholders so the owner can see it.
  var reserve = /** @type {HTMLElement | null} */ (document.querySelector("[data-reserve]"));
  if (reserve) {
    var payUrl = httpsUrl(cfg.reservationUrl);
    var amount = typeof cfg.reservationAmount === "string" ? cfg.reservationAmount.trim() : "";
    var live = !!(payUrl && amount);
    if (live || isPreview) {
      if (amount) {
        reserve.querySelectorAll("[data-reserve-amount]").forEach(function (el) {
          el.textContent = amount;
          el.classList.remove("ph");
        });
      }
      var payLink = /** @type {HTMLAnchorElement | null} */ (reserve.querySelector("[data-reserve-link]"));
      if (live && payUrl && payLink) {
        // Stripe Payment Links accept these: fills in her email and ties the deposit to her signup.
        if (payUrl.hostname === "buy.stripe.com") {
          if (data.email) payUrl.searchParams.set("prefilled_email", String(data.email));
          if (typeof data.referralCode === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(data.referralCode)) {
            payUrl.searchParams.set("client_reference_id", data.referralCode);
          }
        }
        payLink.href = payUrl.href;
        payLink.textContent = "Reserve for " + amount;
      } else {
        var rp = /** @type {HTMLElement | null} */ (reserve.querySelector("[data-reserve-preview]"));
        if (rp) rp.hidden = false;
      }
      reserve.hidden = false;
    }
  }

  // Referral reward: only the owner's real reward, never an invented one.
  var reward = /** @type {HTMLElement | null} */ (document.querySelector("[data-reward]"));
  if (reward) {
    var goal = Number(cfg.referralGoal);
    var rewardText = typeof cfg.referralReward === "string" ? cfg.referralReward.trim() : "";
    if (goal >= 1 && Math.floor(goal) === goal && rewardText) {
      reward.textContent = goal === 1
        ? "When a friend joins with your link, you get "
        : "When " + goal.toLocaleString("en-US") + " friends join with your link, you get ";
      var strong = document.createElement("strong");
      strong.textContent = rewardText;
      reward.appendChild(strong);
      reward.appendChild(document.createTextNode("."));
      reward.hidden = false;
    } else if (isPreview) {
      reward.hidden = false;
    }
  }

  // Position: only shown when the real signup service returned one.
  var pos = Number(data.position);
  var posEl = /** @type {HTMLElement | null} */ (document.querySelector("[data-position]"));
  if (posEl && pos > 0) {
    var batch = Number(cfg.foundingBatchSize);
    posEl.textContent = batch > 0 && pos <= batch
      ? "You're number " + pos.toLocaleString("en-US") + " of the first " + batch.toLocaleString("en-US") + "."
      : "You're number " + pos.toLocaleString("en-US") + " on the list.";
    posEl.hidden = false;
  }

  // Share link
  var base = (cfg.siteUrl || (location.origin + location.pathname.replace(/thanks\.html$/, ""))).replace(/\/?$/, "/");
  var link = data.referralCode ? base + "?ref=" + encodeURIComponent(data.referralCode) : base;
  var message = "I just joined the founding list for 3:17, sleep support for when you wake in the middle of the night and can't fall back asleep. Thought of you: " + link;

  var linkInput = /** @type {HTMLInputElement | null} */ (document.querySelector("[data-share-link]"));
  if (linkInput) linkInput.value = link;

  var sms = /** @type {HTMLAnchorElement | null} */ (document.querySelector("[data-share-sms]"));
  if (sms) sms.href = "sms:?&body=" + encodeURIComponent(message);
  var wa = /** @type {HTMLAnchorElement | null} */ (document.querySelector("[data-share-wa]"));
  if (wa) wa.href = "https://wa.me/?text=" + encodeURIComponent(message);

  var nativeBtn = /** @type {HTMLButtonElement | null} */ (document.querySelector("[data-share-native]"));
  if (nativeBtn && navigator.share) {
    nativeBtn.hidden = false;
    nativeBtn.addEventListener("click", function () {
      navigator.share({ title: "3:17", text: message.replace(" " + link, ""), url: link }).catch(function () {});
    });
  }

  var copyBtn = document.querySelector("[data-copy]");
  var copyStatus = document.querySelector("[data-copy-status]");
  if (copyBtn && linkInput) {
    copyBtn.addEventListener("click", function () {
      var ok = function () { copyStatus.textContent = "Link copied."; copyBtn.textContent = "Copied"; setTimeout(function () { copyBtn.textContent = "Copy link"; }, 2500); };
      var fallback = function () {
        linkInput.focus(); linkInput.select();
        var done = false;
        try { done = document.execCommand("copy"); } catch (e) {}
        if (done) ok(); else copyStatus.textContent = "Your link is selected. Press and hold, or use your keyboard, to copy it.";
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(link).then(ok, fallback);
      else fallback();
    });
  }

  // Quiz
  var quiz = /** @type {HTMLFormElement | null} */ (document.querySelector("form[data-quiz]"));
  var quizStatus = document.querySelector("[data-quiz-status]");
  if (quiz) {
    var busy = false;
    quiz.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (busy) return;
      var fd = new FormData(quiz);
      var answers = { email: data.email || null, wakeTime: fd.get("wakeTime"), stage: fd.get("stage"), next: fd.get("next") };
      if (!answers.wakeTime && !answers.stage && !answers.next) {
        quizStatus.textContent = "Choose at least one answer, or skip this. It's optional.";
        return;
      }
      var btn = quiz.querySelector('button[type="submit"]');
      var thanks = function () {
        busy = true;
        quizStatus.textContent = "Thank you. We've got your answers.";
        btn.textContent = "Answers sent";
        btn.setAttribute("aria-disabled", "true");
      };
      if (!cfg.quizEndpoint) {
        try { sessionStorage.setItem("317_quiz", JSON.stringify(answers)); } catch (e) {}
        thanks();
        return;
      }
      busy = true;
      quizStatus.textContent = "Sending";
      fetch(cfg.quizEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers)
      }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        thanks();
      }).catch(function () {
        busy = false;
        quizStatus.textContent = "We couldn't send that. Please try again.";
      });
    });
  }
})();
