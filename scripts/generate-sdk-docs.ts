/**
 * Generate SDK Structure Documentation
 *
 * This script parses the SDK source files and generates markdown documentation
 * showing the full SDK API structure.
 *
 * Usage: npx ts-node scripts/generate-sdk-docs.ts
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MethodInfo {
  name: string;
  parameters: string[];
  isAsync: boolean;
  isStatic: boolean;
  jsDoc?: string;
}

interface PropertyInfo {
  name: string;
  type: string;
  jsDoc?: string;
  isStaticClassRef: boolean; // true if property is assigned to a static class
}

interface ClassInfo {
  name: string;
  methods: MethodInfo[];
  properties: PropertyInfo[];
  jsDoc?: string;
}

function getJsDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const fullText = sourceFile.getFullText();
  const nodeStart = node.getFullStart();
  const leadingComments = ts.getLeadingCommentRanges(fullText, nodeStart);

  if (leadingComments && leadingComments.length > 0) {
    const lastComment = leadingComments[leadingComments.length - 1];
    const commentText = fullText.slice(lastComment.pos, lastComment.end);
    if (commentText.startsWith('/**')) {
      // Extract first meaningful line of JSDoc
      const lines = commentText.split('\n');
      for (const line of lines) {
        // Remove leading whitespace, asterisks, and slashes
        let cleaned = line.replace(/^\s*\/?\*+\s*/, '').trim();
        // Remove trailing */ or /
        cleaned = cleaned.replace(/\*?\/?$/, '').trim();
        if (cleaned && !cleaned.startsWith('@') && cleaned !== '/' && cleaned !== '*') {
          return cleaned;
        }
      }
    }
  }
  return undefined;
}

function parseClass(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): ClassInfo {
  const className = node.name?.getText(sourceFile) || 'Anonymous';
  const methods: MethodInfo[] = [];
  const properties: PropertyInfo[] = [];

  node.members.forEach(member => {
    // Skip private/protected members
    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    const isPrivate = modifiers?.some(m =>
      m.kind === ts.SyntaxKind.PrivateKeyword ||
      m.kind === ts.SyntaxKind.ProtectedKeyword
    );
    if (isPrivate) return;

    // Skip members starting with underscore
    const memberName = (member as any).name?.getText(sourceFile);
    if (memberName?.startsWith('_')) return;

    if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) {
      const name = member.name.getText(sourceFile);
      if (name === 'constructor') return;

      const parameters = member.parameters.map(p => p.name.getText(sourceFile));
      const isAsync = modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) || false;
      const isStatic = modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) || false;
      const jsDoc = getJsDocComment(member, sourceFile);

      methods.push({ name, parameters, isAsync, isStatic, jsDoc });
    } else if (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) {
      const name = member.name.getText(sourceFile);
      let type = member.type ? member.type.getText(sourceFile) : 'any';
      const jsDoc = getJsDocComment(member, sourceFile);

      // Check if property is assigned to a static class (e.g., `public readonly stream = StreamInitActions;`)
      let isStaticClassRef = false;
      if (ts.isPropertyDeclaration(member) && member.initializer) {
        const initText = member.initializer.getText(sourceFile);
        // If initializer is an identifier (class reference), it's a static class ref
        if (ts.isIdentifier(member.initializer)) {
          isStaticClassRef = true;
          type = initText; // Use the class name as the type
        }
      }

      properties.push({ name, type, jsDoc, isStaticClassRef });
    }
  });

  return {
    name: className,
    methods,
    properties,
    jsDoc: getJsDocComment(node, sourceFile),
  };
}

