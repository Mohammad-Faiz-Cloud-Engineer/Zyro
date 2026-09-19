---
title: Zyro
emoji: 🚀
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
app_port: 7860
---
# Zyro - SMS Bomber

A clean, fast SMS bomber with a minimal web UI.

## What it does

Enter a phone number, pick how many messages to send, optionally write a custom message, and hit start. That's it.

## Features

- **Editable country code** - defaults to +91, change it for international numbers
- **Custom message** - type whatever you want (up to 2000 chars), or pick a preset. Leave it blank and it sends a default
- **Bombing count slider** - 1 to 1000 by default (the live API `max_count` can raise or lower the cap), with quick-pick chips for common values
- **Live terminal log** - shows exactly what's happening in real time
- **Server health check** - auto-pings the backend every 25s, shows green/red status in the navbar
- **Mission history** - saves past runs to localStorage, exportable as JSON

## Setup

No build step. No heavy dependencies. Four core files:

```text
index.html
style.css
script.js
server.js
```

**For Local Development:** 
Because of CORS restrictions on the API, run the included local proxy server:
`node server.js`
Then open `http://localhost:7860` in your browser (or the port in `PORT`).

## Tech

Vanilla HTML/CSS/JS. No frameworks. Fonts are Plus Jakarta Sans and JetBrains Mono from Google Fonts.

## Note

For educational purposes only. Don't be stupid with it.
