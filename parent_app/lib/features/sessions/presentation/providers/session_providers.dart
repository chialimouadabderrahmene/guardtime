import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/features/sessions/data/sessions_repository.dart';
import 'package:parent_app/features/sessions/domain/session_model.dart';

final activeSessionsProvider = FutureProvider<List<SessionModel>>((ref) async {
  return ref.read(sessionsRepositoryProvider).fetchActiveSessions();
});
