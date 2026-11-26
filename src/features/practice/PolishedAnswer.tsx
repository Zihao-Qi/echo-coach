import { useRef } from "react";
import { getDemoAudio } from "../../content/questions/demo-audio";
import { AudioPlayer } from "../AudioPlayer";

function EmphasizedParagraph({
  text,
  highlights,
}: {
  text: string;
  highlights: readonly string[];
}) {
  const matches = highlights
    .map((phrase) => ({ phrase, start: text.indexOf(phrase) }))
    .filter((part) => part.start >= 0)
    .sort((a, b) => a.start - b.start);
  const end = (index: number) => {
    const match = matches[index];
    return match ? match.start + match.phrase.length : 0;
  };
  return (
    <p>
      {matches.map(({ phrase, start }, i) => (
        <span key={phrase}>
          {text.slice(end(i - 1), start)}
          <strong className="font-semibold text-bright">{phrase}</strong>
        </span>
      ))}
      {text.slice(end(matches.length - 1))}
    </p>
  );
}

export function PolishedAnswer({
  id,
  paragraphs,
  highlights,
}: {
  id: string;
  paragraphs: readonly string[];
  highlights: readonly string[];
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const asset = getDemoAudio(id, "answer");
  return (
    <section
      className="rounded-3xl bg-night p-5 text-canvas sm:p-7"
      aria-labelledby="sample-polished-heading"
    >
      <h3
        ref={heading}
        tabIndex={-1}
        id="sample-polished-heading"
        className="font-display text-xl font-bold"
      >
        Sample polished answer
      </h3>
      <p className="mt-1 text-sm text-night-muted">
        A prewritten example for this question, not a rewrite of your answer.
      </p>
      {asset && (
        <AudioPlayer key={asset.path} asset={asset} headingRef={heading} />
      )}
      <div className="mt-4 space-y-3 text-sm leading-7">
        {paragraphs.map((text, index) => (
          <EmphasizedParagraph
            key={index}
            text={text}
            highlights={highlights}
          />
        ))}
      </div>
    </section>
  );
}
