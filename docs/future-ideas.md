# Ideas for future practice sessions

These are options, not scheduled features. The original prototype tried several of them; we can revisit the learner’s need without committing to the same tool. See [release status](implementation-status.md) for what’s available now.

| What a learner might want | What we have now | When to revisit it |
| --- | --- | --- |
| An interviewer who listens and responds aloud | The public mock interview is typed. The prototype used Gemini Live for spoken turns. | If learners want to practice turn-taking and answering spoken follow-ups, not just drafting answers. |
| A transcript that captures what I actually said | The public recorder gives sample text. The private preview adds browser dictation and optional Gemini transcription. The prototype used Chirp 3. | If testing with real speakers shows missed words that change the meaning of an answer. |
| A better way to phrase my answer without changing my story | Public feedback is illustrative. The private preview can suggest a technical answer with Gemini. The prototype used Gemini 2.5 Flash for rewriting. | If learners want help rewriting more kinds of answers and we can verify that revisions preserve their facts. |
| More answers I can listen to | The public demo plays clips made in advance with Gemini Flash TTS. The private preview also uses it to read suggested technical answers on demand with a key. | If learners need playback for answers beyond those already covered. |
| A cue card I can take away | The current recap is text. The prototype used Imagen for cue cards. | If a visual reminder helps learners remember what to practice better than text alone. |
| My practice history on another device | Private authenticated practice can store attempts in Firestore. Public sample history is temporary; in the private preview, attempts made with a Gemini key stay in the tab. | If public-demo users want to opt in to saved recaps. We’d need to decide what gets saved, for how long, and how to delete it. |
