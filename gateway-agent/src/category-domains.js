'use strict';

/**
 * Small, representative domain samples per traffic category (Layer 7
 * bandwidth shaping). Same best-effort philosophy as the project's other
 * pattern lists (VPN domains, strict-mode DoH resolvers): not exhaustive,
 * and CDN/anycast IP reuse across unrelated services means resolved IPs can
 * both under- and over-match. "YouTube 1Mbps" from the spec maps to the
 * STREAMING category here, since that's how domains are already classified
 * elsewhere in this system (see backend seed-domains.ts) — there is no
 * separate YOUTUBE category.
 */
const CATEGORY_DOMAINS = {
  GAMING: ['steampowered.com', 'epicgames.com', 'xboxlive.com', 'playstation.net', 'roblox.com'],
  STREAMING: ['youtube.com', 'googlevideo.com', 'netflix.com', 'twitch.tv'],
  SOCIAL: ['instagram.com', 'tiktok.com', 'snapchat.com', 'facebook.com'],
};

function domainsForCategory(category) {
  return CATEGORY_DOMAINS[category] || [];
}

module.exports = { CATEGORY_DOMAINS, domainsForCategory };
