const channels = [
  {
    id: "turkce",
    name: "Radyo Pop Türkçe",
    shortName: "Türkçe",
    streamUrl: "https://yayin.radyopop.site/turkce",
    logo: "assets/logos/radyo-pop-turkce.png",
    metadataUrl: "https://akkurtcastpanel.radyopop.site:5050/api/public/radios/radyo-pop-turkce/now-playing"
  },
  {
    id: "yabanci",
    name: "Radyo Pop Yabancı",
    shortName: "Yabancı",
    streamUrl: "https://yayin.radyopop.site/radyo",
    logo: "assets/logos/radyo-pop-yabanci.png",
    metadataUrl: "https://akkurtcastpanel.radyopop.site:5050/api/public/radios/radyo-pop/now-playing"
  },
  {
    id: "nostalji",
    name: "Radyo Pop Nostalji",
    shortName: "Nostalji",
    streamUrl: "https://yayin.radyopop.site/nostalji",
    logo: "assets/logos/radyo-pop-nostalji.png",
    metadataUrl: "https://akkurtcastpanel.radyopop.site:5050/api/public/radios/radyo-pop-nostalji/now-playing"
  },
  {
    id: "remix",
    name: "Radyo Pop Remix",
    shortName: "Remix",
    streamUrl: "https://yayin.radyopop.site/remix",
    logo: "assets/logos/radyo-pop-remix.png?v=5",
    metadataUrl: "https://akkurtcastpanel.radyopop.site:5050/api/public/radios/radyo-pop-remix/now-playing"
  },
  {
    id: "arabesk",
    name: "Radyo Pop Arabesk",
    shortName: "Arabesk",
    streamUrl: "https://yayin.radyopop.site/arabesk",
    logo: "assets/logos/radyo-pop-arabesk.png",
    metadataUrl: "https://akkurtcastpanel.radyopop.site:5050/api/public/radios/arabesk/now-playing"
  }
];

const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
const baseAudio = document.querySelector("#radioAudio");
const playToggle = document.querySelector("#playToggle");
const stationLogo = document.querySelector("#stationLogo");
const coverArt = document.querySelector("#coverArt");
const coverFrame = document.querySelector(".cover-frame");
const songTitle = document.querySelector("#songTitle");
const artistName = document.querySelector("#artistName");
const liveState = document.querySelector("#liveState");
const volumeRange = document.querySelector("#volumeRange");
const stationButtons = Array.from(document.querySelectorAll(".station-button"));
const dialogButtons = Array.from(document.querySelectorAll("[data-dialog]"));
const closeDialogButtons = Array.from(document.querySelectorAll("[data-close-dialog]"));
const chatWidget = document.querySelector("#siteChat");
const chatToggle = document.querySelector("#chatToggle");
const chatClose = document.querySelector("#chatClose");
const chatMessages = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");

const chatApiBase = "https://akkurtcastpanel.radyopop.site:5050";
const chatVisitorKey = "radyoPopChatVisitorId";
const chatConversationKey = "radyoPopChatConversationId";

const audioPool = new Map();

let activeChannel = channels[0];
let activeAudio = null;
let metadataTimer = null;
let intendedToPlay = false;
let fastSwitchingPrimed = false;
let switchToken = 0;
let chatConversationId = localStorage.getItem(chatConversationKey) || "";
let chatVisitorId = localStorage.getItem(chatVisitorKey) || "";
let chatPollTimer = null;
let chatStarting = false;

if (!chatVisitorId) {
  chatVisitorId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(chatVisitorKey, chatVisitorId);
}

function setLiveState(text) {
  liveState.textContent = text;
}

function updatePlayState(isPlaying) {
  document.body.classList.toggle("is-playing", isPlaying);
  playToggle.setAttribute("aria-label", isPlaying ? "Duraklat" : "Oynat");
}

