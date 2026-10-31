// ADR-0038: attempts with a growing delay (1, 2, 4, 8, 16, then 30 s), same rule as src/resilience.ts.
// When the platform answers, the requested page is reloaded (the address, hash included, is unchanged).
(function () {
  // ADR-0040: English when theme-init.js chose it (French is written in the page itself).
  var english = document.documentElement.lang === "en"
  if (english) {
    document.title = "Temporarily unavailable — Rapidfox Academy"
    document.getElementById("module").textContent = "Python Data Engineering & Advanced SQL"
    document.getElementById("heading").textContent = "Temporarily unavailable"
    document.getElementById("text").textContent = "The platform is temporarily unavailable. Your session and your work are kept. Trying again automatically…"
    document.getElementById("retry").textContent = "Try again now"
  }
  var attempt = 0, left = 0, timer = null
  var next = document.getElementById("next")
  var button = document.getElementById("retry")
  function delay(n) { return Math.min(30, Math.pow(2, n)) }
  function show() {
    next.textContent = english ? (left > 0 ? "Next attempt in " + left + " s" : "Trying again…")
      : (left > 0 ? "Prochaine tentative dans " + left + " s" : "Nouvelle tentative…")
  }
  function probe() {
    fetch("/health/live", { cache: "no-store", credentials: "same-origin" })
      .then(function (response) { if (response.ok) window.location.reload(); else wait() })
      .catch(wait)
  }
  function wait() {
    left = delay(attempt)
    attempt += 1
    show()
    clearInterval(timer)
    timer = setInterval(function () {
      left -= 1
      show()
      if (left <= 0) { clearInterval(timer); probe() }
    }, 1000)
  }
  button.addEventListener("click", function () { clearInterval(timer); left = 0; show(); probe() })
  wait()
})()
