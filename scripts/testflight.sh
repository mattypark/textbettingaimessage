#!/usr/bin/env bash
# Archive the Mushy iOS app (container + Messages extension) and upload to TestFlight.
#   DEVELOPMENT_TEAM=ABCDE12345 ./scripts/testflight.sh
# Add --upload-only to re-upload the last archive without rebuilding.
set -euo pipefail

cd "$(dirname "$0")/../ios"
: "${DEVELOPMENT_TEAM:?set DEVELOPMENT_TEAM to your Apple team id}"

ARCHIVE="build/Mushy.xcarchive"
EXPORT="build/export"

if [[ "${1:-}" != "--upload-only" ]]; then
  xcodegen generate
  xcodebuild -scheme Mushy -configuration Release -destination "generic/platform=iOS" \
    -archivePath "$ARCHIVE" -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" archive
fi

cat > build/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$DEVELOPMENT_TEAM</string>
  <key>signingStyle</key><string>automatic</string>
</dict></plist>
PLIST

xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT" \
  -exportOptionsPlist build/ExportOptions.plist -allowProvisioningUpdates
echo "uploaded — check App Store Connect → TestFlight for processing"
