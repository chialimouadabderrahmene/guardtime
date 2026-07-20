class AppConfig {
  const AppConfig._();

  static const appName = 'GuardTime Parent';
  static const packageName = 'com.guardtime.parent_app';
  static const apiBaseUrl = 'https://api.waqti.pro';
  // Public IP of the production DNS resolver families point their devices at
  // (the DNS service runs on the same VPS as api.waqti.pro).
  static const dnsResolverIp = '169.58.30.9';
  // Must match backend's PAIR_DOMAIN_SUFFIX (backend/src/pairing/pairing.constants.ts)
  // and dns-service's PAIR_DOMAIN_SUFFIX (dns-service/src/resolver.ts).
  static const pairDomainSuffix = 'pair.guardtime.local';
  static const privacyPolicyUrl = '$apiBaseUrl/legal/privacy-policy';
  static const privacyRequestUrl = '$apiBaseUrl/legal/privacy-request';
  static const networkHeartbeatWindow = Duration(minutes: 10);
}
