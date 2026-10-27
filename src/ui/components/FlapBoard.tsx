// A split-flap display like the old departure boards at airports. Each character
// flips in with a small delay; people who prefer reduced motion see it instantly (see CSS).
export function FlapBoard({ lines, width }: { lines: string[]; width: number }) {
  return (
    <div className="flapboard" role="img" aria-label={lines.join(' ')}>
      {lines.map((line, row) => (
        <div className="flapboard__row" key={row}>
          {line
            .toUpperCase()
            .padEnd(width, ' ')
            .slice(0, width)
            .split('')
            .map((char, col) => (
              <span
                className="flap"
                key={`${col}-${char}`}
                style={{ animationDelay: `${(row * width + col) * 18}ms` }}
              >
                {char === ' ' ? ' ' : char}
              </span>
            ))}
        </div>
      ))}
    </div>
  );
}
