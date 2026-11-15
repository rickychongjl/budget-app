// The small part of Markdown the legal drafts (docs/legal) use: headings, paragraphs, bulleted and numbered lists, tables,
// rules, **bold** and `code`. Anything else is kept as the plain text it is. Markdown.tsx draws the blocks.

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'rule' }

const HEADING = /^(#{1,3}) (.*)$/
const BULLET = /^- (.*)$/
const NUMBERED = /^\d+\. (.*)$/

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())

export function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const heading = HEADING.exec(line)

    if (line.trim() === '') {
      i++
    } else if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2] })
      i++
    } else if (/^-{3,}$/.test(line.trim())) {
      blocks.push({ kind: 'rule' })
      i++
    } else if (line.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(cells(lines[i]))
        i++
      }
      // The second row is the |---|---| separator.
      const [head, , ...body] = rows
      blocks.push({ kind: 'table', head, rows: body })
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line)
      const marker = ordered ? NUMBERED : BULLET
      const items: string[] = []
      while (i < lines.length && lines[i].trim() !== '') {
        const item = marker.exec(lines[i])
        if (item) {
          items.push(item[1])
        } else if (/^\s+\S/.test(lines[i]) && items.length > 0) {
          items[items.length - 1] += ` ${lines[i].trim()}`
        } else {
          break
        }
        i++
      }
      blocks.push({ kind: 'list', ordered, items })
    } else {
      const text: string[] = []
      while (i < lines.length && lines[i].trim() !== '' && !HEADING.test(lines[i]) && !lines[i].startsWith('|') && !BULLET.test(lines[i]) && !NUMBERED.test(lines[i])) {
        text.push(lines[i].trim())
        i++
      }
      blocks.push({ kind: 'paragraph', text: text.join(' ') })
    }
  }

  return blocks
}

// The drafts end with notes for Ricky (the claims table and what the code says against the policy), headed "Claims and
// where they are true". They are for him, not the public, so the page stops before them, and before the rule above them.
export function publishable(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const end = lines.findIndex((line) => /^#{1,3} Claims and where they are true/.test(line))
  const kept = end === -1 ? lines : lines.slice(0, end)
  while (kept.length > 0 && (kept[kept.length - 1].trim() === '' || /^-{3,}$/.test(kept[kept.length - 1].trim()))) {
    kept.pop()
  }
  return kept.join('\n')
}
