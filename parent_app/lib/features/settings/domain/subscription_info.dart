class SubscriptionInfo {
  const SubscriptionInfo({required this.plan, required this.active});

  final String plan;
  final bool active;

  String get badgeLabel => plan.toUpperCase();

  factory SubscriptionInfo.fromJson(Map<String, dynamic> json) {
    return SubscriptionInfo(
      plan: json['plan'] as String? ?? 'FREE',
      active: json['active'] as bool? ?? false,
    );
  }
}
