const state = {
  items: [],
  decisions: {},
  tags: [],
  customTags: [],
  queue: [],
  currentItem: null,
  exportReady: false,
  savePanelItem: null,
  savePanelTags: [],
  history: [],
  exportFiles: new Map(),
  mediaObjectUrls: new Map(),
  exportMeta: {
    key: "",
    label: "",
    basePath: "",
    resultFile: "",
  },
  outputHandle: null,
  settings: {
    proMode: false,
    exportJsonPath: "",
    exportRoot: "",
    outputPath: "",
    defaultTags: [],
    typeFilters: [],
  },
  settingsDraftTags: [],
  renderedItemId: null,
  importStats: {
    total: 0,
    autoSkipped: 0,
  },
};

const elements = {
  statTotal: document.getElementById("stat-total"),
  statLeft: document.getElementById("stat-left"),
  statSkipped: document.getElementById("stat-skipped"),
  statSkippedWrap: document.getElementById("stat-skipped-wrap"),
  statSaved: document.getElementById("stat-saved"),
  footerStats: document.querySelector(".footer-stats"),
  openPrivacyBtn: document.getElementById("open-privacy-btn"),
  privacyModal: document.getElementById("privacy-modal"),
  closePrivacyBtn: document.getElementById("close-privacy-btn"),
  deleteBtn: document.getElementById("delete-btn"),
  undoCardBtn: document.getElementById("undo-card-btn"),
  stageLayout: document.getElementById("stage-layout"),
  cardStage: document.getElementById("card-stage"),
  stage: document.querySelector(".stage"),
  card: document.getElementById("message-card"),
  emptyState: document.getElementById("empty-state"),
  emptyTitle: document.getElementById("empty-title"),
  emptyCopy: document.getElementById("empty-copy"),
  emptyPickExportBtn: document.getElementById("empty-pick-export-btn"),
  emptyDownloadOutputBtn: document.getElementById("empty-download-output-btn"),
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
  settingsExportPath: document.getElementById("settings-export-path"),
  settingsOutputPath: document.getElementById("settings-output-path"),
  pickExportBtn: document.getElementById("pick-export-btn"),
  openExportFolderBtn: document.getElementById("open-export-folder-btn"),
  resetProgressBtn: document.getElementById("reset-progress-btn"),
  downloadOutputBtn: document.getElementById("download-output-btn"),
  pickOutputBtn: document.getElementById("pick-output-btn"),
  openOutputFolderBtn: document.getElementById("open-output-folder-btn"),
  exportFolderInput: document.getElementById("export-folder-input"),
  settingsTypeFilters: document.getElementById("settings-type-filters"),
  settingsTagsEditor: document.getElementById("settings-tags-editor"),
  settingsTagInput: document.getElementById("settings-tag-input"),
  saveSettingsTagsBtn: document.getElementById("save-settings-tags-btn"),
};

const DEFAULT_TAGS_FALLBACK = ["мысли", "дневник", "референс", "ссылка", "цитата"];
const ITEM_TYPE_FILTERS = [
  { key: "text", label: "Текст" },
  { key: "link", label: "Ссылки" },
  { key: "image", label: "Фото" },
  { key: "video", label: "Видео" },
  { key: "voice", label: "Голосовые" },
  { key: "round_video", label: "Кружки" },
  { key: "audio", label: "Аудио" },
  { key: "sticker", label: "Стикеры" },
  { key: "document", label: "Файлы" },
];
const ALL_ITEM_TYPE_FILTER_KEYS = ITEM_TYPE_FILTERS.map((entry) => entry.key);
const STORAGE_KEYS = {
  settings: "fav-tinder.settings.v2",
  decisionsPrefix: "fav-tinder.decisions.v2.",
};
const ATTACHMENTS_DIR_NAME = "Вложения";
const OUTPUT_EXPORT_DIR_NAME = "telegram-cleaner-export";
const MISSING_FILE_MARKER = "(File exceeds maximum size. Change data exporting settings to download.)";
const UTF8_ENCODER = new TextEncoder();
const THANK_YOU_NOTE_TEXT =
  "Спасибо, что воспользовались Разгребателем Телеги. Надеюсь, он помог навести порядок. Буду рад видеть вас в Telegram: https://t.me/y8ntv и в Instagram: https://instagram.com/y8n\n";

function supportsOutputDirectoryPick() {
  return typeof window.showDirectoryPicker === "function";
}

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
  state.settings.defaultTags = normalizeSettingsTags(settings.default_tags);
  state.settings.typeFilters = normalizeTypeFilters(
    settings.type_filters,
    !Object.prototype.hasOwnProperty.call(settings, "type_filters"),
  );
  state.settingsDraftTags = [...state.settings.defaultTags];
  mergeKnownTags(state.settings.defaultTags);
}

