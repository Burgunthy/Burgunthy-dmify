/**
 * Affiliate-disclosure text presets per country (PLAN 7-2).
 *
 * Many jurisdictions require affiliate links to be disclosed. These presets
 * give influencers a one-click starting point; they can also write a custom
 * one. The account's chosen text is prepended to every DM (see buildDmMessage).
 */
export interface DisclosurePreset {
  id: string
  label: string
  text: string
}

export const DISCLOSURE_PRESETS: DisclosurePreset[] = [
  {
    id: 'kr-coupang',
    label: '한국 · 쿠팡 파트너스',
    text: '쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
  },
  {
    id: 'us-ftc',
    label: 'US · FTC',
    text: 'As an affiliate, I may earn a commission from qualifying purchases.',
  },
  {
    id: 'jp',
    label: '日本 · アフィリエイト',
    text: 'この記事にはアフィリエイトリンクが含まれています。',
  },
  {
    id: 'generic',
    label: '범용 · Generic',
    text: 'This message contains affiliate links.',
  },
]
