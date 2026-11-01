const GAME_PASS_TIERS = ['game-pass-essential', 'game-pass-premium', 'game-pass-pc', 'game-pass-ultimate']
const PS_PLUS_TIERS = ['ps-plus-basic', 'ps-plus-extra', 'ps-plus-premium']
const SUBSCRIPTION_SERVICES = ['game-pass', ...GAME_PASS_TIERS, ...PS_PLUS_TIERS]
const membershipDefaults = () => ({ timeZone: null, gamePass: { tier: 'none', activeUntil: null }, psPlus: { tier: 'none', activeUntil: null } })
module.exports = { GAME_PASS_TIERS, PS_PLUS_TIERS, SUBSCRIPTION_SERVICES, membershipDefaults }
