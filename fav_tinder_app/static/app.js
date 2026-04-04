const state = {
  items: [],
  decisions: {},
  tags: [],
  queue: [],
  currentItem: null,
  exportReady: false,
  savePanelItem: null,
  savePanelTags: [],
  history: [],
  settings: {
    proMode: false,
    exportJsonPath: "",
    exportRoot: "",
    outputPath: "",
    defaultTags: [],
  },
  settingsDraftTags: [],
};

const elements = {
  statTotal: document.getElementById("stat-total"),
  statLeft: document.getElementById("stat-left"),
  statSaved: document.getElementById("stat-saved"),
  footerStats: document.querySelector(".footer-stats"),
  deleteBtn: document.getElementById("delete-btn"),
  stageLayout: document.getElementById("stage-layout"),
  cardStage: document.getElementById("card-stage"),
  card: document.getElementById("message-card"),
  emptyState: document.getElementById("empty-state"),
  emptyTitle: document.getElementById("empty-title"),
  emptyCopy: document.getElementById("empty-copy"),
  emptyPickExportBtn: document.getElementById("empty-pick-export-btn"),
  messageDate: document.getElementById("message-date"),
  messageSourceWrap: document.getElementById("message-source-wrap"),
  messageSource: document.getElementById("message-source"),
  messageTime: document.getElementById("message-time"),
  messageMedia: document.getElementById("message-media"),
  messageWebpage: document.getElementById("message-webpage"),
  messageText: document.getElementById("message-text"),
  messageLinks: document.getElementById("message-links"),
  savePanel: document.getElementById("save-panel"),
  presetTags: document.getElementById("preset-tags"),
  customTagInput: document.getElementById("custom-tag-input"),
  saveCommentInput: document.getElementById("save-comment-input"),
  cancelSaveBtn: document.getElementById("cancel-save-btn"),
  confirmSaveBtn: document.getElementById("confirm-save-btn"),
  skipBtn: document.getElementById("skip-btn"),
  saveBtn: document.getElementById("save-btn"),
  swipeHints: document.querySelector(".swipe-hints"),
  openSettingsBtn: document.getElementById("open-settings-btn"),
  settingsModal: document.getElementById("settings-modal"),
  closeSettingsBtn: document.getElementById("close-settings-btn"),
  proModeBtn: document.getElementById("pro-mode-btn"),
  proModeStatus: document.getElementById("pro-mode-status"),
  settingsExportPath: document.getElementById("settings-export-path"),
  settingsOutputPath: document.getElementById("settings-output-path"),
  pickExportBtn: document.getElementById("pick-export-btn"),
  openExportFolderBtn: document.getElementById("open-export-folder-btn"),
  pickOutputBtn: document.getElementById("pick-output-btn"),
  openOutputFolderBtn: document.getElementById("open-output-folder-btn"),
  settingsTagsEditor: document.getElementById("settings-tags-editor"),
  settingsTagInput: document.getElementById("settings-tag-input"),
  saveSettingsTagsBtn: document.getElementById("save-settings-tags-btn"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeTagKey(value) {
  return String(value || "").trim().toLocaleLowerCase("ru");
}

function tagUsageCountMap() {
  const counts = new Map();
  for (const decision of Object.values(state.decisions)) {
    if (decision.action !== "save") {
      continue;
    }
    for (const tag of decision.tags || []) {
      const key = normalizeTagKey(tag);
      if (!key) {
        continue;
      }
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

function mergeKnownTags(tags) {
  const byKey = new Map(state.tags.map((tag) => [normalizeTagKey(tag), tag]));
  for (const tag of tags) {
    const cleaned = String(tag || "").trim();
    const key = normalizeTagKey(cleaned);
    if (key && !byKey.has(key)) {
      byKey.set(key, cleaned);
    }
  }
  state.tags = [...byKey.values()];
}

function syncSettingsState(settings = {}) {
  state.settings.proMode = Boolean(settings.pro_mode);
  state.settings.exportJsonPath = String(settings.export_json_path || "");
  state.settings.exportRoot = String(settings.export_root || "");
  state.exportReady = Boolean(settings.export_ready);
  state.settings.outputPath = String(settings.obsidian_output_path || "");
  state.settings.defaultTags = Array.isArray(settings.default_tags) ? [...settings.default_tags] : [];
  state.settingsDraftTags = [...state.settings.defaultTags];
  mergeKnownTags(state.settings.defaultTags);
}

function getOrderedKnownTags() {
  const counts = tagUsageCountMap();
  return [...state.tags].sort((left, right) => {
    const leftCount = counts.get(normalizeTagKey(left)) || 0;
    const rightCount = counts.get(normalizeTagKey(right)) || 0;
    if (leftCount !== rightCount) {
      return rightCount - leftCount;
    }
    return left.localeCompare(right, "ru");
  });
}

function sortByDateAsc(items) {
  return [...items].sort((a, b) => {
    if (a.date_iso === b.date_iso) {
      return a.id - b.id;
    }
    return a.date_iso > b.date_iso ? 1 : -1;
  });
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function hostFromHref(href) {
  try {
    const parsed = new URL(href);
    return (parsed.hostname || parsed.host || href).replace(/^www\./, "");
  } catch {
    return String(href || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "link";
  }
}

function pathFromHref(href) {
  try {
    const parsed = new URL(href);
    const path = `${parsed.pathname || ""}${parsed.search || ""}`.replace(/^\/+/, "");
    return path || parsed.hostname || href;
  } catch {
    return String(href || "").replace(/^https?:\/\//, "");
  }
}

function collapseWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const TAG_PALETTE = [
  { bg: "rgba(255, 214, 220, 0.32)", border: "rgba(255, 185, 195, 0.56)", text: "#ffeef2" },
  { bg: "rgba(255, 230, 199, 0.3)", border: "rgba(255, 206, 158, 0.56)", text: "#fff4e8" },
  { bg: "rgba(255, 243, 176, 0.28)", border: "rgba(242, 220, 118, 0.5)", text: "#fffbe6" },
  { bg: "rgba(197, 244, 210, 0.28)", border: "rgba(155, 226, 177, 0.54)", text: "#effff4" },
  { bg: "rgba(192, 235, 255, 0.28)", border: "rgba(141, 210, 245, 0.52)", text: "#eef9ff" },
  { bg: "rgba(210, 217, 255, 0.3)", border: "rgba(172, 183, 255, 0.54)", text: "#f1f4ff" },
  { bg: "rgba(239, 210, 255, 0.3)", border: "rgba(220, 172, 255, 0.5)", text: "#faf0ff" },
  { bg: "rgba(255, 214, 242, 0.3)", border: "rgba(255, 177, 226, 0.52)", text: "#fff0fa" },
];

function tagAccent(tag) {
  const key = normalizeTagKey(tag);
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

function applyTagAccent(node, tag) {
  const accent = tagAccent(tag);
  node.style.setProperty("--tag-bg", accent.bg);
  node.style.setProperty("--tag-border", accent.border);
  node.style.setProperty("--tag-text", accent.text);
}

function refreshQueue() {
  state.queue = state.items.filter((item) => !state.decisions[String(item.id)]);
  state.currentItem = state.queue[0] || null;
}

function isProMode() {
  return Boolean(state.settings?.proMode);
}

function isSettingsOpen() {
  return !elements.settingsModal.classList.contains("hidden");
}

function leftAction() {
  return isProMode() ? "delete" : "skip";
}

function syncStageVerticalAlignment() {
  const stage = elements.cardStage;
  if (!stage) {
    return;
  }
}

function getDecision(itemId) {
  return state.decisions[String(itemId)] || null;
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function isInteractiveTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("button, a, input, textarea, select, summary"));
}

function mediaSourcePath(media) {
  return media?.source_path ? `/source/${encodeURI(media.source_path)}` : null;
}

function mediaPreviewPath(media) {
  return media?.preview_path ? `/source/${encodeURI(media.preview_path)}` : null;
}

function isVoiceMessage(media) {
  return media?.media_type === "voice_message";
}

function isRoundVideo(media) {
  return media?.media_type === "video_message" || String(media?.source_path || "").includes("round_video_messages/");
}

function renderStats() {
  elements.footerStats.classList.toggle("hidden", !state.exportReady);
  const total = state.items.length;
  const left = state.queue.length;
  const saved = Object.values(state.decisions).filter((decision) => decision.action === "save").length;

  elements.statTotal.textContent = total;
  elements.statLeft.textContent = left;
  elements.statSaved.textContent = saved;
}

function renderActionButtons() {
  const proMode = isProMode();
  elements.deleteBtn.classList.toggle("hidden", !proMode);
  elements.proModeBtn.classList.toggle("active", proMode);
  elements.proModeStatus.textContent = proMode ? "Вкл" : "Выкл";
  const skipIcon = elements.skipBtn?.querySelector("svg");
  if (skipIcon) {
    skipIcon.innerHTML = proMode
      ? '<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="5 12 12 19 19 12"></polyline>'
      : '<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>';
  }
}

function truncateMiddle(value, maxLength = 74) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  const left = Math.ceil((maxLength - 1) / 2);
  const right = Math.floor((maxLength - 1) / 2);
  return `${text.slice(0, left)}…${text.slice(-right)}`;
}

function renderSettingsModal() {
  renderActionButtons();
  elements.settingsExportPath.textContent = truncateMiddle(state.settings.exportJsonPath || "Не выбран");
  elements.settingsOutputPath.textContent = truncateMiddle(state.settings.outputPath || "Не выбрана");
  elements.openExportFolderBtn.disabled = !state.exportReady;
  elements.settingsTagsEditor.innerHTML = "";

  for (const tag of state.settingsDraftTags) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-chip active settings-tag-chip";
    chip.textContent = tag;
    applyTagAccent(chip, tag);
    chip.addEventListener("click", () => {
      state.settingsDraftTags = state.settingsDraftTags.filter((entry) => normalizeTagKey(entry) !== normalizeTagKey(tag));
      renderSettingsModal();
    });
    elements.settingsTagsEditor.append(chip);
  }
}

function openSettingsModal() {
  state.settingsDraftTags = [...state.settings.defaultTags];
  elements.settingsTagInput.value = "";
  elements.settingsModal.classList.remove("hidden");
  renderSettingsModal();
}

function closeSettingsModal() {
  elements.settingsModal.classList.add("hidden");
}

function addSettingsDraftTag(tag) {
  const cleaned = String(tag || "").trim();
  const key = normalizeTagKey(cleaned);
  if (!key || state.settingsDraftTags.some((entry) => normalizeTagKey(entry) === key)) {
    return false;
  }
  state.settingsDraftTags = [...state.settingsDraftTags, cleaned];
  return true;
}

function commitSettingsTagInput() {
  const rawValue = elements.settingsTagInput.value;
  const parts = rawValue
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  let changed = false;
  for (const tag of parts) {
    changed = addSettingsDraftTag(tag) || changed;
  }
  if (changed || rawValue.trim()) {
    elements.settingsTagInput.value = "";
  }
  return changed;
}

function createMetaPill(item, media) {
  const pill = document.createElement("div");
  pill.className = "media-meta-pill";
  const parts = [];
  if (media.duration_seconds) {
    parts.push(formatDuration(media.duration_seconds));
  }
  parts.push(item.time_display);
  pill.textContent = parts.join("  ");
  return pill;
}

function createOpenOriginalButton(sourcePath) {
  if (!sourcePath) {
    return null;
  }
  const anchor = document.createElement("a");
  anchor.className = "open-original-button";
  anchor.href = sourcePath;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.title = "Открыть оригинал";
  anchor.textContent = "↗";
  return anchor;
}

function syncToggleButton(button, isPlaying) {
  button.textContent = isPlaying ? "❚❚" : "▶";
}

function buildWaveform(seed, count = 28) {
  let value = Number(seed) || 1;
  const bars = [];
  for (let index = 0; index < count; index += 1) {
    value = (value * 9301 + 49297) % 233280;
    bars.push(18 + (value / 233280) * 62);
  }
  return bars;
}

function isLinkOnlyMessage(item) {
  if (!item?.links?.length || !item?.text) {
    return false;
  }
  const [firstLink] = item.links;
  const normalizedText = collapseWhitespace(item.text);
  return normalizedText === firstLink.href || normalizedText === firstLink.text || normalizedText === collapseWhitespace(firstLink.text);
}

function animateCardBack() {
  return new Promise((resolve) => {
    const card = elements.card;
    const finish = () => {
      card.removeEventListener("transitionend", finish);
      resolve();
    };
    requestAnimationFrame(() => {
      card.addEventListener("transitionend", finish, { once: true });
      card.style.transform = "";
    });
  });
}

function createVideoBlock(item, media) {
  const sourcePath = mediaSourcePath(media);
  if (!sourcePath) {
    return createFilePreview(item, media);
  }

  const previewPath = mediaPreviewPath(media);
  const isRound = isRoundVideo(media);
  const wrapper = document.createElement("div");
  wrapper.className = isRound ? "round-video" : "telegram-video";
  if (!isRound && Number(media.width) > Number(media.height || 0)) {
    wrapper.classList.add("compact");
  }

  const video = document.createElement("video");
  video.src = sourcePath;
  video.preload = "metadata";
  video.playsInline = true;
  video.loop = isRound;
  if (previewPath) {
    video.poster = previewPath;
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "video-toggle";
  syncToggleButton(toggle, false);

  const update = () => syncToggleButton(toggle, !video.paused && !video.ended);
  const togglePlayback = async () => {
    if (video.paused || video.ended) {
      await video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  toggle.addEventListener("click", togglePlayback);
  video.addEventListener("click", togglePlayback);
  video.addEventListener("play", update);
  video.addEventListener("pause", update);
  video.addEventListener("ended", update);

  wrapper.append(video, toggle, createMetaPill(item, media));

  const openOriginal = createOpenOriginalButton(sourcePath);
  if (openOriginal) {
    wrapper.append(openOriginal);
  }
  return wrapper;
}

function createImageBlock(item, media) {
  const sourcePath = mediaSourcePath(media);
  const previewPath = mediaPreviewPath(media);
  const wrapper = document.createElement("div");
  wrapper.className = `media-frame ${media.kind === "sticker" ? "sticker-frame" : "image-frame"}`;

  const image = document.createElement("img");
  image.src = sourcePath || previewPath || "";
  image.alt = media.file_name || media.kind;
  image.loading = "lazy";

  wrapper.append(image, createMetaPill(item, media));
  const openOriginal = createOpenOriginalButton(sourcePath);
  if (openOriginal) {
    wrapper.append(openOriginal);
  }
  return wrapper;
}

function createAudioBlock(item, media) {
  const sourcePath = mediaSourcePath(media);
  if (!sourcePath) {
    return createFilePreview(item, media);
  }

  const voice = isVoiceMessage(media);
  const wrapper = document.createElement("div");
  wrapper.className = voice ? "voice-player" : "audio-player";

  const audio = document.createElement("audio");
  audio.src = sourcePath;
  audio.preload = "metadata";
  audio.hidden = true;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "audio-toggle";
  syncToggleButton(toggle, false);

  const copy = document.createElement("div");
  copy.className = "audio-copy";

  const title = document.createElement("div");
  title.className = "audio-title";
  title.textContent = voice ? "Голосовое сообщение" : media.file_name || "Аудио";

  const subtitle = document.createElement("div");
  subtitle.className = "audio-subtitle";
  subtitle.textContent = voice ? "Telegram voice message" : "Аудиофайл";

  const progressNode = document.createElement("div");
  const fillNode = document.createElement("div");

  if (voice) {
    progressNode.className = "voice-wave";
    buildWaveform(item.id).forEach((height) => {
      const bar = document.createElement("span");
      bar.className = "voice-bar";
      bar.style.height = `${height}%`;
      progressNode.append(bar);
    });
    fillNode.className = "voice-progress-fill";
  } else {
    progressNode.className = "audio-progress";
    fillNode.className = "audio-progress-fill";
  }
  progressNode.append(fillNode);

  const metaRow = document.createElement("div");
  metaRow.className = "audio-meta-row";
  const currentNode = document.createElement("span");
  const durationNode = document.createElement("span");
  currentNode.textContent = "0:00";
  durationNode.textContent = formatDuration(media.duration_seconds);
  metaRow.append(currentNode, durationNode);

  copy.append(title, subtitle, progressNode, metaRow);
  wrapper.append(toggle, copy, audio);

  const update = () => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(media.duration_seconds) || 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const ratio = duration > 0 ? current / duration : 0;
    fillNode.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    currentNode.textContent = formatDuration(current);
    durationNode.textContent = formatDuration(duration);
    syncToggleButton(toggle, !audio.paused && !audio.ended);
  };

  const togglePlayback = async () => {
    if (audio.paused || audio.ended) {
      await audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  toggle.addEventListener("click", togglePlayback);
  progressNode.addEventListener("click", (event) => {
    const rect = progressNode.getBoundingClientRect();
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(media.duration_seconds) || 0;
    if (!rect.width || duration <= 0) {
      return;
    }
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = duration * ratio;
  });
  audio.addEventListener("loadedmetadata", update);
  audio.addEventListener("timeupdate", update);
  audio.addEventListener("play", update);
  audio.addEventListener("pause", update);
  audio.addEventListener("ended", update);

  const openOriginal = createOpenOriginalButton(sourcePath);
  if (openOriginal) {
    wrapper.append(openOriginal);
  }
  update();
  return wrapper;
}

function createFilePreview(item, media) {
  const sourcePath = mediaSourcePath(media);
  const wrapper = document.createElement("div");
  wrapper.className = "file-preview";

  const icon = document.createElement("div");
  icon.className = "file-preview-icon";
  icon.textContent = media.kind === "pdf" ? "PDF" : media.kind === "document" ? "DOC" : "FILE";

  const copy = document.createElement("div");
  copy.className = "file-preview-copy";

  const name = document.createElement("div");
  name.className = "file-preview-name";
  name.textContent = media.file_name || "Файл";

  const meta = document.createElement("div");
  meta.className = "file-preview-meta";
  meta.textContent = media.missing ? "Файл отсутствует в экспорте" : `${item.time_display}  •  ${media.kind}`;

  copy.append(name, meta);
  if (sourcePath && !media.missing) {
    const anchor = document.createElement("a");
    anchor.href = sourcePath;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = "Открыть файл";
    copy.append(anchor);
  }

  wrapper.append(icon, copy);
  return wrapper;
}

function renderMedia(item) {
  elements.messageMedia.innerHTML = "";
  const media = item.media;
  if (!media) {
    return;
  }

  let node = null;
  if (media.kind === "image" || media.kind === "sticker") {
    node = createImageBlock(item, media);
  } else if (media.kind === "video") {
    node = createVideoBlock(item, media);
  } else if (media.kind === "audio") {
    node = createAudioBlock(item, media);
  } else {
    node = createFilePreview(item, media);
  }

  if (node) {
    elements.messageMedia.append(node);
  }
}

function renderSegments(segments) {
  elements.messageText.innerHTML = "";
  if (!segments.length) {
    elements.messageText.classList.add("is-empty");
    return;
  }

  elements.messageText.classList.remove("is-empty");
  const paragraph = document.createElement("p");
  for (const segment of segments) {
    if (!segment.text) {
      continue;
    }
    let node = null;
    if (segment.type === "link") {
      node = document.createElement("a");
      node.href = segment.href;
      node.target = "_blank";
      node.rel = "noreferrer";
      node.textContent = segment.text;
    } else if (segment.type === "bold") {
      node = document.createElement("strong");
      node.textContent = segment.text;
    } else if (segment.type === "italic") {
      node = document.createElement("em");
      node.textContent = segment.text;
    } else if (segment.type === "code") {
      node = document.createElement("code");
      node.textContent = segment.text;
    }

    paragraph.append(node || document.createTextNode(segment.text));
  }
  elements.messageText.append(paragraph);
}

function buildWebPreview(item) {
  if (!item.links.length) {
    return null;
  }

  const [firstLink] = item.links;
  const href = firstLink.href;
  const site = hostFromHref(href);
  const rawText = String(item.text || "");
  const withoutHref = rawText.replace(href, "").replace(firstLink.text, "").trim();
  const textParts = withoutHref
    .split(/\n+/)
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);
  const fallbackTitle = firstLink.text && firstLink.text !== href ? firstLink.text : pathFromHref(href);
  const title = truncate(textParts[0] || fallbackTitle || site, 92);
  const description = textParts.length > 1 ? truncate(textParts.slice(1).join(" "), 120) : "";

  return {
    href,
    site,
    title: title || site,
    description,
    thumbLetter: site.slice(0, 1).toUpperCase() || "L",
  };
}

function renderWebpage(item) {
  elements.messageWebpage.innerHTML = "";
  const preview = buildWebPreview(item);
  if (!preview) {
    return;
  }

  const card = document.createElement("a");
  card.className = "webpage-card";
  card.href = preview.href;
  card.target = "_blank";
  card.rel = "noreferrer";

  const copy = document.createElement("div");
  copy.className = "webpage-copy";

  const site = document.createElement("div");
  site.className = "webpage-site";
  site.textContent = preview.site;

  const title = document.createElement("div");
  title.className = "webpage-title";
  title.textContent = preview.title;

  copy.append(site, title);
  if (preview.description) {
    const description = document.createElement("div");
    description.className = "webpage-description";
    description.textContent = preview.description;
    copy.append(description);
  }

  const thumb = document.createElement("div");
  thumb.className = "webpage-thumb";
  thumb.textContent = preview.thumbLetter;

  card.append(copy, thumb);
  elements.messageWebpage.append(card);
}

function renderLinks(item) {
  elements.messageLinks.innerHTML = "";
  if (!item.links.length) {
    elements.messageLinks.classList.add("hidden");
    return;
  }

  const links = item.links.length > 1 ? item.links.slice(1) : [];
  if (!links.length) {
    elements.messageLinks.classList.add("hidden");
    return;
  }

  elements.messageLinks.classList.remove("hidden");
  for (const link of links) {
    const anchor = document.createElement("a");
    anchor.className = "message-link-row";
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = link.text || link.href;
    elements.messageLinks.append(anchor);
  }
}

function renderCard() {
  renderStats();
  renderActionButtons();
  if (!state.exportReady) {
    elements.card.classList.add("hidden");
    elements.swipeHints.classList.add("hidden");
    elements.emptyState.classList.remove("hidden");
    elements.emptyTitle.textContent = "Выберите export";
    elements.emptyCopy.textContent = "Открой result.json из папки экспорта Telegram, и здесь сразу появится карточка сообщения.";
    elements.emptyPickExportBtn.classList.remove("hidden");
    syncStageVerticalAlignment();
    return;
  }

  const item = state.currentItem;
  if (!item) {
    elements.card.classList.add("hidden");
    elements.swipeHints.classList.add("hidden");
    elements.emptyState.classList.remove("hidden");
    elements.emptyTitle.textContent = "Очередь закончилась";
    elements.emptyCopy.textContent = "Все сообщения получили действие. Можно выбрать другой export или продолжить после новых изменений.";
    elements.emptyPickExportBtn.classList.add("hidden");
    syncStageVerticalAlignment();
    return;
  }

  elements.emptyState.classList.add("hidden");
  elements.card.classList.remove("hidden");
  elements.swipeHints.classList.toggle("hidden", Boolean(state.savePanelItem));
  elements.card.style.transform = "";
  elements.messageDate.textContent = item.date_display;
  elements.messageTime.textContent = item.time_display;

  if (item.source) {
    elements.messageSourceWrap.classList.remove("hidden");
    elements.messageSource.textContent = item.source;
  } else {
    elements.messageSourceWrap.classList.add("hidden");
    elements.messageSource.textContent = "";
  }

  renderMedia(item);
  renderSegments(isLinkOnlyMessage(item) ? [] : item.segments);
  renderWebpage(item);
  renderLinks(item);
  syncStageVerticalAlignment();
}

function addTagToSavePanel(tag) {
  const cleaned = String(tag || "").trim();
  const key = normalizeTagKey(cleaned);
  if (!key || state.savePanelTags.some((value) => normalizeTagKey(value) === key)) {
    return false;
  }
  state.savePanelTags = [...state.savePanelTags, cleaned];
  mergeKnownTags([cleaned]);
  return true;
}

function removeTagFromSavePanel(tag) {
  const key = normalizeTagKey(tag);
  state.savePanelTags = state.savePanelTags.filter((value) => normalizeTagKey(value) !== key);
}

function commitPendingTagInput() {
  const rawValue = elements.customTagInput.value;
  const parts = rawValue
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  let changed = false;
  for (const tag of parts) {
    changed = addTagToSavePanel(tag) || changed;
  }
  if (changed || rawValue.trim()) {
    elements.customTagInput.value = "";
  }
  return changed;
}

function renderSavePanel() {
  const item = state.savePanelItem;
  if (!item) {
    elements.savePanel.classList.add("hidden");
    elements.swipeHints.classList.toggle("hidden", !state.exportReady || !state.currentItem);
    elements.stageLayout.classList.remove("save-open");
    syncStageVerticalAlignment();
    return;
  }

  const decision = getDecision(item.id);
  elements.savePanel.classList.remove("hidden");
  elements.swipeHints.classList.add("hidden");
  elements.stageLayout.classList.add("save-open");
  elements.presetTags.innerHTML = "";
  const usageCounts = tagUsageCountMap();
  mergeKnownTags(state.settings.defaultTags);

  const orderedTags = getOrderedKnownTags().sort((left, right) => {
    const leftActive = state.savePanelTags.some((value) => normalizeTagKey(value) === normalizeTagKey(left));
    const rightActive = state.savePanelTags.some((value) => normalizeTagKey(value) === normalizeTagKey(right));
    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1;
    }
    return 0;
  });

  for (const tag of orderedTags) {
    const chip = document.createElement("button");
    chip.type = "button";
    const count = usageCounts.get(normalizeTagKey(tag)) || 0;
    const isActive = state.savePanelTags.some((value) => normalizeTagKey(value) === normalizeTagKey(tag));
    chip.className = `tag-chip ${isActive ? "active" : ""}`;
    chip.textContent = tag;
    if (count > 0) {
      chip.title = `Использований: ${count}`;
    }
    applyTagAccent(chip, tag);
    chip.addEventListener("click", () => {
      if (state.savePanelTags.some((value) => normalizeTagKey(value) === normalizeTagKey(tag))) {
        removeTagFromSavePanel(tag);
      } else {
        addTagToSavePanel(tag);
      }
      renderSavePanel();
    });
    elements.presetTags.append(chip);
  }
  elements.presetTags.append(elements.customTagInput);

  elements.confirmSaveBtn.textContent = decision && decision.action === "save" ? "Обновить" : "Сохранить";
  syncStageVerticalAlignment();
}

async function loadBootstrap() {
  const response = await fetch("/api/bootstrap");
  const payload = await response.json();
  state.items = sortByDateAsc(payload.items);
  state.decisions = payload.decisions;
  state.tags = Array.isArray(payload.tags) ? payload.tags : [];
  syncSettingsState(payload.settings || {});
  refreshQueue();
  renderCard();
  renderSavePanel();
  renderSettingsModal();
}

async function updateSettings(nextSettings) {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(nextSettings),
  });
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.error || "Не удалось сохранить настройки");
  }
  syncSettingsState(payload.settings || {});
  if (Array.isArray(payload.tags)) {
    state.tags = payload.tags;
  }
  mergeKnownTags(state.settings.defaultTags);
  renderSettingsModal();
  renderSavePanel();
  renderCard();
}

async function invokeSettingsAction(path, payload = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!result.ok) {
    if (result.cancelled) {
      return null;
    }
    throw new Error(result.error || "Не удалось выполнить действие");
  }
  if (result.settings) {
    syncSettingsState(result.settings);
    renderSettingsModal();
  }
  return result;
}

async function sendDecision(item, action, tags = [], comment = "", options = {}) {
  const { recordHistory = true } = options;
  const previous = state.decisions[String(item.id)] || null;
  const response = await fetch("/api/decision", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message_id: item.id,
      action,
      tags,
      comment,
    }),
  });
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.error || "Не удалось записать действие");
  }

  if (action === "clear") {
    delete state.decisions[String(item.id)];
  } else {
    state.decisions[String(item.id)] = payload.decision;
  }

  if (action === "save") {
    mergeKnownTags(tags);
  }

  if (recordHistory) {
    state.history.unshift({ item, previous });
  }

  refreshQueue();
  renderCard();
  renderSavePanel();
}

