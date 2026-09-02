# BOCO-FI — Bottle Collection & Wi-Fi rewards

A reverse vending machine system for the Philippines. Users insert plastic bottles or aluminium cans and receive **coins**, a **Wi-Fi voucher**, or **points saved to their account**. This repository contains the whole system as static HTML/CSS/JS — no build step, no backend required to run the demo.

| Surface | Path | Who uses it |
|---|---|---|
| **Machine kiosk** | `kiosk/` | The touchscreen on the vending machine. Implements all 25 screens of the wireframe site map (1.1 Idle → 7.2 Session ended). |
| **User app** | `app/` | Recyclers. Register/log in, link to a machine by code, see balance & history, claim saved credits as Wi-Fi vouchers. Mobile-first, PWA manifest. |
| **Owner / admin** | `admin/` | The machine owner. Dashboard, machines (sensor state + controls), owner alerts, transactions (CSV export), users, vouchers, reward settings. |
| Launcher | `index.html` | Links to the three surfaces + demo instructions. |

## Run it

Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .          # or: python3 -m http.server 8080
```

Serving over http(s) also enables the user app's service worker.

**Demo accounts**

- User app: `maria@example.com` / PIN `1234` (also `jose@example.com` / `1234`)
- Admin: `admin` / `admin123`

**Full loop:** open the kiosk and the user app in two tabs. On the kiosk tap *Log in*; in the app go to *Link* and type the 4-letter code shown on the kiosk. The kiosk continues automatically. Use the kiosk's sensor simulator (buttons on the *Insert* screen or the ☰ service menu) to "insert" items, then pick a reward. Everything shows up live in the admin dashboard.

## How it maps to the design board

- **Flowchart** → `kiosk/kiosk.js` state machine. Every decision diamond is implemented: log in vs guest, reward availability (both / no coins / no Wi-Fi / none → owner notified), valid item?, bin at 80% → crusher, add more vs claim, logged in → extra *Save to account* option, coins / Wi-Fi / save branches, guest keeps physical reward only.
- **Wireframe site map** → one template per screen id (`SCREENS['4.3']` etc.), with the section colours 1.0–7.0 used as the accent for each phase and the copy taken from the wireframes ("Item accepted +₱0.25 · Session total", "Disappears in 30 seconds", "+140 pts · New balance", …).
- **Storyboard** → kiosk chrome: ☰ · logo · 🔔 · avatar header, leafy green/blue background, big round *Recycle Today — Tap to Start* button, 7-step progress bar in the footer.
- **Reward table** (Sakto ₱0.05, 500 ml ₱0.10, can ₱0.20–0.30) → editable in *Admin → Settings*. Points = ₱ × 100 (so ₱1.40 → 140 pts as on the board); Wi-Fi = 10 min per ₱1.

## Architecture

```
assets/js/db.js      shared data layer (localStorage + cross-tab sync)   ← swap for an API
assets/css/base.css  design tokens & primitives
kiosk/               index.html · kiosk.css · kiosk.js
app/                 index.html · app.css · app.js · manifest.json · sw.js
admin/               index.html · admin.css · admin.js
```

`db.js` exposes `BocofiDB` with namespaces `users`, `machines`, `transactions`, `vouchers`, `alerts`, `links` (QR-login handshake), `config`, `admin`, plus `on(fn)` for change events. All three surfaces read and write through it only, so replacing localStorage with HTTP calls is a single-file change.

### Data model (summary)

- `machines[]` — `id, name, location, status, binLevel, coinHopper, wifiSignal, coinsEnabled, wifiEnabled, totalBottles, totalPaidOut, session`
- `users[]` — `id, name, email, pin, points, bottles`
- `transactions[]` — `id, machineId, userId|null, items[{type,label,value}], total, reward: coins|wifi|save|claim, points?, minutes?, voucherCode?`
- `vouchers[]` — `code, minutes, userId, machineId, expiresAt, redeemed`
- `alerts[]` — owner notifications raised by machines (`bin`, `coins`, `wifi`, `rewards`)
- `links{}` — kiosk login codes: `{ machineId, status: pending|linked, userId }`
- `config` — reward table, rates, thresholds, admin credentials

## What is simulated

This is a front-end prototype. The following are stand-ins for real hardware/services and are clearly labelled in the UI:

- **Item sensor** — buttons on the kiosk insert screen / service menu instead of a material sensor.
- **Bin fill, coin hopper, Wi-Fi signal** — sliders in the kiosk service menu and in *Admin → Machines*.
- **QR code** — the kiosk draws a pseudo-QR and shows a 4-letter code; the app links by typing the code (camera scanning needs a QR library or native wrapper).
- **Wi-Fi voucher** — a code is generated and stored; nothing talks to a captive portal.
- **Authentication** — plain PIN/password in localStorage. Use a real auth provider before any deployment.

## Next steps for production

1. Replace `db.js` persistence with a REST/WebSocket API (Supabase, Firebase, or a small Node service) and move validation server-side.
2. Kiosk ↔ hardware bridge (serial/GPIO) for the sensor, crusher, coin dispenser and fill-level sensor.
3. Captive-portal integration for vouchers (e.g. MikroTik hotspot / RADIUS).
4. Real QR scanning in the app (`@zxing/browser` or a native shell).
5. Hash passwords/PINs; add rate limiting and audit logs for admin actions.
