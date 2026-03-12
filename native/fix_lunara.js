const fs = require('fs');
const path = 'c:/Users/Aryan/Desktop/orbit-v2/native/components/screens/LunaraScreen.tsx';
let code = fs.readFileSync(path, 'utf8');

// Fix 1: remove leftover "    )}" that got appended at the end of the partner block
code = code.replace(/(\<\/MalePartnerView\>\s*\n\s*\)}\s*)(\s*\)\s*\})\s*(\s*\<\/View\>)/, '$1\n$3');

// Fix 2: remove any remaining TabBar references (setActiveTab / TabBar JSX) - it no longer exists
code = code.replace(/<TabBar[^/]*\/>/g, '');
code = code.replace(/\bsetActiveTab\b/g, '(_t: any) => {}');

// Fix 3: remove orphaned TABS const and TabId type if still present
code = code.replace(/^const TABS = \[[\s\S]*?\] as const;\s*\ntype TabId = typeof TABS\[number\]\['id'\];\s*\n/m, '');

fs.writeFileSync(path, code, 'utf8');
console.log('Fixed. Lines:', code.split('\n').length);
console.log('setActiveTab remaining:', code.split('setActiveTab').length - 1);
console.log('TabBar remaining:', code.split('<TabBar').length - 1);