function collectSavePanelTags() {
  commitPendingTagInput();
  return [...state.savePanelTags];
}

function openSavePanel(item) {
  if (!item) {
    return;
  }
  const decision = getDecision(item.id);
  state.savePanelItem = item;
  state.savePanelTags = decision?.action === "save" ? [...(decision.tags || [])] : [];
  elements.customTagInput.value = "";
  elements.saveCommentInput.value = decision?.action === "save" ? decision.comment || "" : "";
  renderSavePanel();
}

function closeSavePanel() {
  state.savePanelItem = null;
  state.savePanelTags = [];
  elements.customTagInput.value = "";
  elements.saveCommentInput.value = "";
  renderSavePanel();
}

async function handleAction(action) {
  const item = state.currentItem;
  if (!item) {
    return;
  }
  await sendDecision(item, action);
}

async function submitSavePanel() {
  const item = state.savePanelItem;
  if (!item) {
    return;
  }
  const tags = collectSavePanelTags();
  if (!tags.length) {
    elements.customTagInput.focus();
    return;
  }
  const comment = elements.saveCommentInput.value.trim();
  await sendDecision(item, "save", tags, comment);
  closeSavePanel();
}

function registerButtons() {
  elements.cancelSaveBtn.addEventListener("click", closeSavePanel);
  elements.confirmSaveBtn.addEventListener("click", submitSavePanel);
  elements.deleteBtn.addEventListener("click", async () => {
    await handleAction("delete");
  });
  elements.skipBtn.addEventListener("click", async () => {
    await handleAction("skip");
  });
  elements.saveBtn.addEventListener("click", () => {
    openSavePanel(state.currentItem);
  });
  elements.openSettingsBtn.addEventListener("click", openSettingsModal);
  elements.closeSettingsBtn.addEventListener("click", closeSettingsModal);
  elements.settingsModal.addEventListener("click", (event) => {
    if (event.target === elements.settingsModal) {
      closeSettingsModal();
    }
  });
  elements.proModeBtn.addEventListener("click", async () => {
    try {
      await updateSettings({ pro_mode: !isProMode() });
    } catch (error) {
      console.error(error);
    }
  });
  elements.pickExportBtn.addEventListener("click", async () => {
    try {
      const result = await invokeSettingsAction("/api/settings/export/pick");
      if (result) {
        closeSavePanel();
        await loadBootstrap();
      }
    } catch (error) {
      console.error(error);
    }
  });
  elements.emptyPickExportBtn.addEventListener("click", async () => {
    try {
      const result = await invokeSettingsAction("/api/settings/export/pick");
      if (result) {
        await loadBootstrap();
      }
    } catch (error) {
      console.error(error);
    }
  });
  elements.openExportFolderBtn.addEventListener("click", async () => {
    try {
      await invokeSettingsAction("/api/settings/open", { kind: "export" });
    } catch (error) {
      console.error(error);
    }
  });
  elements.pickOutputBtn.addEventListener("click", async () => {
    try {
      const result = await invokeSettingsAction("/api/settings/output/pick");
      if (result) {
        await loadBootstrap();
      }
    } catch (error) {
      console.error(error);
    }
  });
  elements.openOutputFolderBtn.addEventListener("click", async () => {
    try {
      await invokeSettingsAction("/api/settings/open", { kind: "output" });
    } catch (error) {
      console.error(error);
    }
  });
  elements.saveSettingsTagsBtn.addEventListener("click", async () => {
    try {
      commitSettingsTagInput();
      await updateSettings({ default_tags: [...state.settingsDraftTags] });
    } catch (error) {
      console.error(error);
    }
  });
  elements.settingsTagInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (commitSettingsTagInput()) {
        renderSettingsModal();
      }
      return;
    }
    if (event.key === "Backspace" && !elements.settingsTagInput.value && state.settingsDraftTags.length) {
      event.preventDefault();
      state.settingsDraftTags = state.settingsDraftTags.slice(0, -1);
      renderSettingsModal();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      commitSettingsTagInput();
      await updateSettings({ default_tags: [...state.settingsDraftTags] });
    }
  });
  elements.settingsTagInput.addEventListener("blur", () => {
    if (commitSettingsTagInput()) {
      renderSettingsModal();
    }
  });
  elements.customTagInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (commitPendingTagInput()) {
        renderSavePanel();
      }
      return;
    }
    if (event.key === "Backspace" && !elements.customTagInput.value && state.savePanelTags.length) {
      event.preventDefault();
      state.savePanelTags = state.savePanelTags.slice(0, -1);
      renderSavePanel();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      await submitSavePanel();
    }
  });
  elements.customTagInput.addEventListener("blur", () => {
    if (commitPendingTagInput()) {
      renderSavePanel();
    }
  });
  elements.saveCommentInput.addEventListener("keydown", async (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      await submitSavePanel();
    }
  });
}

