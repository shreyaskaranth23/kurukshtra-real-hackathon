
export function extractStructuredData(scraped) {
  if (!scraped || typeof scraped !== "object") {
    throw new Error("Scraped data must be an object.");
  }

  const title =
    typeof scraped.title === "string" ? scraped.title.trim() : "";

  const description =
    typeof scraped.description === "string"
      ? scraped.description.trim()
      : "";

  const headings = Array.isArray(scraped.headings)
    ? scraped.headings.filter((item) => typeof item === "string")
    : [];

  const links = Array.isArray(scraped.links)
    ? scraped.links
        .filter(
          (item) =>
            item &&
            typeof item.label === "string" &&
            typeof item.url === "string"
        )
        .map(({ label, url }) => ({ label, url }))
    : [];

  const text =
    typeof scraped.text === "string" ? scraped.text.trim() : "";

  return {
    service: "structured-data-extractor",
    sourceUrl: typeof scraped.url === "string" ? scraped.url : null,
    extractedAt: new Date().toISOString(),
    fieldsFound: {
      title: Boolean(title),
      description: Boolean(description),
      headings: headings.length,
      links: links.length,
      text: Boolean(text),
    },
    data: {
      title,
      description,
      headings,
      links,
      textPreview: text.slice(0, 1000),
    },
  };
}
