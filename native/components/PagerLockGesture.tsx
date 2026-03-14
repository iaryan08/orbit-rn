import React, { useMemo } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useOrbitStore } from '../lib/store';

type PagerLockGestureProps = {
    children: React.ReactElement;
    direction?: 'horizontal' | 'vertical';
    enabled?: boolean;
};

export function PagerLockGesture({
    children,
    direction = 'horizontal',
    enabled = true
}: PagerLockGestureProps) {
    const isPagerScrollEnabledSV = useOrbitStore(state => state.isPagerScrollEnabledSV);

    const setPagerScrollEnabled = useOrbitStore(state => state.setPagerScrollEnabled);

    const gesture = useMemo(() => {
        const pan = Gesture.Pan()
            .enabled(enabled)
            .onBegin(() => {
                isPagerScrollEnabledSV.value = false;
                runOnJS(setPagerScrollEnabled)(false);
            })
            .onFinalize(() => {
                isPagerScrollEnabledSV.value = true;
                runOnJS(setPagerScrollEnabled)(true);
            });

        if (direction === 'horizontal') {
            pan.activeOffsetX([-3, 3]).failOffsetY([-10, 10]);
        } else {
            pan.activeOffsetY([-6, 6]).failOffsetX([-10, 10]);
        }

        return Gesture.Simultaneous(pan, Gesture.Native());
    }, [direction, enabled, isPagerScrollEnabledSV]);

    return (
        <GestureDetector gesture={gesture}>
            {children}
        </GestureDetector>
    );
}