async function undoLastAction() {
  const action = state.history.shift();
  if (!action) {
    return;
  }

  if (action.previous) {
    await sendDecision(
      action.item,
      action.previous.action,
      action.previous.tags || [],
      action.previous.comment || "",
      { recordHistory: false },
    );
    return;
  }

  await sendDecision(action.item, "clear", [], "", { recordHistory: false });
}

function bindKeyboard() {
  window.addEventListener("keydown", async (event) => {
    if (event.key === "Escape" && isSettingsOpen()) {
      event.preventDefault();
      closeSettingsModal();
      return;
    }

    if (event.key === "Escape" && state.savePanelItem) {
      event.preventDefault();
      closeSavePanel();
      return;
    }

    if (isTypingTarget(event.target) || isSettingsOpen()) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      await handleAction(isProMode() ? "delete" : "skip");
    } else if (event.key === "ArrowDown" && isProMode()) {
      event.preventDefault();
      await handleAction("skip");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      openSavePanel(state.currentItem);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      await undoLastAction();
    } else if (event.key === "Enter" && state.savePanelItem) {
      event.preventDefault();
      await submitSavePanel();
    }
  });
}

function bindSwipe() {
  const card = elements.card;
  let drag = null;

  card.addEventListener("pointerdown", (event) => {
    if (!state.currentItem || state.savePanelItem || isInteractiveTarget(event.target)) {
      return;
    }
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
    };
    card.classList.add("dragging");
    card.setPointerCapture(event.pointerId);
  });

  card.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    drag.dx = event.clientX - drag.startX;
    drag.dy = event.clientY - drag.startY;
    const rotate = drag.dx / 28;
    card.style.transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${rotate}deg)`;
  });

  card.addEventListener("pointerup", async (event) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const { dx } = drag;
    drag = null;
    card.classList.remove("dragging");
    card.releasePointerCapture(event.pointerId);

    if (dx <= -130) {
      await handleAction(leftAction());
      return;
    }
    if (dx >= 130) {
      await animateCardBack();
      openSavePanel(state.currentItem);
      return;
    }
    elements.card.style.transform = "";
  });
}

async function init() {
  registerButtons();
  bindKeyboard();
  bindSwipe();
  window.addEventListener("resize", syncStageVerticalAlignment);
  await loadBootstrap();
}

init().catch((error) => {
  console.error(error);
});
