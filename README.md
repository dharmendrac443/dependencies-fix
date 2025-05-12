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

## Screenshots of how to use
### 1. Before Fixing Dependencies

Before running the extension, you may encounter issues where the dependencies in your `pubspec.yaml` file are incompatible, preventing your Flutter project from running or building properly.
<img width="1440" alt="Image" src="https://github.com/user-attachments/assets/f19d1121-9e97-45f8-b604-da739b6cb408" />

### 2. Running the Extension

To run the extension, follow these steps:

1. Open the **Command Palette** in VS Code:
   - On macOS: `Cmd + Shift + P`
   - On Windows/Linux: `Ctrl + Shift + P`
   
2. Search for ` Auto-fix Flutter Dependency Conflicts` and select it.
<img width="1440" alt="Image" src="https://github.com/user-attachments/assets/0a1f6deb-cdab-4b65-99d9-96ae124ba962" />

### 3. After Fixing Dependencies

Once the extension has fixed the dependency conflicts, your `pubspec.yaml` will be updated with compatible versions of the dependencies.
<img width="1440" alt="Image" src="https://github.com/user-attachments/assets/154af9f0-f415-439a-81ea-9ad6aa7da46a" />