function safeJsonParse(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeSettingsTags(rawTags) {
  if (!Array.isArray(rawTags)) {
    return [...DEFAULT_TAGS_FALLBACK];
  }
  const normalizedTags = [];
  const seen = new Set();
  for (const rawTag of rawTags) {
    if (typeof rawTag !== "string") {
      continue;
    }
    const cleaned = rawTag.trim();
    const key = normalizeTagKey(cleaned);
    if (key && !seen.has(key)) {
      seen.add(key);
      normalizedTags.push(cleaned);
    }
  }
  return normalizedTags.length ? normalizedTags : [...DEFAULT_TAGS_FALLBACK];
}

function normalizeTypeFilters(rawFilters, fallbackToAll = true) {
  if (!Array.isArray(rawFilters)) {
    return fallbackToAll ? [...ALL_ITEM_TYPE_FILTER_KEYS] : [];
  }
  const normalizedFilters = [];
  const seen = new Set();
  for (const rawFilter of rawFilters) {
    const filterKey = String(rawFilter || "").trim();
    if (!ALL_ITEM_TYPE_FILTER_KEYS.includes(filterKey) || seen.has(filterKey)) {
      continue;
    }
    seen.add(filterKey);
    normalizedFilters.push(filterKey);
  }
  if (!normalizedFilters.length && fallbackToAll) {
    return [...ALL_ITEM_TYPE_FILTER_KEYS];
  }
  return normalizedFilters;
}

function storedSettingsPayload() {
  const stored = safeJsonParse(localStorage.getItem(STORAGE_KEYS.settings), {});
  const hasStoredTypeFilters = Array.isArray(stored.type_filters);
  return {
    pro_mode: Boolean(stored.pro_mode),
    default_tags: normalizeSettingsTags(stored.default_tags),
    type_filters: normalizeTypeFilters(stored.type_filters, !hasStoredTypeFilters),
  };
}

function currentSettingsPayload() {
  const stored = storedSettingsPayload();
  return {
    ...stored,
    export_json_path: state.exportMeta.label,
    export_root: state.exportMeta.basePath,
    export_ready: state.exportReady,
    obsidian_output_path: state.settings.outputPath || "",
  };
}

function persistSettingsPayload(settings) {
  localStorage.setItem(
    STORAGE_KEYS.settings,
    JSON.stringify({
      pro_mode: Boolean(settings.pro_mode),
      default_tags: normalizeSettingsTags(settings.default_tags),
      type_filters: normalizeTypeFilters(settings.type_filters, false),
    }),
  );
}

function currentExportStorageKey() {
  return state.exportMeta.key ? `${STORAGE_KEYS.decisionsPrefix}${state.exportMeta.key}` : "";
}

function rememberCustomTags(tags) {
  const byKey = new Map(state.customTags.map((tag) => [normalizeTagKey(tag), tag]));
  for (const tag of tags) {
    const cleaned = String(tag || "").trim();
    const key = normalizeTagKey(cleaned);
    if (key && !byKey.has(key)) {
      byKey.set(key, cleaned);
    }
  }
  state.customTags = [...byKey.values()];
}

function rebuildKnownTags() {
  const displayByTag = new Map();
  for (const tag of state.settings.defaultTags) {
    const key = normalizeTagKey(tag);
    if (key) {
      displayByTag.set(key, tag);
    }
  }
  for (const tag of state.customTags) {
    const key = normalizeTagKey(tag);
    if (key) {
      displayByTag.set(key, tag);
    }
  }
  for (const decision of Object.values(state.decisions)) {
    for (const tag of decision.tags || []) {
      const key = normalizeTagKey(tag);
      if (key) {
        displayByTag.set(key, tag);
      }
    }
  }

  const counts = tagUsageCountMap();
  const defaultOrder = new Map(state.settings.defaultTags.map((tag, index) => [normalizeTagKey(tag), index]));
  state.tags = [...displayByTag.keys()]
    .sort((left, right) => {
      const leftCount = counts.get(left) || 0;
      const rightCount = counts.get(right) || 0;
      if (leftCount !== rightCount) {
        return rightCount - leftCount;
      }
      const leftOrder = defaultOrder.has(left) ? defaultOrder.get(left) : state.settings.defaultTags.length + 1;
      const rightOrder = defaultOrder.has(right) ? defaultOrder.get(right) : state.settings.defaultTags.length + 1;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return String(displayByTag.get(left) || "").localeCompare(String(displayByTag.get(right) || ""), "ru");
    })
    .map((key) => displayByTag.get(key));
}

function persistCurrentExportState() {
  const storageKey = currentExportStorageKey();
  if (!storageKey) {
    return;
  }
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      export_label: state.exportMeta.label,
      custom_tags: state.customTags,
      decisions: state.decisions,
      updated_at: new Date().toISOString(),
    }),
  );
}

function restoreExportState(exportKey) {
  const stored = safeJsonParse(localStorage.getItem(`${STORAGE_KEYS.decisionsPrefix}${exportKey}`), {});
  state.decisions = stored && typeof stored.decisions === "object" && stored.decisions ? stored.decisions : {};
  state.customTags = Array.isArray(stored.custom_tags) ? [...stored.custom_tags] : [];
}

async function resetCurrentExportProgress() {
  const storageKey = currentExportStorageKey();
  if (!storageKey) {
    return;
  }
  localStorage.removeItem(storageKey);
  state.decisions = {};
  state.customTags = [];
  state.history = [];
  closeSavePanel();
  rebuildKnownTags();
  persistCurrentExportState();
  await maybeRebuildOutput();
  refreshQueue();
  renderCard();
  renderSavePanel();
  renderSettingsModal();
}

function revokeMediaObjectUrls() {
  for (const objectUrl of state.mediaObjectUrls.values()) {
    URL.revokeObjectURL(objectUrl);
  }
  state.mediaObjectUrls.clear();
}

