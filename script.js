const streamUrl = "https://ec1.everestcast.host:1595/stream";
const metadataUrl = "https://ec1.everestcast.host:1595/status-json.xsl";
const defaultArtwork = "assets/radyo-pop-icon.png";

const audio = document.getElementById("radioStream");
const playButton = document.getElementById("playButton");
const heroPlayButton = document.getElementById("heroPlayButton");
const volumeControl = document.getElementById("volumeControl");
const statusTitle = document.getElementById("statusTitle");
const statusText = document.getElementById("statusText");
const copyLinkButton = document.getElementById("copyLinkButton");
const streamUrlField = document.getElementById("streamUrl");
const equalizer = document.querySelector(".equalizer");
const trackTitle = document.getElementById("trackTitle");
const trackArtist = document.getElementById("trackArtist");
const trackArtwork = document.getElementById("trackArtwork");
const scheduleBadge = document.getElementById("scheduleBadge");
const scheduleItems = [...document.querySelectorAll(".schedule-item")];

const artworkCache = new Map();

const idleState = {
  title: "Radyo Pop Canlı Yayın",
  text: "Yayını başlatmak için oynat düğmesine basın.",
};

const playingState = {
  title: "Radyo Pop Canlı Yayın",
  text: "Yayın açık. Keyifli dinlemeler.",
};

const loadingState = {
  title: "Bağlanıyor...",
  text: "Yayın hazırlanıyor. Birkaç saniye içinde ses gelmeli.",
};

const errorState = {
  title: "Bağlantı Hatası",
  text: "Yayın şu anda açılamadı. Harici oynatıcı bağlantısını deneyebilirsiniz.",
};

function setVisualState(isPlaying) {
  playButton.textContent = isPlaying ? "❚❚" : "▶";
  playButton.setAttribute("aria-label", isPlaying ? "Yayını durdur" : "Yayını oynat");
  heroPlayButton.textContent = isPlaying ? "Yayını Durdur" : "Yayını Başlat";
  if (equalizer) {
    equalizer.classList.toggle("is-idle", !isPlaying);
  }
}

function updateStatus(state) {
  statusTitle.textContent = state.title;
  statusText.textContent = state.text;
}

function toMinutes(timeValue) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  return hours * 60 + minutes;
}

function getCurrentScheduleItem() {
  const now = new Date();
  const day = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isWeekend = day === 0 || day === 6;
  const activeGroup = isWeekend ? "weekend" : "weekday";

  for (const item of scheduleItems) {
    if (item.dataset.group !== activeGroup) {
      continue;
    }

    const start = toMinutes(item.dataset.start);
    const end = toMinutes(item.dataset.end);
    const isOvernight = end <= start;
    const isActive = isOvernight
      ? currentMinutes >= start || currentMinutes < end
      : currentMinutes >= start && currentMinutes < end;

    if (isActive) {
      return item;
    }
  }

  return null;
}

function updateScheduleHighlight() {
  scheduleItems.forEach((item) => item.classList.remove("is-live"));

  const activeItem = getCurrentScheduleItem();
  if (!activeItem) {
    if (scheduleBadge) {
      scheduleBadge.textContent = "Canlı Akış";
    }
    return;
  }

  activeItem.classList.add("is-live");
  if (scheduleBadge) {
    const showName = activeItem.querySelector("strong")?.textContent?.trim() || "Canlı Akış";
    scheduleBadge.textContent = `Şu anda yayında: ${showName}`;
  }
}

function normalizeText(value) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/[|–]/g, "-")
    .trim();
}

function parseNowPlaying(rawTitle) {
  const cleanTitle = normalizeText(rawTitle);

  if (!cleanTitle) {
    return { title: "Yayın bilgisi yükleniyor", artist: "Radyo Pop" };
  }

  const parts = cleanTitle.split(" - ");
  if (parts.length >= 2) {
    return {
      artist: parts.shift().trim(),
      title: parts.join(" - ").trim(),
    };
  }

  return { title: cleanTitle, artist: "Radyo Pop" };
}

