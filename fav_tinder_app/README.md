# Fav Tinder

Локальный инструмент для разбора экспорта Telegram Saved Messages в браузере.

## Что умеет

- `←` пропустить сообщение
- `→` пометить как удалённое
- `↓` сохранить в теги `мысли`, `дневник`, `сон`, `ссылка` и любые свои
- экспортировать сохранённые элементы в markdown-структуру для Obsidian

## Запуск

```powershell
cd /path/to/telegram-cleaner
.\start_fav_tinder.ps1
```

Или:

```powershell
python .\fav_tinder_app\server.py
```

Служебные данные появятся тут:

- `fav_tinder_app\data\decisions.json`
- `fav_tinder_app\data\obsidian_export\`