function clearImportedExport() {
  revokeMediaObjectUrls();
  state.items = [];
  state.decisions = {};
  state.customTags = [];
  state.tags = [...state.settings.defaultTags];
  state.queue = [];
  state.currentItem = null;
  state.history = [];
  state.exportFiles = new Map();
  state.exportMeta = {
    key: "",
    label: "",
    basePath: "",
    resultFile: "",
  };
  state.importStats = {
    total: 0,
    autoSkipped: 0,
  };
  state.exportReady = false;
  syncSettingsState(currentSettingsPayload());
  rebuildKnownTags();
  closeSavePanel();
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

function normalizeRelativePath(value) {
  const normalized = String(value || "").replaceAll("\\", "/").replace(/^\.?\//, "").replace(/\/{2,}/g, "/").trim();
  return normalized.replace(/^\/+/, "");
}

function basenameFromPath(value) {
  const normalized = normalizeRelativePath(value);
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
}

function dirnameFromPath(value) {
  const normalized = normalizeRelativePath(value);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
}

function guessMimeType(relativePath) {
  const extension = basenameFromPath(relativePath).toLowerCase().split(".").pop() || "";
  const byExtension = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    dng: "image/x-adobe-dng",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    webm: "video/webm",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    opus: "audio/ogg",
    wav: "audio/wav",
    flac: "audio/flac",
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
    tgs: "application/x-tgsticker",
  };
  return byExtension[extension] || "application/octet-stream";
}

function getFileByRelativePath(relativePath) {
  return state.exportFiles.get(normalizeRelativePath(relativePath)) || null;
}

function existingRelativePath(value) {
  const relativePath = normalizeRelativePath(value);
  if (!relativePath || isMissingMarker(value)) {
    return null;
  }
  return getFileByRelativePath(relativePath) ? relativePath : null;
}

function derivedPreview(fileRelative) {
  if (!fileRelative) {
    return null;
  }
  const directory = dirnameFromPath(fileRelative);
  const name = basenameFromPath(fileRelative);
  const previewPath = normalizeRelativePath(`${directory ? `${directory}/` : ""}${name}_thumb.jpg`);
  return getFileByRelativePath(previewPath) ? previewPath : null;
}

function flattenText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((chunk) => {
        if (typeof chunk === "string") {
          return chunk;
        }
        if (chunk && typeof chunk === "object") {
          return String(chunk.text || "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

function extractSegments(message) {
  const entities = message?.text_entities;
  if (Array.isArray(entities) && entities.length) {
    return entities
      .map((entity) => {
        if (typeof entity === "string") {
          return { type: "plain", text: entity };
        }
        if (!entity || typeof entity !== "object") {
          return null;
        }
        const entityType = String(entity.type || "plain");
        const text = String(entity.text || "");
        const href = String(entity.href || "");
        if (entityType === "link" || entityType === "text_link") {
          return { type: "link", text, href: href || text };
        }
        if (entityType === "bold" || entityType === "italic" || entityType === "code") {
          return { type: entityType, text };
        }
        return { type: "plain", text };
      })
      .filter(Boolean);
  }
  const flattened = flattenText(message?.text || "");
  return flattened ? [{ type: "plain", text: flattened }] : [];
}

function extractLinks(segments) {
  const seen = new Set();
  const links = [];
  for (const segment of segments) {
    if (segment?.type !== "link") {
      continue;
    }
    const href = String(segment.href || "").trim();
    const text = String(segment.text || href).trim() || href;
    const key = `${text}::${href}`;
    if (href && !seen.has(key)) {
      seen.add(key);
      links.push({ text, href });
    }
  }
  return links;
}

function isMissingMarker(value) {
  return typeof value === "string" && value.trim() === MISSING_FILE_MARKER;
}

function formatDisplayDate(dateIso) {
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) {
    return {
      dateDisplay: String(dateIso || ""),
      timeDisplay: "",
    };
  }
  return {
    dateDisplay: new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(parsed),
    timeDisplay: new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed),
  };
}

function detectMedia(message) {
  const photoRelative = existingRelativePath(message?.photo);
  const fileRelative = existingRelativePath(message?.file);
  const thumbnailRelative = existingRelativePath(message?.thumbnail);
  const mediaType = String(message?.media_type || "");
  const mimeType = String(message?.mime_type || "");

  if (photoRelative) {
    return {
      kind: "image",
      media_type: "photo",
      file_name: basenameFromPath(photoRelative),
      source_path: photoRelative,
      preview_path: photoRelative,
      mime_type: mimeType || guessMimeType(photoRelative),
      width: message?.width,
      height: message?.height,
      duration_seconds: message?.duration_seconds,
      missing: false,
    };
  }

  if (!fileRelative && !isMissingMarker(message?.file)) {
    return null;
  }

  const previewRelative = thumbnailRelative || derivedPreview(fileRelative);
  const suffix = basenameFromPath(fileRelative || String(message?.file_name || "")).toLowerCase();

  let kind = "document";
  if (["video_file", "video_message", "animation"].includes(mediaType) || mimeType.startsWith("video/")) {
    kind = "video";
  } else if (["voice_message", "audio_file"].includes(mediaType) || mimeType.startsWith("audio/")) {
    kind = "audio";
  } else if (mediaType === "sticker" || suffix.endsWith(".tgs") || suffix.endsWith(".webp")) {
    kind = "sticker";
  } else if (
    mimeType.startsWith("image/") ||
    [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".dng"].some((extension) => suffix.endsWith(extension))
  ) {
    kind = "image";
  } else if (suffix.endsWith(".pdf")) {
    kind = "pdf";
  }

  return {
    kind,
    media_type: mediaType || kind,
    file_name: String(message?.file_name || basenameFromPath(fileRelative) || "missing-file"),
    source_path: fileRelative,
    preview_path: previewRelative,
    mime_type: mimeType || guessMimeType(fileRelative || ""),
    width: message?.width,
    height: message?.height,
    duration_seconds: message?.duration_seconds,
    missing: !fileRelative,
  };
}

function messageHasUnavailableMedia(message, media) {
  if (media?.missing) {
    return true;
  }

  const photoValue = message?.photo;
  if (typeof photoValue === "string" && photoValue.trim() && !existingRelativePath(photoValue)) {
    return true;
  }

  const fileValue = message?.file;
  if (typeof fileValue === "string" && fileValue.trim() && !existingRelativePath(fileValue)) {
    return true;
  }

  return false;
}

function inspectImportedMessage(message) {
  if (message?.type !== "message") {
    return {
      countsAsPost: false,
      autoSkipped: false,
      item: null,
    };
  }

  const segments = extractSegments(message);
  const text = segments.map((segment) => segment.text || "").join("").trim();
  const media = detectMedia(message);
  const unavailableMedia = messageHasUnavailableMedia(message, media);

  if (!text && !media && !unavailableMedia) {
    return {
      countsAsPost: false,
      autoSkipped: false,
      item: null,
    };
  }

  if (unavailableMedia) {
    return {
      countsAsPost: true,
      autoSkipped: true,
      item: null,
    };
  }

  const dateIso = String(message.date || "");
  const { dateDisplay, timeDisplay } = formatDisplayDate(dateIso);
  const links = extractLinks(segments);
  const author = String(message.from || "").trim() || "Saved Messages";
  const source = String(message.saved_from || message.forwarded_from || "").trim();

  return {
    countsAsPost: true,
    autoSkipped: false,
    item: {
      id: Number(message.id),
      date_iso: dateIso,
      date_display: dateDisplay,
      time_display: timeDisplay,
      author,
      source,
      text,
      segments,
      links,
      media,
      edited_iso: message.edited || null,
    },
  };
}

function hashString(value) {
  let hash = 5381;
  for (const character of String(value || "")) {
    hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
  }
  return (hash >>> 0).toString(16);
}

function buildExportKey(exportData, label) {
  const messages = Array.isArray(exportData?.messages) ? exportData.messages : [];
  const first = messages[0] || {};
  const last = messages[messages.length - 1] || {};
  const signature = [
    label,
    exportData?.name || "",
    messages.length,
    first.id || "",
    first.date || "",
    last.id || "",
    last.date || "",
  ].join("|");
  return hashString(signature);
}

function reportError(error) {
  const message = error instanceof Error ? error.message : String(error || "Неизвестная ошибка");
  console.error(error);
  window.alert(message);
}

async function collectFilesFromDirectoryHandle(handle, prefix = "") {
  const files = [];
  for await (const [name, entry] of handle.entries()) {
    const relativePath = normalizeRelativePath(prefix ? `${prefix}/${name}` : name);
    if (entry.kind === "file") {
      files.push({
        file: await entry.getFile(),
        relativePath,
      });
      continue;
    }
    if (entry.kind === "directory") {
      files.push(...(await collectFilesFromDirectoryHandle(entry, relativePath)));
    }
  }
  return files;
}

async function importFromCollectedFiles(files, label) {
  const preparedFiles = files
    .map(({ file, relativePath }) => ({
      file,
      relativePath: normalizeRelativePath(relativePath),
    }))
    .filter((entry) => entry.file && entry.relativePath);

  const resultCandidates = preparedFiles
    .filter((entry) => basenameFromPath(entry.relativePath).toLowerCase() === "result.json")
    .sort((left, right) => left.relativePath.length - right.relativePath.length);

  if (!resultCandidates.length) {
    throw new Error("В выбранной папке не найден result.json");
  }

  const resultEntry = resultCandidates[0];
  const basePath = dirnameFromPath(resultEntry.relativePath);
  const exportFiles = new Map();
  for (const entry of preparedFiles) {
    const withinBase = !basePath || entry.relativePath === basePath || entry.relativePath.startsWith(`${basePath}/`);
    if (!withinBase) {
      continue;
    }
    const rebasedPath = basePath ? entry.relativePath.slice(basePath.length + 1) : entry.relativePath;
    exportFiles.set(normalizeRelativePath(rebasedPath), entry.file);
  }

  const resultFile = exportFiles.get("result.json");
  if (!resultFile) {
    throw new Error("Не удалось открыть result.json внутри выбранной папки");
  }

  const exportData = safeJsonParse(await resultFile.text(), null);
  if (!exportData || !Array.isArray(exportData.messages)) {
    throw new Error("result.json не похож на экспорт Telegram");
  }

  const previousExportFiles = state.exportFiles;
  state.exportFiles = exportFiles;
  let items;
  let importStats;
  try {
    const inspectedMessages = exportData.messages.map((message) => inspectImportedMessage(message));
    items = sortByDateAsc(inspectedMessages.map((entry) => entry.item).filter(Boolean));
    importStats = {
      total: inspectedMessages.filter((entry) => entry.countsAsPost).length,
      autoSkipped: inspectedMessages.filter((entry) => entry.autoSkipped).length,
    };
  } catch (error) {
    state.exportFiles = previousExportFiles;
    throw error;
  }

  const exportLabel = basePath ? `${label}/${basePath}` : label;
  return {
    items,
    importStats,
    exportMeta: {
      key: buildExportKey(exportData, exportLabel),
      label: exportLabel,
      basePath: exportLabel,
      resultFile: resultEntry.relativePath,
    },
  };
}

async function applyImportedExport(imported) {
  revokeMediaObjectUrls();
  state.items = imported.items;
  state.importStats = imported.importStats || {
    total: imported.items.length,
    autoSkipped: 0,
  };
  state.exportMeta = imported.exportMeta;
  state.exportReady = true;
  state.history = [];
  restoreExportState(imported.exportMeta.key);
  const availableIds = new Set(state.items.map((item) => String(item.id)));
  state.decisions = Object.fromEntries(
    Object.entries(state.decisions).filter(([messageId]) => availableIds.has(messageId)),
  );
  syncSettingsState(currentSettingsPayload());
  rebuildKnownTags();
  refreshQueue();
  renderCard();
  renderSavePanel();
  renderSettingsModal();
  await maybeRebuildOutput();
}

async function importFromDirectoryHandle(handle) {
  const files = await collectFilesFromDirectoryHandle(handle);
  const imported = await importFromCollectedFiles(files, handle.name || "Выбранная папка");
  await applyImportedExport(imported);
}

async function importFromFileList(fileList) {
  const files = Array.from(fileList || []).map((file) => ({
    file,
    relativePath: normalizeRelativePath(file.webkitRelativePath || file.name),
  }));
  if (!files.length) {
    return;
  }
  const rootLabel = files[0].relativePath.includes("/") ? files[0].relativePath.split("/")[0] : "Выбранная папка";
  const strippedFiles = files.map((entry) => {
    const relativePath = entry.relativePath.startsWith(`${rootLabel}/`)
      ? entry.relativePath.slice(rootLabel.length + 1)
      : entry.relativePath;
    return {
      file: entry.file,
      relativePath,
    };
  });
  const imported = await importFromCollectedFiles(strippedFiles, rootLabel);
  await applyImportedExport(imported);
}

async function pickExportFolder() {
  if (typeof window.showDirectoryPicker === "function") {
    const handle = await window.showDirectoryPicker({
      id: "telegram-export",
      mode: "read",
    });
    await importFromDirectoryHandle(handle);
    return;
  }

  if (!elements.exportFolderInput) {
    throw new Error("Текущий браузер не поддерживает выбор папки");
  }

  elements.exportFolderInput.click();
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
  state.queue = state.items.filter((item) => itemMatchesActiveTypeFilters(item) && !state.decisions[String(item.id)]);
  state.currentItem = state.queue[0] || null;
}

function itemTypeFilterKey(item) {
  const media = item?.media;
  if (media) {
    if (isRoundVideo(media)) {
      return "round_video";
    }
    if (isVoiceMessage(media)) {
      return "voice";
    }
    if (media.kind === "pdf") {
      return "document";
    }
    return media.kind || "document";
  }
  if (item?.links?.length) {
    return "link";
  }
  return "text";
}

function itemMatchesActiveTypeFilters(item, activeFilters = state.settings.typeFilters) {
  return activeFilters.includes(itemTypeFilterKey(item));
}

function hiddenByTypeFiltersCount() {
  return state.items.filter((item) => !state.decisions[String(item.id)] && !itemMatchesActiveTypeFilters(item)).length;
}

function nextTypeFiltersForToggle(filterKey) {
  const current = [...state.settings.typeFilters];
  const isActive = current.includes(filterKey);
  if (isActive) {
    return current.filter((entry) => entry !== filterKey);
  }
  const next = [...current, filterKey];
  return ITEM_TYPE_FILTERS.map((entry) => entry.key).filter((entry) => next.includes(entry));
}

function isProMode() {
  return Boolean(state.settings?.proMode);
}

function isSettingsOpen() {
  return !elements.settingsModal.classList.contains("hidden");
}

function isPrivacyOpen() {
  return !elements.privacyModal.classList.contains("hidden");
}

function leftAction() {
  return isProMode() ? "delete" : "skip";
}

function resetStageScroll() {
  if (elements.stage) {
    elements.stage.scrollTop = 0;
  }
}

function syncStageVerticalAlignment() {
  const layout = elements.stageLayout;
  if (!layout) {
    return;
  }
  layout.classList.remove("is-overflowing");
  layout.style.paddingTop = "";
  layout.style.paddingBottom = "";
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
  if (!media?.source_path) {
    return null;
  }
  const relativePath = normalizeRelativePath(media.source_path);
  if (!relativePath) {
    return null;
  }
  if (state.mediaObjectUrls.has(relativePath)) {
    return state.mediaObjectUrls.get(relativePath);
  }
  const file = getFileByRelativePath(relativePath);
  if (!file) {
    return null;
  }
  const objectUrl = URL.createObjectURL(file);
  state.mediaObjectUrls.set(relativePath, objectUrl);
  return objectUrl;
}

function mediaPreviewPath(media) {
  if (!media?.preview_path) {
    return null;
  }
  const relativePath = normalizeRelativePath(media.preview_path);
  if (!relativePath) {
    return null;
  }
  if (state.mediaObjectUrls.has(relativePath)) {
    return state.mediaObjectUrls.get(relativePath);
  }
  const file = getFileByRelativePath(relativePath);
  if (!file) {
    return null;
  }
  const objectUrl = URL.createObjectURL(file);
  state.mediaObjectUrls.set(relativePath, objectUrl);
  return objectUrl;
}

function isVoiceMessage(media) {
  return media?.media_type === "voice_message";
}

function isRoundVideo(media) {
  return media?.media_type === "video_message" || String(media?.source_path || "").includes("round_video_messages/");
}

function renderStats() {
  elements.footerStats.classList.toggle("hidden", !state.exportReady);
  const total = state.importStats.total || state.items.length;
  const left = state.queue.length;
  const skippedByUser = Object.values(state.decisions).filter((decision) => decision.action === "skip").length;
  const autoSkipped = state.importStats.autoSkipped || 0;
  const hiddenByFilters = hiddenByTypeFiltersCount();
  const skipped = skippedByUser + autoSkipped + hiddenByFilters;
  const saved = Object.values(state.decisions).filter((decision) => decision.action === "save").length;

  elements.statTotal.textContent = total;
  elements.statLeft.textContent = left;
  elements.statSkipped.textContent = skipped;
  elements.statSaved.textContent = saved;

  if (elements.statSkippedWrap) {
    const tooltipParts = [];
    if (autoSkipped > 0) {
      tooltipParts.push(
        `Автоматически скрыто ${autoSkipped}: в экспорте есть запись, но отсутствует локальный файл фото, видео или документа.`,
      );
    }
    if (skippedByUser > 0) {
      tooltipParts.push(`Вы пропустили вручную: ${skippedByUser}.`);
    }
    if (hiddenByFilters > 0) {
      tooltipParts.push(`Скрыто фильтрами типов: ${hiddenByFilters}.`);
    }
    if (!tooltipParts.length) {
      tooltipParts.push("Здесь показываются ручные пропуски и авто-скрытые записи без локальных файлов.");
    }
    const tooltipText = tooltipParts.join("\n");
    elements.statSkippedWrap.dataset.tooltip = tooltipText;
    elements.statSkippedWrap.title = tooltipText;
  }
}

function renderUndoButton() {
  if (!elements.undoCardBtn) {
    return;
  }
  const canUndo = state.history.length > 0;
  elements.undoCardBtn.disabled = !canUndo;
  elements.undoCardBtn.classList.toggle("hidden", !state.exportReady);
}

function renderActionButtons() {
  const proMode = isProMode();
  elements.deleteBtn.classList.toggle("hidden", !proMode);
  elements.proModeBtn.classList.toggle("active", proMode);
  elements.proModeBtn.setAttribute("aria-pressed", proMode ? "true" : "false");

  const skipMainIcon = elements.skipBtn?.querySelector(".hint-main-icon");
  if (skipMainIcon) {
    skipMainIcon.innerHTML = proMode
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

function normalizeLinkForDisplay(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function formatVisibleLinkText(text, href) {
  const cleanHref = String(href || "").trim();
  const cleanText = String(text || "").trim();
  if (!cleanHref) {
    return cleanText;
  }
  if (!cleanText) {
    return cleanHref;
  }
  const normalizedHref = normalizeLinkForDisplay(cleanHref);
  const normalizedText = normalizeLinkForDisplay(cleanText);
  if (normalizedText === normalizedHref || normalizedText === cleanHref) {
    return cleanHref;
  }
  return `${cleanText} -> ${cleanHref}`;
}

function renderSettingsModal() {
  renderActionButtons();
  elements.settingsExportPath.textContent = truncateMiddle(state.settings.exportJsonPath || "Не выбрана");
  const canPickOutput = supportsOutputDirectoryPick();
  const canExportArtifacts = state.exportReady && hasExportableArtifacts();
  const outputPathLabel = state.settings.outputPath
    ? `Папка Chrome: ${state.settings.outputPath}. Скачать .zip тоже можно.`
    : canPickOutput
      ? "На любом браузере можно скачать один .zip. В Chrome можно дополнительно писать прямо в локальную папку."
      : "Экспорт доступен как один локальный .zip без доступа к папке.";
  elements.settingsOutputPath.textContent = state.settings.outputPath ? truncateMiddle(outputPathLabel) : outputPathLabel;
  elements.openExportFolderBtn.disabled = !state.exportReady;
  elements.resetProgressBtn.disabled = !state.exportReady;
  elements.downloadOutputBtn.disabled = !canExportArtifacts;
  elements.pickOutputBtn.classList.toggle("hidden", !canPickOutput);
  elements.openOutputFolderBtn.classList.toggle("hidden", !canPickOutput);
  elements.openOutputFolderBtn.disabled = !state.outputHandle || !canExportArtifacts;
  elements.settingsTypeFilters.innerHTML = "";
  elements.settingsTagsEditor.innerHTML = "";

  for (const filter of ITEM_TYPE_FILTERS) {
    const chip = document.createElement("button");
    chip.type = "button";
    const isActive = state.settings.typeFilters.includes(filter.key);
    chip.className = `tag-chip settings-filter-chip ${isActive ? "active" : ""}`;
    chip.textContent = filter.label;
    if (isActive) {
      applyTagAccent(chip, filter.label);
    }
    chip.addEventListener("click", async () => {
      try {
        await updateSettings({ type_filters: nextTypeFiltersForToggle(filter.key) });
      } catch (error) {
        reportError(error);
      }
    });
    elements.settingsTypeFilters.append(chip);
  }

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

function openPrivacyModal() {
  elements.privacyModal.classList.remove("hidden");
}

function closePrivacyModal() {
  elements.privacyModal.classList.add("hidden");
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
      node.textContent = formatVisibleLinkText(segment.text, segment.href);
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

  const links = item.links.filter((link, index) => {
    if (index > 0) {
      return true;
    }
    return isLinkOnlyMessage(item) || normalizeLinkForDisplay(link.text) !== normalizeLinkForDisplay(link.href);
  });
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
    anchor.textContent = formatVisibleLinkText(link.text, link.href);
    elements.messageLinks.append(anchor);
  }
}

function renderCard() {
  renderStats();
  renderUndoButton();
  renderActionButtons();
  resetStageScroll();
  if (!state.exportReady) {
    state.renderedItemId = null;
    elements.card.classList.add("hidden");
    elements.swipeHints.classList.add("hidden");
    elements.emptyState.classList.remove("hidden");
    elements.emptyTitle.textContent = "Выберите папку экспорта";
    elements.emptyCopy.innerHTML =
      "Браузер попросит доступ только к выбранной папке.<br /><br />Файлы откроются локально в вашем браузере,<br />сервер не может видеть и обрабатывать ваши данные.";
    elements.emptyPickExportBtn.classList.remove("hidden");
    elements.emptyDownloadOutputBtn.classList.add("hidden");
    syncStageVerticalAlignment();
    return;
  }

  const item = state.currentItem;
  if (!item) {
    state.renderedItemId = null;
    elements.card.classList.add("hidden");
    elements.swipeHints.classList.add("hidden");
    elements.emptyState.classList.remove("hidden");
    if (hiddenByTypeFiltersCount() > 0) {
      elements.emptyTitle.textContent = "По этим фильтрам пусто";
      elements.emptyCopy.textContent = "Включи скрытые типы в настройках, чтобы вернуть их в очередь.";
    } else {
      elements.emptyTitle.textContent = "Очередь закончилась";
      elements.emptyCopy.textContent = "Все сообщения получили действие. Можно выбрать другой export или продолжить после новых изменений.";
    }
    elements.emptyPickExportBtn.classList.add("hidden");
    elements.emptyDownloadOutputBtn.classList.toggle("hidden", !hasExportableArtifacts());
    syncStageVerticalAlignment();
    return;
  }

  elements.emptyState.classList.add("hidden");
  elements.emptyDownloadOutputBtn.classList.add("hidden");
  elements.card.classList.remove("hidden");
  elements.swipeHints.classList.toggle("hidden", Boolean(state.savePanelItem));
  elements.card.style.transform = "";
  state.renderedItemId = item.id;
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
  syncSettingsState(currentSettingsPayload());
  rebuildKnownTags();
  refreshQueue();
  renderCard();
  renderSavePanel();
  renderSettingsModal();
}

async function updateSettings(nextSettings) {
  const settings = storedSettingsPayload();
  if (Object.prototype.hasOwnProperty.call(nextSettings, "pro_mode")) {
    settings.pro_mode = Boolean(nextSettings.pro_mode);
  }
  if (Object.prototype.hasOwnProperty.call(nextSettings, "default_tags")) {
    settings.default_tags = normalizeSettingsTags(nextSettings.default_tags);
  }
  if (Object.prototype.hasOwnProperty.call(nextSettings, "type_filters")) {
    settings.type_filters = normalizeTypeFilters(nextSettings.type_filters, false);
  }
  persistSettingsPayload(settings);
  syncSettingsState(currentSettingsPayload());
  if (state.savePanelItem && !itemMatchesActiveTypeFilters(state.savePanelItem)) {
    closeSavePanel();
  }
  rebuildKnownTags();
  refreshQueue();
  renderSettingsModal();
  renderSavePanel();
  renderCard();
}

function safePathComponent(value, fallback = "item") {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return cleaned || fallback;
}

function slugifyTag(tag) {
  return safePathComponent(String(tag || "").toLocaleLowerCase("ru"), "tag")
    .replaceAll(" ", "-")
    .replace(/-{2,}/g, "-");
}

function normalizeLinkForFilename(href) {
  try {
    const parsed = new URL(href);
    const host = (parsed.hostname || parsed.host || "").replace(/^www\./, "");
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const queryParts = [];
    if (parsed.search) {
      queryParts.push(parsed.search.slice(1).replaceAll("&", "_").replaceAll("=", "-"));
    }
    if (parsed.hash) {
      queryParts.push(parsed.hash.slice(1));
    }
    const parts = [host, ...pathParts, ...queryParts].filter(Boolean);
    return parts.map((part) => safePathComponent(part, "link")).slice(0, 6).join("_") || "link";
  } catch {
    return safePathComponent(String(href || "").replace(/^https?:\/\//, ""), "link");
  }
}

function mediaLabel(media) {
  if (!media) {
    return "Пост";
  }
  const labels = {
    image: "Фото",
    video: "Видео",
    audio: "Аудио",
    sticker: "Стикер",
    pdf: "PDF",
    document: "Документ",
  };
  return labels[media.kind] || "Файл";
}

function deriveNoteTitleFragment(item) {
  const text = collapseWhitespace(item?.text || "");
  const links = Array.isArray(item?.links) ? item.links : [];
  if (links.length) {
    const firstLink = links[0].href;
    if (!text || text === firstLink || text === links[0].text || text === String(links[0].text || "").trim()) {
      return safePathComponent(`Ссылка_${normalizeLinkForFilename(firstLink)}`, `message-${item.id}`);
    }
  }
  if (text) {
    return safePathComponent(text.slice(0, 50), `message-${item.id}`);
  }
  return safePathComponent(mediaLabel(item?.media), `message-${item.id}`);
}

function makeNoteStem(item) {
  const parsed = new Date(item.date_iso);
  if (Number.isNaN(parsed.getTime())) {
    return `${item.id}_${deriveNoteTitleFragment(item).slice(0, 120)}`;
  }
  const parts = [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
    "_",
    String(parsed.getHours()).padStart(2, "0"),
    String(parsed.getMinutes()).padStart(2, "0"),
    String(parsed.getSeconds()).padStart(2, "0"),
  ].join("");
  return `${parts}_${deriveNoteTitleFragment(item).slice(0, 120)}`;
}

function renderSegmentsForMarkdown(segments) {
  const parts = [];
  for (const segment of segments || []) {
    const segmentType = segment?.type || "plain";
    const text = segment?.text || "";
    if (!text) {
      continue;
    }
    if (segmentType === "link") {
      parts.push(`[${text}](${segment.href || text})`);
    } else if (segmentType === "bold") {
      parts.push(`**${text}**`);
    } else if (segmentType === "italic") {
      parts.push(`*${text}*`);
    } else if (segmentType === "code") {
      parts.push(`\`${text}\``);
    } else {
      parts.push(text);
    }
  }
  return parts.join("").trim();
}

function renderNote(item, tags, mediaFiles, comment) {
  const lines = ["---", "tags:"];
  for (const tag of tags) {
    lines.push(`  - ${JSON.stringify(tag)}`);
  }
  if (item.media) {
    lines.push(`media_kind: ${item.media.kind}`);
  }
  lines.push("---", "", `#${item.id} | | ${String(item.date_iso || "").replace("T", " ")}`, "");

  let authorLine = `**Автор:** ${item.author}`;
  if (item.source) {
    authorLine += ` | | ${item.source}`;
  }
  lines.push(authorLine, "");

  if (comment) {
    lines.push("## Комментарий", "", comment, "");
  }

  if (item.text) {
    lines.push("## Содержимое", "", renderSegmentsForMarkdown(item.segments) || item.text, "");
  }

  if (item.links?.length) {
    lines.push("## Ссылки", "");
    for (const link of item.links) {
      lines.push(`- [${link.text}](${link.href})`);
    }
    lines.push("");
  }

  if (item.media) {
    lines.push("## Медиа", "", `Тип: \`${item.media.kind}\``, "");
    if (item.media.missing) {
      lines.push("Файл отсутствует в экспорте Telegram. В заметке сохранена только карточка сообщения.", "");
    } else {
      const mainName = mediaFiles.main;
      const previewName = mediaFiles.preview;
      if (mainName) {
        lines.push(`[Открыть файл](./${ATTACHMENTS_DIR_NAME}/${mainName})`, "");
      }
      if ((item.media.kind === "image" || item.media.kind === "sticker") && mainName) {
        lines.push(`![](./${ATTACHMENTS_DIR_NAME}/${mainName})`, "");
      } else if (item.media.kind === "video" && mainName) {
        if (previewName) {
          lines.push(`![](./${ATTACHMENTS_DIR_NAME}/${previewName})`, "");
        }
        lines.push(`<video controls preload="metadata" src="./${ATTACHMENTS_DIR_NAME}/${mainName}"></video>`, "");
      } else if (item.media.kind === "audio" && mainName) {
        lines.push(`<audio controls preload="metadata" src="./${ATTACHMENTS_DIR_NAME}/${mainName}"></audio>`, "");
      } else if (previewName) {
        lines.push(`![](./${ATTACHMENTS_DIR_NAME}/${previewName})`, "");
      }
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

function buildDeleteCandidatesFiles() {
  const deleteIds = Object.entries(state.decisions)
    .filter(([, decision]) => decision?.action === "delete")
    .map(([messageId]) => Number(messageId))
    .sort((left, right) => left - right);
  if (!deleteIds.length) {
    return null;
  }

  const payload = {
    updated_at: new Date().toISOString(),
    export_root: state.exportMeta.label,
    export_json_path: state.exportMeta.label ? `${state.exportMeta.label}/result.json` : "result.json",
    message_ids: deleteIds,
  };

  return {
    json: `${JSON.stringify(payload, null, 2)}\n`,
    text: `${deleteIds.join("\n")}\n`,
  };
}

function sortedSavedExportEntries() {
  const itemsById = new Map(state.items.map((item) => [String(item.id), item]));
  return Object.entries(state.decisions)
    .filter(([, decision]) => decision?.action === "save")
    .map(([messageId, decision]) => ({
      item: itemsById.get(String(messageId)),
      decision,
    }))
    .filter((entry) => entry.item && Array.isArray(entry.decision.tags) && entry.decision.tags.length)
    .sort((left, right) => {
      if (left.item.date_iso === right.item.date_iso) {
        return right.item.id - left.item.id;
      }
      return left.item.date_iso < right.item.date_iso ? 1 : -1;
    });
}

function hasExportableArtifacts() {
  return sortedSavedExportEntries().length > 0 || Boolean(buildDeleteCandidatesFiles());
}

function buildThankYouArtifact() {
  return {
    path: "Спасибо.txt",
    data: UTF8_ENCODER.encode(THANK_YOU_NOTE_TEXT),
    modifiedAt: new Date(),
  };
}

async function buildExportArtifacts() {
  const artifacts = [];

  for (const { item, decision } of sortedSavedExportEntries()) {
    const tags = decision.tags || [];
    const mainTag = tags[0];
    const tagFolder = slugifyTag(mainTag);
    const attachmentsDir = `${tagFolder}/${ATTACHMENTS_DIR_NAME}`;

    const media = item.media;
    const mediaFiles = {};
    if (media && !media.missing) {
      if (media.source_path) {
        const sourceFile = getFileByRelativePath(media.source_path);
        if (sourceFile) {
          const safeName = safePathComponent(sourceFile.name, `${item.id}`);
          const targetName = `${item.id}_${safeName}`;
          mediaFiles.main = targetName;
          artifacts.push({
            path: `${attachmentsDir}/${targetName}`,
            data: sourceFile,
            modifiedAt: sourceFile.lastModified ? new Date(sourceFile.lastModified) : new Date(item.date_iso),
          });
        }
      }

      if (media.preview_path && media.preview_path !== media.source_path) {
        const previewFile = getFileByRelativePath(media.preview_path);
        if (previewFile) {
          const safeName = safePathComponent(previewFile.name, `${item.id}_preview`);
          const targetName = `${item.id}_${safeName}`;
          mediaFiles.preview = targetName;
          artifacts.push({
            path: `${attachmentsDir}/${targetName}`,
            data: previewFile,
            modifiedAt: previewFile.lastModified ? new Date(previewFile.lastModified) : new Date(item.date_iso),
          });
        }
      }
    }

    const noteName = `${makeNoteStem(item)}.md`;
    const noteContent = renderNote(item, tags, mediaFiles, String(decision.comment || "").trim());
    artifacts.push({
      path: `${tagFolder}/${noteName}`,
      data: UTF8_ENCODER.encode(noteContent),
      modifiedAt: new Date(item.date_iso || Date.now()),
    });
  }

  const deleteFiles = buildDeleteCandidatesFiles();
  if (deleteFiles) {
    const generatedAt = new Date();
    artifacts.push({
      path: "delete_message_ids.json",
      data: UTF8_ENCODER.encode(deleteFiles.json),
      modifiedAt: generatedAt,
    });
    artifacts.push({
      path: "delete_message_ids.txt",
      data: UTF8_ENCODER.encode(deleteFiles.text),
      modifiedAt: generatedAt,
    });
  }

  return artifacts;
}

async function toUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (typeof value === "string") {
    return UTF8_ENCODER.encode(value);
  }
  throw new Error("Не удалось подготовить данные для экспорта");
}

function zipTimestampParts(rawDate) {
  const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate || Date.now());
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const clampedYear = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((clampedYear - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function buildZipArchive(entries) {
  const localChunks = [];
  const centralChunks = [];
  let localSize = 0;
  let centralSize = 0;
  let offset = 0;
  let entryCount = 0;

  for (const entry of entries) {
    const relativePath = normalizeRelativePath(entry.path);
    if (!relativePath) {
      continue;
    }

    const fileNameBytes = UTF8_ENCODER.encode(relativePath);
    const fileBytes = await toUint8Array(entry.data);
    const checksum = crc32(fileBytes);
    const { dosDate, dosTime } = zipTimestampParts(entry.modifiedAt);

    const localHeader = new ArrayBuffer(30);
    const localView = new DataView(localHeader);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, fileBytes.length, true);
    localView.setUint32(22, fileBytes.length, true);
    localView.setUint16(26, fileNameBytes.length, true);
    localView.setUint16(28, 0, true);

    localChunks.push(new Uint8Array(localHeader), fileNameBytes, fileBytes);
    localSize += 30 + fileNameBytes.length + fileBytes.length;

    const centralHeader = new ArrayBuffer(46);
    const centralView = new DataView(centralHeader);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, fileBytes.length, true);
    centralView.setUint32(24, fileBytes.length, true);
    centralView.setUint16(28, fileNameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);

    centralChunks.push(new Uint8Array(centralHeader), fileNameBytes);
    centralSize += 46 + fileNameBytes.length;
    offset += 30 + fileNameBytes.length + fileBytes.length;
    entryCount += 1;
  }

  const endRecord = new ArrayBuffer(22);
  const endView = new DataView(endRecord);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entryCount, true);
  endView.setUint16(10, entryCount, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localSize, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localChunks, ...centralChunks, new Uint8Array(endRecord)], {
    type: "application/zip",
  });
}

function buildExportArchiveName() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "_",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  return `${OUTPUT_EXPORT_DIR_NAME}_${stamp}.zip`;
}

function triggerDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noreferrer";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 2000);
}

async function downloadExportArchive() {
  const artifacts = await buildExportArtifacts();
  if (!artifacts.length) {
    throw new Error("Пока нечего экспортировать.");
  }
  const archiveEntries = artifacts.map((artifact) => ({
    ...artifact,
    path: `${OUTPUT_EXPORT_DIR_NAME}/${artifact.path}`,
  }));
  archiveEntries.push(buildThankYouArtifact());
  const blob = await buildZipArchive(archiveEntries);
  triggerDownload(blob, buildExportArchiveName());
}

async function ensureDirectory(parentHandle, name) {
  return parentHandle.getDirectoryHandle(name, { create: true });
}

async function clearDirectoryHandle(handle) {
  const entryNames = [];
  for await (const [name] of handle.entries()) {
    entryNames.push(name);
  }
  for (const name of entryNames) {
    await handle.removeEntry(name, { recursive: true });
  }
}

async function writeBinaryFile(handle, name, data) {
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  if (data instanceof Uint8Array) {
    await writable.write(data);
  } else if (data instanceof ArrayBuffer) {
    await writable.write(data);
  } else if (ArrayBuffer.isView(data)) {
    await writable.write(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  } else if (data instanceof Blob) {
    await writable.write(await data.arrayBuffer());
  } else if (typeof data === "string") {
    await writable.write(data);
  } else {
    throw new Error("Не удалось записать бинарный файл");
  }
  await writable.close();
}

async function writeArtifactToDirectory(rootHandle, artifact) {
  const pathParts = normalizeRelativePath(artifact.path).split("/").filter(Boolean);
  if (!pathParts.length) {
    return;
  }
  const fileName = pathParts.pop();
  let currentHandle = rootHandle;
  for (const segment of pathParts) {
    currentHandle = await ensureDirectory(currentHandle, segment);
  }
  await writeBinaryFile(currentHandle, fileName, artifact.data);
}

async function rebuildTagExports() {
  if (!state.outputHandle) {
    return;
  }

  const exportRoot = await ensureDirectory(state.outputHandle, OUTPUT_EXPORT_DIR_NAME);
  await clearDirectoryHandle(exportRoot);
  const artifacts = await buildExportArtifacts();
  for (const artifact of artifacts) {
    await writeArtifactToDirectory(exportRoot, artifact);
  }
  if (artifacts.length) {
    await writeArtifactToDirectory(state.outputHandle, buildThankYouArtifact());
  }
}

async function maybeRebuildOutput() {
  if (!state.outputHandle) {
    return;
  }
  await rebuildTagExports();
}

async function sendDecision(item, action, tags = [], comment = "", options = {}) {
  const { recordHistory = true } = options;
  const previous = state.decisions[String(item.id)] || null;

  if (action === "clear") {
    delete state.decisions[String(item.id)];
  } else {
    const normalizedTags = [];
    const seenTags = new Set();
    for (const rawTag of tags) {
      const cleaned = String(rawTag || "").trim();
      const key = normalizeTagKey(cleaned);
      if (key && !seenTags.has(key)) {
        seenTags.add(key);
        normalizedTags.push(cleaned);
      }
    }

    state.decisions[String(item.id)] = {
      action,
      updated_at: new Date().toISOString(),
      tags: action === "save" ? normalizedTags : [],
      comment: action === "save" ? String(comment || "").trim() : "",
      message_id: item.id,
      date_iso: item.date_iso,
      text_preview: item.text.length > 140 ? `${item.text.slice(0, 140)}…` : item.text,
      media_kind: item.media?.kind || null,
    };
  }

  if (action === "save") {
    rememberCustomTags(tags);
  }

  rebuildKnownTags();
  persistCurrentExportState();

  if (recordHistory) {
    state.history.unshift({ item, previous });
  }

  await maybeRebuildOutput();
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
  elements.undoCardBtn?.addEventListener("click", async () => {
    await undoLastAction();
  });
  elements.deleteBtn.addEventListener("click", async () => {
    await handleAction("delete");
  });
  elements.skipBtn.addEventListener("click", async () => {
    await handleAction("skip");
  });
  elements.saveBtn.addEventListener("click", () => {
    openSavePanel(state.currentItem);
  });
  elements.openPrivacyBtn.addEventListener("click", openPrivacyModal);
  elements.closePrivacyBtn.addEventListener("click", closePrivacyModal);
  elements.privacyModal.addEventListener("click", (event) => {
    if (event.target === elements.privacyModal) {
      closePrivacyModal();
    }
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
      reportError(error);
    }
  });
  elements.pickExportBtn.addEventListener("click", async () => {
    try {
      closeSavePanel();
      await pickExportFolder();
    } catch (error) {
      if (error?.name !== "AbortError") {
        reportError(error);
      }
    }
  });
  elements.emptyPickExportBtn.addEventListener("click", async () => {
    try {
      await pickExportFolder();
    } catch (error) {
      if (error?.name !== "AbortError") {
        reportError(error);
      }
    }
  });
  elements.emptyDownloadOutputBtn.addEventListener("click", async () => {
    try {
      await downloadExportArchive();
    } catch (error) {
      reportError(error);
    }
  });
  elements.resetProgressBtn?.addEventListener("click", async () => {
    try {
      await resetCurrentExportProgress();
    } catch (error) {
      reportError(error);
    }
  });
  elements.openExportFolderBtn.addEventListener("click", () => {
    clearImportedExport();
    rebuildKnownTags();
    renderCard();
    renderSavePanel();
    renderSettingsModal();
  });
  elements.downloadOutputBtn.addEventListener("click", async () => {
    try {
      await downloadExportArchive();
    } catch (error) {
      reportError(error);
    }
  });
  elements.pickOutputBtn.addEventListener("click", async () => {
    try {
      if (!supportsOutputDirectoryPick()) {
        throw new Error("Этот браузер не умеет писать прямо в папку. Используйте кнопку «Скачать .zip».");
      }
      const handle = await window.showDirectoryPicker({
        id: "telegram-cleaner-output",
        mode: "readwrite",
      });
      state.outputHandle = handle;
      state.settings.outputPath = `${handle.name}/${OUTPUT_EXPORT_DIR_NAME}`;
      renderSettingsModal();
      if (state.exportReady) {
        await rebuildTagExports();
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        reportError(error);
      }
    }
  });
  elements.openOutputFolderBtn.addEventListener("click", async () => {
    try {
      if (!state.outputHandle) {
        throw new Error("Сначала выберите папку для Chrome или скачайте .zip.");
      }
      await rebuildTagExports();
    } catch (error) {
      reportError(error);
    }
  });
  elements.saveSettingsTagsBtn.addEventListener("click", async () => {
    try {
      commitSettingsTagInput();
      await updateSettings({ default_tags: [...state.settingsDraftTags] });
    } catch (error) {
      reportError(error);
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
  elements.exportFolderInput?.addEventListener("change", async (event) => {
    const { files } = event.target;
    try {
      closeSavePanel();
      await importFromFileList(files);
    } catch (error) {
      reportError(error);
    } finally {
      event.target.value = "";
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
    if (event.key === "Escape" && isPrivacyOpen()) {
      event.preventDefault();
      closePrivacyModal();
      return;
    }

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
