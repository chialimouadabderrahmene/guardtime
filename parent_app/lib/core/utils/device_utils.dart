import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

String deviceLabel(String type) {
  return switch (type) {
    'ANDROID_PHONE' => 'Android Phone',
    'ANDROID_TABLET' => 'Android Tablet',
    'IPHONE' => 'iPhone',
    'IPAD' => 'iPad',
    'XBOX' => 'Xbox',
    'PLAYSTATION' => 'PlayStation',
    'NINTENDO' => 'Nintendo Switch',
    'STEAM_DECK' => 'Steam Deck',
    'PC' => 'Windows PC',
    'MAC' => 'Mac',
    'SMART_TV' => 'Smart TV',
    'STREAMING_BOX' => 'Streaming Box',
    _ => 'Other Device',
  };
}

IconData deviceIcon(String type) {
  return switch (type) {
    'ANDROID_PHONE' || 'IPHONE' => Icons.smartphone_rounded,
    'ANDROID_TABLET' || 'IPAD' => Icons.tablet_mac_rounded,
    'PC' => Icons.desktop_windows_rounded,
    'MAC' || 'STEAM_DECK' => Icons.laptop_mac_rounded,
    'SMART_TV' || 'STREAMING_BOX' => Icons.tv_rounded,
    'XBOX' || 'PLAYSTATION' || 'NINTENDO' => Icons.sports_esports_rounded,
    _ => Icons.devices_other_rounded,
  };
}

Color deviceAccent(String type) {
  return switch (type) {
    'PLAYSTATION' || 'NINTENDO' => AppPalette.brass300,
    'XBOX' => AppPalette.success,
    'SMART_TV' || 'STREAMING_BOX' => AppPalette.brand200,
    _ => AppPalette.brand400,
  };
}

bool hasOfflineLimitations(String type) {
  return switch (type) {
    'PLAYSTATION' ||
    'NINTENDO' ||
    'STEAM_DECK' ||
    'PC' ||
    'MAC' ||
    'SMART_TV' ||
    'STREAMING_BOX' => true,
    _ => false,
  };
}

/// Maps a device type to the network/DNS setup guide platform key served by
/// the backend (`/platform-support/guides/:platform`). Each family routes to
/// its own verified 2026 guide instead of a generic router fallback.
String guidePlatformForDeviceType(String type) {
  return switch (type) {
    'PLAYSTATION' => 'PLAYSTATION',
    'NINTENDO' => 'NINTENDO',
    'XBOX' => 'XBOX',
    'IPHONE' || 'IPAD' => 'IOS',
    'ANDROID_PHONE' || 'ANDROID_TABLET' => 'ANDROID',
    'PC' => 'WINDOWS',
    'MAC' => 'MACOS',
    'STEAM_DECK' => 'STEAM_DECK',
    'SMART_TV' || 'STREAMING_BOX' => 'SMART_TV',
    _ => 'ROUTER',
  };
}
