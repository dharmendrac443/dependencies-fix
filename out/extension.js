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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const semver = __importStar(require("semver"));
const axios_1 = __importDefault(require("axios"));
const exec = require('child_process').exec;
// Get workspace root path
function getWorkspacePath() {
    return vscode.workspace.workspaceFolders?.[0].uri.fsPath;
}
function isSdkDependency(pkg) {
    return ['flutter', 'flutter_test', 'flutter_driver'].includes(pkg);
}
// Parse YAML files with error handling
async function parseYaml(filePath) {
    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return yaml.load(content);
    }
    catch (error) {
        vscode.window.showErrorMessage(`Error parsing ${path.basename(filePath)}: ${error}`);
        return null;
    }
}
// New feature: Check for cross-package compatibility
// This function checks if the package versions are compatible with each other
// Add this function to check cross-package compatibility
async function checkCrossPackageCompatibility(conflicts) {
    const compatibilityMatrix = await buildCompatibilityMatrix();
    const workspacePath = getWorkspacePath();
    if (!workspacePath)
        return [];
    const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
    const pubspec = await parseYaml(pubspecPath);
    if (!pubspec)
        return [];
    const allDependencies = {
        ...pubspec.dependencies,
        ...pubspec.dev_dependencies
    };
    const enhancedConflicts = [];
    for (const conflict of conflicts) {
        const packageName = conflict.package;
        const currentVersion = allDependencies[packageName]?.version ||
            allDependencies[packageName]?.toString();
        const compatibleVersions = await findCompatibleVersions(packageName, currentVersion, allDependencies, compatibilityMatrix);
        if (compatibleVersions.length > 0) {
            enhancedConflicts.push({
                package: packageName,
                required: {
                    ...conflict.required,
                    compatibility: compatibleVersions.join(', ')
                }
            });
        }
    }
    return enhancedConflicts;
}
// Build compatibility matrix from pub.dev data
async function buildCompatibilityMatrix() {
    const matrix = {};
    const workspacePath = getWorkspacePath();
    if (!workspacePath)
        return matrix;
    const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
    const pubspec = await parseYaml(pubspecPath);
    if (!pubspec)
        return matrix;
    const allDependencies = {
        ...pubspec.dependencies,
        ...pubspec.dev_dependencies
    };
    for (const [pkgName] of Object.entries(allDependencies)) {
        try {
            const response = await axios_1.default.get(`https://pub.dev/api/packages/${pkgName}`);
            matrix[pkgName] = {};
            for (const versionData of response.data.versions) {
                matrix[pkgName][versionData.version] = {
                    compatibleWith: versionData.pubspec.dependencies || {}
                };
            }
        }
        catch (error) {
            console.error(`Error fetching compatibility data for ${pkgName}:`, error);
        }
    }
    return matrix;
}
// Find versions compatible with other dependencies
async function findCompatibleVersions(packageName, currentVersion, allDependencies, compatibilityMatrix) {
    const compatibleVersions = [];
    const versions = await fetchPackageVersions(packageName);
    for (const version of versions) {
        let isCompatible = true;
        const versionDeps = compatibilityMatrix[packageName]?.[version]?.compatibleWith || {};
        for (const [depName, depConstraint] of Object.entries(versionDeps)) {
            if (allDependencies[depName]) {
                const currentDepVersion = allDependencies[depName]?.version ||
                    allDependencies[depName]?.toString();
                if (!semver.satisfies(currentDepVersion, depConstraint)) {
                    isCompatible = false;
                    break;
                }
            }
        }
        if (isCompatible) {
            compatibleVersions.push(version);
        }
    }
    return compatibleVersions.sort(semver.rcompare);
}
// Enhanced conflict resolution
async function resolveEnhancedConflicts(conflict) {
    try {
        // First try basic version resolution
        const basicSolution = await resolveOptimalVersion(conflict);
        if (basicSolution)
            return basicSolution;
        // If basic resolution fails, check cross-package compatibility
        const compatibilityMatrix = await buildCompatibilityMatrix();
        const workspacePath = getWorkspacePath();
        if (!workspacePath)
            return null;
        const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
        const pubspec = await parseYaml(pubspecPath);
        if (!pubspec)
            return null;
        const allDependencies = {
            ...pubspec.dependencies,
            ...pubspec.dev_dependencies
        };
        const compatibleVersions = await findCompatibleVersions(conflict.package, allDependencies[conflict.package], allDependencies, compatibilityMatrix);
        if (compatibleVersions.length > 0) {
            return compatibleVersions[0];
        }
        return null;
    }
    catch (error) {
        vscode.window.showErrorMessage(`Enhanced resolution failed: ${error}`);
        return null;
    }
}
// Check if the package is an SDK dependency
// Get transitive dependencies from pubspec.lock
async function getTransitiveDependencies() {
    const workspacePath = getWorkspacePath();
    if (!workspacePath)
        return [];
    const lockfilePath = path.join(workspacePath, 'pubspec.lock');
    if (!fs.existsSync(lockfilePath))
        return [];
    const lockfile = await parseYaml(lockfilePath);
    const packages = [];
    if (lockfile?.packages) {
        for (const [pkgName, pkgData] of Object.entries(lockfile.packages)) {
            packages.push({
                name: pkgName,
                sources: [{
                        source: 'root',
                        constraint: pkgData.version
                    }]
            });
        }
    }
    return packages;
}
// Detect conflicts in dependencies
async function getDependencyConflicts() {
    const workspacePath = getWorkspacePath();
    if (!workspacePath)
        return [];
    const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
    const pubspec = await parseYaml(pubspecPath);
    if (!pubspec)
        return [];
    const conflicts = [];
    const allDeps = await getTransitiveDependencies();
    // Analyze direct dependencies
    const directDeps = {
        ...pubspec.dependencies,
        ...pubspec.dev_dependencies
    };
    allDeps.push(...Object.entries(directDeps).map(([name, constraint]) => {
        let constraintValue = '';
        // Handle the constraint types
        if (typeof constraint === 'string') {
            constraintValue = constraint;
        }
        else if (constraint && typeof constraint === 'object' && 'version' in constraint) {
            const versionConstraint = constraint;
            constraintValue = versionConstraint.version;
        }
        else {
            console.warn(`Unknown constraint format for ${name}`);
            constraintValue = '*'; // Default if format is not recognized
        }
        return {
            name,
            sources: [{
                    source: 'pubspec.yaml',
                    constraint: constraintValue,
                }],
        };
    }));
    const depMap = new Map();
    allDeps.forEach(pkg => {
        if (!depMap.has(pkg.name)) {
            depMap.set(pkg.name, new Set());
        }
        pkg.sources.forEach(source => {
            depMap.get(pkg.name)?.add(source.constraint);
        });
    });
    depMap.forEach((constraints, pkgName) => {
        if (isSdkDependency(pkgName))
            return;
        if (constraints.size > 1) {
            conflicts.push({
                package: pkgName,
                required: Array.from(constraints).reduce((acc, curr, idx) => {
                    acc[`source_${idx}`] = curr;
                    return acc;
                }, {})
            });
        }
    });
    return conflicts;
}
// Convert Flutter constraints to semver format
function convertToSemverRange(flutterConstraint) {
    if (!flutterConstraint)
        return '*';
    const cleaned = flutterConstraint
        .replace(/\bany\b/g, '*')
        .replace(/^([\d.]+)$/, '^$1') // Convert exact version to caret
        .replace(/\s+/g, ' ')
        .trim();
    try {
        return new semver.Range(cleaned).range || '*';
    }
    catch {
        return '*';
    }
}
// Resolve optimal version using semver intersection
async function resolveOptimalVersion(conflict) {
    try {
        const versions = await fetchPackageVersions(conflict.package);
        if (!versions.length)
            return null;
        const ranges = Object.values(conflict.required)
            .map(c => convertToSemverRange(c))
            .filter(r => r !== '*');
        if (!ranges.length)
            return versions[0];
        let validRange = ranges[0];
        for (const range of ranges.slice(1)) {
            validRange = semver.validRange(semver.intersects(validRange, range) ? validRange : null);
            if (!validRange)
                break;
        }
        if (!validRange)
            return null;
        const validVersions = versions.filter(v => semver.satisfies(v, validRange));
        return validVersions[0] || null;
    }
    catch (error) {
        vscode.window.showErrorMessage(`Version resolution failed for ${conflict.package}: ${error}`);
        return null;
    }
}
// Fetch package versions from pub.dev
async function fetchPackageVersions(pkgName) {
    try {
        const response = await axios_1.default.get(`https://pub.dev/api/packages/${pkgName}`);
        return response.data.versions.map((v) => v.version).sort(semver.rcompare);
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to fetch versions for ${pkgName}: ${error}`);
        return [];
    }
}
// Update pubspec.yaml with resolved version
async function updatePubspec(pkgName, version) {
    const workspacePath = getWorkspacePath();
    if (!workspacePath)
        return;
    const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
    const doc = await vscode.workspace.openTextDocument(pubspecPath);
    const text = doc.getText();
    const versionPattern = new RegExp(`^([ \\t]*${pkgName}:\\s*)([\\^>=<~]*)([0-9a-zA-Z\\.-]+)`, 'm');
    const newText = text.replace(versionPattern, `$1$2${version}`);
    if (text === newText) {
        vscode.window.showInformationMessage(`No changes made to ${pkgName}`);
        return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), newText);
    await vscode.workspace.applyEdit(edit);
}
// Main conflict resolution handler
async function autoFixConflicts() {
    try {
        let conflicts = await getDependencyConflicts();
        // Check for cross-package compatibility issues
        const compatibilityConflicts = await checkCrossPackageCompatibility(conflicts);
        conflicts = [...conflicts, ...compatibilityConflicts];
        if (!conflicts.length) {
            vscode.window.showInformationMessage('No dependency conflicts found!');
            return;
        }
        for (const conflict of conflicts) {
            const solution = await resolveOptimalVersion(conflict);
            if (solution) {
                await updatePubspec(conflict.package, solution);
                vscode.window.showInformationMessage(`Resolved ${conflict.package}@${solution}`);
            }
            else {
                vscode.window.showErrorMessage(`Could not resolve ${conflict.package}: ` +
                    `Conflicting requirements: ${Object.values(conflict.required).join(', ')}`);
            }
        }
        // Get the workspace root path (project root)
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {
            vscode.window.showErrorMessage('Project root not found.');
            return;
        }
        // Set the working directory to the root of the Flutter project
        process.chdir(workspacePath);
        // Run `flutter pub get` after resolving all conflicts
        exec('flutter pub get', (error, stdout, stderr) => {
            if (error) {
                vscode.window.showErrorMessage(`Error running flutter pub get: ${stderr}`);
                return;
            }
            vscode.window.showInformationMessage('Dependencies updated successfully!');
        });
        await vscode.commands.executeCommand('workbench.action.files.saveAll');
    }
    catch (error) {
        vscode.window.showErrorMessage(`Auto-fix failed: ${error}`);
    }
}
// Extension activation
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('flutterDepFixer.autoFix', autoFixConflicts));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (doc) => {
        if (doc.fileName.endsWith('pubspec.yaml')) {
            await vscode.commands.executeCommand('flutterDepFixer.autoFix');
        }
    }));
}
//# sourceMappingURL=extension.js.map