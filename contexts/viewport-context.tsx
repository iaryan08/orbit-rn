'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface ViewportContextType {
    viewportHeight: number;
    viewportWidth: number;
    isKeyboardVisible: boolean;
}

const ViewportContext = createContext<ViewportContextType>({
    viewportHeight: 0,
    viewportWidth: 0,
    isKeyboardVisible: false,
});

export function ViewportProvider({ children }: { children: React.ReactNode }) {
    const [viewport, setViewport] = useState<ViewportContextType>({
        viewportHeight: 0,
        viewportWidth: 0,
        isKeyboardVisible: false,
    });

    const capture = useCallback(() => {
        if (typeof window === 'undefined') return;
        setViewport(prev => {
            // Only update if width changed (device rotation) or first init (height === 0)
            // This ignores keyboard opening (which only shrinks HEIGHT, not width)
            if (prev.viewportHeight === 0 || window.innerWidth !== prev.viewportWidth) {
                return {
                    ...prev,
                    viewportHeight: window.innerHeight,
                    viewportWidth: window.innerWidth,
                };
            }
            return prev;
        });

        document.documentElement.style.setProperty('--app-width', `${window.innerWidth}px`);
        document.documentElement.style.setProperty('--app-width-stable', `${window.innerWidth}px`);
    }, []);

    useEffect(() => {
        capture();
        window.addEventListener('resize', capture);
        return () => window.removeEventListener('resize', capture);
    }, [capture]);

    useEffect(() => {
        if (viewport.viewportHeight > 0) {
            document.documentElement.style.setProperty('--app-height', `${viewport.viewportHeight}px`);
            document.documentElement.style.setProperty('--app-height-stable', `${viewport.viewportHeight}px`);
        }
    }, [viewport.viewportHeight]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const applyKeyboardMetrics = () => {
            const vv = window.visualViewport;
            const baseHeight = viewport.viewportHeight || window.innerHeight;
            let keyboardHeight = 0;

            if (vv) {
                keyboardHeight = Math.max(0, Math.round(baseHeight - vv.height - vv.offsetTop));
            } else {
                keyboardHeight = Math.max(0, Math.round(baseHeight - window.innerHeight));
            }

            document.documentElement.style.setProperty('--orbit-kb-height', `${keyboardHeight}px`);
            document.documentElement.setAttribute('data-kb-visible', keyboardHeight > 80 ? 'true' : 'false');
            setViewport(v => ({ ...v, isKeyboardVisible: keyboardHeight > 80 }));
        };

        applyKeyboardMetrics();
        const vv = window.visualViewport;
        vv?.addEventListener('resize', applyKeyboardMetrics);
        window.addEventListener('resize', applyKeyboardMetrics);

        return () => {
            vv?.removeEventListener('resize', applyKeyboardMetrics);
            window.removeEventListener('resize', applyKeyboardMetrics);
        };
    }, [viewport.viewportHeight]);

    useEffect(() => {
        // Keyboard visibility only; actual field scrolling is handled by each modal's
        // internal scroll container to avoid moving the whole page/dialog.
        let cleanup: (() => void) | null = null;

        const initKeyboard = async () => {
            try {
                const { Keyboard } = await import('@capacitor/keyboard');
                const showL = await Keyboard.addListener('keyboardWillShow', (info: any) => {
                    const h = Math.max(0, Number(info?.keyboardHeight || 0));
                    document.documentElement.style.setProperty('--orbit-kb-height', `${h}px`);
                    document.documentElement.setAttribute('data-kb-visible', h > 0 ? 'true' : 'false');
                    setViewport(v => ({ ...v, isKeyboardVisible: true }));
                });
                const hideL = await Keyboard.addListener('keyboardWillHide', () => {
                    document.documentElement.style.setProperty('--orbit-kb-height', `0px`);
                    document.documentElement.setAttribute('data-kb-visible', 'false');
                    setViewport(v => ({ ...v, isKeyboardVisible: false }));
                });

                cleanup = () => {
                    showL.remove();
                    hideL.remove();
                };
            } catch (e) {
                //
            }
        };

        if (typeof window !== 'undefined') {
            initKeyboard();
        }

        return () => {
            if (cleanup) cleanup();
        };
    }, []);

    return (
        <ViewportContext.Provider value={viewport}>
            {children}
        </ViewportContext.Provider>
    );
}

export function useViewport() {
    return useContext(ViewportContext);
}
