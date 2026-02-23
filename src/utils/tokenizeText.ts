export type Token = {
  id: string
  text: string
  isWord: boolean
}

export function tokenizeText(input: string): Token[] {
  return input.split(/(\s+)/).map((chunk, i) => ({
    id: `${i}-${chunk}`,
    text: chunk,
    isWord: /\S/.test(chunk),
  }))
}