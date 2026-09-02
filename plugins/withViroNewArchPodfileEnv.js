const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * ViroReact's Podfile check requires ENV['RCT_NEW_ARCH_ENABLED'] == '1' at
 * `pod install` time. New Architecture IS enabled in this project (Expo SDK
 * 54 + "newArchEnabled": true), but Expo's generated Podfile doesn't export
 * that env var, so `pod install` would fail. This plugin prepends the env
 * assignment to the generated Podfile so builds work without any manual
 * environment setup.
 */
const ENV_LINE = 'ENV["RCT_NEW_ARCH_ENABLED"] = "1"';

module.exports = function withViroNewArchPodfileEnv(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        const contents = fs.readFileSync(podfilePath, 'utf8');
        if (!contents.includes(ENV_LINE)) {
          fs.writeFileSync(podfilePath, `${ENV_LINE}\n${contents}`);
        }
      }
      return cfg;
    },
  ]);
};
