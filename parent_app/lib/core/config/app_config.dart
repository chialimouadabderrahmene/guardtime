class AppConfig {
  const AppConfig._();

  static const appName = 'GuardTime Parent';
  static const packageName = 'com.guardtime.parent_app';
  static const apiBaseUrl = 'https://api.waqti.pro';
  // Public IP of the production DNS resolver families point their devices at
  // (the DNS service runs on the same VPS as api.waqti.pro).
  static const dnsResolverIp = '169.58.30.9';
  static const privacyPolicyUrl = '$apiBaseUrl/legal/privacy-policy';
  static const privacyRequestUrl = '$apiBaseUrl/legal/privacy-request';
  static const networkHeartbeatWindow = Duration(minutes: 10);
}
