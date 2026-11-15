import type { ReactNode } from 'react'
import { parse } from './legalText'
import styles from './Public.module.css'

// Built as React elements, never as HTML strings, so nothing in the text can become markup.
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .filter((part) => part !== '')
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return <code key={i}>{part.slice(1, -1)}</code>
      }
      return part
    })
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className={styles.prose}>
      {parse(source).map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            const Tag = (['h1', 'h2', 'h3'] as const)[block.level - 1]
            return <Tag key={i}>{inline(block.text)}</Tag>
          }
          case 'paragraph':
            return <p key={i}>{inline(block.text)}</p>
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul'
            return (
              <Tag key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </Tag>
            )
          }
          case 'table':
            // Its own scrolling box, so a wide table never makes the page scroll sideways (MASTER 6).
            return (
              <div key={i} className={styles.tableScroll} tabIndex={0} role="region" aria-label="Table">
                <table>
                  <thead>
                    <tr>
                      {block.head.map((cell, j) => (
                        <th key={j} scope="col">
                          {inline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td key={k}>{inline(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'rule':
            return <hr key={i} />
        }
      })}
    </div>
  )
}
