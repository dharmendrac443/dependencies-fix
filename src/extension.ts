import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as yaml from 'js-yaml';

// Setup output channel
const outputChannel = vscode.window.createOutputChannel('Flutter Dep Updater');

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0].uri.fsPath;
}

async function runCommand(command: string): Promise<string> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) {
    outputChannel.appendLine('No workspace folder found.');
    return Promise.reject('No workspace folder found.');
  }

  const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
  if (!fs.existsSync(pubspecPath)) {
    outputChannel.appendLine('No Flutter project found. Ensure you are inside a valid Flutter project directory.');
    return Promise.reject('No Flutter project found.');
  }

  return new Promise((resolve, reject) => {
    exec(command, { cwd: workspacePath }, (error, stdout, stderr) => {
      if (error) {
        outputChannel.appendLine(`Error: ${stderr}`);
        reject(stderr);
      } else {
        outputChannel.appendLine(stdout);
        resolve(stdout);
      }
    });
  });
}

async function getLatestVersion(packageName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(`https://pub.dev/api/packages/${packageName}`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response.latest.version);
        } catch (e) {
          reject(`Failed to parse response for ${packageName}`);
        }
      });
    }).on('error', (err) => reject(err));
  });
}

async function updateAllDependencies() {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) {
    vscode.window.showErrorMessage('No workspace found.');
    return;
  }

  const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
  let pubspecContent = fs.readFileSync(pubspecPath, 'utf-8');
  const lines = pubspecContent.split('\n');

  let insideDependencies = false;
  let insideDevDependencies = false;
  const updatedLineIndices: number[] = []; // Track indices of updated lines

  const updatedLines = await Promise.all(
    lines.map(async (line, index) => { // Added index parameter
      const trimmed = line.trim();

      if (/^\s*version:/.test(trimmed)) {
        return line;
      }

      if (/^dependencies:\s*$/.test(trimmed)) {
        insideDependencies = true;
        insideDevDependencies = false;
        return line;
      } else if (/^dev_dependencies:\s*$/.test(trimmed)) {
        insideDevDependencies = true;
        insideDependencies = false;
        return line;
      } else if (/^[a-zA-Z_]+:/.test(trimmed) && !/^\s/.test(line)) {
        insideDependencies = false;
        insideDevDependencies = false;
      }

      if ((insideDependencies || insideDevDependencies) && /^(\s*)([a-zA-Z0-9_]+):\s*(\^?\d+\.\d+\.\d+)(\s*)$/.test(line)) {
        const match = line.match(/^(\s*)([a-zA-Z0-9_]+):\s*(\^?\d+\.\d+\.\d+)(\s*)$/);
        if (match) {
          const [, indent, pkg, currentVersion, space] = match;
          try {
            const latestVersion = await getLatestVersion(pkg);
            if (latestVersion !== currentVersion.replace('^', '')) {
              outputChannel.appendLine(`Updated ${pkg} to ^${latestVersion}`);
              updatedLineIndices.push(index); // Track the line index
              return `${indent}${pkg}: ^${latestVersion}${space}`;
            }
          } catch (e) {
            outputChannel.appendLine(`Skipped ${pkg}: ${e}`);
          }
        }
      }

      return line;
    })
  );

  const updatedContent = updatedLines.join('\n');
  fs.writeFileSync(pubspecPath, updatedContent, 'utf-8');

  outputChannel.appendLine('pubspec.yaml updated. Running flutter pub get...');
  await runCommand(`flutter pub get`);

  // Highlight updated lines
  if (updatedLineIndices.length > 0) {
    const uri = vscode.Uri.file(pubspecPath);
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);
      
      // Create decoration type with background color
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(144, 238, 144, 0.3)' // Light green highlight
      });
      
      // Create decorations for each updated line
      const decorations = updatedLineIndices.map(lineIndex => {
        const line = document.lineAt(lineIndex);
        return { range: line.range };
      });
      
      editor.setDecorations(decorationType, decorations);
      
      // Remove decorations after 5 seconds
      setTimeout(() => {
        decorationType.dispose();
      }, 5000);
    } catch (error) {
      outputChannel.appendLine(`Error highlighting lines: ${error}`);
    }
  }

  vscode.window.showInformationMessage('Dependencies updated successfully!');
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('flutterDepFixer.autoFix', async () => {
      outputChannel.show();
      outputChannel.clear();
      await updateAllDependencies();
    })
  );
}

export function deactivate() {}