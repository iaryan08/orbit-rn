const fs = require('fs');

// UPDATE APPSLICE
let code = fs.readFileSync('c:/Users/Aryan/Desktop/orbit-v2/native/lib/store/appSlice.ts', 'utf8');
code = code.replace('isMoodDrawerOpen: boolean;\n    setMoodDrawerOpen: (open: boolean) => void;', 'isMoodDrawerOpen: boolean;\n    setMoodDrawerOpen: (open: boolean) => void;\n    isMoodHistoryOpen: boolean;\n    setMoodHistoryOpen: (open: boolean) => void;');
code = code.replace('isMoodDrawerOpen: false,', 'isMoodDrawerOpen: false,\n    isMoodHistoryOpen: false,');
code = code.replace('setMoodDrawerOpen: (open: boolean) => set({ isMoodDrawerOpen: open }),', 'setMoodDrawerOpen: (open: boolean) => set({ isMoodDrawerOpen: open }),\n    setMoodHistoryOpen: (open: boolean) => set({ isMoodHistoryOpen: open }),');
fs.writeFileSync('c:/Users/Aryan/Desktop/orbit-v2/native/lib/store/appSlice.ts', code);

// UPDATE _LAYOUT
let layoutCode = fs.readFileSync('c:/Users/Aryan/Desktop/orbit-v2/native/app/_layout.tsx', 'utf8');
layoutCode = layoutCode.replace('import { MoodLoggerDrawer } from "../components/MoodLoggerDrawer";', 'import { MoodLoggerDrawer } from "../components/MoodLoggerDrawer";\nimport { MoodHistoryDrawer } from "../components/MoodHistoryDrawer";');
layoutCode = layoutCode.replace('{isAuthenticated && <MoodLoggerDrawer />}', '{isAuthenticated && <MoodLoggerDrawer />}\n                {isAuthenticated && <MoodHistoryDrawer />}');
fs.writeFileSync('c:/Users/Aryan/Desktop/orbit-v2/native/app/_layout.tsx', layoutCode);

