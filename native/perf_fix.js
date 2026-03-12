const fs = require('fs');

// Fix 1: Wrap MalePartnerView export with React.memo
{
    const p = 'c:/Users/Aryan/Desktop/orbit-v2/native/components/lunara/MalePartnerView.tsx';
    let code = fs.readFileSync(p, 'utf8');
    // Change: export function MalePartnerView(...) { -> const MalePartnerView = React.memo(function MalePartnerView(...) {
    // And add export default at end
    if (!code.includes('React.memo')) {
        code = code.replace(
            'export function MalePartnerView({',
            'const MalePartnerViewBase = React.memo(function MalePartnerView({'
        );
        // Replace closing brace of the component function - find last }) before const styles
        const stylesIdx = code.indexOf('\nconst styles = StyleSheet.create');
        const before = code.slice(0, stylesIdx);
        const after = code.slice(stylesIdx);
        // The component ends with `}` just before styles
        // Add closing paren for memo + export
        const newCode = before.trimEnd() + '\n});\n\nexport const MalePartnerView = MalePartnerViewBase;\n' + after;
        fs.writeFileSync(p, newCode);
        console.log('MalePartnerView → React.memo applied');
    } else {
        console.log('MalePartnerView already memoized');
    }
}

// Fix 2: Wrap LunaraOnboarding with React.memo
{
    const p = 'c:/Users/Aryan/Desktop/orbit-v2/native/components/lunara/LunaraOnboarding.tsx';
    let code = fs.readFileSync(p, 'utf8');
    if (!code.includes('React.memo')) {
        // Wrap the export
        code = code.replace(
            /export function LunaraOnboarding\(/,
            'const LunaraOnboardingBase = React.memo(function LunaraOnboarding('
        );
        // Find end of function (last }) and close memo
        const stylesIdx = code.indexOf('\nconst styles');
        if (stylesIdx > -1) {
            const before = code.slice(0, stylesIdx).trimEnd();
            const after = code.slice(stylesIdx);
            const newCode = before + '\n});\n\nexport const LunaraOnboarding = LunaraOnboardingBase;\n' + after;
            fs.writeFileSync(p, newCode);
            console.log('LunaraOnboarding → React.memo applied');
        } else {
            console.log('LunaraOnboarding - could not find styles, skipping');
        }
    } else {
        console.log('LunaraOnboarding already memoized');
    }
}

// Fix 3: NavbarDock - memoize the handleLunaraTab with useCallback
{
    const p = 'c:/Users/Aryan/Desktop/orbit-v2/native/components/NavbarDock.tsx';
    let code = fs.readFileSync(p, 'utf8');

    // Make sure useCallback is imported
    if (!code.includes('useCallback')) {
        code = code.replace("import React, { useEffect, useState } from 'react';",
            "import React, { useEffect, useState, useCallback } from 'react';");
    }

    // Wrap handleLunaraTab in useCallback
    code = code.replace(
        `    const handleLunaraTab = (id: LunaraTabId) => {`,
        `    const handleLunaraTab = useCallback((id: LunaraTabId) => {`
    );
    // Find the closing brace of handleLunaraTab and add dependency array
    // It ends with: };
    code = code.replace(
        `        if (activeTabIndex !== 5) setTabIndex(5, 'tap');\n    };`,
        `        if (activeTabIndex !== 5) setTabIndex(5, 'tap');\n    }, [activeTabIndex, lunaraTab, setLunaraTab, setTabIndex]);`
    );

    fs.writeFileSync(p, code);
    console.log('NavbarDock handleLunaraTab → useCallback applied');
}

console.log('\nAll perf fixes applied. Re-running audit...');