function parseFile(filePath: string): ClassInfo[] {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const classes: ClassInfo[] = [];

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node) && node.name) {
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      const isExported = modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      if (isExported) {
        classes.push(parseClass(node, sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return classes;
}

function formatMethodSignature(method: MethodInfo): string {
  const params = method.parameters.length > 0 ? method.parameters.join(', ') : '';
  return `.${method.name}(${params})`;
}

function collectAllClasses(srcDir: string): Map<string, ClassInfo> {
  const classes = new Map<string, ClassInfo>();

  function walkDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walkDir(filePath);
      } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
        try {
          const fileClasses = parseFile(filePath);
          for (const cls of fileClasses) {
            classes.set(cls.name, cls);
          }
        } catch (e) {
          // Skip files that fail to parse
        }
      }
    }
  }

  walkDir(srcDir);
  return classes;
}

function renderClass(
  lines: string[],
  prefix: string,
  propName: string,
  classInfo: ClassInfo | undefined,
  allClasses: Map<string, ClassInfo>,
  jsDoc?: string,
  depth: number = 0,
  maxDepth: number = 3
): void {
  if (depth > maxDepth) return;

  const indent = '  '.repeat(depth);
  const comment = jsDoc ? `  // ${jsDoc}` : '';

  if (depth === 0) {
    lines.push(`${prefix}${propName}${comment}`);
  } else {
    lines.push(`${indent}.${propName}${comment}`);
  }

  if (!classInfo) return;

  const nextIndent = '  '.repeat(depth + 1);

  // Render methods
  for (const method of classInfo.methods) {
    if (!method.isStatic) {
      lines.push(`${nextIndent}${formatMethodSignature(method)}`);
    }
  }

  // Render sub-namespaces (properties that are services or static class refs)
  for (const prop of classInfo.properties) {
    let subClass: ClassInfo | undefined;

    if (prop.isStaticClassRef) {
      // Property is assigned to a static class
      subClass = allClasses.get(prop.type);
      if (subClass) {
        // For static classes, we show static methods
        const staticMethods = subClass.methods.filter(m => m.isStatic);
        if (staticMethods.length > 0) {
          const subComment = prop.jsDoc ? `  // ${prop.jsDoc}` : '';
          lines.push(`${nextIndent}.${prop.name}${subComment}`);
          for (const method of staticMethods) {
            lines.push(`${nextIndent}  ${formatMethodSignature(method)}`);
          }
        } else {
          // If no static methods, just list the property
          const subComment = prop.jsDoc ? `  // ${prop.jsDoc}` : `  // ${prop.type}`;
          lines.push(`${nextIndent}.${prop.name}${subComment}`);
        }
      } else {
        // Class not found, just list the property with type
        const subComment = prop.jsDoc ? `  // ${prop.jsDoc}` : `  // ${prop.type}`;
        lines.push(`${nextIndent}.${prop.name}${subComment}`);
      }
    } else {
      // Regular property - try to find its class
      const cleanType = prop.type.replace(/<.*>/, '').trim();
      subClass = allClasses.get(cleanType);

      if (subClass && (subClass.methods.length > 0 || subClass.properties.length > 0)) {
        renderClass(lines, '', prop.name, subClass, allClasses, prop.jsDoc, depth + 1, maxDepth);
      }
    }
  }
}

function renderObjectType(
  lines: string[],
  prefix: string,
  propName: string,
  typeText: string,
  allClasses: Map<string, ClassInfo>,
  depth: number = 0
): void {
  const indent = '  '.repeat(depth);

  if (depth === 0) {
    lines.push(`${prefix}${propName}`);
  } else {
    lines.push(`${indent}.${propName}`);
  }

  // Parse inline object type like `{ transactionBuilder: BaseTransactionBuilder; queryHelper: QueryHelper; }`
  const propMatches = typeText.matchAll(/(\w+)\s*:\s*(\w+)/g);
  const nextIndent = '  '.repeat(depth + 1);

  for (const match of propMatches) {
    const subPropName = match[1];
    const subTypeName = match[2];
    const subClass = allClasses.get(subTypeName);

    if (subClass && subClass.methods.length > 0) {
      lines.push(`${nextIndent}.${subPropName}  // ${subTypeName}`);
      for (const method of subClass.methods) {
        if (!method.isStatic) {
          lines.push(`${nextIndent}  ${formatMethodSignature(method)}`);
        }
      }
    } else {
      lines.push(`${nextIndent}.${subPropName}  // ${subTypeName}`);
    }
  }
}

