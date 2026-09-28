import { LanguageSupport, StreamLanguage } from "@codemirror/language";

const language = StreamLanguage.define<{ comment: boolean }>({
  name: "html",
  startState: () => ({ comment: false }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (state.comment) {
      if (stream.skipTo("-->")) {
        stream.pos += 3;
        state.comment = false;
      } else stream.skipToEnd();
      return "comment";
    }
    if (stream.match("<!--")) {
      state.comment = true;
      return "comment";
    }
    if (!stream.skipTo("<!--")) stream.skipToEnd();
    if (stream.pos === stream.start) stream.next();
    return null;
  },
});

export function html(): LanguageSupport {
  return new LanguageSupport(language);
}

export function htmlCompletionSource(): null {
  return null;
}
