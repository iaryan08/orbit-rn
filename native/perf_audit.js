const fs = require('fs');
const path = require('path');

const FILES = [
    'c:/Users/Aryan/Desktop/orbit-v2/native/components/screens/LunaraScreen.tsx',
    'c:/Users/Aryan/Desktop/orbit-v2/native/components/lunara/MalePartnerView.tsx',
    'c:/Users/Aryan/Desktop/orbit-v2/native/components/lunara/BiologicalTimeline.tsx',
    'c:/Users/Aryan/Desktop/orbit-v2/native/components/lunara/DailyInsightCard.tsx',
    'c:/Users/Aryan/Desktop/orbit-v2/native/components/lunara/CycleSummaryBanner.tsx',
    'c:/Users/Aryan/Desktop/orbit-v2/native/components/lunara/LunaraOnboarding.tsx',
    'c:/Users/Aryan/Desktop/orbit-v2/native/components/NavbarDock.tsx',
    'c:/Users/Aryan/Desktop/orbit-v2/native/lib/store/lunaraSlice.ts',
];

let totalIssues = 0;

FILES.forEach(f => {
    const name = path.basename(f);
    const code = fs.readFileSync(f, 'utf8');
    const issues = [];

    // 1. Inline entering= animation objects (the crash cause)
    const inlineEntering = [...code.matchAll(/entering=\{(?:FadeIn|FadeInDown|ZoomIn|SlideIn)[^}]+\(\d[^}]*\)\}/g)].map(m => m[0]);
    if (inlineEntering.length) issues.push(`CRASH: inline entering= (${inlineEntering.length}): ${inlineEntering[0]}`);

    // 2. Inline arrow functions in JSX (re-create every render)
    const inlineArrows = [...code.matchAll(/on(?:Press|Change|Select|Submit|Focus|Blur)=\{\(\) =>/g)].length;
    if (inlineArrows > 6) issues.push(`PERF: ${inlineArrows} inline arrow functions in JSX`);

    // 3. Missing React.memo on exported components (only check .tsx)
    if (f.endsWith('.tsx') && !f.includes('Screen') && !f.includes('Dock')) {
        const exportedFns = [...code.matchAll(/export function (\w+)/g)].map(m => m[1]);
        const memoized = [...code.matchAll(/React\.memo\(/g)].length;
        if (exportedFns.length > 0 && memoized === 0) {
            issues.push(`PERF: ${exportedFns.join(',')} not wrapped in React.memo`);
        }
    }

    // 4. ScrollView without throttle (Android drain)
    if (code.includes('scrollEventThrottle') && !code.includes('IS_ANDROID') && f.includes('Screen')) {
        issues.push('PERF: scrollEventThrottle not Android-aware');
    }

    // 5. Missing useCallback on handlers
    const handlers = [...code.matchAll(/const handle\w+ = \((?!.*useCallback)/g)].length;
    if (handlers > 0) issues.push(`PERF: ${handlers} bare handler(s) not in useCallback`);

    const status = issues.length === 0 ? 'OK  ' : 'WARN';
    console.log(`${status} ${name}`);
    issues.forEach(i => console.log(`     → ${i}`));
    totalIssues += issues.length;
});

console.log(`\n${totalIssues === 0 ? '✓ No performance issues found' : `${totalIssues} issues to address`}`);
