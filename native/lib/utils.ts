export const getPartnerName = (profile: any, partnerProfile: any) => {
    if (profile?.partner_nickname) return profile.partner_nickname;
    if (partnerProfile?.display_name) return partnerProfile.display_name.split(' ')[0];
    return 'Love';
};

export const getTodayIST = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().split('T')[0];
};