// UPDATE DASHBOARDWIDGETS
let dwCode = fs.readFileSync('c:/Users/Aryan/Desktop/orbit-v2/native/components/DashboardWidgets.tsx', 'utf8');
const newComponent = `export const ConnectionBoard = React.memo(({ profile, partnerProfile, cycleLogs }: any) => {
    const { setMoodDrawerOpen, moods, loading, sendHeartbeatOptimistic, idToken, setMoodHistoryOpen } = useOrbitStore();
    const today = getTodayIST();
    const myId = profile?.id;
    const partnerId = partnerProfile?.id;

    const myLatestMood = useMemo(
        () =>
            moods
                .filter(m => m.user_id === myId && m.mood_date === today)
                .sort((a, b) => getMoodTimestamp(b) - getMoodTimestamp(a))[0],
        [moods, myId, today]
    );
    const partnerLatestMood = useMemo(
        () =>
            moods
                .filter(m => m.user_id === partnerId && m.mood_date === today)
                .sort((a, b) => getMoodTimestamp(b) - getMoodTimestamp(a))[0],
        [moods, partnerId, today]
    );

    const myMoodDisplay = parseMoodPresentation(myLatestMood?.emoji);
    const partnerMoodDisplay = parseMoodPresentation(partnerLatestMood?.emoji);
    const myMoodEmoji = myLatestMood ? [myMoodDisplay.emoji] : (cycleLogs[myId]?.[today]?.symptoms || []);
    const partnerMoodEmoji = partnerLatestMood ? [partnerMoodDisplay.emoji] : (cycleLogs[partnerId]?.[today]?.symptoms || []);

    const myNote = myLatestMood?.mood_text || cycleLogs[myId]?.[today]?.note || '';
    const partnerNote = partnerLatestMood?.mood_text || cycleLogs[partnerId]?.[today]?.note || '';

    const myAvatarUrl = useMemo(() =>
        getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken),
        [profile?.avatar_url, idToken]);

    const partnerAvatarUrl = useMemo(() =>
        getPublicStorageUrl(partnerProfile?.avatar_url, 'avatars', idToken),
        [partnerProfile?.avatar_url, idToken]);

    const myName = profile?.display_name?.split(' ')[0] || 'You';
    const partnerName = getPartnerName(profile, partnerProfile);
    const heartbeatPulse = useSharedValue(0);

    const handleHeartbeatHold = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        heartbeatPulse.value = 0;
        heartbeatPulse.value = withSequence(
            withTiming(1, { duration: 120 }),
            withTiming(0, { duration: 180 })
        );
        sendHeartbeatOptimistic();
    };

    const heartbeatPulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + heartbeatPulse.value * 0.025 }],
    }));

    if (loading && moods.length === 0) {
        return (
            <GlassCard style={styles.connCard} intensity={10}>
                <View style={styles.connHeaderRedesign}>
                    <Shimmer width={120} height={24} />
                    <Shimmer width={60} height={24} borderRadius={12} />
                </View>
                <Shimmer width="100%" height={200} borderRadius={16} />
            </GlassCard>
        );
    }

    return (
        <Animated.View>
            <GlassCard style={styles.connCard} intensity={10}>
                <View style={styles.connHeaderRedesign}>
                    <View style={styles.connTitleGroup}>
                        <Sparkles size={18} color={Colors.dark.indigo[400]} />
                        <Text style={styles.connTitle}>Moods</Text>
                    </View>
                    <View style={styles.connActions}>
                        <TouchableOpacity
                            style={styles.connHistoryBtn}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                if (setMoodHistoryOpen) setMoodHistoryOpen(true);
                            }}
                        >
                            <Clock size={16} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.connUpdateBtnRedesign}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setMoodDrawerOpen(true);
                            }}
                        >
                            <Text style={styles.connUpdateTextRedesign}>Update</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Partner Mood Block - Highlighted */}
                <Animated.View style={[styles.connBlockPartnerRedesign, heartbeatPulseStyle]}>
                    <TouchableOpacity style={styles.connUserRowRedesign} onLongPress={handleHeartbeatHold} delayLongPress={220}>
                        <ProfileAvatar
                            url={partnerAvatarUrl}
                            fallbackText={partnerName}
                            size={38}
                            borderWidth={0}
                        />
                        <View style={{ marginLeft: 14, flex: 1 }}>
                            <Text style={styles.connUserLabelRedesign} numberOfLines={1}>{partnerName}</Text>
                            {partnerMoodEmoji.length > 0 ? (
                                <View style={styles.connMoodInline}>
                                    <Emoji symbol={partnerMoodEmoji[partnerMoodEmoji.length - 1] || '✨'} size={14} />
                                    <Text style={styles.connMoodLabelInline} numberOfLines={1}>{partnerMoodDisplay.label || partnerMoodEmoji[partnerMoodEmoji.length - 1]}</Text>
                                </View>
                            ) : (
                                <Text style={styles.connEmptyTextRedesign}>Waiting for vibe...</Text>
                            )}
                        </View>
                    </TouchableOpacity>
                    
                    {partnerNote ? (
                        <View style={styles.connNoteBoxRedesign}>
                            <Quote size={16} color="rgba(129, 140, 248, 0.4)" style={{ marginRight: 8, marginTop: 2 }} />
                            <Text style={styles.connNoteTextRedesign}>"{partnerNote}"</Text>
                        </View>
                    ) : (
                        partnerMoodEmoji.length === 0 && (
                            <View style={styles.connNoteBoxEmpty}>
                                <Text style={styles.connNoteEmptyText}>No updates yet today.</Text>
                            </View>
                        )
                    )}
                </Animated.View>

                {/* Vertical Separator */}
                <View style={styles.connDividerShape}>
                    <View style={styles.connDividerLine} />
                    <Heart size={14} color="rgba(255,255,255,0.15)" fill="rgba(255,255,255,0.05)" style={{ paddingHorizontal: 8, backgroundColor: 'rgba(5, 5, 10, 0.8)' }} />
                    <View style={styles.connDividerLine} />
                </View>

                {/* User Mood Block */}
                <Animated.View style={[styles.connBlockSelfRedesign, heartbeatPulseStyle]}>
                    <TouchableOpacity style={styles.connUserRowRedesign} onLongPress={handleHeartbeatHold} delayLongPress={220}>
                        <ProfileAvatar
                            url={myAvatarUrl}
                            fallbackText={myName}
                            size={38}
                            borderWidth={0}
                        />
                        <View style={{ marginLeft: 14, flex: 1 }}>
                            <Text style={styles.connUserLabelRedesign} numberOfLines={1}>You</Text>
                            {myMoodEmoji.length > 0 ? (
                                <View style={styles.connMoodInline}>
                                    <Emoji symbol={myMoodEmoji[myMoodEmoji.length - 1] || '✨'} size={14} />
                                    <Text style={styles.connMoodLabelInlineSelf} numberOfLines={1}>{myMoodDisplay.label || myMoodEmoji[myMoodEmoji.length - 1]}</Text>
                                </View>
                            ) : (
                                <Text style={styles.connEmptyTextRedesign}>How are you?</Text>
                            )}
                        </View>
                    </TouchableOpacity>

                    {myNote ? (
                        <View style={styles.connNoteBoxSelfRedesign}>
                            <Quote size={16} color="rgba(251, 113, 133, 0.4)" style={{ marginRight: 8, marginTop: 2 }} />
                            <Text style={styles.connNoteTextRedesign}>"{myNote}"</Text>
                        </View>
                    ) : (
                        myMoodEmoji.length === 0 && (
                            <View style={styles.connNoteBoxEmpty}>
                                <Text style={styles.connNoteEmptyText}>Tap update to share your mood.</Text>
                            </View>
                        )
                    )}
                </Animated.View>
            </GlassCard>
        </Animated.View>
    );
});`;

