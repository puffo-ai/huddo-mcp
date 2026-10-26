import type { Plugin } from "unified";
import type { Root, Strong, Text, Parent } from "mdast";
import { visit, SKIP } from "unist-util-visit";
import { MENTION_RE } from "../../../shared/text/mention";

export { MENTION_RE } from "../../../shared/text/mention";

export type MentionResolver = (slug: string) => string | undefined;
export type IsSlugInSpace = (slug: string) => boolean;

export const remarkMentions: Plugin<
  [MentionResolver?, string?, IsSlugInSpace?],
  Root
> = (
  resolve = () => undefined,
  selfSlug,
  isSlugInSpace,
) => {
  return (tree) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index == null) return;
      const value = node.value;
      const re = new RegExp(MENTION_RE.source, MENTION_RE.flags);
      let match: RegExpExecArray | null;
      const newChildren: (Text | Strong)[] = [];
      let lastIndex = 0;
      let foundAny = false;

      while ((match = re.exec(value)) !== null) {
        foundAny = true;
        const fullMatch = match[0];
        const leadingChar = match[1];
        const slug = match[2];
        const start = match.index + leadingChar.length;
        if (start > lastIndex) {
          newChildren.push({
            type: "text",
            value: value.slice(lastIndex, start),
          });
        }
        if (isSlugInSpace && !isSlugInSpace(slug)) {
          newChildren.push({ type: "text", value: `@${slug}` });
          lastIndex = match.index + fullMatch.length;
          continue;
        }
        const display = resolve(slug) ?? slug;
        const isSelf = selfSlug != null && slug === selfSlug;
        const strong: Strong = {
          type: "strong",
          data: {
            hProperties: {
              className: isSelf
                ? "puffo-mention puffo-mention-self"
                : "puffo-mention",
              "data-mention-slug": slug,
              title: `@${slug}`,
            },
          },
          children: [{ type: "text", value: `@${display}` }],
        };
        newChildren.push(strong);
        lastIndex = match.index + fullMatch.length;
      }

      if (!foundAny) return;

      if (lastIndex < value.length) {
        newChildren.push({ type: "text", value: value.slice(lastIndex) });
      }

      (parent as Parent).children.splice(index, 1, ...newChildren);
      return [SKIP, index + newChildren.length];
    });
  };
};
