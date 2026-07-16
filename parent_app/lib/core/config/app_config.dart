class AppConfig {
  const AppConfig._();

  static const appName = 'GuardTime Parent';
  static const packageName = 'com.guardtime.parent_app';
  static const apiBaseUrl = 'https://backendparent-production.up.railway.app';
  static const dnsResolverIp = '8.208.89.37';
  static const privacyPolicyUrl = '$apiBaseUrl/legal/privacy-policy';
  static const privacyRequestUrl = '$apiBaseUrl/legal/privacy-request';
  static const networkHeartbeatWindow = Duration(minutes: 10);
}
