from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import webbrowser
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


def bundle_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    return Path(__file__).resolve().parent


def runtime_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


APP_ROOT = runtime_root()
WORKSPACE_ROOT = APP_ROOT.parent if not getattr(sys, "frozen", False) else APP_ROOT
BUNDLE_ROOT = bundle_root()
STATIC_ROOT = BUNDLE_ROOT / "static"
DATA_ROOT = APP_ROOT / "data"
SETTINGS_FILE = APP_ROOT / "settings.json"
STATE_FILE = DATA_ROOT / "decisions.json"
BASE_OBSIDIAN_ROOT = DATA_ROOT / "obsidian_export"
DELETE_IDS_FILE = DATA_ROOT / "delete_message_ids.json"
DELETE_IDS_TEXT_FILE = DATA_ROOT / "delete_message_ids.txt"
DEFAULT_TAGS_FALLBACK = ["мысли", "дневник", "референс", "ссылка", "цитата"]
ATTACHMENTS_DIR_NAME = "Вложения"
MISSING_FILE_MARKER = "(File exceeds maximum size. Change data exporting settings to download.)"

EXPORT_ROOT: Path | None = None
OUTPUT_ROOT: Path = BASE_OBSIDIAN_ROOT
ITEMS: list[dict[str, Any]] = []
ITEMS_BY_ID: dict[int, dict[str, Any]] = {}


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def atomic_write_text(path: Path, content: str) -> None:
    ensure_dir(path.parent)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(content, encoding="utf-8")
    temp_path.replace(path)


def atomic_write_json(path: Path, payload: Any) -> None:
    atomic_write_text(path, json.dumps(payload, ensure_ascii=False, indent=2))


def current_export_root() -> Path:
    if EXPORT_ROOT is None:
        raise FileNotFoundError("Telegram export is not configured")
    return EXPORT_ROOT


def current_obsidian_root() -> Path:
    return OUTPUT_ROOT


def load_settings() -> dict[str, Any]:
    ensure_dir(APP_ROOT)
    if not SETTINGS_FILE.exists():
        settings = {
            "version": 1,
            "export_json_path": "",
            "obsidian_output_path": "",
            "pro_mode": False,
            "default_tags": list(DEFAULT_TAGS_FALLBACK),
        }
        atomic_write_json(SETTINGS_FILE, settings)
        return settings
    with SETTINGS_FILE.open("r", encoding="utf-8") as handle:
        settings = json.load(handle)
    settings.setdefault("version", 1)
    settings.setdefault("export_json_path", "")
    settings.setdefault("obsidian_output_path", "")
    settings.setdefault("pro_mode", False)
    settings.setdefault("default_tags", list(DEFAULT_TAGS_FALLBACK))
    if str(settings.get("obsidian_output_path", "")).strip() == str(BASE_OBSIDIAN_ROOT):
        settings["obsidian_output_path"] = ""
    return settings


def save_settings(settings: dict[str, Any]) -> None:
    atomic_write_json(SETTINGS_FILE, settings)


def normalize_settings_tags(raw_tags: Any) -> list[str]:
    if not isinstance(raw_tags, list):
        return list(DEFAULT_TAGS_FALLBACK)
    normalized_tags: list[str] = []
    seen: set[str] = set()
    for raw_tag in raw_tags:
        if not isinstance(raw_tag, str):
            continue
        tag = raw_tag.strip()
        key = normalize_tag(tag)
        if key and key not in seen:
            seen.add(key)
            normalized_tags.append(tag)
    return normalized_tags or list(DEFAULT_TAGS_FALLBACK)


def initialize_output_root(settings: dict[str, Any]) -> None:
    global OUTPUT_ROOT

    configured = str(settings.get("obsidian_output_path", "")).strip()
    output_root = Path(configured).expanduser().resolve() if configured else BASE_OBSIDIAN_ROOT
    OUTPUT_ROOT = output_root


def current_default_tags(settings: dict[str, Any] | None = None) -> list[str]:
    if settings is None:
        settings = load_settings()
    return normalize_settings_tags(settings.get("default_tags", []))


def choose_directory(initial_dir: Path | None = None, title: str = "Выберите папку") -> Path | None:
    try:
        import tkinter
        from tkinter import filedialog

        root = tkinter.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(
            parent=root,
            title=title,
            initialdir=str(initial_dir or APP_ROOT),
            mustexist=False,
        )
        root.destroy()
        if not selected:
            return None
        return Path(selected).resolve()
    except Exception:
        return None


