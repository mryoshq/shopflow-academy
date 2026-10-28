// Applies the saved theme before the first paint (no flash). External file: the CSP forbids inline scripts.
(function () {
  try {
    var choice = window.localStorage.getItem("shopflow:theme") || "system"
    var dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
    var root = document.documentElement
    root.classList.toggle("dark", dark)
    root.classList.toggle("light", !dark)
    root.style.colorScheme = dark ? "dark" : "light"
  } catch (error) { /* storage unavailable: light theme */ }
})()
