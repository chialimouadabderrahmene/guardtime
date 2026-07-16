import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/features/children/data/children_repository.dart';
import 'package:parent_app/features/children/domain/child_model.dart';

final childrenListProvider = FutureProvider<List<ChildModel>>((ref) async {
  return ref.read(childrenRepositoryProvider).fetchChildren();
});

final childDetailsProvider = FutureProvider.family<ChildModel, String>((
  ref,
  childId,
) async {
  return ref.read(childrenRepositoryProvider).fetchChild(childId);
});