function setCover(src, isLogo) {
  coverArt.src = src;
  coverFrame.classList.toggle("is-logo", isLogo);
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanTrackTitle(value) {
  return normalizeText(value)
    .replace(/\.(mp3|aac|m4a|wav|flac)$/i, "")
    .replace(/_/g, " ");
}

function parseNowPlaying(rawTitle) {
  const cleanTitle = cleanTrackTitle(rawTitle);

  if (!cleanTitle) {
    return { title: "", artist: "" };
  }

  const parts = cleanTitle.split(" - ");

  if (parts.length >= 2) {
    return {
      artist: normalizeText(parts.shift()),
      title: cleanTrackTitle(parts.join(" - "))
    };
  }

  return {
    title: cleanTitle,
    artist: ""
  };
}

function readAkkurtcastNowPlaying(data) {
  const now = data?.now || {};
  const apiTitle = cleanTrackTitle(now.title || "");
  const apiArtist = normalizeText(now.artist || "");

  if (apiTitle || apiArtist) {
    return {
      title: apiTitle,
      artist: apiArtist
    };
  }

  const fallbackTitle = cleanTrackTitle(now.filename || now.icy_title || now.metadata || "");
  return parseNowPlaying(fallbackTitle);
}

function readNowPlayingData(data, channel) {
  if (data?.now) {
    const info = readAkkurtcastNowPlaying(data);

    return {
      title: info.title || channel.name,
      artist: info.artist || channel.shortName,
      artwork: ""
    };
  }

  return {
    title: cleanTrackTitle(data?.song || data?.title || channel.name),
    artist: normalizeText(data?.artist || channel.shortName),
    artwork: data?.artwork || ""
  };
}

function searchItunesArtwork(info) {
  const searchKey = normalizeText(`${info.artist} ${info.title}`);

  if (!searchKey || searchKey === info.title) {
    return Promise.resolve("");
  }

  return new Promise((resolve) => {
    const callbackName = `itunesCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (data) => {
      cleanup();
      const artwork = data?.results?.[0]?.artworkUrl100 || "";
      resolve(artwork ? artwork.replace("100x100bb", "512x512bb") : "");
    };

    script.onerror = () => {
      cleanup();
      resolve("");
    };

    script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(searchKey)}&media=music&entity=song&limit=1&country=TR&callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

function renderStation(channel) {
  stationLogo.src = channel.logo;
  stationLogo.alt = channel.name;
  setCover(channel.logo, true);
  songTitle.textContent = channel.name;
  artistName.textContent = channel.shortName;

  stationButtons.forEach((button) => {
    const isActive = button.dataset.station === channel.id;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function isActivePlayer(player) {
  return activeAudio === player && activeChannel.id === player.dataset.station;
}

function setPlayerAudible(player, audible) {
  player.muted = !audible;
  player.volume = audible ? Number(volumeRange.value) : 0;
}

function muteStandbyPlayers(exceptId) {
  audioPool.forEach((player, id) => {
    if (id !== exceptId) {
      setPlayerAudible(player, false);
    }
  });
}

function attachPlayerEvents(player) {
  player.addEventListener("playing", () => {
    if (isActivePlayer(player) && intendedToPlay) {
      updatePlayState(true);
      setLiveState("Canlı yayında");
    }
  });

  player.addEventListener("waiting", () => {
    if (isActivePlayer(player) && intendedToPlay) {
      setLiveState("Bağlanıyor");
    }
  });

  player.addEventListener("stalled", () => {
    if (isActivePlayer(player) && intendedToPlay) {
      setLiveState("Bağlantı yenileniyor");
    }
  });

  player.addEventListener("pause", () => {
    if (isActivePlayer(player) && !intendedToPlay) {
      updatePlayState(false);
    }
  });

  player.addEventListener("error", () => {
    if (isActivePlayer(player)) {
      intendedToPlay = false;
      updatePlayState(false);
      setLiveState("Yayın bağlantısı kontrol ediliyor");
    }
  });
}

function ensurePlayer(channelId) {
  if (audioPool.has(channelId)) {
    return audioPool.get(channelId);
  }

  const channel = channelMap.get(channelId);
  const player = audioPool.size === 0 && baseAudio ? baseAudio : document.createElement("audio");

  player.preload = "auto";
  player.playsInline = true;
  player.dataset.station = channel.id;
  player.src = channel.streamUrl;
  setPlayerAudible(player, false);
  attachPlayerEvents(player);

  if (player !== baseAudio) {
    player.setAttribute("aria-hidden", "true");
    document.body.appendChild(player);
  }

  audioPool.set(channelId, player);

  try {
    player.load();
  } catch {
    // Browser desteklemezse play() anında tekrar deneyecek.
  }

  return player;
}

function preparePlayers() {
  channels.forEach((channel) => ensurePlayer(channel.id));
}

async function warmPlayer(channelId) {
  const player = ensurePlayer(channelId);

  if (!player.paused) {
    return true;
  }

  setPlayerAudible(player, false);

  try {
    await player.play();
    return true;
  } catch {
    try {
      player.load();
    } catch {
      // Bağlantı yine play() ile yeniden denenecek.
    }

    return false;
  }
}

function primeFastSwitching() {
  if (fastSwitchingPrimed) {
    return;
  }

  fastSwitchingPrimed = true;

  channels.forEach((channel) => {
    if (channel.id !== activeChannel.id) {
      warmPlayer(channel.id);
    }
  });
}

async function loadNowPlaying(channelId) {
  const channel = channelMap.get(channelId);

  if (!channel) {
    return;
  }

  try {
    const metadataUrl = channel.metadataUrl || `api/now-playing/${channelId}`;
    const response = await fetch(metadataUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Parça bilgisi alınamadı.");
    }

    const data = await response.json();

    if (activeChannel.id !== channelId) {
      return;
    }

    const info = readNowPlayingData(data, channel);
    songTitle.textContent = info.title || channel.name;
    artistName.textContent = info.artist || channel.shortName;
    const artwork = info.artwork || await searchItunesArtwork(info);

    if (activeChannel.id !== channelId) {
      return;
    }

    if (artwork) {
      setCover(artwork, false);
    } else {
      setCover(channel.logo, true);
    }
  } catch {
    if (activeChannel.id === channelId) {
      songTitle.textContent = channel.name;
      artistName.textContent = channel.shortName;
      setCover(channel.logo, true);
    }
  }
}

function scheduleMetadata() {
  clearInterval(metadataTimer);
  loadNowPlaying(activeChannel.id);
  metadataTimer = setInterval(() => loadNowPlaying(activeChannel.id), 25000);
}

function chatRequest(path, options = {}) {
  return fetch(`${chatApiBase}${path}`, {
    cache: "no-store",
    ...options
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Sohbet bağlantısı kurulamadı.");
    }

    return data;
  });
}

function chatPost(path, payload) {
  return chatRequest(path, {
    method: "POST",
    body: new URLSearchParams(payload)
  });
}

function renderChatMessages(conversation) {
  if (!chatMessages || !conversation) {
    return;
  }

  chatMessages.textContent = "";

  conversation.messages.forEach((message) => {
    const row = document.createElement("div");
    const bubble = document.createElement("div");

    row.className = `chat-row ${message.sender === "visitor" ? "is-me" : "is-agent"}`;
    bubble.className = "chat-bubble";
    bubble.textContent = message.text || "";
    row.appendChild(bubble);
    chatMessages.appendChild(row);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function startChat() {
  if (chatStarting) {
    return null;
  }

  chatStarting = true;

  try {
    const data = await chatPost("/api/public/chat/start", {
      visitor_id: chatVisitorId,
      conversation_id: chatConversationId,
      name: "Web Ziyaretçisi"
    });

    chatConversationId = data.conversation?.id || "";

    if (chatConversationId) {
      localStorage.setItem(chatConversationKey, chatConversationId);
    }

    renderChatMessages(data.conversation);
    return data.conversation;
  } finally {
    chatStarting = false;
  }
}

async function refreshChat() {
  if (!chatConversationId) {
    await startChat();
    return;
  }

  const query = new URLSearchParams({ visitor_id: chatVisitorId });
  const data = await chatRequest(`/api/public/chat/${encodeURIComponent(chatConversationId)}?${query}`);
  renderChatMessages(data.conversation);
}

function setChatOpen(open) {
  if (!chatWidget || !chatToggle) {
    return;
  }

  chatWidget.classList.toggle("is-open", open);
  chatToggle.setAttribute("aria-expanded", String(open));

  if (open) {
    startChat().catch(() => {});
    chatInput?.focus();
    clearInterval(chatPollTimer);
    chatPollTimer = setInterval(() => refreshChat().catch(() => {}), 4500);
  } else {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

chatToggle?.addEventListener("click", () => {
  setChatOpen(!chatWidget.classList.contains("is-open"));
});

chatClose?.addEventListener("click", () => {
  setChatOpen(false);
});

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = normalizeText(chatInput?.value || "");

  if (!text) {
    return;
  }

  if (chatInput) {
    chatInput.value = "";
  }

  try {
    if (!chatConversationId) {
      await startChat();
    }

    const data = await chatPost(`/api/public/chat/${encodeURIComponent(chatConversationId)}/message`, {
      visitor_id: chatVisitorId,
      name: "Web Ziyaretçisi",
      text
    });

    renderChatMessages(data.conversation);
  } catch {
    const fallback = document.createElement("div");
    fallback.className = "chat-row is-agent";
    fallback.innerHTML = '<div class="chat-bubble">Mesaj gönderilemedi. Lütfen biraz sonra tekrar deneyin.</div>';
    chatMessages?.appendChild(fallback);
  }
});

async function playActiveChannel({ keepCurrentUntilReady = false } = {}) {
  const token = ++switchToken;
  const targetAudio = ensurePlayer(activeChannel.id);
  const previousAudio = activeAudio && activeAudio !== targetAudio ? activeAudio : null;

  intendedToPlay = true;
  activeAudio = targetAudio;

  if (!targetAudio.paused) {
    setPlayerAudible(targetAudio, true);
    muteStandbyPlayers(activeChannel.id);
    updatePlayState(true);
    setLiveState("Canlı yayında");
    primeFastSwitching();
    return;
  }

  setLiveState("Bağlanıyor");
  setPlayerAudible(targetAudio, !keepCurrentUntilReady);

  try {
    if (keepCurrentUntilReady) {
      setPlayerAudible(targetAudio, false);
    }

    await targetAudio.play();

    if (token !== switchToken) {
      return;
    }

    setPlayerAudible(targetAudio, true);
    muteStandbyPlayers(activeChannel.id);
    updatePlayState(true);
    setLiveState("Canlı yayında");
    primeFastSwitching();
  } catch {
    if (token !== switchToken) {
      return;
    }

    intendedToPlay = false;
    setPlayerAudible(targetAudio, false);

    if (previousAudio) {
      setPlayerAudible(previousAudio, false);
    }

    updatePlayState(false);
    setLiveState("Yayın hazır");
  }
}

function pausePlayback() {
  intendedToPlay = false;
  fastSwitchingPrimed = false;
  switchToken += 1;

  audioPool.forEach((player) => {
    setPlayerAudible(player, false);
    player.pause();
  });

  setLiveState("Duraklatıldı");
  updatePlayState(false);
}

function selectStation(channelId, playAfterSelect = false) {
  const channel = channelMap.get(channelId);

  if (!channel) {
    return;
  }

  const wasPlaying = intendedToPlay && activeAudio && !activeAudio.paused;
  activeChannel = channel;
  renderStation(channel);
  scheduleMetadata();

  if (wasPlaying || playAfterSelect) {
    playActiveChannel({ keepCurrentUntilReady: wasPlaying });
  } else {
    activeAudio = ensurePlayer(channel.id);
    muteStandbyPlayers(channel.id);
    setLiveState("Yayın hazır");
  }
}

stationButtons.forEach((button) => {
  button.addEventListener("pointerenter", () => {
    warmPlayer(button.dataset.station);
  });

  button.addEventListener("focus", () => {
    warmPlayer(button.dataset.station);
  });

  button.addEventListener("click", () => {
    selectStation(button.dataset.station, true);
  });
});

dialogButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const dialog = document.querySelector(`#${button.dataset.dialog}`);

    if (!dialog) {
      return;
    }

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  });
});

closeDialogButtons.forEach((button) => {
  button.addEventListener("click", () => {
    button.closest("dialog")?.close();
  });
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
});

playToggle.addEventListener("click", () => {
  if (!intendedToPlay || !activeAudio || activeAudio.paused) {
    playActiveChannel();
  } else {
    pausePlayback();
  }
});

volumeRange.addEventListener("input", () => {
  if (activeAudio && intendedToPlay) {
    activeAudio.volume = Number(volumeRange.value);
  }
});

renderStation(activeChannel);
preparePlayers();
activeAudio = ensurePlayer(activeChannel.id);
scheduleMetadata();
