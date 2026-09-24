import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';

export type HolographicJailGraphicMode = 'active' | 'warning' | 'jailbreak' | 'returned' | 'success';

interface HolographicJailGraphicProps {
  mode?: HolographicJailGraphicMode;
  size?: number;
}

const VIEW_W = 320;
const VIEW_H = 230;
const ASPECT = VIEW_H / VIEW_W; // 0.71875

const FRONT_LEFT = 70;
const FRONT_RIGHT = 250;
const FRONT_TOP = 60;
const FRONT_BOTTOM = 180;

const BACK_LEFT = 50;
const BACK_RIGHT = 230;
const BACK_TOP = 30;
const BACK_BOTTOM = 150;

interface Tint {
  main: string;
  inner: string;
  glow: string;
}

const TINTS: Record<HolographicJailGraphicMode, Tint> = {
  active: { main: '#3FD4FF', inner: '#5BA8FF', glow: '#1A8CFF' },
  warning: { main: '#FFD166', inner: '#F5A623', glow: '#FF9F1C' },
  jailbreak: { main: '#FF5E8C', inner: '#FF3B6A', glow: '#FF1F5A' },
  returned: { main: '#79DDE8', inner: '#4DB8E8', glow: '#3A9BD3' },
  success: { main: '#79DDE8', inner: '#4DB8E8', glow: '#3A9BD3' },
};

const outerD = [
  // Front rectangle
  `M ${FRONT_LEFT} ${FRONT_BOTTOM}`,
  `L ${FRONT_RIGHT} ${FRONT_BOTTOM}`,
  `L ${FRONT_RIGHT} ${FRONT_TOP}`,
  `L ${FRONT_LEFT} ${FRONT_TOP}`,
  'Z',
  // Back rectangle
  `M ${BACK_LEFT} ${BACK_BOTTOM}`,
  `L ${BACK_RIGHT} ${BACK_BOTTOM}`,
  `L ${BACK_RIGHT} ${BACK_TOP}`,
  `L ${BACK_LEFT} ${BACK_TOP}`,
  'Z',
  // Corner connectors
  `M ${FRONT_LEFT} ${FRONT_BOTTOM} L ${BACK_LEFT} ${BACK_BOTTOM}`,
  `M ${FRONT_RIGHT} ${FRONT_BOTTOM} L ${BACK_RIGHT} ${BACK_BOTTOM}`,
  `M ${FRONT_RIGHT} ${FRONT_TOP} L ${BACK_RIGHT} ${BACK_TOP}`,
  `M ${FRONT_LEFT} ${FRONT_TOP} L ${BACK_LEFT} ${BACK_TOP}`,
].join(' ');

const frontBarsX = [100, 140, 180, 220];
const backBarsX = [80, 115, 155, 195];

const innerD = [
  ...frontBarsX.map((x) => `M ${x} ${FRONT_BOTTOM} L ${x} ${FRONT_TOP}`),
  `M ${FRONT_LEFT} 130 L ${FRONT_RIGHT} 130`,
].join(' ');

const backInnerD = [
  ...backBarsX.map((x) => `M ${x} ${BACK_BOTTOM} L ${x} ${BACK_TOP}`),
  `M ${BACK_LEFT} 105 L ${BACK_RIGHT} 105`,
].join(' ');

const cornerPoints: [number, number][] = [
  [FRONT_LEFT, FRONT_BOTTOM],
  [FRONT_RIGHT, FRONT_BOTTOM],
  [FRONT_RIGHT, FRONT_TOP],
  [FRONT_LEFT, FRONT_TOP],
  [BACK_LEFT, BACK_BOTTOM],
  [BACK_RIGHT, BACK_BOTTOM],
  [BACK_RIGHT, BACK_TOP],
  [BACK_LEFT, BACK_TOP],
];

const floorGridD = [
  'M 70 192 L 250 192',
  'M 60 204 L 260 204',
  'M 50 216 L 270 216',
  'M 120 192 L 100 216',
  'M 160 192 L 160 216',
  'M 200 192 L 220 216',
].join(' ');

