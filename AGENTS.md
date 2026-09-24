# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## PhoneJail verification

- The installed app remains Expo SDK 54 / React Native 0.81.5 / Viro 2.56.0; do not upgrade it as part of visual changes.
- Run `npx tsc --noEmit`, `npx expo-doctor`, `node scripts/test-session.cjs`, and `node scripts/test-ar.cjs`.
- Check packaged native assets with `npx expo export --platform ios --platform android --output-dir .expo/verification-export`.
- iOS device build: `xcodebuild -quiet -workspace ios/PhoneJail.xcworkspace -scheme PhoneJail -configuration Debug -sdk iphoneos -destination 'generic/platform=iOS' build`.
- The bundled ViroKit emits an existing deployment-target warning: its iOS binary requires 17.6 while the app target is 15.1. Do not silently change native targets; older-device support is not verified.
- Regenerate/validate layered OBJ assets and the local alarm with `python3 scripts/generate-jail-assets.py`; `--preview` produces an offline geometry render, not a Viro/device screenshot.
- Metro must restart after changes to `metro.config.js` (OBJ asset support). Fast Refresh alone does not reload resolver configuration.
- Viro 2.56.0's `ViroQuad.uvCoordinates` typing incorrectly expects nested tuples; its native `VRTQuad.h` and documented runtime API expect flat `[u0, v0, u1, v1]`.
- AR and model-load callbacks must notify parent React state from events/effects, never from state updater functions. VM tests do not replace physical AR/gesture/audio verification.
