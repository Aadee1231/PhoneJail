const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Some pods (e.g. react-native-svg's RNSVGFilters resource bundle) declare a
 * deployment target below the modern Xcode minimum (15.0), which fails
 * device builds. RN's react_native_post_install only normalizes pod library
 * targets, not resource-bundle targets, so we inject a post_install pass
 * that raises every Pods project target to the app deployment target.
 */
const MARKER = 'withPodDeploymentTarget';
const INJECT = `
    # ${MARKER}: raise stale pod targets to the app deployment target
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |bc|
        app_target = podfile_properties['ios.deploymentTarget'] || '15.1'
        if bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < app_target.to_f
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = app_target
        end
      end
    end
`;

module.exports = function withPodDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        const contents = fs.readFileSync(podfilePath, 'utf8');
        if (!contents.includes(MARKER)) {
          const needle = 'post_install do |installer|';
          if (!contents.includes(needle)) {
            throw new Error(`${MARKER}: could not find post_install block in Podfile`);
          }
          fs.writeFileSync(podfilePath, contents.replace(needle, needle + INJECT));
        }
      }
      return cfg;
    },
  ]);
};