// Translucent glass panels — one per visible face of the enclosure, in
// back-to-front paint order.
const PANEL_FILLS: { points: string; opacity: number }[] = [
  // Back face
  { points: `${BACK_LEFT},${BACK_TOP} ${BACK_RIGHT},${BACK_TOP} ${BACK_RIGHT},${BACK_BOTTOM} ${BACK_LEFT},${BACK_BOTTOM}`, opacity: 0.05 },
  // Left face
  { points: `${FRONT_LEFT},${FRONT_TOP} ${BACK_LEFT},${BACK_TOP} ${BACK_LEFT},${BACK_BOTTOM} ${FRONT_LEFT},${FRONT_BOTTOM}`, opacity: 0.06 },
  // Right face
  { points: `${FRONT_RIGHT},${FRONT_TOP} ${BACK_RIGHT},${BACK_TOP} ${BACK_RIGHT},${BACK_BOTTOM} ${FRONT_RIGHT},${FRONT_BOTTOM}`, opacity: 0.06 },
  // Top face
  { points: `${FRONT_LEFT},${FRONT_TOP} ${FRONT_RIGHT},${FRONT_TOP} ${BACK_RIGHT},${BACK_TOP} ${BACK_LEFT},${BACK_TOP}`, opacity: 0.05 },
  // Interior floor face
  { points: `${FRONT_LEFT},${FRONT_BOTTOM} ${FRONT_RIGHT},${FRONT_BOTTOM} ${BACK_RIGHT},${BACK_BOTTOM} ${BACK_LEFT},${BACK_BOTTOM}`, opacity: 0.07 },
  // Front face (drawn last, most visible)
  { points: `${FRONT_LEFT},${FRONT_TOP} ${FRONT_RIGHT},${FRONT_TOP} ${FRONT_RIGHT},${FRONT_BOTTOM} ${FRONT_LEFT},${FRONT_BOTTOM}`, opacity: 0.08 },
];

export function HolographicJailGraphic({ mode = 'active', size = 300 }: HolographicJailGraphicProps) {
  const tint = TINTS[mode];
  const height = Math.round(size * ASPECT);

  return (
    <View
      style={[styles.root, { width: size, height }]}
      pointerEvents="none"
      accessible
      accessibilityLabel={`${mode} holographic containment chamber`}
    >
      <Svg
        width={size}
        height={height}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          <LinearGradient id="floor-glow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tint.main} stopOpacity={0.18} />
            <Stop offset="1" stopColor={tint.main} stopOpacity={0} />
          </LinearGradient>

          <RadialGradient id="ground-glow" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
            <Stop offset="0" stopColor={tint.glow} stopOpacity={0.22} />
            <Stop offset="0.65" stopColor={tint.glow} stopOpacity={0.09} />
            <Stop offset="1" stopColor={tint.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Soft feathered contact halo under the jail */}
        <Ellipse cx={160} cy={206} rx={124} ry={18} fill="url(#ground-glow)" />

        {/* Floor / grid impression */}
        <Polygon
          points={`${FRONT_LEFT},192 ${FRONT_RIGHT},192 270,216 50,216`}
          fill="url(#floor-glow)"
          stroke={tint.main}
          strokeOpacity={0.2}
          strokeWidth={1.5}
        />
        <Path
          d={floorGridD}
          stroke={tint.main}
          strokeOpacity={0.12}
          strokeWidth={1}
          fill="none"
        />

        {/* Translucent glass panels */}
        {PANEL_FILLS.map((panel, i) => (
          <Polygon key={i} points={panel.points} fill={tint.main} fillOpacity={panel.opacity} />
        ))}

        {/* Outer edge glow */}
        <Path
          d={outerD}
          stroke={tint.glow}
          strokeOpacity={0.25}
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Bright outer wireframe */}
        <Path
          d={outerD}
          stroke={tint.main}
          strokeOpacity={0.95}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Inner secondary lines */}
        <Path
          d={innerD}
          stroke={tint.inner}
          strokeOpacity={0.45}
          strokeWidth={1.2}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d={backInnerD}
          stroke={tint.inner}
          strokeOpacity={0.28}
          strokeWidth={1}
          strokeLinecap="round"
          fill="none"
        />

        {/* Glowing corner dots */}
        {cornerPoints.map(([cx, cy], i) => (
          <Circle key={i} cx={cx} cy={cy} r={8} fill={tint.glow} fillOpacity={0.1} />
        ))}
        {cornerPoints.map(([cx, cy], i) => (
          <Circle key={i} cx={cx} cy={cy} r={3.5} fill={tint.main} fillOpacity={0.7} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: 'transparent',
    alignSelf: 'center',
  },
});
