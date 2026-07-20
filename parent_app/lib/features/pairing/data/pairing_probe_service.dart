import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

/// Sends the DNS auto-pairing probe: one raw UDP DNS query, straight to the
/// resolver's IP, for the hostname `<token>.pair.guardtime.local`.
///
/// Why raw UDP instead of the platform's normal DNS lookup APIs: a device's
/// OS resolver has no way to carry an app-level token, and during pairing
/// the monitored device isn't even pointed at GuardTime's resolver yet.
/// Sending this probe *from the parent's phone, over the same household
/// WiFi/WAN egress* means it arrives with the household's shared public IP
/// — exactly the value the backend needs to register (same pattern NextDNS
/// calls "Linked IP"). See backend/src/pairing/pairing.constants.ts for the
/// full rationale and the matching hostname pattern the resolver expects.
class PairingProbeResult {
  const PairingProbeResult({required this.sent, this.error});

  final bool sent;
  final String? error;
}

class PairingProbeService {
  static const _dnsPort = 53;
  static const _replyTimeout = Duration(seconds: 2);

  Future<PairingProbeResult> sendProbe({
    required String resolverHost,
    required String pairDomainSuffix,
    required String token,
  }) async {
    RawDatagramSocket? socket;
    StreamSubscription<RawSocketEvent>? subscription;
    try {
      final address =
          InternetAddress.tryParse(resolverHost) ??
          (await InternetAddress.lookup(resolverHost)).first;

      socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      final packet = _buildQuery('$token.$pairDomainSuffix');
      socket.send(packet, address, _dnsPort);

      // Best-effort: a reply here just proves the probe reached the
      // resolver's UDP port. It is not the pairing confirmation — that
      // comes from polling GET /devices/:id/pair/status, since a strict
      // firewall dropping the reply doesn't mean the backend never saw it.
      final completer = Completer<void>();
      subscription = socket.listen((event) {
        if (event == RawSocketEvent.read) {
          socket?.receive();
          if (!completer.isCompleted) completer.complete();
        }
      });
      await completer.future.timeout(_replyTimeout, onTimeout: () {});

      return const PairingProbeResult(sent: true);
    } catch (e) {
      return PairingProbeResult(sent: false, error: e.toString());
    } finally {
      await subscription?.cancel();
      socket?.close();
    }
  }

  Uint8List _buildQuery(String domain) {
    final id = Random().nextInt(0xFFFF);
    final labels = domain.split('.').where((l) => l.isNotEmpty);

    final nameBytes = <int>[];
    for (final label in labels) {
      final bytes = label.codeUnits;
      nameBytes.add(bytes.length);
      nameBytes.addAll(bytes);
    }
    nameBytes.add(0);

    final header = ByteData(12);
    header.setUint16(0, id);
    header.setUint16(2, 0x0100); // standard query, recursion desired
    header.setUint16(4, 1); // QDCOUNT = 1

    final question = ByteData(4);
    question.setUint16(0, 1); // QTYPE  = A
    question.setUint16(2, 1); // QCLASS = IN

    return Uint8List.fromList([
      ...header.buffer.asUint8List(),
      ...nameBytes,
      ...question.buffer.asUint8List(),
    ]);
  }
}
