import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/features/devices/domain/device_model.dart';
import 'package:parent_app/features/protection/domain/protection_score.dart';
import 'package:parent_app/features/router_integration/domain/detected_router_model.dart';
import 'package:parent_app/features/router_integration/domain/router_capabilities_model.dart';
import 'package:parent_app/features/router_integration/domain/router_command_model.dart';
import 'package:parent_app/features/router_integration/domain/router_features_model.dart';
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

  group('Router Integration Engine models', () {
    test('RouterCapabilitiesModel isFullyIntegrated requires both an official API and a shipped plugin', () {
      final implemented = RouterCapabilitiesModel.fromJson({
        'pluginId': 'mikrotik',
        'vendorDisplayName': 'MikroTik',
        'integrationStatus': 'OFFICIAL_API',
        'pluginImplemented': true,
        'protocol': 'RouterOS-REST',
        'supportsDNSChange': true,
        'supportsFirewallRules': true,
        'supportsPauseDevice': true,
        'supportsClientDisconnect': true,
        'supportsQoS': true,
        'supportsParentalControl': false,
        'supportsACL': true,
        'supportsMACFiltering': true,
        'supportsAPI': true,
        'supportsSSH': true,
        'supportsTR064': false,
        'supportsRouterOS': true,
        'supportedAuthentication': ['http-basic-auth'],
      });
      expect(implemented.isOfficialApi, isTrue);
      expect(implemented.isFullyIntegrated, isTrue);
      expect(implemented.flags.firstWhere((f) => f.label == 'Client Disconnect').supported, isTrue);

      final notYetImplemented = RouterCapabilitiesModel.fromJson({
        'pluginId': 'unifi',
        'vendorDisplayName': 'Ubiquiti UniFi',
        'integrationStatus': 'OFFICIAL_API',
        'pluginImplemented': false,
        'supportsDNSChange': false,
        'supportsFirewallRules': false,
        'supportsPauseDevice': false,
        'supportsClientDisconnect': false,
        'supportsQoS': false,
        'supportsParentalControl': false,
        'supportsACL': false,
        'supportsMACFiltering': false,
        'supportsAPI': false,
        'supportsSSH': false,
        'supportsTR064': false,
        'supportsRouterOS': false,
        'supportedAuthentication': [],
      });
      expect(notYetImplemented.isOfficialApi, isTrue);
      expect(notYetImplemented.isFullyIntegrated, isFalse);

      final guideOnly = RouterCapabilitiesModel.fromJson({
        'pluginId': 'netgear',
        'vendorDisplayName': 'Netgear',
        'integrationStatus': 'GUIDE_ONLY',
        'pluginImplemented': false,
        'supportsDNSChange': false,
        'supportsFirewallRules': false,
        'supportsPauseDevice': false,
        'supportsClientDisconnect': false,
        'supportsQoS': false,
        'supportsParentalControl': false,
        'supportsACL': false,
        'supportsMACFiltering': false,
        'supportsAPI': false,
        'supportsSSH': false,
        'supportsTR064': false,
        'supportsRouterOS': false,
        'supportedAuthentication': [],
      });
      expect(guideOnly.isOfficialApi, isFalse);
      expect(guideOnly.isFullyIntegrated, isFalse);
    });

    test('DetectedRouterModel hasBeenDetected reflects whether a vendor was ever found', () {
      final undetected = DetectedRouterModel.fromJson({
        'gatewayId': 'gw-1',
        'integrationStatus': 'UNDETECTED',
      });
      expect(undetected.hasBeenDetected, isFalse);

      final detected = DetectedRouterModel.fromJson({
        'gatewayId': 'gw-1',
        'integrationStatus': 'OFFICIAL_API',
        'vendor': 'MikroTik',
        'confidence': '90',
      });
      expect(detected.hasBeenDetected, isTrue);
      expect(detected.confidence, 90);
    });

    test('RouterFeaturesModel parses a nested capabilities object', () {
      final features = RouterFeaturesModel.fromJson({
        'detected': true,
        'capabilities': {
          'pluginId': 'openwrt',
          'vendorDisplayName': 'OpenWrt',
          'integrationStatus': 'OFFICIAL_API',
          'pluginImplemented': true,
          'protocol': 'ubus-JSONRPC',
          'supportsDNSChange': true,
          'supportsFirewallRules': true,
          'supportsPauseDevice': true,
          'supportsClientDisconnect': true,
          'supportsQoS': true,
          'supportsParentalControl': false,
          'supportsACL': true,
          'supportsMACFiltering': true,
          'supportsAPI': true,
          'supportsSSH': true,
          'supportsTR064': false,
          'supportsRouterOS': false,
          'supportedAuthentication': ['ssh-key'],
        },
      });
      expect(features.detected, isTrue);
      expect(features.capabilities?.vendorDisplayName, 'OpenWrt');
    });

    test('RouterFeaturesModel handles a null capabilities object (undetected router)', () {
      final features = RouterFeaturesModel.fromJson({'detected': false, 'capabilities': null});
      expect(features.detected, isFalse);
      expect(features.capabilities, isNull);
    });

    test('RouterDiagnosticsModel parses recent commands and their result data', () {
      final diagnostics = RouterDiagnosticsModel.fromJson({
        'router': {'vendor': 'MikroTik'},
        'recentCommands': [
          {
            'id': 'cmd-1',
            'type': 'END_GAMING_SESSION',
            'status': 'ACKNOWLEDGED',
            'createdAt': '2026-07-18T00:00:00.000Z',
            'resultData': {'strategyUsed': 'DISCONNECT_CLIENT'},
          },
        ],
      });
      expect(diagnostics.router?['vendor'], 'MikroTik');
      expect(diagnostics.recentCommands, hasLength(1));
      expect(diagnostics.recentCommands.first.status, 'ACKNOWLEDGED');
      expect(diagnostics.recentCommands.first.resultData?['strategyUsed'], 'DISCONNECT_CLIENT');
    });

    test('EndGamingSessionResult parses a successful strategy list', () {
      final result = EndGamingSessionResult.fromJson({
        'enqueued': true,
        'commandId': 'cmd-1',
        'strategies': ['DISCONNECT_CLIENT', 'PAUSE_DEVICE'],
        'reason': null,
      });
      expect(result.enqueued, isTrue);
      expect(result.strategies, ['DISCONNECT_CLIENT', 'PAUSE_DEVICE']);
    });

    test('EndGamingSessionResult parses the not-supported (Guide Only) case', () {
      final result = EndGamingSessionResult.fromJson({
        'enqueued': false,
        'strategies': [],
        'reason': 'This router has no supported control strategy (Guide Only).',
      });
      expect(result.enqueued, isFalse);
      expect(result.strategies, isEmpty);
      expect(result.reason, contains('Guide Only'));
    });
  });
}
