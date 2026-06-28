export type Lang = 'en';

export const SUPPORTED_LANGS: Lang[] = ['en'];

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
};

// English-only dictionary. The t()/I18nProvider plumbing stays (the landing
// page is wired to it), but the app is single-language by design now.
export const translations: Record<Lang, Record<string, string>> = {
  en: {
    // Nav (landing)
    'nav.features': 'Features',
    'nav.howItWorks': 'How It Works',
    'nav.pricing': 'Pricing',
    'nav.getStarted': 'Get Started',

    // Hero
    'hero.badge': 'Instagram Graph API v25',
    'hero.headline.1': 'Turn Instagram Comments',
    'hero.headline.2': 'Into ',
    'hero.headline.highlight': 'Affiliate Revenue',
    'hero.subtitle.1': 'Auto-reply on comments → Verify follows → Send affiliate link via DM.',
    'hero.subtitle.2': '24/7 automated influencer marketing with zero manual work.',
    'hero.cta.primary': 'Get Started Free →',
    'hero.cta.secondary': 'See How It Works',
    'hero.stat.autoReplies': 'Auto Replies',
    'hero.stat.avgResponse': 'Avg Response',
    'hero.stat.accountLinks': 'Account Links',

    // Features
    'features.title': 'Core Features',
    'features.subtitle': 'All the tools you need to automate your Instagram business',
    'features.autoReply.title': 'Auto Comment Reply',
    'features.autoReply.desc': 'Instantly reply with a preset message when a new comment is posted. Landing page URLs supported.',
    'features.followVerify.title': 'Follow Verification DM',
    'features.followVerify.desc': 'Automatically send DMs to commenters. Convert them into followers with a follow-verify button.',
    'features.affiliate.title': 'Affiliate Link Management',
    'features.affiliate.desc': 'Register affiliate links per product and auto-insert them into DMs. Track conversion rates.',

    // How It Works
    'howItWorks.title': 'How It Works',
    'howItWorks.subtitle': 'Build an automated revenue pipeline in 3 steps',
    'howItWorks.step1.title': 'Connect Instagram',
    'howItWorks.step1.desc': 'Link your Meta Business account and Instagram profile.',
    'howItWorks.step2.title': 'Set Up Auto-Reply',
    'howItWorks.step2.desc': 'Write comment reply templates and DM messages.',
    'howItWorks.step3.title': 'Add Affiliate Links',
    'howItWorks.step3.desc': "Register product affiliate links and they'll be auto-included in DMs.",

    // Pricing
    'pricing.title': 'Simple Pricing',
    'pricing.subtitle': 'Start free for 30 days. Cancel anytime.',
    'pricing.badge': '30 Days Free',
    'pricing.planName': 'DMify',
    'pricing.perMonth': '/month',
    'pricing.billed': 'Billed monthly after free trial',
    'pricing.feature1': 'Multiple Instagram accounts',
    'pricing.feature2': 'Unlimited posts',
    'pricing.feature3': 'Auto DM with affiliate links',
    'pricing.feature4': 'Comment auto-reply',
    'pricing.feature5': 'Follow verification',
    'pricing.feature6': 'Analytics dashboard',
    'pricing.cta': 'Start Free Trial',

    // CTA
    'cta.headline': 'Start Automating Today',
    'cta.subtitle': 'Up and running in 5 minutes. No credit card required to get started.',
    'cta.button': 'Get Started Free →',

    // Footer
    'footer.copyright': '© 2026 DMify. All rights reserved.',
    'footer.terms': 'Terms of Service',
    'footer.privacy': 'Privacy Policy',

    // Dashboard nav
    'dash.nav.dashboard': 'Dashboard',
    'dash.nav.history': 'History',
    'dash.nav.pricing': 'Pricing',
    'dash.nav.posts': 'Posts',
    'dash.nav.accounts': 'Accounts',
    'dash.nav.raffle': 'Raffle',
    'dash.nav.settings': 'Settings',
    'dash.nav.signout': 'Sign Out',
  },
};
