"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const https = __importStar(require("https"));
// Setup output channel
const outputChannel = vscode.window.createOutputChannel('Flutter Dep Updater');
function getWorkspacePath() {
    return vscode.workspace.workspaceFolders?.[0].uri.fsPath;
}
async function runCommand(command) {
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
        (0, child_process_1.exec)(command, { cwd: workspacePath }, (error, stdout, stderr) => {
            if (error) {
                outputChannel.appendLine(`Error: ${stderr}`);
                reject(stderr);
            }
            else {
                outputChannel.appendLine(stdout);
                resolve(stdout);
            }
        });
    });
}
async function getLatestVersion(packageName) {
    return new Promise((resolve, reject) => {
        https.get(`https://pub.dev/api/packages/${packageName}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response.latest.version);
                }
                catch (e) {
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
    const updatedLineIndices = []; // Track indices of updated lines
    const updatedLines = await Promise.all(lines.map(async (line, index) => {
        const trimmed = line.trim();
        if (/^\s*version:/.test(trimmed)) {
            return line;
        }
        if (/^dependencies:\s*$/.test(trimmed)) {
            insideDependencies = true;
            insideDevDependencies = false;
            return line;
        }
        else if (/^dev_dependencies:\s*$/.test(trimmed)) {
            insideDevDependencies = true;
            insideDependencies = false;
            return line;
        }
        else if (/^[a-zA-Z_]+:/.test(trimmed) && !/^\s/.test(line)) {
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
                }
                catch (e) {
                    outputChannel.appendLine(`Skipped ${pkg}: ${e}`);
                }
            }
        }
        return line;
    }));
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
        }
        catch (error) {
            outputChannel.appendLine(`Error highlighting lines: ${error}`);
        }
    }
    vscode.window.showInformationMessage('Dependencies updated successfully!');
}
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('flutterDepFixer.autoFix', async () => {
        outputChannel.show();
        outputChannel.clear();
        await updateAllDependencies();
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map