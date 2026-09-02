import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

export type JailVisualMode =
  | 'idle'
  | 'placing'
  | 'calibrating'
  | 'active'
  | 'warning'
  | 'jailbreak'
  | 'returned'
  | 'completed'
  | 'failed';

interface Props {
  mode: JailVisualMode;
  size?: number;
}

const MODE_COLOR: Record<JailVisualMode, string> = {
  idle: '#3a4160',
  placing: '#3fd0ff',
  calibrating: '#4d7dff',
  active: '#3b82f6',
  warning: '#ffb020',
  jailbreak: '#ff3b30',
  returned: '#3b82f6',
  completed: '#3b82f6',
  failed: '#ff3b30',
};

/** Locked, closed padlock state (as opposed to "placing"/"idle" open state). */
const LOCKED_MODES = new Set<JailVisualMode>(['calibrating', 'active', 'warning', 'jailbreak', 'failed']);

/** Simple 2D line segment rendered as a rotated hairline View between two points. */
function lineStyle(x1: number, y1: number, x2: number, y2: number, thickness: number): ViewStyle {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return {
    position: 'absolute',
    left: midX - length / 2,
    top: midY - thickness / 2,
    width: length,
    height: thickness,
    transform: [{ rotate: `${angle}rad` }],
  };
}

