import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DebugSnapshot, JailState } from '../types';
import {
  MOTION_RECOVER_MPS2,
  MOTION_TRIGGER_MPS2,
  TILT_RECOVER_DEGREES,
  TILT_TRIGGER_DEGREES,
} from '../constants';

interface Props {
  state: JailState;
  debug: DebugSnapshot;
}

export function DebugPanel({ state, debug }: Props) {
  const [open, setOpen] = useState(false);

  if (!__DEV__) return null;

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide diagnostics' : 'Show diagnostics'}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.toggleText}>{open ? 'Hide diagnostics' : 'Diagnostics'}</Text>
      </Pressable>
      {open && (
        <View style={styles.panel}>
          <Text style={styles.text}>state: {state}</Text>
          <Text style={styles.text}>
            tilt: {debug.tiltDeg.toFixed(1)}° (smoothed {debug.tiltSmoothedDeg.toFixed(1)}°) — trigger &gt;{' '}
            {TILT_TRIGGER_DEGREES}° / recover &lt; {TILT_RECOVER_DEGREES}°
          </Text>
          <Text style={styles.text}>
            motion: {debug.motionMag.toFixed(2)} (smoothed {debug.motionSmoothedMps2.toFixed(2)}) m/s² —
            trigger &gt; {MOTION_TRIGGER_MPS2} / recover &lt; {MOTION_RECOVER_MPS2}
          </Text>
          <Text style={styles.text}>
            gravity: x={debug.gravity.x.toFixed(2)} y={debug.gravity.y.toFixed(2)} z={debug.gravity.z.toFixed(2)}
          </Text>
          <Text style={styles.text}>
            linear: x={debug.linearAccel.x.toFixed(2)} y={debug.linearAccel.y.toFixed(2)} z={debug.linearAccel.z.toFixed(2)}
          </Text>
          <Text style={styles.text}>triggerHold: {debug.triggerHoldMs}ms</Text>
          <Text style={styles.text}>recoverHold: {debug.recoverHoldMs}ms</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    maxWidth: 360,
    marginTop: 12,
  },
  toggle: {
    minHeight: 44,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  togglePressed: {
    backgroundColor: 'rgba(153,187,223,0.08)',
  },
  toggleText: {
    color: '#8EA3BA',
    fontSize: 11,
    fontWeight: '500',
  },
  panel: {
    backgroundColor: '#0D1828',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#25364B',
  },
  text: {
    color: '#B3C6DB',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    marginBottom: 5,
    lineHeight: 18,
  },
});