function escapeJsonpValue(value) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function loadArtworkJsonp(searchTerm) {
  return new Promise((resolve) => {
    const callbackName = `itunesCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");

    window[callbackName] = (payload) => {
      const artwork =
        payload?.results?.[0]?.artworkUrl100?.replace("100x100bb", "600x600bb") ||
        payload?.results?.[0]?.artworkUrl100 ||
        null;
      cleanup();
      resolve(artwork);
    };

    function cleanup() {
      delete window[callbackName];
      script.remove();
    }

    script.onerror = () => {
      cleanup();
      resolve(null);
    };

    script.src = `https://itunes.apple.com/search?media=music&entity=song&limit=1&term=${escapeJsonpValue(searchTerm)}&callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

async function updateArtwork(info) {
  const searchKey = `${info.artist} ${info.title}`.trim();

  if (!searchKey) {
    trackArtwork.src = defaultArtwork;
    return;
  }

  if (artworkCache.has(searchKey)) {
    trackArtwork.src = artworkCache.get(searchKey) || defaultArtwork;
    return;
  }

  const artwork = await loadArtworkJsonp(searchKey);
  artworkCache.set(searchKey, artwork || defaultArtwork);
  trackArtwork.src = artwork || defaultArtwork;
}

async function refreshNowPlaying() {
  try {
    const response = await fetch(metadataUrl, { cache: "no-store" });
    const data = await response.json();
    const source = Array.isArray(data?.icestats?.source) ? data.icestats.source[0] : data?.icestats?.source;

    const rawTitle =
      source?.title ||
      source?.metadata?.x_icy_title ||
      source?.yp_currently_playing ||
      source?.server_name;

    const info = parseNowPlaying(rawTitle);
    trackTitle.textContent = info.title;
    trackArtist.textContent = info.artist;
    await updateArtwork(info);
  } catch (error) {
    trackTitle.textContent = "Yayın bilgisi alınamadı";
    trackArtist.textContent = "Radyo Pop";
    trackArtwork.src = defaultArtwork;
  }
}

async function togglePlayback() {
  try {
    if (audio.paused) {
      setVisualState(false);
      updateStatus(loadingState);
      await audio.play();
    } else {
      audio.pause();
    }
  } catch (error) {
    setVisualState(false);
    updateStatus(errorState);
  }
}

async function copyStreamLink() {
  const restoreText = copyLinkButton.textContent;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(streamUrl);
    } else {
      const helper = document.createElement("textarea");
      helper.value = streamUrl;
      helper.setAttribute("readonly", "");
      helper.style.position = "absolute";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      document.body.removeChild(helper);
    }

    copyLinkButton.textContent = "Kopyalandı";
    setTimeout(() => {
      copyLinkButton.textContent = restoreText;
    }, 1600);
  } catch (error) {
    copyLinkButton.textContent = "Kopyalanamadı";
    setTimeout(() => {
      copyLinkButton.textContent = restoreText;
    }, 1600);
  }
}

playButton.addEventListener("click", togglePlayback);
heroPlayButton.addEventListener("click", togglePlayback);
copyLinkButton.addEventListener("click", copyStreamLink);

volumeControl.addEventListener("input", (event) => {
  audio.volume = Number(event.target.value);
});

audio.addEventListener("playing", () => {
  setVisualState(true);
  updateStatus(playingState);
});

audio.addEventListener("loadstart", () => {
  if (!audio.paused) {
    updateStatus(loadingState);
  }
});

audio.addEventListener("waiting", () => {
  setVisualState(false);
  updateStatus(loadingState);
});

audio.addEventListener("pause", () => {
  setVisualState(false);
  updateStatus(idleState);
});

audio.addEventListener("error", () => {
  setVisualState(false);
  updateStatus(errorState);
});

audio.volume = Number(volumeControl.value);
streamUrlField.textContent = streamUrl;
audio.load();
setVisualState(false);
updateStatus(idleState);
refreshNowPlaying();
updateScheduleHighlight();
window.setInterval(refreshNowPlaying, 15000);
window.setInterval(updateScheduleHighlight, 60000);
