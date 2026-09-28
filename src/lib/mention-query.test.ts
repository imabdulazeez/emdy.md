import { describe, expect, it } from "vite-plus/test";
import { mentionQuery } from "./mention-query";

describe("mentionQuery", () => {
  it("finds an @ that starts a word and reads the query after it", () => {
    expect(mentionQuery("@")).toEqual({ offset: 0, query: "" });
    expect(mentionQuery("Journal @tod")).toEqual({ offset: 8, query: "tod" });
    expect(mentionQuery("Due (@next fri")).toEqual({ offset: 5, query: "next fri" });
  });

  it("ignores addresses, paths, escapes, code, and a space after the @", () => {
    expect(mentionQuery("me@example")).toBeNull();
    expect(mentionQuery("a/@b")).toBeNull();
    expect(mentionQuery("\\@b")).toBeNull();
    expect(mentionQuery("`@b")).toBeNull();
    expect(mentionQuery("@ today")).toBeNull();
    expect(mentionQuery("@@")).toBeNull();
    expect(mentionQuery("no mention")).toBeNull();
  });

  it("stops after forty characters", () => {
    expect(mentionQuery(`@${"a".repeat(40)}`)).not.toBeNull();
    expect(mentionQuery(`@${"a".repeat(41)}`)).toBeNull();
  });
});
