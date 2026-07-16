/// Shared copy constants. Previously duplicated verbatim across six
/// screens (device details, gaming control, full lock, DNS guide,
/// offline checklist, offline guide) with independent drift risk.
abstract final class AppDisclaimers {
  static const offlineGamesNotice =
      'Offline games and consoles without an internet connection can\'t be '
      'blocked through DNS. Use the offline control checklist for these '
      'devices instead.';
}
