# Fav Tinder

Локальный browser-first инструмент для разбора экспорта Telegram Saved Messages.

Репозиторий: `https://github.com/y110692/telegram-cleaner`

## Что умеет

- выбрать папку Telegram export целиком, а не только `result.json`
- локально показывать текст, картинки, аудио, видео и файлы прямо в браузере
- `←` пропустить сообщение
- `→` сохранить в теги и комментарий
- `Pro` режим для пометок на удаление и сбора `message_id`
- экспортировать сохранённые элементы в markdown-структуру для Obsidian в выбранную пользователем папку

## Запуск

```powershell
cd /path/to/telegram-cleaner
.\start_fav_tinder.ps1
```

Или:

```powershell
python .\server.py
```

Что хранится локально:

- решения и теги: `localStorage` браузера
- markdown-экспорт: подпапка `telegram-cleaner-export` внутри выбранной папки

Важно:

- `result.json` и медиа не отправляются серверу, если вы запускаете текущую версию как локальную статику
- для записи markdown в папку нужен Chromium-браузер с поддержкой File System Access API
