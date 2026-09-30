import { Helmet } from 'react-helmet-async';
import { useSettingsStore } from '../store/data/settingsStore';

// Single source of SEO truth.
//
// Precedence (highest → lowest):
//   1. Page-level prop  (e.g. <SEOHead title={account.title} /> in AccountDetail)
//   2. Admin Settings   (saved via /admin → /api/settings → useSettingsStore)
//   3. Hardcoded fallback (only for fields the admin never set)
//
// Before this change, every page (Home, Shop, Cart, Checkout, Profile) was
// overriding the SEOHead with hardcoded strings, which meant whatever the
// admin saved in Settings → SEO never reached the user's tab title / meta tags.
// Now SEOHead reads from useSettingsStore directly, so admin SEO flows all
// the way through without each page having to wire up a fetch.
export default function SEOHead({
  title,
  description,
  keywords,
  ogImage,
  twitterCard,
  canonical,
  type = 'website',
}) {
  const settings = useSettingsStore((s) => s.settings);

  const finalTitle = title ?? settings?.seoTitle;
  const finalDescription = description ?? settings?.seoDescription;
  const finalKeywords = keywords ?? settings?.seoKeywords;
  const finalOgImage = ogImage ?? settings?.ogImage;
  const finalTwitterCard = twitterCard ?? settings?.twitterCard ?? 'summary';
  const finalCanonical = canonical ?? settings?.seoCanonical;
  const finalSiteName = settings?.siteName || 'PhamLongFCO';

  // Fallbacks — only used if the admin hasn't filled in the corresponding
  // settings field. Static because they describe the site (not the page) and
  // changing them would require a DB write.
  const defaultDescription =
    'PhamLongFCO - Shop Pham Long chuyên mua bán tài khoản FC Online giá rẻ, uy tín, chất lượng. Giao dịch tự động 24/7.';
  const defaultKeywords =
    'phamlongfco, pham long fco, shop pham long, shop phạm long, shopphamlong, mua tai khoan fc online, ban tai khoan fc online, shop fc online';
  const defaultOgImage = 'https://phamlongfco.com/favicon-512x512.png';

  const fullTitle = finalTitle
    ? `${finalTitle} | ${finalSiteName}`
    : `${finalSiteName} - Shop Pham Long | Mua Bán Tài Khoản FC Online Giá Rẻ`;
  const metaDescription = finalDescription || defaultDescription;
  const metaKeywords = finalKeywords || defaultKeywords;
  const metaOgImage = finalOgImage || defaultOgImage;

  return (
    <Helmet>
      {/* Basic */}
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />
      <meta name="keywords" content={metaKeywords} />

      {/* Canonical URL */}
      {finalCanonical && <link rel="canonical" href={finalCanonical} />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={metaOgImage} />
      <meta property="og:site_name" content={finalSiteName} />
      {finalCanonical && <meta property="og:url" content={finalCanonical} />}

      {/* Twitter */}
      <meta name="twitter:card" content={finalTwitterCard} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={metaOgImage} />
    </Helmet>
  );
}