function generateMarkdown(sdkClass: ClassInfo, allClasses: Map<string, ClassInfo>): string {
  const lines: string[] = [];

  lines.push('# SDK Structure\n');
  lines.push('```typescript');
  lines.push("const sdk = new FutarchySDK({ network: 'devnet' });\n");

  // Categorize properties
  const services: PropertyInfo[] = [];
  const utilities: PropertyInfo[] = [];

  const serviceNames = ['dao', 'launchpad', 'proposal', 'market', 'admin', 'intents'];
  const utilityNames = ['utils', 'client', 'network', 'deployments', 'packages', 'sharedObjects'];

  for (const prop of sdkClass.properties) {
    if (serviceNames.includes(prop.name)) {
      services.push(prop);
    } else if (utilityNames.includes(prop.name)) {
      utilities.push(prop);
    } else if (prop.type.includes('Service')) {
      services.push(prop);
    } else {
      utilities.push(prop);
    }
  }

  // Sort services in defined order
  services.sort((a, b) => {
    const aIdx = serviceNames.indexOf(a.name);
    const bIdx = serviceNames.indexOf(b.name);
    if (aIdx === -1 && bIdx === -1) return 0;
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  // Services section
  lines.push('// ============================================================================');
  lines.push('// SERVICES');
  lines.push('// ============================================================================\n');

  for (const prop of services) {
    const cleanType = prop.type.replace(/<.*>/, '').trim();
    const serviceClass = allClasses.get(cleanType);
    renderClass(lines, 'sdk.', prop.name, serviceClass, allClasses, prop.jsDoc, 0, 3);
    lines.push('');
  }

  // Top-level methods
  const publicMethods = sdkClass.methods.filter(m => !m.isStatic);
  if (publicMethods.length > 0) {
    lines.push('// Top-level methods');
    for (const method of publicMethods) {
      lines.push(`sdk${formatMethodSignature(method)}`);
    }
    lines.push('');
  }

  // Utilities section
  lines.push('// ============================================================================');
  lines.push('// UTILITIES');
  lines.push('// ============================================================================\n');

  for (const prop of utilities) {
    // Check if it's an inline object type
    if (prop.type.includes('{') && prop.type.includes('}')) {
      renderObjectType(lines, 'sdk.', prop.name, prop.type, allClasses, 0);
    } else {
      const cleanType = prop.type.replace(/<.*>/, '').trim();
      const utilClass = allClasses.get(cleanType);

      if (utilClass && utilClass.methods.length > 0) {
        renderClass(lines, 'sdk.', prop.name, utilClass, allClasses, prop.jsDoc, 0, 1);
      } else {
        const comment = prop.jsDoc ? `  // ${prop.jsDoc}` : '';
        lines.push(`sdk.${prop.name}${comment}`);
      }
    }
  }

  lines.push('```');

  return lines.join('\n');
}

function main() {
  const sdkDir = path.resolve(__dirname, '..');
  const srcDir = path.join(sdkDir, 'src');
  const outputPath = path.join(sdkDir, 'SDK_STRUCTURE.md');

  console.log('Parsing SDK source files...');

  // Collect all classes
  const allClasses = collectAllClasses(srcDir);
  console.log(`Found ${allClasses.size} classes`);

  // Parse the main SDK class
  const sdkFilePath = path.join(srcDir, 'FutarchySDK.ts');
  const sdkClasses = parseFile(sdkFilePath);
  const sdkClass = sdkClasses.find(c => c.name === 'FutarchySDK');

  if (!sdkClass) {
    console.error('Could not find FutarchySDK class');
    process.exit(1);
  }

  console.log('Generating documentation...');
  const markdown = generateMarkdown(sdkClass, allClasses);

  fs.writeFileSync(outputPath, markdown);
  console.log(`Documentation written to ${outputPath}`);
}

main();