export function VirtualJail({ mode, size = 240 }: Props) {
  const color = MODE_COLOR[mode];
  const locked = LOCKED_MODES.has(mode);

  // Whole-jail breathing / entrance scale.
  const scale = useRef(new Animated.Value(mode === 'calibrating' ? 0.82 : 1)).current;
  // Horizontal shake (warning / jailbreak instability).
  const shakeX = useRef(new Animated.Value(0)).current;
  // Opacity flicker (warning flicker / jailbreak strobe).
  const flicker = useRef(new Animated.Value(1)).current;
  // Back-face "detaching" offset, used only in jailbreak to look broken apart.
  const breakOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  // Build-up progress for calibration (0 = not assembled, 1 = fully assembled).
  const assemble = useRef(new Animated.Value(mode === 'calibrating' ? 0 : 1)).current;
  // Unlock / open animation for a completed session.
  const unlock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anims: Animated.CompositeAnimation[] = [];
    shakeX.setValue(0);
    breakOffset.setValue({ x: 0, y: 0 });

    if (mode === 'calibrating') {
      scale.setValue(0.82);
      assemble.setValue(0);
      Animated.timing(assemble, { toValue: 1, duration: 900, useNativeDriver: true }).start();
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.03, duration: 900, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      anims.push(pulse);
    } else if (mode === 'idle' || mode === 'placing' || mode === 'active' || mode === 'returned') {
      assemble.setValue(1);
      scale.setValue(mode === 'returned' ? 1.08 : 1);
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.035, duration: 1600, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 1600, useNativeDriver: true }),
        ])
      );
      anims.push(pulse);
      if (mode === 'returned') {
        anims.push(Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }));
      }
    } else if (mode === 'warning') {
      assemble.setValue(1);
      scale.setValue(1);
      const jitter = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeX, { toValue: -5, duration: 70, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 5, duration: 70, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: -3, duration: 70, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 0, duration: 90, useNativeDriver: true }),
        ])
      );
      const flick = Animated.loop(
        Animated.sequence([
          Animated.timing(flicker, { toValue: 0.55, duration: 160, useNativeDriver: true }),
          Animated.timing(flicker, { toValue: 1, duration: 160, useNativeDriver: true }),
        ])
      );
      anims.push(jitter, flick);
    } else if (mode === 'jailbreak' || mode === 'failed') {
      assemble.setValue(1);
      scale.setValue(1.02);
      const rage = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeX, { toValue: -9, duration: 55, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 9, duration: 55, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: -6, duration: 55, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 6, duration: 55, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 0, duration: 55, useNativeDriver: true }),
        ])
      );
      // Slow, restrained strobe (~2.3Hz) — noticeable but not seizure-inducing.
      const strobe = Animated.loop(
        Animated.sequence([
          Animated.timing(flicker, { toValue: 0.4, duration: 220, useNativeDriver: true }),
          Animated.timing(flicker, { toValue: 1, duration: 220, useNativeDriver: true }),
        ])
      );
      // Back face + edges "detach" and drift, as if the cage is broken apart.
      const detach = Animated.loop(
        Animated.sequence([
          Animated.timing(breakOffset, { toValue: { x: 8, y: -6 }, duration: 260, useNativeDriver: true }),
          Animated.timing(breakOffset, { toValue: { x: -6, y: 4 }, duration: 260, useNativeDriver: true }),
          Animated.timing(breakOffset, { toValue: { x: 4, y: 8 }, duration: 260, useNativeDriver: true }),
          Animated.timing(breakOffset, { toValue: { x: 0, y: 0 }, duration: 260, useNativeDriver: true }),
        ])
      );
      anims.push(rage, strobe, detach);
    } else if (mode === 'completed') {
      assemble.setValue(1);
      scale.setValue(1);
      flicker.setValue(1);
      unlock.setValue(0);
      anims.push(
        Animated.timing(unlock, { toValue: 1, duration: 700, useNativeDriver: true })
      );
    }

    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [mode, scale, shakeX, flicker, breakOffset, assemble, unlock]);

  // --- Geometry: a simple parallelepiped-style wireframe box. ---
  const depth = size * 0.22;
  const frontW = size * 0.56;
  const frontH = size * 0.5;
  const frontLeft = (size - frontW) / 2 - depth / 2;
  const frontTop = size - frontH - size * 0.16;

  const F = {
    TL: { x: frontLeft, y: frontTop },
    TR: { x: frontLeft + frontW, y: frontTop },
    BL: { x: frontLeft, y: frontTop + frontH },
    BR: { x: frontLeft + frontW, y: frontTop + frontH },
  };
  const B = {
    TL: { x: frontLeft + depth, y: frontTop - depth },
    TR: { x: frontLeft + frontW + depth, y: frontTop - depth },
    BL: { x: frontLeft + depth, y: frontTop + frontH - depth },
    BR: { x: frontLeft + frontW + depth, y: frontTop + frontH - depth },
  };

  const edgeThickness = 2.5;
  const edges = [
    lineStyle(F.TL.x, F.TL.y, B.TL.x, B.TL.y, edgeThickness),
    lineStyle(F.TR.x, F.TR.y, B.TR.x, B.TR.y, edgeThickness),
    lineStyle(F.BL.x, F.BL.y, B.BL.x, B.BL.y, edgeThickness),
    lineStyle(F.BR.x, F.BR.y, B.BR.x, B.BR.y, edgeThickness),
  ];

  const floorY = F.BL.y;
  const floorLines = [
    lineStyle(F.BL.x - size * 0.05, floorY + size * 0.03, F.BR.x + size * 0.05, floorY + size * 0.03, 1.5),
    lineStyle(F.BL.x - size * 0.1, floorY + size * 0.08, F.BR.x + size * 0.1, floorY + size * 0.08, 1),
    lineStyle(F.BL.x - size * 0.06, floorY, F.BL.x - size * 0.12, floorY + size * 0.09, 1),
    lineStyle(F.BR.x + size * 0.06, floorY, F.BR.x + size * 0.12, floorY + size * 0.09, 1),
  ];

  const cornerSize = size * 0.05;
  const corners = [
    { x: F.TL.x, y: F.TL.y, h: 'l', v: 't' },
    { x: F.TR.x, y: F.TR.y, h: 'r', v: 't' },
    { x: F.BL.x, y: F.BL.y, h: 'l', v: 'b' },
    { x: F.BR.x, y: F.BR.y, h: 'r', v: 'b' },
  ] as const;

  const assembleFrontStyle = {
    opacity: assemble,
    transform: [{ scale: assemble.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
  };
  const assembleBackStyle = {
    opacity: assemble.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }),
  };
  const assembleEdgeStyle = {
    opacity: assemble.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, 1] }),
  };

  const unlockFrontStyle = {
    opacity: unlock.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
    transform: [
      { translateY: unlock.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) },
    ],
  };

  return (
    <View style={[styles.container, { width: size, height: size }]} pointerEvents="none">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: flicker,
            transform: [{ scale }, { translateX: shakeX }],
          },
        ]}
      >
        {/* Floor grid */}
        <Animated.View style={assembleBackStyle}>
          {floorLines.map((s, i) => (
            <View key={`floor-${i}`} style={[styles.hairline, s, { backgroundColor: color, opacity: 0.25 }]} />
          ))}
        </Animated.View>

        {/* Back face + connecting edges (this is the group that "detaches" in jailbreak) */}
        <Animated.View
          style={[
            assembleBackStyle,
            { transform: [{ translateX: breakOffset.x }, { translateY: breakOffset.y }] },
          ]}
        >
          <View
            style={[
              styles.faceFill,
              { left: B.TL.x, top: B.TL.y, width: frontW, height: frontH, backgroundColor: color },
            ]}
          />
          <View
            style={[
              styles.faceOutline,
              { left: B.TL.x, top: B.TL.y, width: frontW, height: frontH, borderColor: color },
            ]}
          />
          <Animated.View style={assembleEdgeStyle}>
            {edges.map((s, i) => (
              <View key={`edge-${i}`} style={[styles.hairline, s, { backgroundColor: color }]} />
            ))}
          </Animated.View>
        </Animated.View>

        {/* Front face (stays put, the "containment wall" facing the viewer) */}
        <Animated.View style={assembleFrontStyle}>
          <Animated.View
            style={[
              styles.faceFill,
              { left: F.TL.x, top: F.TL.y, width: frontW, height: frontH, backgroundColor: color },
              mode === 'completed' ? unlockFrontStyle : undefined,
            ]}
          />
          <Animated.View
            style={[
              styles.faceOutline,
              { left: F.TL.x, top: F.TL.y, width: frontW, height: frontH, borderColor: color },
              mode === 'completed' ? unlockFrontStyle : undefined,
            ]}
          />

          {/* Corner markers */}
          {corners.map((c, i) => (
            <View
              key={`corner-${i}`}
              style={[
                styles.corner,
                {
                  width: cornerSize,
                  height: cornerSize,
                  borderColor: color,
                  left: c.x - (c.h === 'l' ? 2 : cornerSize - 2),
                  top: c.y - (c.v === 't' ? 2 : cornerSize - 2),
                  borderLeftWidth: c.h === 'l' ? 2.5 : 0,
                  borderRightWidth: c.h === 'r' ? 2.5 : 0,
                  borderTopWidth: c.v === 't' ? 2.5 : 0,
                  borderBottomWidth: c.v === 'b' ? 2.5 : 0,
                },
              ]}
            />
          ))}

          {/* Containment lock icon, centered in the front face */}
          <View
            style={[
              styles.lockWrap,
              {
                left: F.TL.x + frontW / 2 - (size * 0.09) / 2,
                top: F.TL.y + frontH / 2 - (size * 0.12) / 2,
              },
            ]}
          >
            <View
              style={[
                styles.lockShackle,
                {
                  width: size * 0.075,
                  height: size * 0.05,
                  borderColor: color,
                  left: (size * 0.09 - size * 0.075) / 2,
                  transform: [{ translateX: locked ? 0 : size * 0.035 }, { rotate: locked ? '0deg' : '18deg' }],
                },
              ]}
            />
            <View
              style={[
                styles.lockBody,
                { width: size * 0.09, height: size * 0.065, backgroundColor: color },
              ]}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hairline: {
    position: 'absolute',
  },
  faceFill: {
    position: 'absolute',
    borderRadius: 6,
    opacity: 0.12,
  },
  faceOutline: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
  },
  lockWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  lockShackle: {
    position: 'absolute',
    top: -14,
    borderWidth: 2.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  lockBody: {
    borderRadius: 3,
    marginTop: 4,
    opacity: 0.9,
  },
});