def open_in_file_manager(path: Path) -> None:
    target = path.resolve()
    if sys.platform.startswith("win"):
        os.startfile(str(target))
        return
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(target)])
        return
    subprocess.Popen(["xdg-open", str(target)])


def settings_payload(settings: dict[str, Any]) -> dict[str, Any]:
    return {
        "pro_mode": bool(settings.get("pro_mode", False)),
        "export_json_path": str(settings.get("export_json_path", "")),
        "export_root": str(current_export_root()) if EXPORT_ROOT is not None else "",
        "export_ready": EXPORT_ROOT is not None,
        "obsidian_output_path": str(settings.get("obsidian_output_path", "")),
        "default_tags": current_default_tags(settings),
    }


def choose_export_json(initial_dir: Path | None = None) -> Path | None:
    try:
        import tkinter
        from tkinter import filedialog

        root = tkinter.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askopenfilename(
            parent=root,
            title="Выберите result.json из Telegram export",
            filetypes=[("Telegram JSON", "result.json"), ("JSON files", "*.json")],
            initialdir=str(initial_dir or APP_ROOT),
        )
        root.destroy()
        if not selected:
            return None
        return Path(selected).resolve()
    except Exception:
        return None


def validate_export_json_path(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if resolved.name.casefold() != "result.json":
        raise FileNotFoundError("Нужно выбрать файл result.json из Telegram export")
    if not resolved.exists() or not resolved.is_file():
        raise FileNotFoundError(f"Файл не найден: {resolved}")
    return resolved


def fallback_export_json_path() -> Path | None:
    if getattr(sys, "frozen", False):
        return None
    for candidate in sorted(WORKSPACE_ROOT.glob("ChatExport*/result.json")):
        if candidate.is_file():
            return candidate.resolve()
    return None


def resolve_export_json_path(settings: dict[str, Any]) -> Path:
    configured_path = str(settings.get("export_json_path", "")).strip()
    if configured_path:
        try:
            return validate_export_json_path(Path(configured_path))
        except FileNotFoundError:
            pass

    fallback_path = fallback_export_json_path()
    if fallback_path is not None:
        settings["export_json_path"] = str(fallback_path)
        save_settings(settings)
        return fallback_path

    initial_dir = APP_ROOT
    if configured_path:
        initial_dir = Path(configured_path).expanduser().resolve().parent

    while True:
        selected = choose_export_json(initial_dir=initial_dir)
        if selected is None:
            raise FileNotFoundError("Файл result.json не выбран")
        try:
            validated = validate_export_json_path(selected)
        except FileNotFoundError as error:
            show_error_dialog("Разгребатель Телеги", str(error))
            initial_dir = selected.parent
            continue
        settings["export_json_path"] = str(validated)
        save_settings(settings)
        return validated


def initialize_export(export_json_path: Path) -> None:
    global EXPORT_ROOT, ITEMS, ITEMS_BY_ID

    EXPORT_ROOT = validate_export_json_path(export_json_path).parent
    ITEMS, ITEMS_BY_ID = load_messages()


def clear_export() -> None:
    global EXPORT_ROOT, ITEMS, ITEMS_BY_ID

    EXPORT_ROOT = None
    ITEMS = []
    ITEMS_BY_ID = {}


def try_initialize_export_from_settings(settings: dict[str, Any]) -> bool:
    configured_path = str(settings.get("export_json_path", "")).strip()
    if not configured_path:
        clear_export()
        return False
    try:
        initialize_export(Path(configured_path))
        return True
    except FileNotFoundError:
        clear_export()
        settings["export_json_path"] = ""
        save_settings(settings)
        return False


def load_state() -> dict[str, Any]:
    ensure_dir(DATA_ROOT)
    if not STATE_FILE.exists():
        state = {
            "version": 1,
            "export_root": current_export_root().name,
            "updated_at": now_iso(),
            "custom_tags": [],
            "decisions": {},
        }
        atomic_write_json(STATE_FILE, state)
        return state
    with STATE_FILE.open("r", encoding="utf-8") as handle:
        state = json.load(handle)
    state.setdefault("decisions", {})
    state.setdefault("custom_tags", [])
    migrate_legacy_tags(state)
    return state


def migrate_legacy_tags(state: dict[str, Any]) -> None:
    legacy_tag = "сон"
    replacement_tag = "референс"

    custom_tags = state.get("custom_tags", [])
    if isinstance(custom_tags, list):
        migrated_custom_tags: list[str] = []
        seen_custom: set[str] = set()
        for raw_tag in custom_tags:
            if not isinstance(raw_tag, str):
                continue
            tag = replacement_tag if normalize_tag(raw_tag) == normalize_tag(legacy_tag) else raw_tag
            key = normalize_tag(tag)
            if key and key not in seen_custom:
                seen_custom.add(key)
                migrated_custom_tags.append(tag)
        state["custom_tags"] = migrated_custom_tags

    for decision in state.get("decisions", {}).values():
        tags = decision.get("tags", [])
        if not isinstance(tags, list):
            continue
        migrated_tags: list[str] = []
        seen_tags: set[str] = set()
        for raw_tag in tags:
            if not isinstance(raw_tag, str):
                continue
            tag = replacement_tag if normalize_tag(raw_tag) == normalize_tag(legacy_tag) else raw_tag
            key = normalize_tag(tag)
            if key and key not in seen_tags:
                seen_tags.add(key)
                migrated_tags.append(tag)
        decision["tags"] = migrated_tags


def save_state(state: dict[str, Any]) -> None:
    state["updated_at"] = now_iso()
    atomic_write_json(STATE_FILE, state)


def rebuild_delete_candidates(state: dict[str, Any]) -> None:
    delete_ids = sorted(
        int(raw_id)
        for raw_id, decision in state.get("decisions", {}).items()
        if decision.get("action") == "delete"
    )
    payload = {
        "updated_at": now_iso(),
        "export_root": current_export_root().name,
        "export_json_path": str(current_export_root() / "result.json"),
        "message_ids": delete_ids,
    }
    atomic_write_json(DELETE_IDS_FILE, payload)
    delete_ids_text = "\n".join(str(message_id) for message_id in delete_ids)
    if delete_ids_text:
        delete_ids_text += "\n"
    atomic_write_text(DELETE_IDS_TEXT_FILE, delete_ids_text)


def load_export() -> dict[str, Any]:
    with (current_export_root() / "result.json").open("r", encoding="utf-8") as handle:
        return json.load(handle)


def safe_path_component(value: str, fallback: str = "item") -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1F]', "-", value.strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return cleaned or fallback


