import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as semver from 'semver';
import axios from 'axios';
const exec = require('child_process').exec;

// Interface for dependency conflicts
interface DependencyConflict {
  package: string;
  required: { [source: string]: string };
}

// Interface for package dependency sources
interface PackageSource {
  name: string;
  sources: Array<{
    source: string;
    constraint: string;
  }>;
}

// Interface for the constraint structure
interface VersionConstraint {
  version: string;
}

interface PackageManifest {
  name: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface CompatibilityMatrix {
  [packageName: string]: {
    [version: string]: {
      compatibleWith: {
        [dependencyName: string]: string;
      };
    };
  };
}

// Get workspace root path
function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0].uri.fsPath;
}

function isSdkDependency(pkg: string): boolean {
  return ['flutter', 'flutter_test', 'flutter_driver'].includes(pkg);
}

// Parse YAML files with error handling
async function parseYaml(filePath: string): Promise<any> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return yaml.load(content);
  } catch (error) {
    vscode.window.showErrorMessage(`Error parsing ${path.basename(filePath)}: ${error}`);
    return null;
  }
}

// New feature: Check for cross-package compatibility
// This function checks if the package versions are compatible with each other
// Add this function to check cross-package compatibility
async function checkCrossPackageCompatibility(conflicts: DependencyConflict[]): Promise<DependencyConflict[]> {
  const compatibilityMatrix = await buildCompatibilityMatrix();
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return [];

  const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
  const pubspec = await parseYaml(pubspecPath);
  if (!pubspec) return [];

  const allDependencies = {
    ...pubspec.dependencies,
    ...pubspec.dev_dependencies
  };

  const enhancedConflicts: DependencyConflict[] = [];

  for (const conflict of conflicts) {
    const packageName = conflict.package;
    const currentVersion = allDependencies[packageName]?.version || 
      (allDependencies[packageName] as any)?.toString();

    const compatibleVersions = await findCompatibleVersions(
      packageName,
      currentVersion,
      allDependencies,
      compatibilityMatrix
    );

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
async function buildCompatibilityMatrix(): Promise<CompatibilityMatrix> {
  const matrix: CompatibilityMatrix = {};
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return matrix;

  const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
  const pubspec = await parseYaml(pubspecPath);
  if (!pubspec) return matrix;

  const allDependencies = {
    ...pubspec.dependencies,
    ...pubspec.dev_dependencies
  };

  for (const [pkgName] of Object.entries(allDependencies)) {
    try {
      const response = await axios.get(`https://pub.dev/api/packages/${pkgName}`);
      matrix[pkgName] = {};

      for (const versionData of response.data.versions) {
        matrix[pkgName][versionData.version] = {
          compatibleWith: versionData.pubspec.dependencies || {}
        };
      }
    } catch (error) {
      console.error(`Error fetching compatibility data for ${pkgName}:`, error);
    }
  }

  return matrix;
}

// Find versions compatible with other dependencies
async function findCompatibleVersions(
  packageName: string,
  currentVersion: string,
  allDependencies: Record<string, any>,
  compatibilityMatrix: CompatibilityMatrix
): Promise<string[]> {
  const compatibleVersions: string[] = [];
  const versions = await fetchPackageVersions(packageName);

  for (const version of versions) {
    let isCompatible = true;
    const versionDeps = compatibilityMatrix[packageName]?.[version]?.compatibleWith || {};

    for (const [depName, depConstraint] of Object.entries(versionDeps)) {
      if (allDependencies[depName]) {
        const currentDepVersion = allDependencies[depName]?.version || 
          (allDependencies[depName] as any)?.toString();
        
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
async function resolveEnhancedConflicts(conflict: DependencyConflict): Promise<string | null> {
  try {
    // First try basic version resolution
    const basicSolution = await resolveOptimalVersion(conflict);
    if (basicSolution) return basicSolution;

    // If basic resolution fails, check cross-package compatibility
    const compatibilityMatrix = await buildCompatibilityMatrix();
    const workspacePath = getWorkspacePath();
    if (!workspacePath) return null;

    const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
    const pubspec = await parseYaml(pubspecPath);
    if (!pubspec) return null;

    const allDependencies = {
      ...pubspec.dependencies,
      ...pubspec.dev_dependencies
    };

    const compatibleVersions = await findCompatibleVersions(
      conflict.package,
      allDependencies[conflict.package],
      allDependencies,
      compatibilityMatrix
    );

    if (compatibleVersions.length > 0) {
      return compatibleVersions[0];
    }

    return null;
  } catch (error) {
    vscode.window.showErrorMessage(`Enhanced resolution failed: ${error}`);
    return null;
  }
}

// Check if the package is an SDK dependency

// Get transitive dependencies from pubspec.lock
async function getTransitiveDependencies(): Promise<PackageSource[]> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return [];

  const lockfilePath = path.join(workspacePath, 'pubspec.lock');
  if (!fs.existsSync(lockfilePath)) return [];

  const lockfile = await parseYaml(lockfilePath);
  const packages: PackageSource[] = [];

  if (lockfile?.packages) {
    for (const [pkgName, pkgData] of Object.entries(lockfile.packages as Record<string, any>)) {
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
async function getDependencyConflicts(): Promise<DependencyConflict[]> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return [];

  const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
  const pubspec = await parseYaml(pubspecPath);
  if (!pubspec) return [];

  const conflicts: DependencyConflict[] = [];
  const allDeps = await getTransitiveDependencies();

  // Analyze direct dependencies
  const directDeps = {
    ...pubspec.dependencies,
    ...pubspec.dev_dependencies
  };

  allDeps.push(...Object.entries(directDeps).map(([name, constraint]) => {
    let constraintValue: string = '';

    // Handle the constraint types
    if (typeof constraint === 'string') {
      constraintValue = constraint;
    } else if (constraint && typeof constraint === 'object' && 'version' in constraint) {
      const versionConstraint = constraint as VersionConstraint;
      constraintValue = versionConstraint.version;
    } else {
      console.warn(`Unknown constraint format for ${name}`);
      constraintValue = '*';  // Default if format is not recognized
    }

    return {
      name,
      sources: [{
        source: 'pubspec.yaml',
        constraint: constraintValue,
      }],
    };
  }));

  const depMap = new Map<string, Set<string>>();
  allDeps.forEach(pkg => {
    if (!depMap.has(pkg.name)) {
      depMap.set(pkg.name, new Set());
    }
    pkg.sources.forEach(source => {
      depMap.get(pkg.name)?.add(source.constraint);
    });
  });

  depMap.forEach((constraints, pkgName) => {
    if (isSdkDependency(pkgName)) return;

    if (constraints.size > 1) {
      conflicts.push({
        package: pkgName,
        required: Array.from(constraints).reduce((acc, curr, idx) => {
          acc[`source_${idx}`] = curr;
          return acc;
        }, {} as Record<string, string>)
      });
    }
  });

  return conflicts;
}

// Convert Flutter constraints to semver format
function convertToSemverRange(flutterConstraint: string): string {
  if (!flutterConstraint) return '*';

  const cleaned = flutterConstraint
    .replace(/\bany\b/g, '*')
    .replace(/^([\d.]+)$/, '^$1')  // Convert exact version to caret
    .replace(/\s+/g, ' ')
    .trim();

  try {
    return new semver.Range(cleaned).range || '*';
  } catch {
    return '*';
  }
}

// Resolve optimal version using semver intersection
async function resolveOptimalVersion(conflict: DependencyConflict): Promise<string | null> {
  try {
    const versions = await fetchPackageVersions(conflict.package);
    if (!versions.length) return null;

    const ranges = Object.values(conflict.required)
      .map(c => convertToSemverRange(c))
      .filter(r => r !== '*');

    if (!ranges.length) return versions[0];

    let validRange: string | null = ranges[0];
    for (const range of ranges.slice(1)) {
      validRange = semver.validRange(semver.intersects(validRange, range) ? validRange : null);
      if (!validRange) break;
    }

    if (!validRange) return null;

    const validVersions = versions.filter(v => semver.satisfies(v, validRange!));
    return validVersions[0] || null;
  } catch (error) {
    vscode.window.showErrorMessage(`Version resolution failed for ${conflict.package}: ${error}`);
    return null;
  }
}

// Fetch package versions from pub.dev
async function fetchPackageVersions(pkgName: string): Promise<string[]> {
  try {
    const response = await axios.get(`https://pub.dev/api/packages/${pkgName}`);
    return response.data.versions.map((v: any) => v.version).sort(semver.rcompare);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to fetch versions for ${pkgName}: ${error}`);
    return [];
  }
}

// Update pubspec.yaml with resolved version
async function updatePubspec(pkgName: string, version: string) {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return;

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
  edit.replace(
    doc.uri,
    new vscode.Range(0, 0, doc.lineCount, 0),
    newText
  );

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
      } else {
        vscode.window.showErrorMessage(
          `Could not resolve ${conflict.package}: ` +
          `Conflicting requirements: ${Object.values(conflict.required).join(', ')}`
        );
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
    exec('flutter pub get', (error: any, stdout: string, stderr: string) => {
      if (error) {
        vscode.window.showErrorMessage(`Error running flutter pub get: ${stderr}`);
        return;
      }
      vscode.window.showInformationMessage('Dependencies updated successfully!');
    });

    await vscode.commands.executeCommand('workbench.action.files.saveAll');
  } catch (error) {
    vscode.window.showErrorMessage(`Auto-fix failed: ${error}`);
  }
}

// Extension activation
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('flutterDepFixer.autoFix', autoFixConflicts)
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async doc => {
      if (doc.fileName.endsWith('pubspec.yaml')) {
        await vscode.commands.executeCommand('flutterDepFixer.autoFix');
      }
    })
  );
}