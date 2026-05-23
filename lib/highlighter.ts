import { createHighlighter, type Highlighter, type ThemedToken } from 'shiki'

let highlighterPromise: Promise<Highlighter> | null = null

// Only langs confirmed in shiki's default bundle
const LANGS = [
  'javascript', 'typescript', 'tsx', 'jsx',
  'json',
  'css', 'scss', 'less',
  'html', 'xml',
  'python', 'ruby', 'go', 'rust', 'java', 'c', 'cpp', 'csharp',
  'sql', 'yaml', 'toml', 'markdown',
  'bash', 'powershell', 'dockerfile',
  'plaintext',
] as const

type SupportedLang = typeof LANGS[number]

const LANG_SET = new Set<string>(LANGS)

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['one-dark-pro'],
      langs: [...LANGS],
    })
  }
  return highlighterPromise
}

const EXT_MAP: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript',
  tsx: 'tsx', jsx: 'jsx',
  json: 'json', json5: 'json',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html',
  xml: 'xml', svg: 'xml',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  sql: 'sql',
  graphql: 'plaintext', gql: 'plaintext',
  yaml: 'yaml', yml: 'yaml',
  toml: 'toml',
  md: 'markdown', mdx: 'markdown',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  ps1: 'powershell',
  dockerfile: 'dockerfile',
}

export function langFromPath(filePath: string): SupportedLang {
  const name = filePath.split('/').pop()?.split('\\').pop() ?? ''
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const lang = EXT_MAP[ext] ?? 'plaintext'
  return (LANG_SET.has(lang) ? lang : 'plaintext') as SupportedLang
}

export interface HighlightedToken {
  content: string
  color: string
}

export async function highlightLine(
  code: string,
  lang: string,
  highlighter: Highlighter
): Promise<HighlightedToken[]> {
  try {
    const tokens: ThemedToken[][] = highlighter.codeToTokens(code || ' ', {
      lang: lang as any,
      theme: 'one-dark-pro',
    }).tokens
    return (tokens[0] ?? []).map(t => ({ content: t.content, color: t.color ?? '#abb2bf' }))
  } catch {
    return [{ content: code, color: '#abb2bf' }]
  }
}
