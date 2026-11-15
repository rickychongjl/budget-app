import { publishable } from './legalText'
import privacy from './legal/privacy.md?raw'
import terms from './legal/terms.md?raw'
import { Markdown } from './Markdown'
import { PublicLayout } from './PublicLayout'
import { usePageMeta } from './usePageMeta'

// The L10 drafts, word for word up to the notes for Ricky (publishable). legal/*.md are copies of docs/legal/*.md,
// because the image build only sees src/web; PublicPagesTests (Budget.Api.Tests) fails when they differ, so docs/legal
// stays the one to edit.
export function Privacy() {
  usePageMeta({ title: 'Privacy policy', description: 'What Tight Arse collects, why, where it is kept, and what you can do about it.', path: '/privacy' })
  return (
    <PublicLayout>
      <Markdown source={publishable(privacy)} />
    </PublicLayout>
  )
}

export function Terms() {
  usePageMeta({ title: 'Terms of use', description: 'The agreement between you and the person who runs Tight Arse.', path: '/terms' })
  return (
    <PublicLayout>
      <Markdown source={publishable(terms)} />
    </PublicLayout>
  )
}
