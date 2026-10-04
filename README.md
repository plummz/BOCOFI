# BOCO-FI

**Bottle Collection with Wi-Fi rewards**

BOCO-FI is a reverse vending machine project. Users put plastic bottles or aluminum cans in the machine and get a reward: coins, a Wi-Fi voucher, or points saved to their account.

Website: https://plummz.github.io/BOCOFI/

## Parts of the system

| Folder | Description |
|---|---|
| `kiosk/` | The touch screen on the machine. Screens follow our Figma flow (1.0 Display Page to 7.1 Resetting Machine). |
| `app/` | The mobile app for users. Log in, see points, coins and Wi-Fi time, link to a machine, convert points and get cash-out codes. |
| `admin/` | For the machine owner. Shows the machines, alerts, transactions, users, vouchers and settings. |
| `assets/` | Logo, shared CSS, and `data.js` which has the sample data and helper functions. |

## How to run

Just open `index.html` in a browser. No installation needed.

The data is saved in the browser's localStorage, so the kiosk, app and admin can share the same data. Open them in tabs on the same browser.

## Test accounts

- User app: `juandelacruz@gmail.com`, PIN `1234`
- Admin: `admin` / `admin123`

## How to test the whole process

1. Open the kiosk and the app in two tabs.
2. Log in to the app.
3. On the kiosk, tap **Recycle Today**, then **Start**, then **Log in**. A 4-letter code will show.
4. In the app, go to **Recycle** and type the code, then tap **Link my account**.
5. On the kiosk, click the item buttons to insert bottles or cans. (We don't have the sensor yet, so the buttons act like the sensor.)
6. Tap **Claim** and choose COINS, WI-FI or SAVE.
7. Check the app and the admin page to see the update.

The ☰ menu on the kiosk lets you change the bin level, coin level and Wi-Fi signal to test the other screens.

## Built with

- HTML
- CSS
- JavaScript
- localStorage (for now, will be changed to a database)

## Design

Colors and logo are from our Figma design:
- Green `#3F5523`
- Blue `#3FADED`
