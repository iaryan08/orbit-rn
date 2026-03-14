const fs = require('fs');
const path = require('path');

// Comprehensive mapping of garbage sequences to real emojis
const mapping = {
    '😊': '😊', '🥰': '🥰', '🤩': '🤩', '😌': '😌',
    '😢': '😢', '😴': '😴', '🙏': '🙏', '😉': '😉',
    '🥺': '🥺', '🫂': '🫂', '🌹': '🌹', '🔥': '🔥',
    '😈': '😈', '✨': '✨', '🩸': '🩸', '❤️': '❤️',
    '💍': '💍', '·': '·', '─': '─', '🧡': '🧡',
    '💙': '💙', '💜': '💜', '💚': '💚', '💪': '💪',
    '🌈': '🌈', '🌟': '🌟', '✅': '✅', '❌': '❌',
    '⚠️': '⚠️', 'ℹ️': 'ℹ️', '🔧': '🔧', '💻': '💻',
    '📱': '📱', '📁': '📁', '📩': '📩', '📨': '📨',
    '📮': '📮', '📭': '📭', '📞': '📞', '📡': '📡',
    '❤️‍🔥': '❤️‍🔥', // Special case for passionate (partial fix)
    '❤️‍🔥': '❤️‍🔥',
    '❤️‍🔥': '❤️‍🔥',
    '✨': '✨',
    '😊': '😊',
    '💍': '💍',
    '': '' // Clean up stray encoded chars if any
};

function walk(dir) {
    fs.readdirSync(dir).forEach(file => {
        let fullPath = path.join(dir, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== '.expo' && file !== 'android' && file !== 'ios') walk(fullPath);
        } else if (fullPath.match(/\.(tsx?|js|json|gradle)$/)) {
            try {
                let content = fs.readFileSync(fullPath, 'utf8');
                let changed = false;

                // Sort keys by length descending to match longest sequences first
                const sortedKeys = Object.keys(mapping).sort((a, b) => b.length - a.length);

                for (const garbage of sortedKeys) {
                    if (content.indexOf(garbage) !== -1) {
                        content = content.split(garbage).join(mapping[garbage]);
                        changed = true;
                    }
                }

                if (changed) {
                    fs.writeFileSync(fullPath, content, 'utf8');
                    console.log(`Fixed: ${fullPath}`);
                }
            } catch (e) {
                // Ignore binary or encoded files that fail to read as utf8 cleanly
            }
        }
    });
}

walk('.');
console.log('Final project-wide restoration complete.');
