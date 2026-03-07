import { useCallback, useRef, useState } from 'react';

export function useLongPress(
    onLongPress: (e: any) => void,
    onClick?: (e: any) => void,
    { shouldPreventDefault = true, delay = 500 } = {}
) {
    const [longPressTriggered, setLongPressTriggered] = useState(false);
    const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const target = useRef<EventTarget | null>(null);

    const start = useCallback(
        (e: any) => {
            if (e.target) {
                target.current = e.target;
            }
            setLongPressTriggered(false);
            timeout.current = setTimeout(() => {
                onLongPress(e);
                setLongPressTriggered(true);
            }, delay);
        },
        [onLongPress, delay, shouldPreventDefault]
    );

    const clear = useCallback(
        (e: any, shouldTriggerClick = true) => {
            timeout.current && clearTimeout(timeout.current);
            if (!longPressTriggered && shouldTriggerClick) {
                onClick?.(e);
            }
            setLongPressTriggered(false);
        },
        [onClick, longPressTriggered]
    );

    return {
        onMouseDown: (e: any) => start(e),
        onTouchStart: (e: any) => start(e),
        onMouseUp: (e: any) => clear(e),
        onMouseLeave: (e: any) => clear(e, false),
        onTouchEnd: (e: any) => clear(e),
        isLongPressTriggered: longPressTriggered
    };
}