def slugify_tag(tag: str) -> str:
    cleaned = safe_path_component(tag.casefold(), fallback="tag")
    cleaned = cleaned.replace(" ", "-")
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    return cleaned


def normalize_tag(tag: str) -> str:
    normalized = re.sub(r"\s+", " ", tag.strip())
    return normalized.casefold()


def collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def flatten_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for chunk in value:
            if isinstance(chunk, str):
                parts.append(chunk)
            elif isinstance(chunk, dict):
                parts.append(str(chunk.get("text", "")))
        return "".join(parts)
    return ""


def extract_segments(message: dict[str, Any]) -> list[dict[str, str]]:
    entities = message.get("text_entities")
    if isinstance(entities, list) and entities:
        segments: list[dict[str, str]] = []
        for entity in entities:
            if isinstance(entity, str):
                segments.append({"type": "plain", "text": entity})
                continue
            if not isinstance(entity, dict):
                continue
            entity_type = entity.get("type", "plain")
            text = str(entity.get("text", ""))
            href = str(entity.get("href") or "")
            if entity_type in {"link", "text_link"}:
                segments.append({"type": "link", "text": text, "href": href or text})
            elif entity_type == "bold":
                segments.append({"type": "bold", "text": text})
            elif entity_type == "italic":
                segments.append({"type": "italic", "text": text})
            elif entity_type == "code":
                segments.append({"type": "code", "text": text})
            else:
                segments.append({"type": "plain", "text": text})
        return segments
    flattened = flatten_text(message.get("text", ""))
    return [{"type": "plain", "text": flattened}] if flattened else []


