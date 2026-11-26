/** Wide and CJK punctuation never belongs to a typed web address, so it ends one, as in core's `links_in`. */
export const WIDE_PUNCT = "\\u2000-\\u206F\\u3000-\\u303F\\uFE30-\\uFE4F\\uFF00-\\uFF65";

export const webAddress = (stop: string, flags = "") => new RegExp(`https?:\\/\\/[^\\s${stop}${WIDE_PUNCT}]+`, flags);
