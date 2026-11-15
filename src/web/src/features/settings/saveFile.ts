// Hands a downloaded file to the browser's own save flow: an object URL on a temporary link with `download`, clicked once.
// The URL is released a little later rather than at once, because Safari reads it after the click returns.
export function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
