# Flutter Dependency Updater for VS Code

## 🔧 Features

This VS Code extension automatically:

- Scans your `pubspec.yaml` for outdated dependencies
- Fetches the latest versions from [pub.dev](https://pub.dev)
- Updates the versions inline
- Highlights updated lines with a soft green background
- Runs `flutter pub get` automatically after update

## 🧠 Smart Conflict Fixing

If your `pubspec.yaml` includes a version that:
- Doesn’t exist on pub.dev
- Is incorrectly typed (e.g., `^2.9.99` when the latest is `^2.1.0`)
- Refers to a yanked version

The extension will **automatically correct it** by replacing it with the latest valid version from pub.dev.

## ✨ Inline Highlighting

Updated lines in `pubspec.yaml` are **temporarily highlighted** in light green, making it easy to see what has changed. The highlight disappears after 5 seconds.

## 🚀 How to Use

1. Open your Flutter project in VS Code.
2. Make sure your project has a valid `pubspec.yaml` file.
3. Press `Ctrl + Shift + P` (or `Cmd + Shift + P` on macOS).
4. Search:  Auto-fix Flutter Dependency Conflicts

The extension will:
- Parse your dependencies and dev_dependencies.
- Check each package’s latest version from pub.dev.
- Update outdated versions (preserving the `^` symbol).
- Highlight the updated lines.
- Run `flutter pub get`.
