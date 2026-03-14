const fs = require('fs');
const path = require('path');

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
    '°C': '°C',
    '°': '°',
    '❤️': '❤️',
    '❤️ ': '❤️ ',
    '❤️‍🔥': '❤️‍🔥',
    '❤️‍🔥': '❤️‍🔥',
    'Connected With ': 'Connected With ',
    '😊': '😊', // fallback for partials
};

function walk(dir) {
    fs.readdirSync(dir).forEach(file => {
        let fullPath = path.join(dir, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') walk(fullPath);
        } else if (fullPath.match(/\.(tsx?|js|json|gradle)$/)) {
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
                    console.log(`Fixed: ${fullPath}`);
                }
            } catch (e) { }
        }
    });
}

walk('.');
console.log('Final deep cleanup complete.');