const startIdx = dwCode.indexOf('export const ConnectionBoard = React.memo(({ profile, partnerProfile, cycleLogs }: any) => {');
const endMarker = 'export const MusicHeartbeat = React.memo(() => {';
const endIdx = dwCode.indexOf(endMarker);

if (startIdx > -1 && endIdx > -1) {
    dwCode = dwCode.substring(0, startIdx) + newComponent + '\n\n' + dwCode.substring(endIdx);
}

if (!dwCode.includes('Clock')) {
    dwCode = dwCode.replace("from 'lucide-react-native';", ", Clock } from 'lucide-react-native';");
}

const newStyles = `
    connHeaderRedesign: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    connActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    connHistoryBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    connUpdateBtnRedesign: { backgroundColor: Colors.dark.rose[500], paddingHorizontal: 18, paddingVertical: 10, borderRadius: 100 },
    connUpdateTextRedesign: { color: 'white', fontSize: 13, fontFamily: Typography.sansBold, letterSpacing: 1 },
    
    connBlockPartnerRedesign: { backgroundColor: 'transparent', padding: 0 },
    connBlockSelfRedesign: { backgroundColor: 'transparent', padding: 0 },
    connUserRowRedesign: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    connUserLabelRedesign: { fontSize: 16, fontFamily: Typography.serifBold, color: 'white', letterSpacing: 0.5 },
    connMoodInline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    connMoodLabelInline: { fontSize: 13, fontFamily: Typography.serifItalic, color: 'rgba(129, 140, 248, 0.9)', textTransform: 'capitalize' },
    connMoodLabelInlineSelf: { fontSize: 13, fontFamily: Typography.serifItalic, color: 'rgba(251, 113, 133, 0.9)', textTransform: 'capitalize' },
    connEmptyTextRedesign: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
    
    connNoteBoxRedesign: { flexDirection: 'row', backgroundColor: 'rgba(129, 140, 248, 0.06)', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(129, 140, 248, 0.15)' },
    connNoteBoxSelfRedesign: { flexDirection: 'row', backgroundColor: 'rgba(251, 113, 133, 0.05)', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(251, 113, 133, 0.15)' },
    connNoteTextRedesign: { flex: 1, fontSize: 15, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.85)', lineHeight: 22 },
    
    connNoteBoxEmpty: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', alignItems: 'center' },
    connNoteEmptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: Typography.sans },
    
    connDividerShape: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
    connDividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },`;

const insertStyleIdx = dwCode.indexOf('connCard: {');
if (insertStyleIdx > -1 && !dwCode.includes('connHeaderRedesign')) {
    dwCode = dwCode.substring(0, insertStyleIdx) + newStyles + '\n' + dwCode.substring(insertStyleIdx);
}

fs.writeFileSync('c:/Users/Aryan/Desktop/orbit-v2/native/components/DashboardWidgets.tsx', dwCode);
console.log('Script done');
