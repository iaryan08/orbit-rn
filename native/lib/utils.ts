export const getPartnerName = (profile: any, partnerProfile: any) => {
    const nickname = profile?.partner_nickname;
    if (typeof nickname === 'string' && nickname.trim()) return nickname.trim();

    const raw =
        partnerProfile?.display_name ||
        partnerProfile?.displayName ||
        partnerProfile?.name ||
        partnerProfile?.nickname ||
        partnerProfile?.first_name ||
        (partnerProfile?.first_name && partnerProfile?.last_name ? `${partnerProfile.first_name} ${partnerProfile.last_name}` : '') ||
        (partnerProfile?.firstName && partnerProfile?.lastName ? `${partnerProfile.firstName} ${partnerProfile.lastName}` : '') ||
        partnerProfile?.full_name ||
        partnerProfile?.username ||
        '';
    if (typeof raw === 'string' && raw.trim()) return raw.trim().split(' ')[0];

    const email = partnerProfile?.email;
    if (typeof email === 'string' && email.includes('@')) {
        return email.split('@')[0];
    }

    return 'Partner';
};

export const getTodayIST = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().split('T')[0];
};

export const parseSafeDate = (dateVal: any): Date | null => {
    if (!dateVal) return null;

    // Handle Firestore Timestamp (native or plain object)
    if (typeof dateVal === 'object') {
        if (typeof dateVal.toMillis === 'function') {
            return new Date(dateVal.toMillis());
        }
        if (typeof dateVal.seconds === 'number') {
            return new Date(dateVal.seconds * 1000 + (dateVal.nanoseconds || 0) / 1000000);
        }
    }

    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
};
