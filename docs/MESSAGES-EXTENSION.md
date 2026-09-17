# Mushy for iMessage — the Messages extension

The GamePigeon-style bubble. Linq can send an `imessage_app` card that names a
Messages extension by bundle id; iMessage renders the card for everyone
(image + caption, fallback text without the app) and hands the card's URL to
the extension when someone who has the app taps it. Our extension is a thin
WKWebView that shows the same `/pay/<bet>` and `/sign/<chat>` sheets the
website serves. No money moves through the app; links out to Venmo / Cash App
/ PayPal leave the bubble and open those apps.

## Layout

```
ios/
  project.yml                      xcodegen spec: app "Mushy" + extension "MushyMessages"
  Mushy/                           container app (App Review needs a real app, not a shell)
  MushyMessages/                   MSMessagesAppViewController + WKWebView
```

Bundle ids: `com.mushy.app` (app), `com.mushy.app.MushyMessages` (extension).
The extension only loads URLs on the site's host (`MUSHY_SITE_URL` in project.yml).

## Build

```bash
brew install xcodegen            # already installed on this Mac
cd ios && DEVELOPMENT_TEAM=<team id> xcodegen generate
open Mushy.xcodeproj             # or: xcodebuild -scheme Mushy -sdk iphonesimulator build
```

Run the Mushy scheme on a simulator; iMessage on the simulator lists the
extension under the app drawer. Sending real cards needs the extension on a
device that receives the Linq message.

## Wire it to the bot

1. Get the extension onto TestFlight (below). Everyone in the test group installs it.
2. Set `LINQ_IMESSAGE_APP_BUNDLE_ID=com.mushy.app.MushyMessages` on Vercel.
   From then on the sign and pay links go out as app cards; without it they are rich link previews.

## TestFlight

`scripts/testflight.sh` archives and uploads with automatic signing. Needs:
- an Apple Developer team id (`DEVELOPMENT_TEAM`) with an App ID for both bundle ids,
- the app record in App Store Connect (asc-mcp can read TestFlight state; the record itself is created in the ASC web UI),
- an App Store Connect API key or Xcode signed in to the account.

```bash
DEVELOPMENT_TEAM=ABCDE12345 ./scripts/testflight.sh
```

## App Review notes (write these into the review notes field)

- The app does not accept, hold, or transfer money. It shows a scorekeeping
  sheet and links out to third-party P2P apps the user already has.
- No real-money gambling is operated by the app (Guideline 5.3.4 is about
  apps that run real-money games; this app runs none). Stakes are points; any
  money between friends is exchanged outside the app, peer to peer.
- Age 17+ rating; the terms require 18+.
- Provide a demo chat id so reviewers can open `/sign/<chat>` and `/pay/<bet>`.

## Not in this scaffold

App icon set, screenshots, privacy nutrition labels, and the ASC record.
