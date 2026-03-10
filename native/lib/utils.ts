export const getPartnerName = (profile: any, partnerProfile: any) => {
    if (profile?.partner_nickname) return profile.partner_nickname;
    if (partnerProfile?.display_name) return partnerProfile.display_name.split(' ')[0];
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
