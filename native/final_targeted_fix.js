const fs = require('fs');
const path = require('path');

const mapping = {
    '😊': '😊', '🥰': '🥰', '🤩': '🤩', '😌': '😌',
    '😢': '😢', '😴': '😴', '🙏': '🙏', '😉': '😉',
    '🥺': '🥺', '🫂': '🫂', '🌹': '🌹', '🔥': '🔥',
    '😈': '😈', '✨': '✨', '🩸': '🩸', '❤️': '❤️',
    '💍': '💍', '·': '·', '──': '─', 'ðŸ§¡': '🧡',
    'ðŸ’™': '💙', 'ðŸ’œ': '💜', 'ðŸ’š': '💚', 'ðŸ’ª': '💪',
    'ðŸŒˆ': '🌈', 'ðŸŒ🌟': '🌟', 'âœ…': '✅', 'â Œ': '❌',
    'âš ï¸ ': '⚠️', 'â„¹ï¸ ': 'ℹ️', 'ðŸ—§': '🔧', 'ðŸ’»': '💻',
    'ðŸ“±': '📱', 'ðŸ“': '📁', 'ðŸ“¨': '📩', 'ðŸ“©': '📨',
    'ðŸ“¬': '📮', 'ðŸ“­': '📭', 'ðŸ“ž': '📞', 'ðŸ“¡': '📡',
    '°C': '°C',
    'Â°': '°',
    '❤️': '❤️',
    '❤️ ': '❤️ ',
    '❤️‍🔥': '❤️‍🔥',
    '❤️‍🔥': '❤️‍🔥',
    'Connected With ': 'Connected With ',
    '💍': '💍', // with space
    'ðŸ’': '💍', // without space
    'â™¥ï¸ ': '❤️',
};

const targetFiles = [
    'components/SearchPalette.tsx',
    'components/lunara/LunaraOnboarding.tsx',
    'components/screens/DashboardScreen.tsx',
    'components/screens/LunaraScreen.tsx',
    'components/screens/SyncCinemaScreen.tsx',
    'components/screens/MemoriesScreen.tsx',
    'components/screens/LettersScreen.tsx',
    'components/ProfileAvatar.tsx',
    'components/MoodLoggerDrawer.tsx',
    'components/DashboardWidgets.tsx',
    'components/dashboard/ImportantDatesCountdown.tsx',
    'components/dashboard/MenstrualPhaseWidget.tsx',
    'components/dashboard/ConnectionBoard.tsx',
    'app/index.tsx',
    'components/PartnerHeader.tsx'
];

targetFiles.forEach(relPath => {
    const fullPath = path.join('c:/Users/Aryan/Desktop/orbit-v2/native', relPath);
    if (!fs.existsSync(fullPath)) return;

    try {
        let content = fs.readFileSync(fullPath, 'utf8');
        let changed = false;

        const sortedKeys = Object.keys(mapping).sort((a, b) => b.length - a.length);

        for (const garbage of sortedKeys) {
            if (content.indexOf(garbage) !== -1) {
                content = content.split(garbage).join(mapping[garbage]);
                changed = true;
            }
        }

        if (changed) {
            fs.writeFileSync(fullPath, content, 'utf8');
            console.log(`Fixed: ${relPath}`);
        }
    } catch (e) {
        console.error(`Error fixing ${relPath}: ${e.message}`);
    }
});

console.log('Targeted cleanup complete.');
