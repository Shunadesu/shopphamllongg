import { Helmet } from 'react-helmet-async';

export default function SEOHead({
  title,
  description,
  keywords,
  ogImage,
  twitterCard = 'summary',
  canonical,
  type = 'website',
}) {
  const siteName = 'PhamLongFCO';
  const defaultDescription = 'PhamLongFCO - Shop Pham Long chuyên mua bán tài khoản FC Online giá rẻ, uy tín, chất lượng. Giao dịch tự động 24/7.';
  const defaultKeywords = 'phamlongfco, pham long fco, shop pham long, shop phạm long, shopphamlong, mua tai khoan fc online, ban tai khoan fc online, shop fc online';
  const defaultOgImage = 'https://phamlongfco.com/favicon-512x512.png';

  const fullTitle = title ? `${title} | ${siteName}` : `${siteName} - Shop Pham Long | Mua Bán Tài Khoản FC Online Giá Rẻ`;
  const metaDescription = description || defaultDescription;
  const metaKeywords = keywords || defaultKeywords;
  const metaOgImage = ogImage || defaultOgImage;

  return (
    <Helmet>
      {/* Basic */}
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />
      <meta name="keywords" content={metaKeywords} />

      {/* Canonical URL */}
      {canonical && <link rel="canonical" href={canonical} />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={metaOgImage} />
      <meta property="og:site_name" content={siteName} />
      {canonical && <meta property="og:url" content={canonical} />}

      {/* Twitter */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={metaOgImage} />
    </Helmet>
  );
}
