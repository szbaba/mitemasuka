import 'package:flutter_test/flutter_test.dart';
import 'package:mitemasuka_app/main.dart';

void main() {
  testWidgets('MitemasukaApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const MitemasukaApp());
    expect(find.text('Beni Goruyor Musun?'), findsOneWidget);
  });
}