def extract_links(segments: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[tuple[str, str]] = set()
    links: list[dict[str, str]] = []
    for segment in segments:
        if segment.get("type") == "link":
            href = segment.get("href", "").strip()
            text = segment.get("text", href).strip() or href
            key = (text, href)
            if href and key not in seen:
                seen.add(key)
                links.append({"text": text, "href": href})
    return links


def is_missing_marker(value: Any) -> bool:
    return isinstance(value, str) and value.strip() == MISSING_FILE_MARKER


def existing_relative_path(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip() or is_missing_marker(value):
        return None
    relative = value.replace("\\", "/")
    if (current_export_root() / relative).exists():
        return relative
    return None


def derived_preview(file_relative: str | None) -> str | None:
    if not file_relative:
        return None
    relative_path = Path(file_relative)
    preview_candidate = relative_path.parent / f"{relative_path.name}_thumb.jpg"
    preview_relative = preview_candidate.as_posix()
    return preview_relative if (current_export_root() / preview_relative).exists() else None


def detect_media(message: dict[str, Any]) -> dict[str, Any] | None:
    photo_relative = existing_relative_path(message.get("photo"))
    file_relative = existing_relative_path(message.get("file"))
    thumbnail_relative = existing_relative_path(message.get("thumbnail"))
    media_type = str(message.get("media_type", ""))
    mime_type = str(message.get("mime_type", ""))

    if photo_relative:
        return {
            "kind": "image",
            "media_type": "photo",
            "file_name": Path(photo_relative).name,
            "source_path": photo_relative,
            "preview_path": photo_relative,
            "mime_type": mime_type or mimetypes.guess_type(photo_relative)[0] or "image/jpeg",
            "width": message.get("width"),
            "height": message.get("height"),
            "duration_seconds": message.get("duration_seconds"),
            "missing": False,
        }

    if not file_relative and not is_missing_marker(message.get("file")):
        return None

    preview_relative = thumbnail_relative or derived_preview(file_relative)
    suffix = Path(file_relative).suffix.lower() if file_relative else Path(str(message.get("file_name", ""))).suffix.lower()

    if media_type in {"video_file", "video_message", "animation"} or mime_type.startswith("video/"):
        kind = "video"
    elif media_type in {"voice_message", "audio_file"} or mime_type.startswith("audio/"):
        kind = "audio"
    elif media_type == "sticker" or suffix in {".tgs", ".webp"}:
        kind = "sticker"
    elif mime_type.startswith("image/") or suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".dng"}:
        kind = "image"
    elif suffix == ".pdf":
        kind = "pdf"
    else:
        kind = "document"

    return {
        "kind": kind,
        "media_type": media_type or kind,
        "file_name": str(message.get("file_name") or (Path(file_relative).name if file_relative else "missing-file")),
        "source_path": file_relative,
        "preview_path": preview_relative,
        "mime_type": mime_type or mimetypes.guess_type(file_relative or "")[0] or "application/octet-stream",
        "width": message.get("width"),
        "height": message.get("height"),
        "duration_seconds": message.get("duration_seconds"),
        "missing": file_relative is None,
    }


def to_display_date(date_iso: str) -> tuple[str, str]:
    parsed = datetime.fromisoformat(date_iso)
    return parsed.strftime("%d %b %Y"), parsed.strftime("%H:%M")


def normalize_message(message: dict[str, Any]) -> dict[str, Any] | None:
    if message.get("type") != "message":
        return None

    segments = extract_segments(message)
    text = "".join(segment.get("text", "") for segment in segments).strip()
    media = detect_media(message)
    if not text and not media:
        return None

    date_iso = str(message.get("date"))
    display_date, display_time = to_display_date(date_iso)
    links = extract_links(segments)
    author = str(message.get("from", "")).strip() or "Saved Messages"
    source = str(message.get("saved_from") or message.get("forwarded_from") or "").strip()

    return {
        "id": int(message["id"]),
        "date_iso": date_iso,
        "date_display": display_date,
        "time_display": display_time,
        "author": author,
        "source": source,
        "text": text,
        "segments": segments,
        "links": links,
        "media": media,
        "edited_iso": message.get("edited"),
    }


def load_messages() -> tuple[list[dict[str, Any]], dict[int, dict[str, Any]]]:
    export_data = load_export()
    normalized_items = [
        item
        for item in (normalize_message(message) for message in export_data.get("messages", []))
        if item is not None
    ]
    normalized_items.sort(key=lambda item: (item["date_iso"], item["id"]))
    return normalized_items, {item["id"]: item for item in normalized_items}


def serialize_decision(message_id: int, decision: dict[str, Any]) -> dict[str, Any]:
    item = ITEMS_BY_ID.get(message_id)
    if item is None:
        return decision
    merged = dict(decision)
    merged["message_id"] = message_id
    merged["date_iso"] = item["date_iso"]
    merged["text_preview"] = (item["text"][:140] + "…") if len(item["text"]) > 140 else item["text"]
    merged["media_kind"] = item["media"]["kind"] if item.get("media") else None
    return merged


def tag_usage_counts(state: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for decision in state.get("decisions", {}).values():
        if decision.get("action") != "save":
            continue
        for tag in decision.get("tags", []):
            normalized = normalize_tag(tag)
            if not normalized:
                continue
            counts[normalized] = counts.get(normalized, 0) + 1
    return counts


def all_known_tags(state: dict[str, Any], settings: dict[str, Any] | None = None) -> list[str]:
    default_tags = current_default_tags(settings)
    display_by_tag = {normalize_tag(tag): tag for tag in default_tags}
    for tag in state.get("custom_tags", []):
        normalized = normalize_tag(tag)
        if normalized:
            display_by_tag[normalized] = tag
    for decision in state.get("decisions", {}).values():
        for tag in decision.get("tags", []):
            normalized = normalize_tag(tag)
            if normalized:
                display_by_tag[normalized] = tag

    counts = tag_usage_counts(state)
    default_order = {normalize_tag(tag): index for index, tag in enumerate(default_tags)}
    return [
        display_by_tag[key]
        for key in sorted(
            display_by_tag,
            key=lambda tag_key: (-counts.get(tag_key, 0), default_order.get(tag_key, len(default_tags) + 1), display_by_tag[tag_key].casefold()),
        )
    ]


def ensure_inside(parent: Path, child: Path) -> None:
    resolved_parent = parent.resolve()
    resolved_child = child.resolve()
    if resolved_parent != resolved_child and resolved_parent not in resolved_child.parents:
        raise ValueError(f"Unsafe path outside workspace: {resolved_child}")


def make_note_stem(item: dict[str, Any]) -> str:
    parsed = datetime.fromisoformat(item["date_iso"])
    stem = parsed.strftime("%Y%m%d_%H%M%S")
    title_fragment = derive_note_title_fragment(item)
    return f"{stem}_{title_fragment[:120]}"


def normalize_link_for_filename(href: str) -> str:
    parsed = urlparse(href)
    host = (parsed.netloc or parsed.path).replace("www.", "").strip("/")
    path_parts = [part for part in parsed.path.split("/") if part]
    query_fragment = []
    if parsed.query:
        query_fragment.append(parsed.query.replace("&", "_").replace("=", "-"))
    if parsed.fragment:
        query_fragment.append(parsed.fragment)
    parts = [host, *path_parts, *query_fragment]
    cleaned_parts = [safe_path_component(part, fallback="link") for part in parts if part]
    return "_".join(cleaned_parts[:6]) or "link"


def media_label(media: dict[str, Any] | None) -> str:
    if not media:
        return "Пост"
    labels = {
        "image": "Фото",
        "video": "Видео",
        "audio": "Аудио",
        "sticker": "Стикер",
        "pdf": "PDF",
        "document": "Документ",
    }
    return labels.get(media.get("kind", ""), "Файл")


def derive_note_title_fragment(item: dict[str, Any]) -> str:
    text = collapse_whitespace(item.get("text", ""))
    links = item.get("links", [])

    if links:
        first_link = links[0]["href"]
        if not text or text in {first_link, links[0]["text"], links[0]["text"].strip()}:
            return safe_path_component(f"Ссылка_{normalize_link_for_filename(first_link)}", fallback=f"message-{item['id']}")

    if text:
        return safe_path_component(text[:50], fallback=f"message-{item['id']}")

    return safe_path_component(media_label(item.get("media")), fallback=f"message-{item['id']}")


def copy_asset(relative_path: str, target_dir: Path, message_id: int) -> str:
    source_path = current_export_root() / relative_path
    safe_name = safe_path_component(source_path.name, fallback=f"{message_id}")
    target_name = f"{message_id}_{safe_name}"
    target_path = target_dir / target_name
    ensure_inside(target_dir, target_path)
    shutil.copy2(source_path, target_path)
    return target_name


def render_segments_for_markdown(segments: list[dict[str, str]]) -> str:
    parts: list[str] = []
    for segment in segments:
        segment_type = segment.get("type", "plain")
        text = segment.get("text", "")
        if not text:
            continue
        if segment_type == "link":
            href = segment.get("href", text)
            parts.append(f"[{text}]({href})")
        elif segment_type == "bold":
            parts.append(f"**{text}**")
        elif segment_type == "italic":
            parts.append(f"*{text}*")
        elif segment_type == "code":
            parts.append(f"`{text}`")
        else:
            parts.append(text)
    return "".join(parts).strip()


def render_note(item: dict[str, Any], tags: list[str], media_files: dict[str, str], comment: str) -> str:
    lines: list[str] = [
        "---",
        "tags:",
    ]
    for tag in tags:
        lines.append(f"  - {json.dumps(tag, ensure_ascii=False)}")
    if item.get("media"):
        lines.append(f"media_kind: {item['media']['kind']}")
    lines.extend(["---", "", f"#{item['id']} | | {item['date_iso'].replace('T', ' ')}", ""])

    author_line = f"**Автор:** {item['author']}"
    if item["source"]:
        author_line += f" | | {item['source']}"
    lines.append(author_line)
    lines.append("")

    if comment:
        lines.append("## Комментарий")
        lines.append("")
        lines.append(comment)
        lines.append("")

    if item["text"]:
        lines.append("## Содержимое")
        lines.append("")
        lines.append(render_segments_for_markdown(item["segments"]) or item["text"])
        lines.append("")

    if item["links"]:
        lines.append("## Ссылки")
        lines.append("")
        for link in item["links"]:
            lines.append(f"- [{link['text']}]({link['href']})")
        lines.append("")

    media = item.get("media")
    if media:
        lines.append("## Медиа")
        lines.append("")
        lines.append(f"Тип: `{media['kind']}`")
        lines.append("")
        if media["missing"]:
            lines.append("Файл отсутствует в экспорте Telegram. В заметке сохранена только карточка сообщения.")
            lines.append("")
        else:
            main_name = media_files.get("main")
            preview_name = media_files.get("preview")
            if main_name:
                lines.append(f"[Открыть файл](./{ATTACHMENTS_DIR_NAME}/{main_name})")
                lines.append("")
            if media["kind"] in {"image", "sticker"} and main_name:
                lines.append(f"![](./{ATTACHMENTS_DIR_NAME}/{main_name})")
                lines.append("")
            elif media["kind"] == "video" and main_name:
                if preview_name:
                    lines.append(f"![](./{ATTACHMENTS_DIR_NAME}/{preview_name})")
                    lines.append("")
                lines.append(f'<video controls preload="metadata" src="./{ATTACHMENTS_DIR_NAME}/{main_name}"></video>')
                lines.append("")
            elif media["kind"] == "audio" and main_name:
                lines.append(f'<audio controls preload="metadata" src="./{ATTACHMENTS_DIR_NAME}/{main_name}"></audio>')
                lines.append("")
            elif preview_name:
                lines.append(f"![](./{ATTACHMENTS_DIR_NAME}/{preview_name})")
                lines.append("")

    return "\n".join(lines).strip() + "\n"


def rebuild_tag_exports(state: dict[str, Any], tags_to_refresh: set[str] | None = None) -> None:
    decisions = state.get("decisions", {})
    saved_entries: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for raw_id, decision in decisions.items():
        if decision.get("action") != "save":
            continue
        item = ITEMS_BY_ID.get(int(raw_id))
        if item is None:
            continue
        saved_entries.append((item, decision))
    output_root = current_obsidian_root()
    if output_root.exists():
        shutil.rmtree(output_root)
    ensure_dir(output_root)

    for item, decision in sorted(saved_entries, key=lambda pair: (pair[0]["date_iso"], pair[0]["id"]), reverse=True):
        tags = decision.get("tags", [])
        if not tags:
            continue

        main_tag = tags[0]
        tag_folder = output_root / slugify_tag(main_tag)
        attachments_dir = tag_folder / ATTACHMENTS_DIR_NAME
        ensure_dir(tag_folder)
        ensure_dir(attachments_dir)

        media = item.get("media")
        media_files: dict[str, str] = {}
        if media and not media.get("missing"):
            source_path = media.get("source_path")
            preview_path = media.get("preview_path")
            if source_path:
                media_files["main"] = copy_asset(source_path, attachments_dir, item["id"])
            if preview_path and preview_path != source_path:
                media_files["preview"] = copy_asset(preview_path, attachments_dir, item["id"])

        note_file_name = f"{make_note_stem(item)}.md"
        note_path = tag_folder / note_file_name
        note_content = render_note(item, tags, media_files, str(decision.get("comment", "")).strip())
        atomic_write_text(note_path, note_content)


def upsert_decision(payload: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    message_id = int(payload["message_id"])
    item = ITEMS_BY_ID.get(message_id)
    if item is None:
        raise KeyError(f"Unknown message id {message_id}")

    action = str(payload.get("action", "")).strip().lower()
    if action not in {"skip", "delete", "save", "clear"}:
        raise ValueError("Action must be one of: skip, delete, save, clear")

    existing = state["decisions"].get(str(message_id), {})
    changed_tags: set[str] = set(slugify_tag(tag) for tag in existing.get("tags", []))

    if action == "clear":
        state["decisions"].pop(str(message_id), None)
        save_state(state)
        rebuild_delete_candidates(state)
        if changed_tags:
            rebuild_tag_exports(state, changed_tags)
        return {"action": "clear", "updated_at": now_iso(), "tags": []}

    decision = {
        "action": action,
        "updated_at": now_iso(),
        "tags": [],
        "comment": "",
    }

    if action == "save":
        raw_tags = payload.get("tags", [])
        if not isinstance(raw_tags, list):
            raise ValueError("Tags payload must be a list")
        normalized_tags: set[str] = set()
        ordered_tags: list[str] = []
        for raw_tag in raw_tags:
            if not isinstance(raw_tag, str):
                continue
            cleaned_value = raw_tag.strip()
            cleaned_key = normalize_tag(cleaned_value)
            if cleaned_key and cleaned_key not in normalized_tags:
                normalized_tags.add(cleaned_key)
                ordered_tags.append(cleaned_value)
        if not ordered_tags:
            raise ValueError("Save action requires at least one tag")
        decision["tags"] = ordered_tags
        known_custom_tags = {normalize_tag(tag): tag for tag in state.get("custom_tags", []) if isinstance(tag, str)}
        for tag in ordered_tags:
            normalized = normalize_tag(tag)
            if not normalized or normalized in known_custom_tags:
                continue
            state["custom_tags"].append(tag)
            known_custom_tags[normalized] = tag
        comment = payload.get("comment", "")
        if comment is None:
            comment = ""
        if not isinstance(comment, str):
            raise ValueError("Comment payload must be a string")
        decision["comment"] = comment.strip()

    changed_tags.update(slugify_tag(tag) for tag in decision.get("tags", []))
    state["decisions"][str(message_id)] = decision
    save_state(state)
    rebuild_delete_candidates(state)
    if changed_tags:
        rebuild_tag_exports(state, changed_tags)
    return serialize_decision(message_id, decision)


class FavTinderHandler(BaseHTTPRequestHandler):
    server_version = "FavTinder/0.1"

    def _write_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _write_file(self, path: Path) -> None:
        content_type, _ = mimetypes.guess_type(path.name)
        content = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _send_not_found(self) -> None:
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        route = parsed.path

        if route == "/api/bootstrap":
            settings = load_settings()
            initialize_output_root(settings)
            export_ready = try_initialize_export_from_settings(settings)
            state = load_state() if export_ready else {"decisions": {}, "custom_tags": []}
            decisions = {
                str(message_id): serialize_decision(int(message_id), decision)
                for message_id, decision in state.get("decisions", {}).items()
            }
            saved_items = [
                serialize_decision(int(message_id), decision)
                for message_id, decision in state.get("decisions", {}).items()
                if decision.get("action") == "save"
            ]
            saved_items.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
            self._write_json(
                {
                    "items": ITEMS,
                    "decisions": decisions,
                    "tags": all_known_tags(state, settings),
                    "saved_items": saved_items[:120],
                    "settings": settings_payload(settings),
                    "stats": {
                        "total": len(ITEMS),
                        "resolved": len(decisions),
                        "saved": sum(1 for decision in decisions.values() if decision.get("action") == "save"),
                        "skipped": sum(1 for decision in decisions.values() if decision.get("action") == "skip"),
                        "deleted": sum(1 for decision in decisions.values() if decision.get("action") == "delete"),
                    },
                }
            )
            return

        if route.startswith("/source/"):
            relative = unquote(route.removeprefix("/source/")).lstrip("/")
            export_root = current_export_root()
            source_path = (export_root / relative).resolve()
            ensure_inside(export_root, source_path)
            if not source_path.exists() or not source_path.is_file():
                self._send_not_found()
                return
            self._write_file(source_path)
            return

        static_target = route.lstrip("/") or "index.html"
        candidate = STATIC_ROOT / static_target
        if candidate.exists() and candidate.is_file():
            self._write_file(candidate)
            return

        self._send_not_found()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/settings/export/pick":
            try:
                settings = load_settings()
                current_path = str(settings.get("export_json_path", "")).strip()
                if current_path:
                    initial_dir = Path(current_path).expanduser().resolve().parent
                elif EXPORT_ROOT is not None:
                    initial_dir = current_export_root()
                else:
                    initial_dir = WORKSPACE_ROOT
                selected = choose_export_json(initial_dir=initial_dir)
                if selected is None:
                    self._write_json({"ok": False, "cancelled": True}, status=HTTPStatus.BAD_REQUEST)
                    return
                validated = validate_export_json_path(selected)
                settings["export_json_path"] = str(validated)
                save_settings(settings)
                initialize_export(validated)
                self._write_json({"ok": True, "settings": settings_payload(settings)})
            except Exception as error:  # pragma: no cover
                self._write_json({"ok": False, "error": str(error)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if parsed.path == "/api/settings/output/pick":
            try:
                settings = load_settings()
                initialize_output_root(settings)
                selected = choose_directory(current_obsidian_root(), "Выберите папку для markdown и вложений")
                if selected is None:
                    self._write_json({"ok": False, "cancelled": True}, status=HTTPStatus.BAD_REQUEST)
                    return
                settings["obsidian_output_path"] = str(selected)
                initialize_output_root(settings)
                save_settings(settings)
                rebuild_tag_exports(load_state())
                self._write_json({"ok": True, "settings": settings_payload(settings)})
            except Exception as error:  # pragma: no cover
                self._write_json({"ok": False, "error": str(error)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if parsed.path == "/api/settings/open":
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
                kind = str(payload.get("kind", "")).strip().lower()
                if kind == "export":
                    target = current_export_root()
                elif kind == "output":
                    settings = load_settings()
                    initialize_output_root(settings)
                    target = current_obsidian_root()
                    ensure_dir(target)
                else:
                    raise ValueError("Unknown folder kind")
                open_in_file_manager(target)
                self._write_json({"ok": True})
            except (ValueError, FileNotFoundError) as error:
                self._write_json({"ok": False, "error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as error:  # pragma: no cover
                self._write_json({"ok": False, "error": str(error)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if parsed.path == "/api/settings":
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
                settings = load_settings()
                if "pro_mode" in payload:
                    settings["pro_mode"] = bool(payload.get("pro_mode"))
                if "default_tags" in payload:
                    settings["default_tags"] = normalize_settings_tags(payload.get("default_tags"))
                if "obsidian_output_path" in payload:
                    settings["obsidian_output_path"] = str(Path(str(payload.get("obsidian_output_path", "")).strip()).expanduser().resolve())
                initialize_output_root(settings)
                save_settings(settings)
                self._write_json({"ok": True, "settings": settings_payload(settings), "tags": all_known_tags(load_state(), settings)})
            except Exception as error:  # pragma: no cover
                self._write_json({"ok": False, "error": str(error)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if parsed.path != "/api/decision":
            self._send_not_found()
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            state = load_state()
            decision = upsert_decision(payload, state)
            self._write_json({"ok": True, "decision": decision})
        except (ValueError, KeyError) as error:
            self._write_json({"ok": False, "error": str(error)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as error:  # pragma: no cover
            self._write_json({"ok": False, "error": str(error)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)


def parse_args(argv: list[str]) -> tuple[int, bool]:
    port = 8421
    open_browser = True
    for index, argument in enumerate(argv):
        if argument == "--no-browser":
            open_browser = False
        if argument == "--port" and index + 1 < len(argv):
            port = int(argv[index + 1])
    return port, open_browser


def show_error_dialog(title: str, message: str) -> None:
    try:
        import tkinter
        from tkinter import messagebox

        root = tkinter.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        messagebox.showerror(title, message, parent=root)
        root.destroy()
    except Exception:
        print(f"{title}: {message}", file=sys.stderr)


def main(argv: list[str]) -> int:
    try:
        port, open_browser = parse_args(argv)
        ensure_dir(DATA_ROOT)
        settings = load_settings()
        initialize_output_root(settings)
        ensure_dir(current_obsidian_root())
        if try_initialize_export_from_settings(settings):
            state = load_state()
            rebuild_delete_candidates(state)

        server = ThreadingHTTPServer(("127.0.0.1", port), FavTinderHandler)
        url = f"http://127.0.0.1:{port}"
        print(f"Разгребатель Телеги is running at {url}")
        print(f"Export source: {current_export_root() if EXPORT_ROOT is not None else 'not selected'}")
        print(f"Obsidian export: {current_obsidian_root()}")

        if open_browser:
            webbrowser.open(url)

        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
    except OSError as error:
        show_error_dialog(
            "Разгребатель Телеги",
            f"Не удалось запустить локальный сервер.\n\nДетали: {error}",
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
