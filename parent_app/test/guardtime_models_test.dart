import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/features/devices/domain/device_model.dart';
import 'package:parent_app/features/protection/domain/protection_score.dart';
import 'package:parent_app/features/settings/domain/parent_profile.dart';

void main() {
  test('device dnsConnected becomes true for recent heartbeat', () {
    final device = DeviceModel.fromJson({
      'id': 'device-1',
      'name': 'Xbox',
      'type': 'XBOX',
      'dnsConfigured': true,
      'lastDnsSeenAt': DateTime.now()
          .subtract(const Duration(minutes: 2))
          .toIso8601String(),
    });

    expect(device.dnsConnected, isTrue);
  });

  test('parent profile displayName trims empty values', () {
    const profile = ParentProfile(
      id: 'parent-1',
      email: 'parent@example.com',
      firstName: 'Ada',
      lastName: '  ',
    );

    expect(profile.displayName, 'Ada');
  });

  test('protection score parses breakdown values', () {
    final score = ProtectionScore.fromJson({
      'score': 81,
      'level': 'HIGH',
      'breakdown': {'dnsVisibility': 30, 'lockState': 15},
    });

    expect(score.score, 81);
    expect(score.level, 'HIGH');
    expect(score.breakdown['dnsVisibility'], 30);
  });
}
