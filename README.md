# FlowDesk Full — полная версия на живых данных Jira

Все 4 вкладки (Доска, Метрики, Нагрузка, Спринт) на живых данных DMS.
Режим просмотра: данные читаются из сервера каждые 2 минуты. Редактирование
локальное (двигать задачи — в самой Jira), т.к. сервер работает на чтение.

Адрес сервера задан в src/data.js (const API). Если сервер другой — поменяй там.

## Локально
npm install
npm run dev   → http://localhost:5173

## Деплой на Vercel (отдельный проект, рядом с простым дашбордом)
1. Создай на GitHub новый репозиторий flowdesk-full (Public)
2. В этой папке:
   git init
   git add .
   git commit -m "flowdesk full"
   git branch -M main
   git remote add origin https://github.com/ТВОЙ-ЛОГИН/flowdesk-full.git
   git push -u origin main
3. vercel.com → Add New → Project → выбери flowdesk-full → Deploy
4. Получишь отдельный адрес. Простой дашборд остаётся жить на своём.
