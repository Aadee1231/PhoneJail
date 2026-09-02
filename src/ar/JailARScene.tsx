import {
  ViroAmbientLight,
  ViroARPlaneSelector,
  ViroARScene,
  ViroTrackingStateConstants,
} from '@reactvision/react-viro';
import { VirtualJail3D } from './VirtualJail3D';

export interface JailARSceneProps {
  /** Notifies the RN overlay that AR tracking is ready. */
  onTrackingReady: (ready: boolean) => void;
  /** Notifies the RN overlay that the user selected a surface. */
  onPlaneSelected: () => void;
  /** Placement has been confirmed — freeze gestures. */
  placed: boolean;
  /** The phone has been detected inside — play the lock animation. */
  locked: boolean;
}

/**
 * The AR scene: detects horizontal planes (desks, tables, floors), lets the
 * user tap one to anchor the virtual jail in world space, then hosts the
 * gesture-adjustable VirtualJail3D on that plane.
 */
export function JailARScene(props: any) {
  const appProps: JailARSceneProps =
    props.sceneNavigator?.viroAppProps ?? props.arSceneNavigator?.viroAppProps ?? {};

  const onTrackingUpdated = (state: any) => {
    appProps.onTrackingReady?.(state === ViroTrackingStateConstants.TRACKING_NORMAL);
  };

  return (
    <ViroARScene onTrackingUpdated={onTrackingUpdated}>
      <ViroAmbientLight color="#ffffff" intensity={600} />
      <ViroARPlaneSelector
        alignment="HorizontalUpward"
        minWidth={0.3}
        minHeight={0.2}
        onPlaneSelected={() => appProps.onPlaneSelected?.()}
      >
        <VirtualJail3D frozen={!!appProps.placed} locked={!!appProps.locked} />
      </ViroARPlaneSelector>
    </ViroARScene>
  );
}
