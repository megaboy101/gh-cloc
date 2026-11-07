// Language definitions: comment syntax + how files are recognised.
// line: line-comment prefixes; block: [open, close] pairs; str: string delimiters
// (strings are tracked so comment markers inside them are ignored).

const C = { line: ['//'], block: [['/*', '*/']], str: ['"', "'"] };
const CJS = { line: ['//'], block: [['/*', '*/']], str: ['"', "'", '`'] };
const HASH = { line: ['#'], block: [], str: ['"', "'"] };
const SQL = { line: ['--'], block: [['/*', '*/']], str: ["'"] };
const XML = { line: [], block: [['<!--', '-->']], str: [] };
const NONE = { line: [], block: [], str: [] };

/** name -> { syntax, ext: [], files: [] } */
const defs = {
  'JavaScript': [CJS, ['js', 'mjs', 'cjs', 'jsx']],
  'TypeScript': [CJS, ['ts', 'mts', 'cts', 'tsx']],
  'JSON': [NONE, ['json', 'jsonc', 'json5', 'webmanifest']],
  'HTML': [XML, ['html', 'htm', 'xhtml']],
  'CSS': [{ line: [], block: [['/*', '*/']], str: ['"', "'"] }, ['css']],
  'SCSS': [C, ['scss']],
  'Sass': [{ line: ['//'], block: [['/*', '*/']], str: [] }, ['sass']],
  'Less': [C, ['less']],
  'Vue': [{ line: ['//'], block: [['<!--', '-->'], ['/*', '*/']], str: [] }, ['vue']],
  'Svelte': [{ line: ['//'], block: [['<!--', '-->'], ['/*', '*/']], str: [] }, ['svelte']],
  'Astro': [{ line: ['//'], block: [['<!--', '-->'], ['/*', '*/']], str: [] }, ['astro']],
  'Python': [{ line: ['#'], block: [['"""', '"""'], ["'''", "'''"]], str: ['"', "'"] }, ['py', 'pyi', 'pyw']],
  'Jupyter Notebook': [NONE, ['ipynb']],
  'Ruby': [{ line: ['#'], block: [['=begin', '=end']], str: ['"', "'"] }, ['rb', 'rake', 'gemspec', 'ru'], ['Gemfile', 'Rakefile', 'Podfile', 'Brewfile']],
  'Go': [CJS, ['go']],
  'Rust': [{ line: ['//'], block: [['/*', '*/']], str: ['"'] }, ['rs']],
  'C': [C, ['c']],
  'C/C++ Header': [C, ['h']],
  'C++': [C, ['cpp', 'cc', 'cxx', 'c++', 'hpp', 'hh', 'hxx', 'ipp', 'inl', 'tpp']],
  'C#': [C, ['cs', 'csx']],
  'Objective-C': [C, ['m']],
  'Objective-C++': [C, ['mm']],
  'Java': [C, ['java']],
  'Kotlin': [C, ['kt', 'kts']],
  'Scala': [C, ['scala', 'sc', 'sbt']],
  'Groovy': [C, ['groovy', 'gradle', 'gvy']],
  'Swift': [C, ['swift']],
  'Dart': [C, ['dart']],
  'PHP': [{ line: ['//', '#'], block: [['/*', '*/']], str: ['"', "'"] }, ['php', 'phtml']],
  'Shell': [HASH, ['sh', 'bash', 'zsh', 'ksh', 'fish', 'bats']],
  'PowerShell': [{ line: ['#'], block: [['<#', '#>']], str: ['"', "'"] }, ['ps1', 'psm1', 'psd1']],
  'Batch': [{ line: ['REM ', 'rem ', '::'], block: [], str: [] }, ['bat', 'cmd']],
  'Perl': [{ line: ['#'], block: [['=pod', '=cut']], str: ['"', "'"] }, ['pl', 'pm', 't']],
  'Lua': [{ line: ['--'], block: [['--[[', ']]']], str: ['"', "'"] }, ['lua']],
  'R': [HASH, ['r', 'rmd']],
  'Julia': [{ line: ['#'], block: [['#=', '=#']], str: ['"'] }, ['jl']],
  'Elixir': [HASH, ['ex', 'exs']],
  'Erlang': [{ line: ['%'], block: [], str: ['"'] }, ['erl', 'hrl']],
  'Haskell': [{ line: ['--'], block: [['{-', '-}']], str: ['"'] }, ['hs', 'lhs']],
  'OCaml': [{ line: [], block: [['(*', '*)']], str: ['"'] }, ['ml', 'mli']],
  'F#': [{ line: ['//'], block: [['(*', '*)']], str: ['"'] }, ['fs', 'fsi', 'fsx']],
  'Clojure': [{ line: [';'], block: [], str: ['"'] }, ['clj', 'cljs', 'cljc', 'edn']],
  'Lisp': [{ line: [';'], block: [['#|', '|#']], str: ['"'] }, ['lisp', 'lsp', 'el', 'scm', 'ss', 'rkt']],
  'Zig': [{ line: ['//'], block: [], str: ['"'] }, ['zig']],
  'Nim': [{ line: ['#'], block: [['#[', ']#']], str: ['"'] }, ['nim', 'nims']],
  'Crystal': [HASH, ['cr']],
  'V': [C, ['v']],
  'D': [C, ['d']],
  'Fortran': [{ line: ['!'], block: [], str: ['"', "'"] }, ['f', 'f90', 'f95', 'f03', 'for']],
  'Assembly': [{ line: [';', '#', '//'], block: [['/*', '*/']], str: [] }, ['asm', 's', 'S']],
  'Solidity': [C, ['sol']],
  'GraphQL': [HASH, ['graphql', 'gql']],
  'Protocol Buffers': [C, ['proto']],
  'SQL': [SQL, ['sql', 'psql', 'mysql']],
  'Markdown': [XML, ['md', 'mdx', 'markdown']],
  'reStructuredText': [NONE, ['rst']],
  'AsciiDoc': [{ line: ['//'], block: [], str: [] }, ['adoc', 'asciidoc']],
  'TeX': [{ line: ['%'], block: [], str: [] }, ['tex', 'sty', 'cls', 'bib']],
  'YAML': [HASH, ['yml', 'yaml']],
  'TOML': [HASH, ['toml']],
  'INI': [{ line: [';', '#'], block: [], str: [] }, ['ini', 'cfg', 'conf', 'properties']],
  'XML': [XML, ['xml', 'xsd', 'xsl', 'xslt', 'plist', 'csproj', 'vbproj', 'fsproj', 'props', 'targets', 'resx', 'xaml', 'xlf', 'xliff', 'xlb', 'storyboard', 'xib']],
  'SVG': [XML, ['svg']],
  'CSV': [NONE, ['csv', 'tsv']],
  'Dockerfile': [HASH, ['dockerfile'], ['Dockerfile', 'Containerfile']],
  'Makefile': [HASH, ['mk', 'mak'], ['Makefile', 'makefile', 'GNUmakefile']],
  'CMake': [HASH, ['cmake'], ['CMakeLists.txt']],
  'Nix': [{ line: ['#'], block: [['/*', '*/']], str: ['"'] }, ['nix']],
  'Terraform': [{ line: ['#', '//'], block: [['/*', '*/']], str: ['"'] }, ['tf', 'tfvars', 'hcl']],
  'Starlark': [HASH, ['bzl', 'star'], ['BUILD', 'BUILD.bazel', 'WORKSPACE', 'MODULE.bazel']],
  'Handlebars': [{ line: [], block: [['{{!--', '--}}'], ['<!--', '-->']], str: [] }, ['hbs', 'handlebars', 'mustache']],
  'Twig': [{ line: [], block: [['{#', '#}']], str: [] }, ['twig']],
  'Liquid': [{ line: [], block: [['{% comment %}', '{% endcomment %}']], str: [] }, ['liquid']],
  'Pug': [{ line: ['//'], block: [], str: [] }, ['pug', 'jade']],
  'ERB': [XML, ['erb']],
  'Razor': [{ line: [], block: [['@*', '*@'], ['<!--', '-->']], str: [] }, ['cshtml', 'razor']],
  'Visual Basic': [{ line: ["'"], block: [], str: ['"'] }, ['vb', 'bas', 'vbs']],
  'Pascal': [{ line: ['//'], block: [['{', '}'], ['(*', '*)']], str: ["'"] }, ['pas', 'pp']],
  'GLSL': [C, ['glsl', 'vert', 'frag', 'geom', 'comp']],
  'HLSL': [C, ['hlsl', 'fx']],
  'WGSL': [C, ['wgsl']],
  'Metal': [C, ['metal']],
  'CUDA': [C, ['cu', 'cuh']],
  'Verilog': [C, ['sv', 'svh', 'vh']],
  'VHDL': [{ line: ['--'], block: [], str: ['"'] }, ['vhd', 'vhdl']],
  'Elm': [{ line: ['--'], block: [['{-', '-}']], str: ['"'] }, ['elm']],
  'PureScript': [{ line: ['--'], block: [['{-', '-}']], str: ['"'] }, ['purs']],
  'Gleam': [{ line: ['//'], block: [], str: ['"'] }, ['gleam']],
  'Odin': [C, ['odin']],
  'Mojo': [HASH, ['mojo']],
  'Hare': [{ line: ['//'], block: [], str: ['"'] }, ['ha']],
  'Haxe': [C, ['hx']],
  'ActionScript': [C, ['as']],
  'CoffeeScript': [{ line: ['#'], block: [['###', '###']], str: ['"', "'"] }, ['coffee']],
  'ReScript': [C, ['res', 'resi']],
  'Reason': [C, ['re', 'rei']],
  'Prisma': [{ line: ['//'], block: [], str: ['"'] }, ['prisma']],
  'Apex': [C, ['cls', 'trigger']],
  'AutoHotkey': [{ line: [';'], block: [['/*', '*/']], str: ['"'] }, ['ahk']],
  'Tcl': [HASH, ['tcl']],
  'Awk': [HASH, ['awk']],
  'Vim Script': [{ line: ['"'], block: [], str: ["'"] }, ['vim'], ['.vimrc']],
  'Smalltalk': [{ line: [], block: [['"', '"']], str: ["'"] }, ['st']],
  'Prolog': [{ line: ['%'], block: [['/*', '*/']], str: ['"'] }, ['pro']],
  'Ada': [{ line: ['--'], block: [], str: ['"'] }, ['ada', 'adb', 'ads']],
  'COBOL': [{ line: ['*>'], block: [], str: ['"'] }, ['cob', 'cbl']],
};

