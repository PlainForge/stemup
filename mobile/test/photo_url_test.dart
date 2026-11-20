import 'package:flutter_test/flutter_test.dart';
import 'package:stemup/models/models.dart';
import 'package:stemup/widgets/common.dart';

void main() {
  test('default avatar is requested as a large PNG (ui-avatars returns SVG once size is set)', () {
    final uri = Uri.parse(optimizePhoto(defaultAvatar));
    expect(uri.queryParameters['format'], 'png');
    expect(uri.queryParameters['size'], '512');
    expect(uri.queryParameters['name'], 'User');
  });

  test('Google photos are upscaled, other URLs are untouched', () {
    expect(optimizePhoto('https://lh3.googleusercontent.com/a/abc=s96-c'), 'https://lh3.googleusercontent.com/a/abc=s400-c');
    const storage = 'https://firebasestorage.googleapis.com/v0/b/x/o/profilePictures%2Fu1?alt=media&token=t';
    expect(optimizePhoto(storage), storage);
  });
}
