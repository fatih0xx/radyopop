(function () {
  const key = String(window.RADYO_POP_TIDIO_PUBLIC_KEY || "").trim();

  if (!key || key === "TIDIO_PUBLIC_KEY_BURAYA") {
    return;
  }

  const script = document.createElement("script");
  script.src = `https://code.tidio.co/${encodeURIComponent(key)}.js`;
  script.async = true;
  document.body.appendChild(script);
})();
