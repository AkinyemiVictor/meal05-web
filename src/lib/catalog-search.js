const MAX_SEARCH_LENGTH = 80;
const MAX_SEARCH_TERMS = 10;

export const getCatalogSearchTerms = (value) => {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/\u2019/g, "'")
    .slice(0, MAX_SEARCH_LENGTH)
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalized) return [];

  const seen = new Set();
  const terms = [];
  for (const rawTerm of normalized.split(" ")) {
    const term = rawTerm.toLocaleLowerCase("en-NG");
    if (!term || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length >= MAX_SEARCH_TERMS) break;
  }
  return terms;
};

export const applyCatalogSearchTerms = (query, value, column = "search_text") =>
  getCatalogSearchTerms(value).reduce(
    (nextQuery, term) => nextQuery.ilike(column, `%${term}%`),
    query
  );
