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

  return (
    <View style={styles.wrapper}>
      <Pressable onPress={() => setOpen(!open)} style={styles.toggle}>
        <Text style={styles.toggleText}>{open ? '▼' : '▶'} Developer Debug</Text>
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
    marginTop: 24,
  },
  toggle: {
    paddingVertical: 10,
  },
  toggleText: {
    color: '#5a5a6a',
    fontSize: 13,
    fontWeight: '700',
  },
  panel: {
    backgroundColor: '#101018',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e2c',
  },
  text: {
    color: '#6a6a7a',
    fontSize: 12,
    fontFamily: 'Courier',
    marginBottom: 3,
  },
});
