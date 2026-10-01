# BOCO-FI: Bottle Collection & Wi-Fi rewards

A reverse vending machine system for the Philippines. Users insert plastic bottles or aluminium cans and get **coins**, a **Wi-Fi voucher**, or **points saved to their account**. The whole system is plain HTML/CSS/JS. There's no build step and no backend needed to run the demo.

| Part | Path | Used by |
|---|---|---|
| **Machine kiosk** | `kiosk/` | The touchscreen on the vending machine. Has all 27 screens of the Figma kiosk flow, numbered the same way (1.0 Display Page to 7.1 Resetting Machine), including redeeming app cash-out codes at the coin tray. |
| **User app** | `app/` | Recyclers. Dashboard with three balances (points, coin balance in ₱, Wi-Fi time left), side menu and bottom tab bar, wallet (convert points to coins or Wi-Fi, cash-out codes for the kiosk), Wi-Fi countdown, top-ups and kiosk vouchers, reward bundles, machine finder, history, notifications, leaderboard and tiers, profile/settings, help. Mobile-first PWA. |
| **Owner / admin** | `admin/` | The machine owner. Dashboard, machines (sensor state and controls), alerts, all transactions (CSV export), users, Wi-Fi vouchers, cash-out codes and reward settings. |
| Launcher | `index.html` | Links to the three parts plus demo instructions. |

## Running it

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .          # or: python3 -m http.server 8080
```

The user app's service worker only works when served over http(s).

**Demo accounts**

- User app: `maria@example.com` / PIN `1234` (also `jose@example.com` / `1234`)
- Admin: `admin` / `admin123`

**Trying the full flow:** open the kiosk and the user app in two tabs. Tap *Log in* on the kiosk, then go to *Link* in the app and type the 4-letter code shown on the kiosk. The kiosk continues on its own. Use the sensor simulator (buttons on the *Insert* screen or in the ☰ service menu) to "insert" items, then pick a reward. For cash-out, make a code under *Wallet → Cash out coins*, enter it on the kiosk reward screen and collect the simulated payout. Everything shows up in the admin dashboard right away, including the Cash-outs page.

## Design

Colours, logo, background and screen numbers come from our Figma high-fidelity file (STUDENT-TYPE-FIGDESIGN): BOCOFI green `#3F5523`, BOCOFI blue `#3FADED`, white background, and the BOCOFI logo exported from Figma (`assets/img/logo.svg`). All values are in `assets/tokens.css`. The kiosk also keeps a few things that aren't in the Figma screens, like the Guest option and the live session totals.

### Design board to code

- **Flowchart**: the state machine in `kiosk/kiosk.js`. Each decision in the flowchart is there: log in or guest, reward availability (both / no coins / no Wi-Fi / none, which notifies the owner), valid item, bin at 80% runs the crusher, add more or claim, *Save to account* for logged-in users, the coins / Wi-Fi / save branches, and guests only getting the physical reward.
- **Wireframe site map**: one template per screen id (`SCREENS['4.2']` etc.), numbered and titled like the Figma frames (1.0 to 7.1), with the text taken from the wireframes ("Item accepted +₱0.25 · Session total", "Disappears in 30 seconds", "+140 pts · New balance", …).
- **Storyboard**: the kiosk header (☰, logo, 🔔, avatar), white background, the big round *Recycle Today, Tap to Start* button and the 7-step progress bar at the bottom.
- **Reward table** (Sakto ₱0.05, 500 ml ₱0.10, can ₱0.20–0.30): can be changed in *Admin → Settings*. Points = ₱ × 100 (so ₱1.40 = 140 pts, same as the board). Wi-Fi = 10 min per ₱1.

## Project structure

```
assets/js/db.js      shared data layer (localStorage + sync between tabs)
assets/css/base.css  shared styles
assets/tokens.css    colours, spacing, type sizes
kiosk/               index.html · kiosk.css · kiosk.js
app/                 index.html · app.css · app.js · manifest.json · sw.js
admin/               index.html · admin.css · admin.js
```

App routes: `#/home #/wallet #/recycle #/wifi #/redeem #/machines #/history #/notifications #/leaderboard #/profile #/help`

`db.js` provides `BocofiDB` with `users`, `machines`, `transactions`, `vouchers`, `alerts`, `cashouts`, `links` (QR login), `config` and `admin`, plus `on(fn)` for change events. The kiosk, app and admin only read and write data through it, so moving from localStorage to a real API only means changing this one file.

### Data

- `machines[]`: `id, name, location, status, binLevel, coinHopper, wifiSignal, coinsEnabled, wifiEnabled, totalBottles, totalPaidOut, session`
- `users[]`: `id, name, email, pin, points, coins (₱), wifiMinutes, wifiSession{startedAt,minutesAtStart,code}|null, bottles, notifRead[], prefs`
- `transactions[]`: `id, machineId, userId|null, items[{type,label,value}], total, reward: coins|wifi|save|adjust|convert-coins|convert-wifi|cashout|cashout-cancel|wifi-use|voucher-add|bundle, points?, minutes?, voucherCode?, code?, label?, note?`. `adjust` is for point changes made by the owner, `cashout` is for creating or paying out a code (see `note`).
- `vouchers[]`: `code, minutes, userId, machineId, expiresAt, redeemed`
- `cashouts[]`: app cash-out codes used at a kiosk: `code, userId, amount, status: pending|paid|cancelled, expiresAt`
- `alerts[]`: owner notifications from machines (`bin`, `coins`, `wifi`, `rewards`)
- `links{}`: kiosk login codes: `{ machineId, status: pending|linked, userId }`
- `config`: reward table, rates, thresholds, admin login

## Simulated parts

This is a front-end prototype, so some hardware and services are faked (and marked in the UI):

- **Item sensor**: buttons on the kiosk insert screen and service menu.
- **Bin fill, coin hopper, Wi-Fi signal**: sliders in the kiosk service menu and in *Admin → Machines*.
- **QR code**: the kiosk shows a 4-letter code and the app links by typing it in. Camera scanning would need a QR library or a native app.
- **Wi-Fi voucher**: a code is generated and saved, but it isn't connected to a captive portal.
- **Login**: PINs and passwords are stored as plain text in localStorage. This has to be replaced with real authentication before deploying.

## Future work

1. Move data from `db.js` to a real backend (Supabase, Firebase or a small Node server) and do validation on the server.
2. Connect the kiosk to the hardware (serial/GPIO) for the sensor, crusher, coin dispenser and bin level sensor.
3. Connect vouchers to a captive portal (e.g. MikroTik hotspot / RADIUS).
4. Real QR scanning in the app (`@zxing/browser` or a native wrapper).
5. Hash passwords and PINs, add rate limiting and log admin actions.
