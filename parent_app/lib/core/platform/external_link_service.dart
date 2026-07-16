import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

final externalLinkServiceProvider = Provider<ExternalLinkService>((ref) {
  return const ExternalLinkService();
});

class ExternalLinkService {
  const ExternalLinkService();

  Future<bool> openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) {
      return false;
    }
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }
}
