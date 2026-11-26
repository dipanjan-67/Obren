import React from 'react';
import katex from 'katex';

interface MathTextProps {
  text: string;
  className?: string;
}

type Token =
  | { kind: 'text'; content: string }
  | { kind: 'inline'; content: string }
  | { kind: 'block'; content: string };

const MATH_REGEX = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?:\\.|[^$\n])+?\$)/g;

function tokenizeMath(input: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MATH_REGEX.lastIndex = 0;

  while ((match = MATH_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'text', content: input.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('$$') && raw.endsWith('$$')) {
      tokens.push({ kind: 'block', content: raw.slice(2, -2).trim() });
    } else if (raw.startsWith('\\[') && raw.endsWith('\\]')) {
      tokens.push({ kind: 'block', content: raw.slice(2, -2).trim() });
    } else if (raw.startsWith('\\(') && raw.endsWith('\\)')) {
      tokens.push({ kind: 'inline', content: raw.slice(2, -2).trim() });
    } else if (raw.startsWith('$') && raw.endsWith('$')) {
      tokens.push({ kind: 'inline', content: raw.slice(1, -1).trim() });
    } else {
      tokens.push({ kind: 'text', content: raw });
    }
    lastIndex = MATH_REGEX.lastIndex;
  }

  if (lastIndex < input.length) {
    tokens.push({ kind: 'text', content: input.slice(lastIndex) });
  }
  return tokens;
}

function formatReadableProse(segment: string): string {
  return segment
    .replace(/<->|<=>/g, '⇌')
    .replace(/->/g, '→')
    .replace(/>=/g, '≥')
    .replace(/<=/g, '≤')
    .replace(/!=/g, '≠');
}

export const MathText: React.FC<MathTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  const tokens = tokenizeMath(text);

  return (
    <span className={className}>
      {tokens.map((token, idx) => {
        if (token.kind === 'text') {
          return (
            <React.Fragment key={idx}>
              {formatReadableProse(token.content)}
            </React.Fragment>
          );
        }

        const displayMode = token.kind === 'block';
        const renderedHtml = katex.renderToString(token.content, {
          displayMode,
          throwOnError: false,
          strict: false,
          trust: false,
        });

        if (displayMode) {
          return (
            <span
              key={idx}
              className="my-2 block overflow-x-auto py-1 text-center"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          );
        }

        return (
          <span
            key={idx}
            className="inline-block align-baseline"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        );
      })}
    </span>
  );
};
