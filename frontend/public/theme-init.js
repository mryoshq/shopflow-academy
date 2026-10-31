// Applies the saved theme before the first paint (no flash). External file: the CSP forbids inline scripts.
(function () {
  try {
    var choice = window.localStorage.getItem("shopflow:theme") || "system"
    var dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
    var root = document.documentElement
    root.classList.toggle("dark", dark)
    root.classList.toggle("light", !dark)
    root.style.colorScheme = dark ? "dark" : "light"
    // ADR-0036: the tab icon follows the theme chosen in the application (green logo in light, clay in dark).
    // Same rule as src/useColorMode.ts (setFavicon); without JavaScript, favicon.svg stays.
    var links = document.querySelectorAll("link[rel~='icon']")
    var icon = document.getElementById("theme-icon")
    if (!icon) {
      icon = document.createElement("link")
      icon.id = "theme-icon"
      icon.rel = "icon"
      icon.type = "image/png"
      icon.setAttribute("sizes", "64x64")
      for (var i = 0; i < links.length; i++) links[i].parentNode.removeChild(links[i])
      document.head.appendChild(icon)
    }
    icon.href = dark ? "/icons/favicon-dark.png" : "/icons/favicon-light.png"
    // ADR-0036: text size and reduced motion, same rules as src/preferences/display.ts.
    var zoom = Number(window.localStorage.getItem("shopflow:zoom"))
    if ([0.8, 0.9, 1.1, 1.25, 1.4, 1.5].indexOf(zoom) !== -1) root.style.fontSize = (zoom * 100) + "%"
    if (window.localStorage.getItem("shopflow:motion") === "reduce") root.classList.add("reduce-motion")
  } catch (error) { /* storage unavailable: light theme */ }
  // ADR-0040: interface language before the first paint, same rule as src/i18n (choice, else browser, else French).
  try {
    var lang = null
    try { lang = window.localStorage.getItem("shopflow:lang") } catch (error) { /* storage blocked */ }
    if (lang !== "fr" && lang !== "en") {
      var wanted = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "fr"])
      lang = "fr"
      for (var j = 0; j < wanted.length; j++) { var code = String(wanted[j]).toLowerCase().slice(0, 2); if (code === "fr" || code === "en") { lang = code; break } }
    }
    document.documentElement.lang = lang
    document.documentElement.dir = "ltr"
  } catch (error) { /* French */ }
})()
