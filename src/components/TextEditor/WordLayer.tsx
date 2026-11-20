import { Token } from "../../utils/tokenizeText"
import React from "react"

type Props = {
  tokens: Token[]
  wordRefs: React.MutableRefObject<HTMLSpanElement[]>
}

export function WordLayer({ tokens, wordRefs }: Props) {
  let wordIndex = 0

  return (
    <>
      {tokens.map(token => {
        if (!token.isWord) {
          return token.text
        }

        const index = wordIndex++

        return (
          <span
            key={token.id}
            ref={el => {
              if (el) wordRefs.current[index] = el
            }}
            data-word-index={index}
            className="inline-block"
          >
            {token.text}
          </span>
        )
      })}
    </>
  )
}