export const LANGS = new Map();
const byExt = new Map();
const byFile = new Map();

for (const [name, [syntax, exts = [], files = []]] of Object.entries(defs)) {
  LANGS.set(name, syntax);
  for (const e of exts) if (!byExt.has(e)) byExt.set(e, name);
  for (const f of files) byFile.set(f, name);
}

// Extensionless scripts are identified by their `#!` line.
const shebangs = [
  [/\b(ba|z|k|da)?sh\b/, 'Shell'],
  [/\bpython[0-9.]*\b/, 'Python'],
  [/\bnode\b|\bdeno\b|\bbun\b/, 'JavaScript'],
  [/\bruby\b/, 'Ruby'],
  [/\bperl\b/, 'Perl'],
  [/\bphp\b/, 'PHP'],
  [/\blua\b/, 'Lua'],
];

/** Detect language from path alone. Returns name or null. */
export function detectByPath(path) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (byFile.has(base)) return byFile.get(base);
  if (/^Dockerfile\./.test(base)) return 'Dockerfile';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1);
  return byExt.get(ext) ?? byExt.get(ext.toLowerCase()) ?? null;
}

/** True if the file has no extension (candidate for shebang detection). */
export function isExtensionless(path) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return base.lastIndexOf('.') <= 0;
}

/** Detect language from a shebang first line. */
export function detectByShebang(firstLine) {
  if (!firstLine.startsWith('#!')) return null;
  for (const [re, name] of shebangs) if (re.test(firstLine)) return name;
  return null;
}
